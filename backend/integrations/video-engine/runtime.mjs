import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import { readFile as readLocal, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'

const context = new AsyncLocalStorage()
export const withEngine = (runtime, action) => context.run(runtime, action)
function host() {
  const runtime = context.getStore()
  if (!runtime) throw new Error('Missing video project context')
  return runtime
}
export class AppError extends Error {
  constructor(code, options) {
    super(options.message || options.key)
    this.key = options.key
    this.codeName = code
  }
}
export const ATTACHMENT_ID = /^[a-f0-9-]{36}$/i
export const STUDIO_SANDBOX = 'video-studio'
export const defineTool = (definition) => definition
export const textOf = (content) =>
  typeof content === 'string'
    ? content
    : content.map((part) => part.text || '').join('')
export const agentConfig = () => ({
  videoModel: process.env.OPENAI_MODEL || 'gpt-6.2-astra',
})
export const logger = {
  warn: (event) => host().log(event),
  info: (event) => host().log(event),
  error: (event) => host().log(event),
}
export const studioChatProject = async () => host().projectId
export const withoutNickname = async (_user, text) => text
export const videoModel = (options) => ({
  invoke: async (messages) => ({
    content: await host().ask(messages, options.maxTokens),
  }),
})
export const createChatModel = videoModel
export const isBudgetExhausted = (error) => error?.code === 'insufficient_quota'
export const sandbox = {
  exec: (_who, input) => host().exec(input),
  readFile: (_who, path, limit) => host().read(path, limit),
  writeFiles: (_who, dir, files) => host().write(dir, files),
  list: (_who, dir) => host().list(dir),
}
export const downloadAttachment = (_user, id) => host().file(id)
export const resolveAttachments = (_user, ids) =>
  Promise.all(ids.map((id) => host().file(id)))
export const listLibraryFiles = () => host().library()
export const uploadFile = (file) => host().save(file.fileName, file.bytes)
export const drawPicture = (options) => host().image(options)
export const plainTextOf = (file) => host().fileText(file.name, file.bytes)
export const extractPdfText = async (bytes) => ({
  text: await host().fileText('reference.pdf', bytes),
})
export async function renderPdfPage(bytes, page) {
  const name = `/tmp/ref-${randomUUID()}`
  await host().write('/tmp', [{ path: name.split('/').pop() + '.pdf', bytes }])
  const result = await host().exec({
    command: `pdftoppm -f ${Number(page)} -l ${Number(page)} -scale-to 900 -singlefile -png '${name}.pdf' '${name}'`,
    timeoutMs: 15000,
  })
  return result.exitCode === 0
    ? host().read(name + '.png', 8 * 1024 * 1024)
    : null
}
export const extractFilePictures = (file) => host().filePictures(file)
const skillRoots = [
  process.env.VIDEO_SKILLS_DIR,
  join(homedir(), '.agents/skills'),
  join(homedir(), '.codex/skills'),
  resolve('integrations/video-skills'),
].filter(Boolean)
export async function findEnabled(_user, name) {
  if (!/^[a-z0-9-]+$/.test(name)) return null
  for (const root of skillRoots) {
    try {
      return {
        id: name,
        root: join(root, name),
        markdown: await readLocal(join(root, name, 'SKILL.md'), 'utf8'),
      }
    } catch {}
  }
  return null
}
export const skillMdOf = (skill) => skill.markdown
export async function readFile(user, id, path) {
  const skill = await findEnabled(user, id)
  if (!skill) return null
  const root = await realpath(skill.root)
  const target = await realpath(resolve(root, path))
  if (!target.startsWith(root + sep)) throw new Error('Invalid skill reference')
  return { content: await readLocal(target) }
}
export async function mountSkill(ctx, name) {
  return !!(await findEnabled(ctx.userId, name))
}
export const VOICES = ['marin', 'cedar', 'coral', 'sage', 'Kore']
export const CLONED_VOICE = /^voice_[\w-]+$/
export async function speakText(_user, _role, projectId, input) {
  if (CLONED_VOICE.test(input.voice))
    throw new Error('Custom speech requires an enrolled voice provider')
  const bytes = await host().speech(
    input.text,
    input.voice === 'Kore' ? 'marin' : input.voice,
  )
  const name = 'voice-' + randomUUID().slice(0, 8)
  const dir = '/home/node/workspace/video-projects/' + projectId + '/assets'
  await host().write(dir, [{ path: name + '.pcm', bytes }])
  const result = await host().exec({
    command: `cd '${dir}' && ffmpeg -v error -f s16le -ar 24000 -ac 1 -i '${name}.pcm' -af loudnorm=I=-16:TP=-1.5:LRA=11 -y '${name}.mp3' && rm '${name}.pcm'`,
    timeoutMs: 30000,
  })
  if (result.exitCode) throw new Error('Speech encode failed')
  return {
    name: name + '.mp3',
    kind: 'audio',
    duration: bytes.length / 48000,
    hasAudio: true,
  }
}
const providerRequired = () => {
  throw new AppError('SERVICE_UNAVAILABLE', {
    key: 'so-video-footage-provider',
    message:
      'An AI video provider with footage, avatar or lip-sync support is required for this tool.',
  })
}
export const startClip = providerRequired
export const startRestyle = providerRequired
export const startJob = providerRequired
export const clipStatus = providerRequired
export const clipFile = providerRequired
export const devices = {
  pickDevice: () => null,
  callTool: () => {
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: 'af-local-device-offline',
      message: 'A paired Blender scene device is required.',
    })
  },
}
export const deleteFile = (_user, id) => host().removeFile(id)

export const fetchPublic = (url, options) =>
  host().fetchPublic(String(url), options?.signal)
export const continuousMotion = () => Boolean(host().continuous)
export const plannedEffects = () => host().soundEffects
export function sceneSoundGuide(start, duration, filmDuration) {
  const cues = host().soundEffects
  if (!Array.isArray(cues)) return ''
  const accents = cues
    .map((cue) => ({ sound: cue.sound, time: cue.position * filmDuration - start }))
    .filter((cue) => cue.time >= 0 && cue.time < duration)
    .map((cue) => `${cue.sound} at ${cue.time.toFixed(2)}s`)
  return accents.length
    ? `Synchronize visual actions to the master audio track at these local times: ${accents.join(', ')}. The master handles audio. `
    : 'The master handles audio. Author the visuals only. '
}
export const requestedShots = () => host().shots
export const chosenStyle = () => host().style || ''
export const transcribe = (audio, language) =>
  host().transcribe(audio, language)
export async function stagePublic(url, dir, name) {
  const response = await fetchPublic(url, {
    signal: AbortSignal.timeout(20000),
  })
  if (!response.ok) throw new Error('Public asset unavailable')
  await host().write(dir, [
    { path: name, bytes: Buffer.from(await response.arrayBuffer()) },
  ])
}

export function adaptBeats(beats) {
  const runtime = host()
  for (const beat of beats) {
    if (runtime.silent) beat.say = ''
    if (runtime.graphicsOnly) {
      delete beat.draw
      delete beat.photo
      delete beat.three
      delete beat.blender
      delete beat.footage
      beat.assets = []
    }
    if (beat.clip && !runtime.graphicsOnly && !beat.draw)
      beat.draw = { prompt: beat.clip.picture, cutout: false }
    delete beat.clip
  }
}
