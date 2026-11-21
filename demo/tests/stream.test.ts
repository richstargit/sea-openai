import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'

function latch() {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

async function listen(server: Server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return 'http://127.0.0.1:' + (server.address() as AddressInfo).port
}

async function* readLines(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      const lines = (pending + decoder.decode(value, { stream: true })).split('\n')
      pending = lines.pop()!
      for (const line of lines) yield JSON.parse(line)
    }
    assert.equal(pending + decoder.decode(), '')
  } finally {
    reader.releaseLock()
  }
}

test('frame stream delivers the match while location is pending, including failure, none and disconnect', { timeout: 18000 }, async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'frame-stream-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  process.env.DEMO_DATA_DIR = dir
  process.env.OPENAI_API_KEY = 'local-stream-fixture'
  let decisionOK = true
  let locationOK = true
  let winner = 'mug'
  let locationCalls = 0
  let locationStart = latch()
  let disconnected = latch()
  let allowLocation = latch()
  t.after(() => allowLocation.release())
  const upstream = createServer(async (req, res) => {
    const chunks = []
    for await (const data of req) chunks.push(data)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/decisions') {
      assert.equal(body.questions[0].type, 'choice')
      assert.deepEqual(body.input[0].content.map((part: {type: string}) => part.type), ['input_image'])
      res.statusCode = decisionOK ? 200 : 429
      res.end(JSON.stringify({ answers: [
        { type: 'choice', name: 'product', choice: winner, confidence: 0.8, probabilities: [
          { value: winner, probability: 0.8 }, { value: winner === 'none' ? 'mug' : 'none', probability: 0.2 },
        ] },
        { type: 'predicate', name: 'held_up', probability: 0.9 },
      ] }))
    } else if (req.url === '/v1/responses') {
      locationCalls++
      res.once('close', disconnected.release)
      locationStart.release()
      await allowLocation.promise
      res.statusCode = locationOK ? 200 : 503
      res.end(JSON.stringify({ object: 'response', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [
        { type: 'output_text', text: JSON.stringify({ scene_evidence: 'present', box: { left: 200, top: 250, right: 600, bottom: 800 } }), annotations: [] },
      ] }] }))
    } else res.writeHead(404).end()
  })
  process.env.OPENAI_BASE_URL = await listen(upstream) + '/v1'
  t.after(() => { upstream.closeAllConnections(); upstream.close() })
  const { default: app } = await import('../app.js')
  const { addProduct } = await import('../catalog.js')
  const api = createServer(app)
  const url = await listen(api) + '/api/detect/frame'
  t.after(() => { api.closeAllConnections(); api.close() })
  const frame = await sharp(Buffer.from('<svg width="80" height="60"><rect width="80" height="60" fill="white"/><rect x="15" y="13" width="30" height="35" fill="black"/></svg>')).jpeg().toBuffer()
  await addProduct({ id: 'mug', name: 'แก้ว', price: 20, description: 'แก้วใบสีดำ' }, [frame])
  const image = 'data:image/jpeg;base64,' + frame.toString('base64')
  const send = (value: string, signal = AbortSignal.timeout(5000)) => fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ image: value }),
  })

  // The localizer cannot respond until AFTER the client has received and parsed the match.
  const first = await send(image)
  assert.match(first.headers.get('content-type')!, /application\/x-ndjson/)
  const lines = readLines(first)
  const { value: match } = await lines.next()
  assert.deepEqual([match.type, match.product_id, match.held_up], ['match', 'mug', true])
  assert.equal(match.probabilities[0].p, 0.8)
  await locationStart.promise
  allowLocation.release()
  const { value: location } = await lines.next()
  assert.deepEqual(location.bbox, { x: 0.2, y: 0.25, width: 0.4, height: 0.55 })
  assert.equal(location.type, 'location')
  assert.equal(location.localization_status, 'found')
  assert.ok(location.latency_ms >= match.latency_ms)
  assert.equal((await lines.next()).done, true)

  winner = 'none'
  const none = readLines(await send(image))
  assert.equal((await none.next()).value.product_id, 'none')
  const skipped = (await none.next()).value
  assert.equal(skipped.localization_status, 'skipped')
  assert.equal(skipped.bbox, null)
  assert.equal((await none.next()).done, true)
  assert.equal(locationCalls, 1)

  winner = 'mug'
  locationOK = false
  const failed = readLines(await send(image))
  assert.equal((await failed.next()).value.product_id, 'mug')
  const unavailable = (await failed.next()).value
  assert.equal(unavailable.localization_status, 'unavailable')
  assert.equal(unavailable.bbox, null)
  assert.equal((await failed.next()).done, true)
  decisionOK = false
  const limit = await send(image)
  assert.equal(limit.status, 429)
  assert.ok((await limit.json()).error)
  assert.equal((await send('not-an-image')).status, 400)

  decisionOK = true
  locationOK = true
  locationStart = latch()
  disconnected = latch()
  allowLocation = latch()
  const controller = new AbortController()
  const last = readLines(await send(image, controller.signal))
  assert.equal((await last.next()).value.type, 'match')
  await locationStart.promise
  controller.abort()
  await disconnected.promise
  allowLocation.release()
  await last.return(undefined)
})
