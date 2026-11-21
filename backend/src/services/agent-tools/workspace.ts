import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { z } from 'zod'
import { Workspace } from '@/models/agent-storage.model.js'
import { mongo } from '@/models/mongo.js'
import { FILE_LIMIT } from '@/services/agent-tools/files.js'

export const workPath = z
  .string()
  .min(1)
  .max(240)
  .refine((value) =>
    value
      .split('/')
      .every(
        (segment) =>
          segment &&
          segment !== '.' &&
          segment !== '..' &&
          !/[\\\p{C}]/u.test(segment),
      ),
  )
const snapshot = z
  .array(z.strictObject({ path: workPath, data: z.base64() }))
  .max(64)
type Snapshot = z.infer<typeof snapshot>
function checked(files: Snapshot) {
  if (
    files.reduce((n, f) => n + Buffer.byteLength(f.data, 'base64'), 0) >
    FILE_LIMIT
  )
    throw new Error('Workspace exceeds 8 MiB')
  return snapshot.parse(files)
}
const runner = `
import base64, json, subprocess, sys
from pathlib import Path
payload = json.load(sys.stdin)
for item in payload["files"]:
    path = Path(item["path"])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(base64.b64decode(item["data"]))
with open("/tmp/output", "w+b") as output:
    result = subprocess.run(["sh", "-c", payload["command"]], stdout=output, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL, timeout=15)
    output.seek(0)
    text = output.read(64000).decode(errors="replace")
files = []
total = 0
for path in Path(".").rglob("*"):
    if path.is_symlink() or not path.is_file():
        continue
    total += path.stat().st_size
    if len(files) >= 64 or total > 8388608:
        sys.exit("Workspace exceeds limit")
    files.append({"path": str(path), "data": base64.b64encode(path.read_bytes()).decode()})
print(json.dumps({"files": files, "exitCode":result.returncode, "output":text}))
`

export class ToolWorkspace {
  private files?: Snapshot
  constructor(
    private readonly userId: string,
    private readonly thread?: string,
  ) {}
  private async load() {
    if (this.files) return this.files
    if (!this.thread) return []
    const row = await mongo(() => Workspace.findOne(this.filter()).lean())
    return checked(row?.files ?? [])
  }
  private filter() {
    return {
      _id: `${this.userId}:${this.thread}`,
      userId: this.userId,
      threadId: this.thread,
    }
  }
  private async save(files: Snapshot) {
    const next = checked(files)
    if (this.thread)
      await mongo(() =>
        Workspace.updateOne(
          this.filter(),
          { $set: { files: next } },
          { upsert: true },
        ),
      )
    this.files = next
  }
  async list() {
    return (await this.load()).map(({ path, data }) => ({
      path,
      bytes: Buffer.byteLength(data, 'base64'),
    }))
  }
  async read(path: string) {
    const file = (await this.load()).find((file) => file.path === path)
    if (!file) throw new Error('Workspace file does not exist')
    return Buffer.from(file.data, 'base64')
  }
  async write(path: string, bytes: Buffer) {
    workPath.parse(path)
    const files = (await this.load()).filter((file) => file.path !== path)
    if (
      files.some(
        (file) =>
          file.path.startsWith(`${path}/`) || path.startsWith(`${file.path}/`),
      )
    )
      throw new Error('A workspace file conflicts with a parent directory')
    await this.save([...files, { path, data: bytes.toString('base64') }])
    return { path, bytes: bytes.length }
  }
  async exec(command: string, signal: AbortSignal) {
    const files = await this.load()
    const name = `sea-tool-${randomUUID()}`
    const args = [
      'run',
      '--rm',
      '--pull=never',
      '--name',
      name,
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--user=65534:65534',
      '--memory=192m',
      '--cpus=1',
      '--pids-limit=32',
      '--tmpfs=/work:rw,nosuid,nodev,size=24m,mode=1777',
      '--tmpfs=/tmp:rw,nosuid,nodev,size=8m,mode=1777',
      '--workdir=/work',
      '-i',
      'python:3.13-alpine',
      'python',
      '-I',
      '-c',
      runner,
    ]
    signal.throwIfAborted()
    const result = await new Promise<string>((resolve, reject) => {
      const child = execFile(
        'docker',
        args,
        { signal, timeout: 22000, maxBuffer: 14 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error)
            reject(
              new Error(
                stderr.trim().slice(-500) || 'Local Docker execution failed',
              ),
            )
          else resolve(stdout)
        },
      )
      child.stdin?.on('error', () => {}).end(JSON.stringify({ files, command }))
    }).catch(async (error) => {
      await promisify(execFile)('docker', ['rm', '-f', name], {
        timeout: 3000,
      }).catch(() => {})
      throw error
    })
    const parsed = z
      .object({
        files: snapshot,
        exitCode: z.number().int(),
        output: z.string(),
      })
      .parse(JSON.parse(result))
    await this.save(parsed.files)
    return { exitCode: parsed.exitCode, text: parsed.output }
  }
}
