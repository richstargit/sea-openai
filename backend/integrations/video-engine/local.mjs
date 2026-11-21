import { execFile, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  rm,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { load } from 'cheerio'
import { promisify } from 'node:util'
import { filmFps, inspectContinuousRender } from './continuity.mjs'
import { placeSoundEffects, readSoundPlan } from './sound-effects.mjs'
import { withEngine } from './runtime.mjs'
import { VIDEO_TOOLS } from './video.tool.mjs'
import { AGENT_HARNESS } from './harness.prompt.mjs'
const syscall = promisify(execFile)
const require = createRequire(import.meta.url)
const remoteTools = new Set([
  'video_veo_clip',
  'video_veo_clips',
  'video_restyle',
  'video_lipsync_clip',
  'video_avatar_clip',
])
export const availableTools = VIDEO_TOOLS.filter(
  (tool) => !remoteTools.has(tool.id) && tool.id !== 'video_blender',
)
export const providerTools = [...remoteTools]
export const harness = AGENT_HARNESS
const root = '/home/node/workspace'
const policies =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; worker-src blob:; base-uri 'none'; form-action 'none'; object-src 'none'\">"

async function checkedDirectory(
  source,
  destination,
  stats = { bytes: 0, files: 0 },
) {
  await mkdir(destination, { recursive: true })
  for (const item of await readdir(source, { withFileTypes: true })) {
    if (
      item.name.startsWith('.') ||
      item.name === 'node_modules' ||
      item.name === 'renders'
    )
      continue
    const from = join(source, item.name),
      to = join(destination, item.name)
    if (item.isDirectory()) {
      await checkedDirectory(from, to, stats)
      continue
    }
    if (!/^[A-Za-z0-9 _.-]+$/.test(item.name))
      throw new Error('Invalid render filename')
    if (
      !/\.(html|css|js|svg|json|png|webp|jpe?g|gif|webm|mp4|mov|mp3|m4a|wav|aac|ogg|woff2?|ttf|glb|gltf|bin|txt)$/i.test(
        item.name,
      )
    )
      continue
    if (/(?:^package(?:-lock)?|^hyperframes[.-]|\.config\.)/i.test(item.name))
      continue
    if (!item.isFile()) throw new Error('Unexpected link in rendered project')
    if (++stats.files > 1500) throw new Error('Project contains too many files')
    const bytes = await readFile(from)
    stats.bytes += bytes.length
    if (stats.bytes > 200 * 1024 * 1024)
      throw new Error('Project exceeds the renderer budget')
    if (item.name.endsWith('.html')) {
      let html = bytes
        .toString()
        .replace(
          /https?:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^/"']+\/dist\/gsap\.min\.js/g,
          'assets/gsap.min.js',
        )
      if (/<head[\s>]/i.test(html))
        html = html.replace(/<head[^>]*>/i, (open) => open + policies)
      await writeFile(to, html)
    } else await writeFile(to, bytes)
  }
}

function dockerInput(args, bytes, signal, limit) {
  return new Promise((ok, fail) => {
    const child = spawn('docker', args, {
      signal,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const chunks = []
    let length = 0
    let error = ''
    child.stdout.on('data', (part) => {
      length += part.length
      if (length > limit) child.kill()
      else chunks.push(part)
    })
    child.stderr.on('data', (part) => {
      error = (error + part).slice(-500)
    })
    child.on('error', fail)
    child.on('close', (code) =>
      code === 0 && length <= limit
        ? ok(Buffer.concat(chunks))
        : fail(new Error(error || 'Video sandbox file transfer failed')),
    )
    child.stdin.on('error', () => {})
    child.stdin.end(bytes)
  })
}

export async function runProject(host, action) {
  const { projectId, signal } = host
  if (!/^[a-z0-9-]{1,48}$/.test(projectId))
    throw new Error('Invalid film project')
  const dir = await mkdtemp(join(tmpdir(), 'sea-film-job-'))
  const container = 'sea-film-' + randomUUID()
  const work = join(dir, 'workspace')
  const relative = 'video-projects/' + projectId
  const project = join(work, relative)
  const isolated = AbortSignal.any([signal, AbortSignal.timeout(14 * 60_000)])
  const docker = (args, opts = {}) =>
    syscall('docker', args, {
      signal: isolated,
      timeout: 120_000,
      maxBuffer: 8 * 1024 * 1024,
      ...opts,
    })
  try {
    await mkdir(join(project, 'assets'), { recursive: true })
    await mkdir(join(project, 'compositions'))
    await cp(
      require.resolve('gsap/dist/gsap.min.js'),
      join(project, 'assets', 'gsap.min.js'),
    )
    const index = `<!doctype html><html><head><meta charset="utf-8"><script src="assets/gsap.min.js"></script><style>*{box-sizing:border-box}html,body{margin:0;width:720px;height:1280px;overflow:hidden}#root{position:relative;width:720px;height:1280px;overflow:hidden}</style></head><body><div id="root" data-composition-id="main" data-width="720" data-height="1280" data-start="0" data-duration="0"></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});window.__timelines.main=tl;</script></body></html>`
    await writeFile(join(project, 'index.html'), index)
    await docker([
      'run',
      '-d',
      '--rm',
      '--name',
      container,
      '--init',
      '--network',
      'none',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--read-only',
      '--tmpfs',
      '/tmp:rw,nosuid,size=1g',
      '--shm-size',
      '384m',
      '--pids-limit',
      '512',
      '--memory',
      '3g',
      '--cpus',
      '4',
      '--user',
      `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
      '--env',
      'HOME=/tmp/home',
      '--mount',
      `type=bind,source=${work},target=${root}`,
      '--workdir',
      root,
      process.env.VIDEO_SANDBOX_IMAGE || 'sea-video-sandbox:0.9.75',
      'sleep',
      'infinity',
    ])
    const exec = async ({ command, timeoutMs }) => {
      try {
        const r = await docker(['exec', container, 'bash', '-lc', command], {
          timeout: Math.min(timeoutMs ?? 90000, 180000),
        })
        return { ...r, exitCode: 0 }
      } catch (e) {
        isolated.throwIfAborted()
        return {
          stdout: String(e.stdout ?? ''),
          stderr: String(e.stderr ?? e.message),
          exitCode: typeof e.code === 'number' ? e.code : 1,
        }
      }
    }
    const read = (file, limit = 8 * 1024 * 1024) =>
      dockerInput(
        ['exec', container, 'cat', '--', file],
        undefined,
        isolated,
        limit,
      )
    const write = async (directory, files) => {
      for (const file of files) {
        if (
          !file.path ||
          file.path.startsWith('/') ||
          file.path.split('/').includes('..')
        )
          throw new Error('Invalid project filename')
        await dockerInput(
          [
            'exec',
            '-i',
            container,
            'node',
            '-e',
            "const fs=require('fs');const p=process.argv[1];fs.mkdirSync(require('path').dirname(p),{recursive:true});process.stdin.pipe(fs.createWriteStream(p))",
            directory + '/' + file.path,
          ],
          file.bytes,
          isolated,
          4096,
        )
      }
    }
    const list = async (directory) => {
      const r = await docker([
        'exec',
        container,
        'node',
        '-e',
        "const f=require('fs'),p=process.argv[1];console.log(JSON.stringify(f.readdirSync(p,{withFileTypes:true}).map(e=>({name:e.name,type:e.isDirectory()?'directory':'file',size:f.lstatSync(p+'/'+e.name).size}))))",
        directory,
      ])
      return JSON.parse(r.stdout)
    }
    if (!host.graphicsOnly) {
      const copied = await exec({
        command: `cp /opt/video/three.js '${root}/${relative}/assets/three.js'`,
      })
      if (copied.exitCode)
        throw new Error('Rebuild the video sandbox to install the 3D runtime')
    }
    const prior = await host.restore()
    if (prior)
      await dockerInput(
        [
          'exec',
          '-i',
          container,
          'tar',
          '-xzf',
          '-',
          '-C',
          root + '/' + relative,
        ],
        prior,
        isolated,
        4096,
      )
    const runtime = { ...host, exec, read, write, list }
    const directory = root + '/' + relative
    if (prior && host.soundEffects === null) runtime.soundEffects = await readSoundPlan(runtime, directory)
    const result = await withEngine(runtime, () => action(runtime))
    if (Array.isArray(runtime.soundEffects))
      await placeSoundEffects(runtime, directory, runtime.soundEffects)
    const archive = await dockerInput(
      [
        'exec',
        container,
        'tar',
        '--exclude=.hyperframes',
        '--exclude=renders',
        '-czf',
        '-',
        '-C',
        root + '/' + relative,
        '.',
      ],
      undefined,
      isolated,
      100 * 1024 * 1024,
    )
    const exportDir = join(dir, 'export')
    await docker(['stop', '-t', '1', container])
    await checkedDirectory(project, exportDir)
    const render = async () => {
      const output = join(dir, 'film.webm')
      const { HOME, PATH, LANG, TMPDIR } = process.env
      await syscall(
        process.execPath,
        [
          resolve('node_modules/hyperframes/bin/hyperframes.mjs'),
          'render',
          exportDir,
          '--output',
          output,
          '--format',
          'webm',
          '--fps',
          String(filmFps),
          '--workers',
          '2',
        ],
        {
          cwd: exportDir,
          env: { HOME, PATH, LANG, TMPDIR, HYPERFRAMES_NO_TELEMETRY: '1' },
          signal: isolated,
          timeout: 480_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      )
      const verifiedBytes = async (file) => {
        if (host.continuous) {
          const count = await inspectContinuousRender(file, isolated)
          host.log(`ตรวจความต่อเนื่องครบ ${count} เฟรม`)
        }
        return readFile(file)
      }
      if ((await stat(output)).size <= 8 * 1024 * 1024) return verifiedBytes(output)
      const { stdout } = await syscall(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'format=duration',
          '-of',
          'csv=p=0',
          output,
        ],
        { signal: isolated },
      )
      const compressed = join(dir, 'compressed.webm')
      await syscall(
        'ffmpeg',
        [
          '-v',
          'error',
          '-i',
          output,
          '-c:v',
          'libvpx-vp9',
          '-b:v',
          String(Math.floor(48_000_000 / Number(stdout.trim()))),
          '-c:a',
          'libopus',
          compressed,
        ],
        { signal: isolated, timeout: 300_000 },
      )
      return verifiedBytes(compressed)
    }
    const page = load(await readFile(join(exportDir, 'index.html'), 'utf8'))
    const boundaries = new Set()
    for (const node of page('[data-composition-src][data-start]').toArray()) {
      const scene = page(node)
      const start = Number(scene.attr('data-start'))
      const duration = Number(scene.attr('data-duration'))
      if (!Number.isFinite(start)) continue
      boundaries.add(start)
      for (const offset of (scene.attr('data-continuous-beats') ?? '').split(',').map(Number)) {
        if (offset > 0 && offset < duration) boundaries.add(start + offset)
      }
    }
    const sceneStarts = [...boundaries].sort((a, b) => a - b)
    return await host.finish({ result, archive, render, sceneStarts })
  } finally {
    await syscall('docker', ['rm', '-f', container], { timeout: 10000 }).catch(
      () => {},
    )
    await rm(dir, { recursive: true, force: true })
  }
}

export function invokeTool(name, ctx, input) {
  const tool = availableTools.find((entry) => entry.id === name)
  if (!tool) throw new Error('This video tool needs an additional provider')
  return tool.run(ctx, tool.input.parse(input))
}
