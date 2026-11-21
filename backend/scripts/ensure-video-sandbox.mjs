// Runs before `npm run dev`: the video director prepares and checks scenes inside a
// disposable Docker container, so the daemon must be up and the image must exist.
// It never stops the dev server: if Docker cannot be prepared it says so loudly and
// continues, because everything except film production still works.
import { execFile, spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const context = path.join(backend, 'integrations', 'video-sandbox')
const image = process.env.VIDEO_SANDBOX_IMAGE?.trim() || 'sea-video-sandbox:0.9.75'
const tag = '[video-sandbox]'
const say = (message) => console.log(`${tag} ${message}`)
const warn = (message) => console.warn(`${tag} WARNING: ${message}`)

const daemonUp = () =>
  exec('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15000 }).then(
    () => true,
    () => false,
  )
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function startDaemon() {
  if (process.platform === 'darwin') {
    say('Docker is not running, opening Docker Desktop…')
    await exec('open', ['-a', 'Docker']).catch(() => undefined)
  } else if (process.platform === 'win32') {
    say('Docker is not running, opening Docker Desktop…')
    spawn('cmd', ['/c', 'start', '', 'Docker Desktop'], { stdio: 'ignore', detached: true }).unref()
  } else {
    return false
  }
  for (let waited = 0; waited < 180; waited += 3) {
    await sleep(3000)
    if (await daemonUp()) return true
  }
  return false
}

async function imageExists() {
  try {
    await exec('docker', ['image', 'inspect', image], { timeout: 15000 })
    return true
  } catch {
    return false
  }
}

function build() {
  return new Promise((resolve) => {
    say(`Building ${image} (first run only, a few minutes)…`)
    const child = spawn('docker', ['build', '-t', image, context], { stdio: 'inherit' })
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

async function main() {
  try {
    await exec('docker', ['--version'], { timeout: 10000 })
  } catch {
    warn('Docker is not installed. Video films cannot be produced until it is.')
    return
  }
  if (!(await daemonUp()) && !(await startDaemon())) {
    warn('Docker did not start. Start Docker Desktop, then restart the dev server.')
    return
  }
  if (await imageExists()) {
    say(`Docker is up and ${image} is ready.`)
    return
  }
  if (process.env.VIDEO_SANDBOX_IMAGE?.trim()) {
    warn(`${image} is not present and is not built here. Pull or build it yourself.`)
    return
  }
  if (await build()) say(`${image} is ready.`)
  else warn(`Building ${image} failed. Film production will fail until it is built.`)
}

await main()
