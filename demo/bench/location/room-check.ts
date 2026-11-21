import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { listProducts } from '../../catalog.js'
import { imageDir, root } from '../../common.js'
import { detectProduct } from '../../detect.js'
import { locateProduct, type BoundingBox } from '../../localize.js'

type RoomCase = {
  image: string
  expected_id: string
  location_target: string
  box: BoundingBox | null
}
const folder = path.dirname(fileURLToPath(import.meta.url))
const cases: RoomCase[] = JSON.parse(await readFile(path.join(folder, 'room-annotations.json'), 'utf8')).cases
const catalog = await listProducts()
const resultFile = path.join(folder, 'room-results.json')
type RoomObservation = RoomCase & {
  fingerprint: string
  match: Awaited<ReturnType<typeof detectProduct>>
  locations: { model: string; predicted: BoundingBox | null; latency_ms: number; iou: number | null }[]
}
const observations: RoomObservation[] = []
const history: RoomObservation[] = process.argv.includes('--resume')
  ? JSON.parse(await readFile(resultFile, 'utf8')).observations : []
function overlap(a: BoundingBox, b: BoundingBox | null) {
  if (!b) return 0
  const w = Math.max(0, Math.min(a.x+a.width,b.x+b.width) - Math.max(a.x,b.x))
  const h = Math.max(0, Math.min(a.y+a.height,b.y+b.height) - Math.max(a.y,b.y))
  return w*h / (a.width*a.height + b.width*b.height - w*h)
}
for (const [i, scene] of cases.entries()) {
  const target = catalog.find(item => item.id === scene.location_target)
  if (!target) throw Error('Demo catalog lacks required SKU ' + scene.location_target)
  const frame = await readFile(path.join(root, scene.image))
  const references = await Promise.all(target.images.map(file => readFile(path.join(imageDir, file))))
  const hash = createHash('sha256').update(frame).update(JSON.stringify({ catalog, scene }))
  for (const ref of references) hash.update(ref)
  const fingerprint = hash.digest('hex')
  const previous = history.find(row => row.fingerprint === fingerprint)
  if (previous) { observations.push(previous); continue }
  const match = await detectProduct(frame, 'choice')
  const locations = []
  const models = i % 2 ? ['gpt-6.2-astra', 'gpt-6.2-sol'] : ['gpt-6.2-sol', 'gpt-6.2-astra']
  for (const model of models) {
    const start = performance.now()
    const predicted = await locateProduct(frame, { ...target, references }, model)
    const latency_ms = Math.round(performance.now()-start)
    const iou = scene.box ? overlap(scene.box, predicted) : null
    locations.push({ model, predicted, latency_ms, iou })
  }
  observations.push({ ...scene, fingerprint, match, locations })
  console.log(scene.image, match.product_id, match.latency_ms, locations.map(r => [r.model,r.latency_ms,r.iou,r.predicted ? 'box' : 'none']))
}
await writeFile(resultFile, JSON.stringify({
  timestamp: new Date().toISOString(), catalog_size: catalog.length, classification: 'gpt-6-luna / choice / image only',
  protocol: 'Classify against the demo catalog without names or captions in the frame input. Then ground the fixed target with each model, including on the empty-background control. Compare with annotations recorded before inference. The control has no injected item.',
  observations,
}, null, 2) + '\n')
