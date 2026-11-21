import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import { toFile } from 'openai'
import type { ResponseInput } from 'openai/resources/responses/responses'
import sharp from 'sharp'
import { z } from 'zod'
import { StoredFile } from '@/models/agent-storage.model.js'
import {
  readVideoProject,
  storeVideoProject,
} from '@/models/video-project.model.js'
import type { AgentChat } from '@/schemas/agent.schema.js'
import { fileText, getFile, saveFile } from '@/services/agent-tools/files.js'
import { followPublicResource } from '@/services/agent-tools/public-web.js'
import { AppError } from '@/services/error.service.js'
import {
  createOpenAIResponse,
  openAIClient,
} from '@/services/openai.service.js'
import type { VideoBrief } from '@/services/video/brief.js'
import { transcribeCaptions } from '@/services/video/captions.js'
import { saleFormatGuide } from '@/services/video/sale-formats.js'
import { speakScript } from '@/services/video/speech.js'

type Message = {
  content:
    | string
    | Array<{ type: string; text?: string; image_url?: { url: string } }>
  getType?: () => string
  _getType?: () => string
}
const types: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pdf: 'application/pdf',
}
const mime = (name: string) =>
  types[name.toLowerCase().split('.').pop() ?? ''] ?? 'application/octet-stream'
function engineInput(messages: Message[]): ResponseInput {
  return messages.map((message) => ({
    role:
      (message.getType?.() ?? message._getType?.()) === 'system'
        ? 'developer'
        : 'user',
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.flatMap(
            (
              part,
            ): Array<
              | { type: 'input_text'; text: string }
              | { type: 'input_image'; image_url: string; detail: 'low' }
            > =>
              part.image_url
                ? [
                    {
                      type: 'input_image',
                      image_url: part.image_url.url,
                      detail: 'low',
                    },
                  ]
                : part.text
                  ? [{ type: 'input_text', text: part.text }]
                  : [],
          ),
  }))
}
type EngineResult = {
  archive: Buffer
  sceneStarts: number[]
  result: unknown
  render: () => Promise<Buffer>
}
type Tool = {
  id: string
  description: string
  input: z.ZodObject
  endsStep?: boolean
}
type ProjectContext = {
  userId: string
  role: string
  threadId: string
  attachmentIds: string[]
  said: string
  signal: AbortSignal
  model?: string
  reportActivity?: (detail: string) => void
}
type Engine = {
  runProject: (
    host: object,
    action: () => Promise<unknown>,
  ) => Promise<Production>
  invokeTool: (
    name: string,
    ctx: ProjectContext,
    input: object,
  ) => Promise<unknown>
  availableTools: Tool[]
  harness: string
  providerTools: string[]
}
type Production = {
  bytes: Buffer
  projectId: string
  toolsUsed: string[]
  sceneStarts: number[]
}
const engine = (): Promise<Engine> =>
  import(pathToFileURL(resolve('integrations/video-engine/local.mjs')).href)

export async function videoToolCatalog() {
  const system = await engine()
  return {
    available: system.availableTools.map((tool) => tool.id),
    needsProvider: system.providerTools,
    needsDevice: ['video_blender'],
  }
}

export async function produceVideo(
  userId: string,
  request: AgentChat,
  brief: VideoBrief,
  signal: AbortSignal,
  runId?: string,
): Promise<Production> {
  const system = await engine()
  const selected = request.projectId
  const projectId = selected ?? runId ?? randomUUID()
  const prior =
    selected || runId
      ? await readVideoProject(userId, projectId, !!selected)
      : undefined
  const replay = !!runId && prior?.runId === runId
  const silent = brief.production
    ? !brief.production.voiceover
    : brief.beats?.every((beat) => !beat.say)
  const ctx: ProjectContext = {
    userId,
    role: 'user',
    threadId: runId ?? projectId,
    attachmentIds: request.files ?? [],
    said: request.message,
    signal,
    reportActivity: (detail) => console.info('[video]', detail),
  }
  const used = new Set<string>(replay ? prior?.toolsUsed : [])
  const file = async (id: string) => {
    const item = await getFile(userId, id)
    return { ...item, mimeType: mime(item.name) }
  }
  const finish = async ({ archive, render, sceneStarts }: EngineResult) => {
    const bytes = await render()
    used.add('video_export')
    if (!replay)
      await storeVideoProject(
        userId,
        projectId,
        prior?.revision ?? 0,
        brief.title,
        archive,
        [...used],
        runId,
      )
    return { bytes, projectId, sceneStarts, toolsUsed: [...used] }
  }
  const host = {
    projectId,
    userId,
    signal,
    continuous: brief.production?.continuous,
    soundEffects: replay ? undefined : brief.production?.soundEffects,
    graphicsOnly: brief.visualMode === 'hyperframes',
    silent,
    shots: brief.production?.shots,
    style: brief.production?.guidance,
    restore: async () => prior?.archive,
    finish,
    log: (event: string) => console.info('[video]', event),
    ask: async (messages: Message[], budget: number) => {
      const result = await createOpenAIResponse(
        {
          input: engineInput(messages),
          max_output_tokens: Math.min(40000, budget ?? 12000),
        },
        signal,
      )
      return result.output_text
    },
    file,
    library: async () =>
      (
        await StoredFile.find({ userId }, { name: 1, video: 1 })
          .sort({ _id: -1 })
          .limit(200)
          .lean()
      ).map((item) => ({
        publicId: item._id,
        fileName: item.name,
        origin: item.video ? 'generated' : 'uploaded',
        kind: mime(item.name).split('/')[0],
      })),
    save: async (name: string, bytes: Buffer) => ({
      publicId: (await saveFile(userId, name, bytes)).id,
    }),
    removeFile: (id: string) => StoredFile.deleteOne({ _id: id, userId }),
    fileText: (name: string, bytes: Buffer) => fileText(name, bytes, signal),
    filePictures: async (item: { name: string; bytes: Buffer }) => {
      if (/\.(png|jpe?g|webp)$/i.test(item.name)) {
        return [
          {
            ...(await sharp(item.bytes, {
              limitInputPixels: 20_000_000,
            }).metadata()),
            bytes: item.bytes,
          },
        ]
      }
      if (!/\.(pptx|docx|xlsx)$/i.test(item.name)) return []
      let total = 0
      const media = unzipSync(item.bytes, {
        filter(entry) {
          if (!/^(ppt|word|xl)\/media\/[^/]+\.(jpe?g|png)$/i.test(entry.name))
            return false
          total += entry.originalSize
          return total < 24 * 1024 * 1024
        },
      })
      return Promise.all(
        Object.values(media)
          .slice(0, 12)
          .map(async (bytes) => ({
            ...(await sharp(bytes, {
              limitInputPixels: 12_000_000,
            }).metadata()),
            bytes: Buffer.from(bytes),
          })),
      )
    },
    speech: async (text: string, voice: string) => {
      const bytes = await speakScript(
        text,
        'Natural editorial narration. Read only the supplied line.',
        voice,
        signal,
      )
      used.add('video_voice')
      return bytes
    },
    image: async (opts: {
      prompt: string
      size: string
      references?: string[]
    }) => {
      if (brief.visualMode === 'hyperframes')
        throw new Error('Graphics-only brief')
      const client = openAIClient()
      const params = {
        model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.6-sunburst',
        quality: 'max' as const,
        complexity: 'high' as const,
        output_format: 'png' as const,
        prompt: opts.prompt,
        size: opts.size,
      }
      const refs = await Promise.all(
        (opts.references ?? []).map(async (url, i) => {
          if (/^[a-z0-9+/=]+$/i.test(url))
            return toFile(Buffer.from(url, 'base64'), `ref-${i}.jpg`, {
              type: 'image/jpeg',
            })
          const match =
            /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url)
          if (!match?.[2]) throw new Error('Unsupported image reference')
          return toFile(
            Buffer.from(match[2], 'base64'),
            `ref-${i}.${match[1]}`,
            { type: `image/${match[1]}` },
          )
        }),
      )
      const options = { signal, maxRetries: 0, timeout: 360000 }
      const out = refs.length
        ? await client.images.edit({ ...params, image: refs }, options)
        : await client.images.generate(params, options)
      const data = out.data?.[0]?.b64_json
      if (!data) throw new Error('No image returned')
      used.add('video_draw_image')
      return { mimeType: 'image/png', bytes: Buffer.from(data, 'base64') }
    },
    transcribe: (bytes: Buffer, language: string) =>
      transcribeCaptions(bytes, language, signal),
    fetchPublic: async (url: string, deadline?: AbortSignal) => {
      const res = await followPublicResource(
        url,
        AbortSignal.any([signal, deadline ?? AbortSignal.timeout(20000)]),
      )
      return new Response(new Uint8Array(res.body), {
        status: res.status,
        headers: Object.fromEntries(res.headers.entries()),
      })
    },
  }
  let repair = ''
  const build = () =>
    system.runProject(host, async () => {
      if (replay) return
      if (!selected) {
        const seconds =
          brief.production?.seconds ??
          brief.beats?.reduce((sum, beat) => sum + beat.seconds, 0) ??
          12
        const words = [
          repair,
          request.message,
          brief.production?.continuous
            ? 'Design one unbroken camera take. The beats are timed changes of pose and framing within this take. Choose a film style from the supplied library, keep a recognizable hero in motion throughout and respect the requested words.'
            : '',
          saleFormatGuide(brief.saleFormat),
          brief.look ?? '',
          brief.visualMode === 'hyperframes'
            ? 'MOTION ONLY. Use exclusively designed vector shapes and kinetic typography. No generated images, photos, clips or 3D files.'
            : '',
          brief.production?.soundEffects?.length
            ? 'Synchronize visible action to these timed sound cues. The engine places their audio: ' +
              brief.production.soundEffects
                .map(
                  (cue) =>
                    `${cue.sound} at ${(seconds * cue.position).toFixed(2)}s`,
                )
                .join(', ')
            : '',
          silent ? 'No voiceover.' : '',
          brief.production?.music === false ? 'No background music.' : '',
        ]
          .join('\n')
          .slice(0, 4000)
        used.add('video_make')
        return system.invokeTool('video_make', ctx, {
          projectId,
          seconds: Math.max(5, Math.round(seconds)),
          brief: words,
          voice: 'marin',
          files: request.files,
          reference: request.referenceFile ?? request.referenceUrl,
        })
      }
      const tools = system.availableTools.filter(
        (item) => item.id !== 'video_make',
      )
      const functions = tools.map((item) => {
        const parameters = z.toJSONSchema(item.input, { io: 'input' })
        delete parameters.$schema
        return {
          type: 'function' as const,
          name: item.id,
          description: item.description,
          parameters,
          strict: false,
        }
      })
      const input: ResponseInput = [
        {
          role: 'user',
          content: JSON.stringify({ projectId, request: request.message }),
        },
      ]
      for (let step = 0; step < 8; step++) {
        signal.throwIfAborted()
        const next = await createOpenAIResponse(
          {
            instructions:
              system.harness +
              ' Edit only this video. Use the available tools for the requested change. Read the results of asset tools and place assets before finishing. Use video_export to finish and render. Project identity is supplied by the application.',
            input,
            tools: functions,
            tool_choice: 'required',
            parallel_tool_calls: false,
            max_output_tokens: 4200,
          },
          signal,
        )
        const call = next.output.find((item) => item.type === 'function_call')
        const tool = tools.find((item) => item.id === call?.name)
        if (!call || !tool)
          throw new AppError('SERVICE_UNAVAILABLE', {
            key: 'so-video-tool-selection',
          })
        const result = await system.invokeTool(tool.id, ctx, {
          ...JSON.parse(call.arguments),
          projectId,
        })
        used.add(tool.id)
        if (tool.endsStep) return result
        input.push(call, {
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(result).slice(0, 16000),
        })
      }
      throw new AppError('SERVICE_UNAVAILABLE', {
        key: 'so-video-edit-step-limit',
      })
    })
  try {
    return await build()
  } catch (error) {
    if (
      selected ||
      replay ||
      !(error instanceof Error) ||
      error.name !== 'ContinuityError'
    )
      throw error
    repair = `The previous render failed its frame check: ${error.message}. Keep the subject, light and camera moving along smooth paths through those times. Animate each handoff over several frames.`
    ctx.reportActivity?.('กำลังแก้จังหวะที่เฟรมกระโดด')
    return build()
  }
}
