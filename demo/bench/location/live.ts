import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { locateProduct, type BoundingBox } from './baseline.js'
import { candidateModel, locateCandidate } from './candidate.js'
import type { Shop } from '../types.js'

const folder = path.dirname(fileURLToPath(import.meta.url))
const bench = path.dirname(folder)
const validation = process.argv.includes('--validation')
const annotations = await readFile(path.join(folder, validation ? 'validation.json' : 'annotations.json'))
export type Case = { shop: string; frame: string; target: string; box: BoundingBox | null }
const cases: Case[] = JSON.parse(annotations.toString()).cases
const trials = []
const candidate = process.argv.includes('--candidate')
const production = validation || process.argv.includes('--production')
const selected = production ? await import('../../ground-product.js') : undefined
const locate = selected?.locateProduct ?? (candidate ? locateCandidate : locateProduct)
const impl = production ? path.join(bench, '..', 'ground-product.ts') : path.join(folder, candidate ? 'candidate.ts' : 'baseline.ts')
const locatorHash = createHash('sha256').update(await readFile(impl)).digest('hex')
for (const condition of cases) {
  const shopRoot = path.join(bench, 'shops', condition.shop)
  const shop: Shop = JSON.parse(await readFile(path.join(shopRoot, 'shop.json'), 'utf8'))
  const product = shop.products.find(p => p.id === condition.target)
  if (!product) throw Error('Unknown target ' + condition.target)
  const references = await Promise.all(product.images.map(f => readFile(path.join(shopRoot, f))))
  const frame = await readFile(path.join(bench, 'frames', condition.shop, condition.frame + '.jpg'))
  const started = performance.now()
  let prediction: BoundingBox | null = null
  let error: string | null = null
  try {
    prediction = await locate(frame, { ...product, references })
  } catch (cause) {
    error = cause instanceof Error ? cause.name + ' ' + String((cause as { status?: number }).status || '') : 'Unknown error'
  }
  const latency_ms = Math.round(performance.now() - started)
  trials.push({ ...condition, prediction, latency_ms, error })
  console.log(condition.frame, condition.target, prediction === null ? 'null' : 'box', latency_ms, error || '')
  if (error && trials.length === 1) throw Error('First request failed: ' + error)
}
const result = {
  model: selected?.localizationModel ?? (candidate ? candidateModel : 'gpt-4.1-mini'), timestamp: new Date().toISOString(),
  annotation_sha256: createHash('sha256').update(annotations).digest('hex'),
  localizer_sha256: locatorHash,
  trials,
}
const output = validation ? 'validation-observations.json' : production ? 'production-results.json' : candidate ? 'candidate-results.json' : 'observations.json'
await writeFile(path.join(folder, output), JSON.stringify(result, null, 2) + '\n')
