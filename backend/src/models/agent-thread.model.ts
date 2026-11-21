import { randomUUID } from 'node:crypto'
import { model, Schema, type UpdateQuery } from 'mongoose'
import { mongo } from '@/models/mongo.js'

import type { AgentChat, AgentMessage } from '@/schemas/agent.schema.js'
import { AppError } from '@/services/error.service.js'

const LEASE_MS = 18_000
const HISTORY_LIMIT = 20

type RunError = { key: string; message: string }

export type AgentRun = {
  id: string
  request: AgentMessage
  status: 'running' | 'interrupted' | 'completed' | 'failed'
  error: RunError | null
}

type Lease = { id: string; expiresAt: Date }

type AgentThread = {
  _id: string
  userId: string
  messages: AgentChat['history']
  run: AgentRun
  lease: Lease | null
  updatedAt: Date
}

export type ActiveThread = AgentThread & { lease: Lease }

const Threads = model<AgentThread>(
  'AgentThread',
  new Schema<AgentThread>(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true },
      messages: [
        new Schema(
          {
            role: { type: String, enum: ['user', 'assistant'], required: true },
            content: { type: String, required: true },
          },
          { _id: false },
        ),
      ],
      run: {
        id: { type: String, required: true },
        request: { type: Schema.Types.Mixed, required: true },
        status: {
          type: String,
          enum: ['running', 'interrupted', 'completed', 'failed'],
          required: true,
        },
        error: {
          type: new Schema({ key: String, message: String }, { _id: false }),
          default: null,
        },
      },
      lease: {
        type: new Schema({ id: String, expiresAt: Date }, { _id: false }),
        default: null,
      },
      updatedAt: { type: Date, required: true },
    },
    { collection: 'agent_threads', versionKey: false },
  ),
)

function newRun(request: AgentMessage): AgentRun {
  return {
    id: randomUUID(),
    request,
    status: 'running',
    error: null,
  }
}

function leaseExpiry(): Date {
  return new Date(Date.now() + LEASE_MS)
}

function newLease(): Lease {
  return { id: randomUUID(), expiresAt: leaseExpiry() }
}

function activeFilter(thread: ActiveThread) {
  return {
    _id: thread._id,
    userId: thread.userId,
    'lease.id': thread.lease.id,
    'lease.expiresAt': { $gt: new Date() },
  }
}

export async function readThread(
  userId: string,
  id: string,
): Promise<AgentThread> {
  const thread = await mongo(() =>
    Threads.findOne({ _id: id, userId }).lean<AgentThread>(),
  )
  if (!thread)
    throw new AppError('NOT_FOUND', { key: 'so-agent-thread-missing' })
  return thread
}

export async function createThread(
  userId: string,
  request: AgentMessage,
): Promise<ActiveThread> {
  const thread = {
    _id: randomUUID(),
    userId,
    messages: [],
    run: newRun(request),
    lease: newLease(),
    updatedAt: new Date(),
  }
  await mongo(() => Threads.create(thread))
  return thread
}

export async function claimThread(
  userId: string,
  id: string,
  request?: AgentMessage,
): Promise<ActiveThread> {
  const lease = newLease()
  const filter = request
    ? {
        _id: id,
        userId,
        'run.status': { $in: ['completed', 'failed'] as AgentRun['status'][] },
      }
    : {
        _id: id,
        userId,
        'run.status': {
          $in: ['running', 'interrupted'] as AgentRun['status'][],
        },
        $or: [{ lease: null }, { 'lease.expiresAt': { $lte: new Date() } }],
      }
  const update: UpdateQuery<AgentThread> = {
    $set: {
      lease,
      updatedAt: new Date(),
      ...(request
        ? { run: newRun(request) }
        : { 'run.status': 'running', 'run.error': null }),
    },
  }
  const thread = await mongo(() =>
    Threads.findOneAndUpdate(filter, update, {
      returnDocument: 'after',
    }).lean<AgentThread>(),
  )
  if (thread) return { ...thread, lease }

  await readThread(userId, id)
  throw new AppError('CONFLICT', {
    key: 'so-agent-thread-busy',
    message: request
      ? 'Finish or resume the current turn first.'
      : 'No interrupted turn is ready to resume.',
  })
}

export async function renewThread(thread: ActiveThread): Promise<boolean> {
  const result = await mongo(() =>
    Threads.updateOne(activeFilter(thread), {
      $set: { 'lease.expiresAt': leaseExpiry() },
    }),
  )
  return result.matchedCount === 1
}

export async function finishThread(
  thread: ActiveThread,
  reply: string,
): Promise<void> {
  const update: UpdateQuery<AgentThread> = {
    $set: { 'run.status': 'completed', lease: null, updatedAt: new Date() },
    $push: {
      messages: {
        $each: [
          { role: 'user', content: thread.run.request.message },
          { role: 'assistant', content: reply },
        ],
        $slice: -HISTORY_LIMIT,
      },
    },
  }
  const result = await mongo(() =>
    Threads.updateOne(activeFilter(thread), update),
  )
  if (result.matchedCount === 0) {
    throw new AppError('CONFLICT', { key: 'so-agent-checkpoint-lease-lost' })
  }
}

export async function pauseThread(
  thread: ActiveThread,
  status: 'interrupted' | 'failed',
  error: RunError,
): Promise<void> {
  await mongo(() =>
    Threads.updateOne(activeFilter(thread), {
      $set: {
        'run.status': status,
        'run.error': error,
        lease: null,
        updatedAt: new Date(),
      },
    }),
  )
}

export function threadView(
  thread: AgentThread,
  progress: {
    plan: string[] | null
    completedSteps: number
    skillsUsed: string[]
  },
) {
  const { run, lease } = thread
  const status =
    run.status === 'running' && (!lease || lease.expiresAt <= new Date())
      ? 'interrupted'
      : run.status
  return {
    id: thread._id,
    messages: thread.messages,
    run: {
      id: run.id,
      status,
      request: run.request,
      ...progress,
      error: run.error,
    },
    updatedAt: thread.updatedAt,
  }
}
