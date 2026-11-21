import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from 'node:http'
import { once } from 'node:events'
import type { AddressInfo } from 'node:net'
import sharp from 'sharp'

test('opt-in localization preserves the classification, orientation and catalog snapshot', async t => {
  const folder = await mkdtemp(path.join(tmpdir(), 'demo-localize-'))
  t.after(() => rm(folder, { recursive: true, force: true }))
  process.env.DEMO_DATA_DIR = folder
  process.env.OPENAI_API_KEY = 'fake-local-fixture'
  const frame = await sharp({ create: { width: 600, height: 300, channels: 3, background: '#ccc' } })
    .composite([{ input: await sharp({ create: { width: 150, height: 120, channels: 3, background: '#667788' } }).png().toBuffer(), left: 50, top: 30 }])
    .jpeg().withMetadata({ orientation: 6 }).toBuffer()
  const reference = await sharp({ create: { width: 80, height: 40, channels: 3, background: '#555' } }).jpeg().toBuffer()
  let winner = 'cup'
  let box: unknown = { left: 10, top: 100, right: 900, bottom: 700 }
  let responseStatus = 200
  let afterDecision: (() => Promise<void>) | undefined
  const requests: { model: string; text: { format: { strict: boolean } }; input: { content: { type: string; image_url?: string; text?: string }[] }[] }[] = []
  const upstream = createServer(async (req, res) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const request = JSON.parse(Buffer.concat(chunks).toString())
    res.setHeader('Content-Type', 'application/json')
    if (req.url === '/v1/decisions') {
      await afterDecision?.()
      const answer = request.questions[0].type === 'choice' ? {
        type: 'choice', name: 'product', choice: winner, confidence: 0.95,
        probabilities: ['cup', 'none'].map(value => ({ value, probability: value === winner ? 0.95 : 0.05 })),
      } : { type: 'predicate', name: 'match_cup', probability: 0.95 }
      res.end(JSON.stringify({ answers: [answer, { type: 'predicate', name: 'held_up', probability: 0.6 }] }))
    } else if (req.url === '/v1/responses') {
      requests.push(request)
      res.statusCode = responseStatus
      res.end(JSON.stringify({ object: 'response', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [
        { type: 'output_text', text: JSON.stringify({ scene_evidence: 'object is visible', box }), annotations: [] },
      ] }] }))
    } else res.writeHead(404).end()
  })
  upstream.listen(0, '127.0.0.1')
  await once(upstream, 'listening')
  t.after(() => upstream.close())
  process.env.OPENAI_BASE_URL = 'http://127.0.0.1:' + (upstream.address() as AddressInfo).port + '/v1'
  const { addProduct, deleteProduct } = await import('../catalog.js')
  const { detectProduct } = await import('../detect.js')
  const fields = { id: 'cup', name: 'original cup', price: 30, description: 'red handle' }
  await addProduct(fields, [reference])
  const normal = await detectProduct(frame, 'choice')
  assert.equal(normal.localization_status, 'skipped')
  assert.equal(normal.bbox, null)
  winner = 'none'
  const noMatch = await detectProduct(frame, 'choice', undefined, true)
  assert.equal(noMatch.localization_status, 'skipped')
  assert.equal(requests.length, 0)
  winner = 'cup'
  const empty = await detectProduct(reference, 'choice', undefined, true)
  assert.equal(empty.product_id, 'cup')
  assert.equal(empty.localization_status, 'not_found')
  assert.equal(empty.bbox, null)
  assert.equal(requests.length, 0)
  const found = await detectProduct(frame, 'choice', 'caption must not reach locator', true)
  assert.deepEqual(found.bbox, { x: 0.01, y: 0.1, width: 0.89, height: 0.6 })
  assert.equal(found.localization_status, 'found')
  assert.equal(requests[0].model, 'gpt-6.2-sol')
  assert.equal(requests[0].text.format.strict, true)
  const parts = requests[0].input[0].content
  assert.deepEqual(parts.map(p => p.type), ['input_text', 'input_image', 'input_text', 'input_image'])
  assert.ok(parts[0].text?.includes('"sku":"cup"'))
  assert.ok(!JSON.stringify(requests[0]).includes('caption must not reach locator'))
  const imageParts = parts.filter(p => p.type === 'input_image')
  for (const part of imageParts) {
    const url = part.image_url ?? ''
    assert.ok(url.startsWith('data:image/jpeg;base64,'))
    const { format, width, height } = await sharp(Buffer.from(url.split(',')[1], 'base64')).metadata()
    assert.equal(format, 'jpeg')
    assert.ok(width! <= 512 && height! <= 512)
  }
  const upright = await sharp(Buffer.from(imageParts.at(-1)!.image_url!.split(',')[1], 'base64')).metadata()
  assert.ok(upright.height! > upright.width!)
  assert.equal(upright.height, 512)
  box = null
  assert.equal((await detectProduct(frame, 'reference', undefined, true)).localization_status, 'not_found')
  for (const invalidBox of [{ left: 10, top: 0, right: 8, bottom: 700 }, { left: -1, top: 0, right: 40, bottom: 40 }]) {
    box = invalidBox
    const result = await detectProduct(frame, 'reference', undefined, true)
    assert.equal(result.product_id, 'cup')
    assert.equal(result.bbox, null)
    assert.equal(result.localization_status, 'unavailable')
  }
  responseStatus = 503
  const offline = await detectProduct(frame, 'choice', undefined, true)
  assert.equal(offline.product_id, 'cup')
  assert.equal(offline.localization_status, 'unavailable')
  responseStatus = 200
  afterDecision = async () => {
    await deleteProduct('cup')
    await addProduct({ ...fields, name: 'replacement cup' }, [reference])
  }
  const callsBeforeEdit = requests.length
  const edited = await detectProduct(frame, 'choice', undefined, true)
  assert.equal(edited.product_name, fields.name)
  assert.equal(edited.localization_status, 'unavailable')
  assert.equal(requests.length, callsBeforeEdit)
})
