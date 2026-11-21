import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import sharp from 'sharp'

async function serve(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port
}
const exec = promisify(execFile)
test('catalog, Detect HTTP, seed and paired evaluation against a local Decisions fixture', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'live-detect-test-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  process.env.DEMO_DATA_DIR = path.join(folder, 'data')
  process.env.DEMO_EVAL_DIR = path.join(folder, 'eval')
  process.env.OPENAI_API_KEY = 'offline-test-key'
  let status = 200
  let requests = 0
  const upstream = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    assert.equal(req.url, '/v1/decisions')
    assert.equal(req.headers.authorization, 'Bearer offline-test-key')
    assert.equal(body.input[0].content[0].type, 'input_image')
    requests++
    const answers = body.questions.map((q: { name: string; type: string }) => q.type === 'choice' ?
      { ...q, choice: 'chili', confidence: 0.9, probabilities: [{ value: 'chili', probability: 0.95 }, { value: 'none', probability: 0.05 }] } :
      { name: q.name, type: q.type, probability: 0.91 })
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ answers }))
  })
  process.env.OPENAI_BASE_URL = await serve(upstream) + '/v1'
  t.after(() => upstream.close())
  const { default: app } = await import('../app.js')
  const server = createServer(app)
  const url = await serve(server)
  t.after(() => server.close())
  const json = (route: string, data: unknown) => fetch(url + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  })
  const sample = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#ec9511' } }).png().toBuffer()
  const image = 'data:image/png;base64,' + sample.toString('base64')
  const fields = { id: 'chili', name: 'น้ำพริก', description: 'ฝาแดง', price: 25, images: [image] }
  for (const page of ['/catalog', '/detect']) assert.equal((await fetch(url + page)).status, 200)
  const detectPage = await (await fetch(url + '/detect')).text()
  const samples = [...detectPage.matchAll(/data-example="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(samples, ['/examples/room-photo.jpg', '/examples/kitchen-room.jpg'])
  for (const samplePath of samples) {
    const sampleResponse = await fetch(url + samplePath)
    assert.equal(sampleResponse.status, 200)
    const sampleImage = await sharp(Buffer.from(await sampleResponse.arrayBuffer())).metadata()
    assert.equal(sampleImage.format, 'jpeg')
  }
  assert.equal((await json('/api/catalog', { ...fields, images: [] })).status, 400)
  const added = await json('/api/catalog', fields)
  assert.equal(added.status, 201)
  const product = await added.json()
  const stored = await fetch(url + '/images/' + product.images[0])
  const metadata = await sharp(Buffer.from(await stored.arrayBuffer())).metadata()
  assert.deepEqual([metadata.format, metadata.width], ['jpeg', 512])
  assert.equal((await json('/api/catalog', fields)).status, 409)
  for (const body of [
    { method: 'choice' }, { image, method: 'unknown' }, { image, method: 'choice', text: 123 },
    { image: 'data:image/jpeg;base64,YmFk', method: 'reference' },
  ]) {
    const result = await json('/api/detect', body)
    assert.equal(result.status, 400)
    assert.equal(typeof (await result.json()).error, 'string')
  }
  assert.equal(requests, 0)
  for (const method of ['choice', 'reference']) {
    const detect = await json('/api/detect', { image, method, text: 'ฝาสีแดง' })
    const result = await detect.json()
    assert.equal(detect.status, 200)
    assert.equal(result.product_id, 'chili')
    assert.equal(result.held_up, true)
    assert.ok(result.latency_ms >= 0)
  }
  status = 429
  assert.equal((await json('/api/detect', { method: 'choice', image })).status, 429)
  status = 200
  const frames = path.join(process.env.DEMO_EVAL_DIR, 'frames', 'chili')
  await mkdir(frames, { recursive: true })
  await writeFile(path.join(frames, '01.jpg'), await sharp(sample).jpeg().toBuffer())
  await writeFile(path.join(frames, '01.txt'), 'ฝาสีแดง')
  const before = requests
  await exec(process.execPath, ['--import', 'tsx', 'eval.ts'])
  assert.equal(requests - before, 4)
  const report = await readFile(path.join(process.env.DEMO_EVAL_DIR, 'results.md'), 'utf8')
  assert.equal(report.match(/100\.0%/g)?.length, 4)
  assert.equal((await fetch(url + '/api/catalog/chili', { method: 'DELETE' })).status, 204)
  assert.equal((await fetch(url + '/images/' + product.images[0])).status, 404)
  const beforeEmpty = requests
  for (const method of ['choice', 'reference']) {
    assert.equal((await json('/api/detect', {image, method})).status, 409)
  }
  assert.equal(requests, beforeEmpty)
  for (const id of ['chili', 'soap', 'basket']) {
    const seedDir = path.join(process.env.DEMO_DATA_DIR, 'seed', id)
    await mkdir(seedDir, { recursive: true })
    await writeFile(path.join(seedDir, '01.png'), sample)
  }
  for (let i = 0; i < 2; i++) await exec(process.execPath, ['--import', 'tsx', 'seed.ts'])
  assert.equal((await (await fetch(url + '/api/catalog')).json()).length, 3)
  assert.equal((await readdir(path.join(process.env.DEMO_DATA_DIR, 'images'))).length, 3)
})
