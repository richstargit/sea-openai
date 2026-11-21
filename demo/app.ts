import express, { type ErrorRequestHandler } from 'express'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { addProduct, deleteProduct, listProducts } from './catalog.js'
import { decodeImage, DemoError, imageDir, root } from './common.js'
import { detectProduct } from './detect.js'
import { locateProduct } from './localize.js'

const app = express()
app.disable('x-powered-by')
app.use('/api', (_req, res, next) => {
  res.locals.start = performance.now()
  res.set('Cache-Control', 'no-store')
  next()
})
app.use('/api/catalog', express.json({ limit: '33mb' }))
app.use('/api/detect', express.json({ limit: '11mb' }))
app.use('/api/locate', express.json({ limit: '11mb' }))
app.get('/api/catalog', async (_req, res) => { res.json(await listProducts()) })
app.post('/api/catalog', async (req, res) => {
  if (!Array.isArray(req.body?.images) || req.body.images.length < 1 || req.body.images.length > 3)
    throw new DemoError(400, 'เลือกภาพอ้างอิง 1–3 รูป')
  res.status(201).json(await addProduct(req.body, req.body.images.map(decodeImage)))
})
app.delete('/api/catalog/:id', async (req, res) => {
  await deleteProduct(req.params.id)
  res.sendStatus(204)
})
app.post('/api/detect', async (req, res) => {
  const result = await detectProduct(decodeImage(req.body?.image), req.body.method, req.body.text, req.body.locate)
  res.json({ ...result, latency_ms: Math.round(performance.now() - res.locals.start) })
})
// Live mode already knows the SKU from Choice; this finds where it is in that same frame.
app.post('/api/locate', async (req, res) => {
  const frame = decodeImage(req.body?.image)
  const target = (await listProducts()).find(p => p.id === req.body?.product_id)
  if (!target) throw new DemoError(404, 'ไม่พบรหัสสินค้านี้')
  const references = await Promise.all(target.images.map(file => readFile(path.join(imageDir, file))))
  const bbox = await locateProduct(frame, { ...target, references })
  res.json({ bbox, latency_ms: Math.round(performance.now() - res.locals.start) })
})
app.post('/api/detect/frame', async (req, res) => {
  const frame = decodeImage(req.body?.image)
  const controller = new AbortController()
  const disconnected = () => controller.abort()
  const elapsed = () => Math.round(performance.now() - res.locals.start)
  res.once('close', disconnected)
  try {
    const result = await detectProduct(frame, 'choice', undefined, true, {
      signal: controller.signal,
      onMatch(match) {
        res.set({
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-store, no-transform',
          'X-Accel-Buffering': 'no',
        })
        res.flushHeaders()
        res.write(JSON.stringify({ type: 'match', ...match, latency_ms: elapsed() }) + '\n')
      },
    })
    if (!controller.signal.aborted) {
      const { bbox, localization_status } = result
      res.end(JSON.stringify({ type: 'location', bbox, localization_status, latency_ms: elapsed() }) + '\n')
    }
  } catch (error) {
    if (!controller.signal.aborted) throw error
  } finally {
    res.off('close', disconnected)
  }
})
const publicDir = path.join(root, 'public')
const benchDir = path.join(root, 'bench')
app.get('/bench', (_req, res) => res.redirect('/bench/review.html'))
app.get('/bench/review.html', (_req, res) => res.sendFile(path.join(benchDir, 'review.html')))
app.get('/bench/location/two-products-sample.mp4', (_req, res) => res.sendFile(path.join(benchDir, 'location', 'two-products-sample.mp4')))
app.get('/bench/location/review.html', (_req, res) => res.sendFile(path.join(benchDir, 'location', 'review.html')))
app.get('/bench/frames/:shop/:file', (req, res) => {
  if (!/^[a-z0-9_-]+$/i.test(req.params.shop) || !/^[a-z0-9_-]+\.jpg$/i.test(req.params.file)) {
    res.sendStatus(404)
    return
  }
  res.sendFile(path.join(benchDir, 'frames', req.params.shop, req.params.file))
})
app.get('/', (_req, res) => res.redirect('/detect'))
for (const page of ['catalog', 'detect']) app.get('/' + page, (_req, res) => res.sendFile(path.join(publicDir, page + '.html')))
app.use('/images', express.static(imageDir))
app.use(express.static(publicDir))
const onError: ErrorRequestHandler = (e, _req, res, _next) => {
  const status = e instanceof DemoError ? e.status : e.status === 413 ? 413 : e.status === 400 ? 400 : 500
  const message = e instanceof DemoError ? e.message : status === 413 ? 'ไฟล์มีขนาดใหญ่เกินไป' :
    status === 400 ? 'ข้อมูลคำขอไม่ถูกต้อง' : 'ระบบอ่านหรือบันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่'
  res.status(status).json({ error: message, latency_ms: Math.round(performance.now() - res.locals.start) || 0 })
}
app.use(onError)
export default app
