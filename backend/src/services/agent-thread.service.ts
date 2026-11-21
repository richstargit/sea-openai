import {
  Annotation,
  END,
  type LangGraphRunnableConfig,
  START,
  StateGraph,
} from '@langchain/langgraph'
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb'
import {
  type ActiveThread,
  finishThread,
  pauseThread,
  renewThread,
} from '@/models/agent-thread.model.js'
import { connectMongo, mongo } from '@/models/mongo.js'
import { prepareAgent, scopeReply, steps } from '@/services/agent.service.js'
import type { AgentFile } from '@/services/agent-tools/files.js'
import { AppError, normalizeError } from '@/services/error.service.js'
import type { VideoBrief } from '@/services/video/brief.js'

type StepResult = {
  task: string
  result: string
  skillsUsed: string[]
  files?: AgentFile[]
}
type Worker = Awaited<ReturnType<typeof prepareAgent>>
export type AgentEvent =
  | { type: 'thread'; threadId: string; runId: string }
  | { type: 'plan'; tasks: string[]; completedSteps: number }
  | {
      type: 'step'
      index: number
      task: string
      status: 'running' | 'completed'
    }
  | { type: 'verify' }
  | { type: 'done'; message: string; skillsUsed: string[]; files?: AgentFile[] }
  | { type: 'error'; key: string; message: string }

type Publish = (event: AgentEvent) => void

const AgentState = Annotation.Root({
  plan: Annotation<string[] | null>(),
  steps: Annotation<StepResult[]>(),
  reply: Annotation<string>(),
  skill: Annotation<string>(),
  brief: Annotation<VideoBrief>(),
})

const RunContext = Annotation.Root({
  worker: Annotation<Worker>(),
  runId: Annotation<string>(),
})
type GraphConfig = LangGraphRunnableConfig<typeof RunContext.State>

function runtime(config: GraphConfig) {
  if (!config.context || !config.signal)
    throw new Error('Missing agent run context')
  return { ...config.context, signal: config.signal }
}

async function intake(_state: typeof AgentState.State, config: GraphConfig) {
  const { worker, signal } = runtime(config)
  const skill = await worker.route(signal)
  return skill ? { skill, plan: steps } : { plan: [], reply: scopeReply }
}
async function executeStep(
  state: typeof AgentState.State,
  config: GraphConfig,
) {
  const { worker, signal, runId } = runtime(config)
  const index = state.steps.length
  const task = steps[index]
  if (!task) throw new Error('Invalid video step')
  config.writer?.({
    type: 'step',
    index,
    task,
    status: 'running',
  } satisfies AgentEvent)
  if (!index) {
    const brief = await worker.design(state.skill, signal)
    return {
      brief,
      steps: [{ task, result: brief.title, skillsUsed: [state.skill] }],
    }
  }
  const result = await worker.render(state.brief, signal, runId)
  return {
    steps: [
      ...state.steps,
      {
        task,
        result: result.message,
        files: result.files,
        skillsUsed: [state.skill],
      },
    ],
  }
}
function verify(state: typeof AgentState.State, config: GraphConfig) {
  config.writer?.({ type: 'verify' } satisfies AgentEvent)
  return { reply: requireReply(state.steps.at(-1)?.result ?? '') }
}

function requireReply(reply: string): string {
  if (!reply.trim()) {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: 'so-agent-empty-response',
    })
  }
  return reply
}

function buildGraph(checkpointer: MongoDBSaver) {
  return new StateGraph(AgentState, RunContext)
    .addNode('intake', intake)
    .addNode('executeStep', executeStep)
    .addNode('verify', verify)
    .addEdge(START, 'intake')
    .addConditionalEdges(
      'intake',
      (state) => (state.plan?.length ? 'executeStep' : END),
      ['executeStep', END],
    )
    .addConditionalEdges(
      'executeStep',
      (state) =>
        state.steps.length < (state.plan?.length ?? 0)
          ? 'executeStep'
          : 'verify',
      ['executeStep', 'verify'],
    )
    .addEdge('verify', END)
    .compile({ checkpointer })
}

let graph: Promise<ReturnType<typeof buildGraph>> | undefined

function agentGraph() {
  graph ??= mongo(async () => {
    const { connection } = await connectMongo()
    const checkpointer = new MongoDBSaver({
      client: connection.getClient(),
      dbName: connection.name,
    })
    const [error] = await checkpointer.setup()
    if (error) throw error
    return buildGraph(checkpointer)
  }).catch((error: unknown) => {
    graph = undefined
    throw error
  })
  return graph
}

function checkpointConfig(userId: string, runId: string) {
  return { configurable: { thread_id: `video:${userId}:${runId}` } }
}

function progressOf(state: Partial<typeof AgentState.State>) {
  const steps = state.steps ?? []
  return {
    plan: state.plan ?? null,
    completedSteps: steps.length,
    files: steps.flatMap((step) => step.files ?? []),
    skillsUsed: [...new Set(steps.flatMap((step) => step.skillsUsed))],
  }
}

export async function readRunProgress(userId: string, runId: string) {
  const workflow = await agentGraph()
  const snapshot = await mongo(() =>
    workflow.getState(checkpointConfig(userId, runId)),
  )
  return progressOf(snapshot.values)
}

async function executeTurn(
  thread: ActiveThread,
  publish: Publish,
  signal: AbortSignal,
) {
  const workflow = await agentGraph()
  const checkpoint = checkpointConfig(thread.userId, thread.run.id)
  const snapshot = await mongo(() => workflow.getState(checkpoint))
  let state: Partial<typeof AgentState.State> = snapshot.values
  let progress = progressOf(state)
  if (progress.plan?.length) {
    publish({
      type: 'plan',
      tasks: progress.plan,
      completedSteps: progress.completedSteps,
    })
  }

  if (!state.reply || snapshot.next.length) {
    const worker = await prepareAgent(
      {
        ...thread.run.request,
        history: thread.messages,
      },
      thread.userId,
    )
    const stream = await workflow.stream(
      snapshot.createdAt ? null : { plan: null, steps: [], reply: '' },
      {
        ...checkpoint,
        context: { worker, runId: thread.run.id },
        signal,
        durability: 'sync',
        streamMode: ['values', 'custom'],
      },
    )
    for await (const [mode, data] of stream) {
      if (mode === 'custom') {
        publish(data as AgentEvent)
        continue
      }

      state = data
      const next = progressOf(state)
      if (!progress.plan && next.plan?.length) {
        publish({ type: 'plan', tasks: next.plan, completedSteps: 0 })
      }
      if (next.completedSteps > progress.completedSteps) {
        const index = next.completedSteps - 1
        const step = state.steps?.[index]
        if (step)
          publish({ type: 'step', index, task: step.task, status: 'completed' })
      }
      progress = next
    }
  }

  const reply = requireReply(state.reply ?? '')
  await finishThread(thread, reply)
  publish({
    type: 'done',
    message: reply,
    skillsUsed: progress.skillsUsed,
    ...(progress.files.length ? { files: progress.files } : {}),
  })
}

export async function runThread(
  thread: ActiveThread,
  publish: Publish,
): Promise<void> {
  const ownership = new AbortController()
  const heartbeat = setInterval(() => {
    void renewThread(thread).then(
      (renewed) => {
        if (!renewed) ownership.abort()
      },
      () => ownership.abort(),
    )
  }, 5_000)
  heartbeat.unref()
  const signal = AbortSignal.any([
    ownership.signal,
    AbortSignal.timeout(180_000),
  ])

  try {
    publish({ type: 'thread', threadId: thread._id, runId: thread.run.id })
    await executeTurn(thread, publish, signal)
  } catch (error) {
    const failure = normalizeError(error, 'so-agent-thread-run')
    const details = { key: failure.key, message: failure.message }
    await pauseThread(
      thread,
      failure.status < 500 ? 'failed' : 'interrupted',
      details,
    ).catch(() => undefined)
    publish({ type: 'error', ...details })
  } finally {
    clearInterval(heartbeat)
  }
}
