import { api, el, post } from './shared.js'
import { displayMatch, lookAlike, percent } from './result-view.js'

const $ = selector => document.querySelector(selector)
const video = $('#live-video')
const stage = $('#live-stage')
const toggle = $('#live-toggle')
const label = $('#live-label')
const note = $('#live-note')
const result = $('#result')
const badge = $('#live-badge')
const boxView = $('#live-box')
const timeline = $('#timeline')
const stats = $('#live-stats')
const camera = $('#camera')
const turbo = $('#turbo')
const skipStill = $('#skip-still')
const showBox = $('#show-box')
const pace = $('#pace')
const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 })

// ---------- bridge to the SnapPromo control room (when embedded) ----------
// ?embed=1&parent=<origin>: hide the demo chrome, report detections, boxes and a 512 px frame per second to the
// parent window, and take start/stop commands from it. Only the named parent origin is talked to.
const query = new URLSearchParams(location.search)
const parentOrigin = query.get('parent')
const embedded = query.has('embed') && window.parent !== window && !!parentOrigin
if (embedded) document.documentElement.dataset.embed = '1'
const bridge = message => { if (embedded) window.parent.postMessage({ source: 'snappromo-live', ...message }, parentOrigin) }
let boxSentAt = 0
let frameTimer = 0
const frameCanvas = document.createElement('canvas')
function sendFrame() {
  if (!running || !video.videoWidth) return
  const scale = 512 / Math.max(video.videoWidth, video.videoHeight)
  frameCanvas.width = Math.round(video.videoWidth * scale)
  frameCanvas.height = Math.round(video.videoHeight * scale)
  frameCanvas.getContext('2d').drawImage(video, 0, 0, frameCanvas.width, frameCanvas.height)
  bridge({ type: 'frame', image: frameCanvas.toDataURL('image/jpeg', 0.7) })
}
window.addEventListener('message', event => {
  if (!embedded || event.origin !== parentOrigin || event.data?.source !== 'snappromo-control') return
  if (event.data.command === 'start' && !running) start()
  if (event.data.command === 'stop') stop('หยุดจากห้องควบคุม')
})

let products = new Map()
let stream = null
let fileUrl = ''
let running = false
let timer = 0
const fresh = () => ({ inflight: 0, sent: 0, skipped: 0, nextSeq: 0, applied: 0, lastStart: 0, lastResultAt: 0, signature: null,
  latencies: [], resultTimes: [], candidate: { id: null, count: 0 }, confirmed: null, noneStreak: 0, errors: 0,
  scene: 0, box: null, locating: false, zoomed: null, lastWatch: 0, lastLocate: -1e9, boxFor: null, prevSig: null, stillSince: 0, changed: false, changedAt: 0,
  cutPending: false, needVote: false, votes: 0, manual: false, startedAt: 0, rect: null, rectAt: 0 })
const live = fresh()

// ---------- modes ----------
function setMode(mode) {
  const isLive = mode === 'live'
  $('#mode-live').setAttribute('aria-selected', String(isLive))
  $('#mode-file').setAttribute('aria-selected', String(!isLive))
  $('#live-panel').hidden = !isLive
  $('#file-panel').hidden = isLive
  stats.hidden = !isLive
  timeline.hidden = !isLive || !timeline.children.length
  if (!isLive) { stop(); releaseSource() }
  document.dispatchEvent(new CustomEvent('detect-mode', { detail: mode }))
  $('#latency').textContent = ''
  result.replaceChildren(el('p', isLive ? 'เลือกแหล่งภาพแล้วกดเริ่มตรวจสด ผลจะอัปเดตเองทุกครั้งที่ภาพเปลี่ยน' : 'ผลลัพธ์และอันดับสินค้าจะแสดงที่นี่', 'muted'))
}
$('#mode-live').onclick = () => setMode('live')
$('#mode-file').onclick = () => setMode('file')

// ---------- sources ----------
function releaseSource() {
  stream?.getTracks().forEach(track => track.stop())
  stream = null
  if (fileUrl) URL.revokeObjectURL(fileUrl)
  fileUrl = ''
  video.pause()
  video.srcObject = null
  video.removeAttribute('src')
  video.load()
  stage.dataset.state = 'idle'
  toggle.disabled = true
  hideBox()
}
async function useStream(open, name) {
  stop()
  releaseSource()
  try {
    stream = await open()
    video.srcObject = stream
    video.loop = false
    await video.play()
    stream.getVideoTracks()[0]?.addEventListener('ended', () => { stop(); releaseSource(); note.textContent = 'แหล่งภาพหยุดแล้ว' })
    sourceReady(name)
  } catch (error) {
    note.textContent = error?.name === 'NotAllowedError' ? 'เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ ' + name : 'เปิด ' + name + ' ไม่ได้ (' + (error?.message || error) + ')'
  }
}
function sourceReady(name) {
  stage.dataset.state = 'ready'
  toggle.disabled = false
  note.textContent = 'แหล่งภาพ: ' + name
}
async function listCameras() {
  try {
    const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput')
    const current = camera.value
    camera.replaceChildren(new Option('กล้องเริ่มต้น', ''))
    for (const d of devices) camera.append(new Option(d.label || 'กล้อง ' + (camera.length), d.deviceId))
    // OBS Virtual Camera is the usual live source: pick it when nothing was chosen yet.
    const obs = devices.find(d => /obs/i.test(d.label))
    camera.value = current || obs?.deviceId || ''
  } catch {}
}
$('#src-camera').onclick = () => useStream(async () => {
  const media = await navigator.mediaDevices.getUserMedia({ video: { deviceId: camera.value ? { exact: camera.value } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
  listCameras()
  return media
}, camera.selectedOptions[0]?.textContent || 'กล้อง')
camera.onchange = () => { if (stream && stage.dataset.state !== 'idle') $('#src-camera').click() }
$('#src-screen').onclick = () => useStream(() => navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }), 'หน้าจอที่แชร์')
$('#src-file').onchange = async event => {
  const file = event.target.files[0]
  event.target.value = ''
  if (!file) return
  stop()
  releaseSource()
  fileUrl = URL.createObjectURL(file)
  video.src = fileUrl
  video.loop = true
  try { await video.play(); sourceReady('วิดีโอ ' + file.name + ' (วนลูป)') }
  catch { note.textContent = 'เบราว์เซอร์เล่นวิดีโอนี้ไม่ได้ ลอง MP4 (H.264) หรือ WebM' }
}
navigator.mediaDevices?.addEventListener?.('devicechange', listCameras)
listCameras()


// ---------- capture ----------
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d', { willReadFrequently: true })
const tiny = document.createElement('canvas')
tiny.width = 32
tiny.height = 18
const tinyCtx = tiny.getContext('2d', { willReadFrequently: true })
const probe = document.createElement('canvas')
probe.width = 160
probe.height = 90
const probeCtx = probe.getContext('2d', { willReadFrequently: true })

// Measure change inside the picture only: in a small OBS window the black border would swamp the average.
function signatureNow(rect = live.rect) {
  if (rect) tinyCtx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, tiny.width, tiny.height)
  else tinyCtx.drawImage(video, 0, 0, tiny.width, tiny.height)
  const px = tinyCtx.getImageData(0, 0, tiny.width, tiny.height).data
  const signature = new Uint8Array(tiny.width * tiny.height)
  for (let i = 0; i < signature.length; i++) signature[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10
  return signature
}
// OBS often places the camera inside a larger black canvas. Crop to the picture so the product keeps its pixels.
function contentRect(w, h) {
  probeCtx.drawImage(video, 0, 0, probe.width, probe.height)
  const px = probeCtx.getImageData(0, 0, probe.width, probe.height).data
  let left = probe.width, right = -1, top = probe.height, bottom = -1
  for (let y = 0; y < probe.height; y++) for (let x = 0; x < probe.width; x++) {
    const i = (y * probe.width + x) * 4
    if (Math.max(px[i], px[i + 1], px[i + 2]) > 22) {
      if (x < left) left = x
      if (x > right) right = x
      if (y < top) top = y
      if (y > bottom) bottom = y
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, w, h }
  const sx = w / probe.width
  const sy = h / probe.height
  const rect = { x: Math.max(0, (left - 1) * sx), y: Math.max(0, (top - 1) * sy) }
  rect.w = Math.min(w, (right + 2) * sx) - rect.x
  rect.h = Math.min(h, (bottom + 2) * sy) - rect.y
  // Only crop real borders; a dark background inside a full picture must not shrink the frame.
  return rect.w * rect.h < w * h * 0.85 ? rect : { x: 0, y: 0, w, h }
}
// The server resizes to 512 px anyway; shrinking here cuts upload time on every frame.
function capture() {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null
  const rect = live.rect ?? contentRect(w, h)
  const scale = Math.min(1, 512 / Math.max(rect.w, rect.h))
  canvas.width = Math.max(1, Math.round(rect.w * scale))
  canvas.height = Math.max(1, Math.round(rect.h * scale))
  ctx.drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, canvas.width, canvas.height)
  // Keep a sharper copy for the box and the zoomed second look.
  const fine = document.createElement('canvas')
  const fineScale = Math.min(1, 1280 / Math.max(rect.w, rect.h))
  fine.width = Math.max(1, Math.round(rect.w * fineScale))
  fine.height = Math.max(1, Math.round(rect.h * fineScale))
  fine.getContext('2d').drawImage(video, rect.x, rect.y, rect.w, rect.h, 0, 0, fine.width, fine.height)
  return { image: canvas.toDataURL('image/jpeg', 0.82), fine, rect, signature: signatureNow(rect), cropped: rect.w < w || rect.h < h }
}
function difference(a, b) {
  if (!a || !b) return 255
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
  return sum / a.length
}

// ---------- loop ----------
function average(list) { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0 }
function newScene() {
  live.scene++
  live.zoomed = null
}
// Probe motion ~8 times a second on a 32×18 thumbnail (free), and only call the model when it is worth it.
// Economy: one call when the picture changes and then holds still (a product raised and shown), plus a
// second vote only when that answer was unsure. Realtime: keep calling while the picture changes.
function schedule() {
  if (!running) return
  const now = performance.now()
  if (!video.videoWidth || (video.paused && !video.srcObject)) return
  if (live.box) track(now)
  if (now - live.lastWatch < 120) return
  live.lastWatch = now
  const economy = pace.value === 'economy'
  // Re-find the picture area about once a second (the OBS layout rarely moves).
  if (!live.rect || now - live.rectAt > 1000) {
    const rect = contentRect(video.videoWidth, video.videoHeight)
    if (live.rect && (Math.abs(rect.x - live.rect.x) > 8 || Math.abs(rect.w - live.rect.w) > 8)) { live.signature = null; live.prevSig = null; hideBox() }
    live.rect = rect
    live.rectAt = now
  }
  const sig = signatureNow()
  const motion = difference(sig, live.prevSig)
  live.prevSig = sig
  const change = live.signature ? difference(sig, live.signature) : 255
  if (live.signature && change > 12 && !live.cutPending) {
    // A hard cut makes the shown card stale right away: dim it until the new frame's answer arrives.
    live.cutPending = true
    newScene()
    if (!badge.hidden) { badge.dataset.state = 'checking'; $('#badge-state').textContent = 'กำลังตรวจภาพใหม่…' }
  }
  if (change > 6 && !live.changed) { live.changed = true; live.changedAt = now }
  live.stillSince = motion < 2.5 ? live.stillSince || now : 0
  const settled = live.stillSince > 0 && now - live.stillSince >= 450
  // Tracking lost (product moved fast or turned): ask Sol again once the picture settles, at most every 4 s.
  // A product that never got a box retries soon; one that lost its box waits longer (Sol costs more than Luna).
  const retry = live.boxFor === live.confirmed?.product_id ? (settled ? 4000 : 6000) : 1200
  if (showBox.checked && !live.box && live.confirmed && !live.locating && now - live.lastLocate > retry) {
    const frame = capture()
    if (frame) { frame.scene = live.scene; locate(live.confirmed, null, frame, false) }
  }
  const maxInflight = economy ? 1 : turbo.checked ? 2 : 1
  if (live.inflight >= maxInflight) return
  let reason = live.manual ? 'manual' : null
  if (!reason && economy) {
    if (!live.signature && (settled || now - live.startedAt > 1500)) reason = 'first'
    else if (live.changed && (settled || now - live.changedAt > 2500)) reason = 'change'
    else if (live.needVote && now - live.lastStart > (settled ? 900 : 1500) && live.votes < 2) reason = 'vote'
  } else if (!reason) {
    // Stagger parallel requests by half a round trip so results arrive evenly instead of in pairs.
    const gap = Math.max(180, average(live.latencies.slice(-6)) / maxInflight)
    if (now - live.lastStart < gap) return
    if (skipStill.checked && now - live.lastResultAt < 4000 && change < 3.5 && !live.needVote) {
      live.skipped++
      live.lastStart = now
      renderStats()
      return
    }
    reason = 'stream'
  }
  if (!reason) return
  const frame = capture()
  if (!frame) return
  live.manual = false
  live.lastStart = now
  live.votes = reason === 'vote' ? live.votes + 1 : 0
  const cut = live.cutPending && live.applied > 0
  live.cutPending = false
  live.changed = false
  live.signature = frame.signature
  frame.scene = live.scene
  send(frame, ++live.nextSeq, cut)
}
async function send(frame, seq, cut) {
  live.inflight++
  live.sent++
  const started = performance.now()
  try {
    const data = await post('/api/detect', { image: frame.image, method: 'choice', locate: false })
    live.errors = 0
    live.latencies.push(performance.now() - started)
    if (live.latencies.length > 20) live.latencies.shift()
    // A slower older request must not overwrite a newer frame's answer.
    if (running && seq > live.applied) { live.applied = seq; apply(data, cut, frame) }
  } catch (error) {
    live.errors++
    note.textContent = error.message
    if (/โควตา|API key|สิทธิ์/.test(error.message) || live.errors >= 4) stop('หยุดเพราะ ' + error.message)
  } finally {
    live.inflight--
    renderStats()
  }
}

// ---------- stabilise ----------
// Show a product as soon as it appears (pending), confirm after two agreeing frames, clear after two "none" frames.
function apply(data, cut, frame) {
  const now = performance.now()
  live.lastResultAt = now
  live.resultTimes.push(now)
  while (live.resultTimes.length && now - live.resultTimes[0] > 5000) live.resultTimes.shift()
  // A zoomed check in this scene outranks a wide frame that still splits between the same look-alikes.
  const z = live.zoomed
  if (z && z.scene === live.scene && data.product_id !== 'none' && data.probabilities.slice(0, 2).some(p => p.id === z.data.product_id)) data = z.data
  const id = data.product_id
  const pair = data.zoom ? null : lookAlike(data)
  live.candidate = live.candidate.id === id ? { id, count: live.candidate.count + 1 } : { id, count: 1 }
  if (id === 'none') {
    live.noneStreak++
    // A blurry moving frame can say "none" while the tracker still sees the product: double-check before removing it.
    const tracked = live.box && tracker.lost === 0
    live.needVote = !!tracked && live.noneStreak < 2
    if (live.noneStreak >= 2 || (!tracked && (cut || pace.value === 'economy'))) { live.confirmed = null; hideBox() }
  } else {
    live.noneStreak = 0
    const sure = !pair && (data.zoom || live.candidate.count >= 2 || (data.confidence ?? 0) >= (cut ? 0.7 : 0.9))
    if (sure) live.confirmed = data
    // Unsure answers get one more look; look-alikes go to the box + zoom check instead.
    live.needVote = !sure && !pair
    if (live.box && live.box.id !== id) hideBox()
    if (!data.zoom) maybeLocate(data, pair, frame)
  }
  bridge({ type: 'detect', productId: id, name: data.product_name, confidence: data.confidence, heldUp: !!data.held_up, confirmed: live.confirmed?.product_id ?? null, lookAlike: !!pair, latencyMs: data.latency_ms })
  renderBadge(data, pair)
  pushTimeline(data, pair)
  displayMatch(result, data)
  if (data.zoom) result.prepend(el('p', '🔍 ยืนยันด้วยภาพซูมรอบสินค้า', 'zoom-note'))
  $('#latency').textContent = '#' + live.applied + ' · ' + data.latency_ms + ' ms' + (frame.cropped ? ' · ครอปขอบดำ' : '')
}
function renderBadge(data, pair) {
  const shown = live.confirmed
  const pending = data.product_id !== 'none' && (!shown || shown.product_id !== data.product_id)
  if (!shown && !pending) { badge.hidden = true; return }
  const target = pending ? data : shown
  const product = products.get(target.product_id)
  badge.hidden = false
  badge.dataset.state = pair ? 'lookalike' : pending ? 'pending' : 'confirmed'
  $('#badge-state').textContent = pair ? 'ใกล้เคียง · กำลังซูมดูใกล้ ๆ' : pending ? 'กำลังยืนยัน…' : target.zoom ? 'ยืนยันด้วยภาพซูม' : target.held_up ? 'กำลังโชว์สินค้า' : 'ตรวจพบสินค้า'
  $('#badge-name').textContent = pair ? pair[0].name + ' หรือ ' + pair[1].name + '?' : target.product_name
  $('#badge-meta').textContent = [product ? baht.format(product.price) : '', target.confidence !== null ? 'มั่นใจ ' + percent(target.confidence) : ''].filter(Boolean).join(' · ')
  $('#badge-meter').style.width = (target.confidence ?? 0) * 100 + '%'
}
function pushTimeline(data, pair) {
  const name = (products.get(data.product_id)?.name ?? data.product_name).slice(0, 14)
  const item = el('li', pair ? '≈' : data.product_id === 'none' ? '–' : (data.zoom ? '🔍 ' : '') + name)
  item.className = pair ? 'lookalike' : data.product_id === 'none' ? 'none' : ''
  item.title = data.product_name + (data.confidence !== null ? ' · ' + percent(data.confidence) : '')
  timeline.prepend(item)
  while (timeline.children.length > 12) timeline.lastChild.remove()
  timeline.hidden = false
}

// ---------- box + zoomed second look ----------
// Sol takes about 3 s, so it runs beside the loop: once per scene and product, never blocking new frames.
function maybeLocate(data, pair, frame) {
  if (!showBox.checked || live.locating || live.box?.id === data.product_id) return
  locate(data, pair, frame, !(live.zoomed && live.zoomed.scene === live.scene))
}
async function locate(data, pair, frame, allowZoom = true) {
  live.locating = true
  live.lastLocate = performance.now()
  boxView.dataset.state = 'searching'
  try {
    const image = frame.fine.toDataURL('image/jpeg', 0.88)
    const { bbox } = await post('/api/locate', { image, product_id: data.product_id })
    // Sol answers 2-3 s later; keep the box as long as that product is still the one on screen.
    const current = live.confirmed?.product_id === data.product_id || live.candidate.id === data.product_id
    if (!running || !current) return
    if (!bbox) {
      // A re-anchor miss keeps the tracked box; two misses in a row mean the product really left the frame.
      if (live.box && ++tracker.anchorFails < 2) return
      note.textContent = 'หากรอบ ' + data.product_name + ' ในภาพไม่เจอ'
      if (live.box) hideBox()
      return
    }
    live.box = { ...bbox, id: data.product_id, rect: frame.rect }
    live.boxFor = data.product_id
    startTracking(frame)
    drawBox()
    // Unsure or look-alike: crop around the box and ask again with a close-up.
    if (allowZoom && (pair || (data.confidence ?? 0) < 0.85)) await zoomCheck(frame, bbox)
  } catch (error) {
    note.textContent = 'ตีกรอบไม่สำเร็จ: ' + error.message
  } finally {
    live.locating = false
    delete boxView.dataset.state
  }
}
async function zoomCheck(frame, bbox) {
  const W = frame.fine.width
  const H = frame.fine.height
  const pad = 0.35
  const x = Math.max(0, (bbox.x - bbox.width * pad) * W)
  const y = Math.max(0, (bbox.y - bbox.height * pad) * H)
  const w = Math.min(W, (bbox.x + bbox.width * (1 + pad)) * W) - x
  const h = Math.min(H, (bbox.y + bbox.height * (1 + pad)) * H) - y
  if (w < 8 || h < 8) return
  const crop = document.createElement('canvas')
  const scale = Math.min(512 / Math.max(w, h), 4)
  crop.width = Math.round(w * scale)
  crop.height = Math.round(h * scale)
  const cctx = crop.getContext('2d')
  cctx.imageSmoothingQuality = 'high'
  cctx.drawImage(frame.fine, x, y, w, h, 0, 0, crop.width, crop.height)
  const data = await post('/api/detect', { image: crop.toDataURL('image/jpeg', 0.9), method: 'choice', locate: false })
  if (!running || data.product_id === 'none') return
  if (lookAlike(data) || (data.confidence ?? 0) < 0.6) { note.textContent = 'ภาพซูมยังแยกรุ่นไม่ชัด ควรถามแม่ค้าว่าเป็นตัวไหน'; return }
  data.zoom = true
  live.zoomed = { scene: frame.scene, data }
  live.sent++
  apply(data, false, frame)
}
function hideBox() {
  if (live.box) bridge({ type: 'box', productId: null, box: null })
  live.box = null
  tracker.values = null
  boxView.hidden = true
  delete boxView.dataset.weak
}

// ---------- box tracking (in the browser, no API) ----------
// Sol finds the product once; afterwards a template of its pixels is followed frame by frame with a
// sum-of-absolute-differences search on a 240 px grey image, over position and a little scale.
// A weak match never hides the box: it stays (dashed) where it was, the search widens, and Sol re-anchors it.
// The box goes away only when detection says the product left, another product appears, or Sol fails twice.
const TW = 240
const GOOD = 26
const trk = document.createElement('canvas')
const trkCtx = trk.getContext('2d', { willReadFrequently: true })
const tracker = { samples: null, values: null, x: 0, y: 0, scale: 1, lost: 0, at: 0, cost: 0, w: 0, h: 0, anchorFails: 0 }
function grey(source, rect) {
  const th = Math.max(8, Math.round(TW * rect.h / rect.w))
  if (trk.width !== TW || trk.height !== th) { trk.width = TW; trk.height = th }
  if (rect.self) trkCtx.drawImage(source, 0, 0, TW, th)
  else trkCtx.drawImage(source, rect.x, rect.y, rect.w, rect.h, 0, 0, TW, th)
  const px = trkCtx.getImageData(0, 0, TW, th).data
  const g = new Uint8Array(TW * th)
  for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10
  return { g, th }
}
// (x0, y0) is the box centre; samples are offsets from the centre, stretched by scale.
function cost(g, th, x0, y0, scale, limit) {
  const { samples, values } = tracker
  let sum = 0
  let n = 0
  for (let i = 0; i < values.length; i++) {
    const x = Math.round(x0 + samples[i * 2] * scale)
    const y = Math.round(y0 + samples[i * 2 + 1] * scale)
    if (x < 0 || y < 0 || x >= TW || y >= th) continue
    sum += Math.abs(g[y * TW + x] - values[i])
    n++
    if (sum > limit * values.length) return Infinity
  }
  return n < values.length * 0.5 ? Infinity : sum / n
}
function search(g, th, cx, cy, radius, step, scales) {
  let best = { x: cx, y: cy, s: scales[1] ?? scales[0], c: Infinity }
  for (const s of scales) for (let y = cy - radius; y <= cy + radius; y += step) for (let x = cx - radius; x <= cx + radius; x += step) {
    const c = cost(g, th, x, y, s, best.c)
    if (c < best.c) best = { x, y, s, c }
  }
  if (step > 1) {
    const { x: bx, y: by, s } = best
    for (let y = by - step + 1; y < by + step; y++) for (let x = bx - step + 1; x < bx + step; x++) {
      const c = cost(g, th, x, y, s, best.c)
      if (c < best.c) best = { x, y, s, c }
    }
  }
  return best
}
function startTracking(frame) {
  const b = live.box
  const { g, th } = grey(frame.fine, { self: true, w: frame.fine.width, h: frame.fine.height })
  const bw = Math.max(4, b.width * TW)
  const bh = Math.max(4, b.height * th)
  const cx = (b.x + b.width / 2) * TW
  const cy = (b.y + b.height / 2) * th
  const n = 20
  const samples = []
  const values = []
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = ((i + 0.5) / n - 0.5) * bw
    const dy = ((j + 0.5) / n - 0.5) * bh
    const x = Math.round(cx + dx)
    const y = Math.round(cy + dy)
    if (x < 0 || y < 0 || x >= TW || y >= th) continue
    samples.push(dx, dy)
    values.push(g[y * TW + x])
  }
  Object.assign(tracker, { samples: Float32Array.from(samples), values: Float32Array.from(values), x: Math.round(cx), y: Math.round(cy),
    scale: 1, lost: 0, at: 0, cost: 0, w: bw, h: bh, anchorFails: 0 })
  delete boxView.dataset.weak
  // Catch up with the movement that happened while Sol was thinking: one wide search on the current picture.
  if (video.videoWidth && live.rect) {
    const current = grey(video, live.rect)
    const best = search(current.g, current.th, tracker.x, tracker.y, 70, 3, [0.85, 1, 1.15])
    if (best.c < GOOD + 4) Object.assign(tracker, { x: best.x, y: best.y, scale: best.s, cost: best.c })
    placeBox(current.th)
  }
}
function placeBox(th) {
  const b = live.box
  const w = tracker.w * tracker.scale
  const h = tracker.h * tracker.scale
  b.width = w / TW
  b.height = h / th
  b.x = (tracker.x - w / 2) / TW
  b.y = (tracker.y - h / 2) / th
  b.rect = live.rect
  drawBox()
}
function track(now) {
  if (!tracker.values || !live.rect || now - tracker.at < 60) return
  tracker.at = now
  const { g, th } = grey(video, live.rect)
  const s = tracker.scale
  // Search wider the longer the match has been weak, so a product moved fast can be picked up again.
  const radius = Math.min(70, 16 + tracker.lost * 6)
  const best = search(g, th, tracker.x, tracker.y, radius, radius > 30 ? 3 : 2, [s * 0.94, s, s * 1.06].map(v => Math.min(2.5, Math.max(0.4, v))))
  tracker.cost = best.c
  if (best.c < GOOD) {
    tracker.lost = 0
    Object.assign(tracker, { x: best.x, y: best.y, scale: best.s })
    delete boxView.dataset.weak
    // Adapt slowly to light and small turns while the match is clearly good.
    if (best.c < 12) {
      const { samples, values } = tracker
      for (let i = 0; i < values.length; i++) {
        const x = Math.round(best.x + samples[i * 2] * best.s)
        const y = Math.round(best.y + samples[i * 2 + 1] * best.s)
        if (x >= 0 && y >= 0 && x < TW && y < th) values[i] = values[i] * 0.9 + g[y * TW + x] * 0.1
      }
    }
    placeBox(th)
  } else {
    tracker.lost++
    boxView.dataset.weak = 'true'
  }
  reanchor(now)
}
// Ask Sol for a fresh box while the product is still on screen: quickly when tracking is weak, and every
// 8 s when the match has drifted. Never more than one Sol call every 2.5 s.
function reanchor(now) {
  if (!showBox.checked || live.locating || !live.box || now - live.lastLocate < 2500) return
  const weak = tracker.lost >= 3
  const drifted = tracker.cost > 16 && now - live.lastLocate > 8000
  if (!weak && !drifted) return
  const product = live.confirmed?.product_id === live.box.id ? live.confirmed : null
  if (!product) return
  const frame = capture()
  if (!frame) return
  frame.scene = live.scene
  locate(product, null, frame, false)
}
function drawBox() {
  const b = live.box
  if (!b || !video.videoWidth) { boxView.hidden = true; return }
  const scale = Math.min(stage.clientWidth / video.videoWidth, stage.clientHeight / video.videoHeight)
  const offX = (stage.clientWidth - video.videoWidth * scale) / 2
  const offY = (stage.clientHeight - video.videoHeight * scale) / 2
  boxView.style.left = offX + (b.rect.x + b.x * b.rect.w) * scale + 'px'
  boxView.style.top = offY + (b.rect.y + b.y * b.rect.h) * scale + 'px'
  boxView.style.width = b.width * b.rect.w * scale + 'px'
  boxView.style.height = b.height * b.rect.h * scale + 'px'
  $('#box-label').textContent = products.get(b.id)?.name ?? b.id
  boxView.hidden = false
  // the box in fractions of the camera frame (what OBS shows), at most 10 times a second
  const now = performance.now()
  if (now - boxSentAt > 100) {
    boxSentAt = now
    const W = video.videoWidth
    const H = video.videoHeight
    bridge({ type: 'box', productId: b.id, box: { x: (b.rect.x + b.x * b.rect.w) / W, y: (b.rect.y + b.y * b.rect.h) / H, w: (b.width * b.rect.w) / W, h: (b.height * b.rect.h) / H } })
  }
}
new ResizeObserver(drawBox).observe(stage)
showBox.onchange = () => { if (!showBox.checked) hideBox() }

function renderStats() {
  $('#stat-latency').textContent = live.latencies.length ? Math.round(average(live.latencies.slice(-6))) : '–'
  $('#stat-rate').textContent = live.resultTimes.length > 1 ? (live.resultTimes.length / 5).toFixed(1) : '–'
  const minutes = live.startedAt ? (performance.now() - live.startedAt) / 60000 : 0
  $('#stat-calls').textContent = live.sent
  $('#stat-skipped').textContent = minutes > 0.05 ? (live.sent / minutes).toFixed(1) + ' ครั้ง/นาที' : '–'
  const economy = pace.value === 'economy'
  $('#hud-text').textContent = !running ? (stage.dataset.state === 'idle' ? 'พร้อม' : 'หยุดอยู่')
    : economy ? 'ประหยัด · ' + (live.inflight ? 'กำลังตรวจ…' : live.changed ? 'รอภาพนิ่ง' : 'รอภาพเปลี่ยน') + ' · ' + live.sent + ' คำขอ'
    : 'LIVE · ' + $('#stat-latency').textContent + ' ms · ' + $('#stat-rate').textContent + ' ผล/วิ'
}

// ---------- start / stop ----------
async function start() {
  try { products = new Map((await api('/api/catalog')).map(p => [p.id, p])) } catch (error) { note.textContent = error.message; return }
  if (!products.size) { note.textContent = 'คลังสินค้ายังว่าง เพิ่มสินค้าในหน้า Catalog ก่อน'; return }
  Object.assign(live, fresh(), { startedAt: performance.now() })
  timeline.replaceChildren()
  badge.hidden = true
  hideBox()
  running = true
  stage.dataset.state = 'running'
  label.textContent = 'หยุดตรวจ'
  note.textContent = 'กำลังตรวจต่อเนื่อง · เทียบกับคลัง ' + products.size + ' รายการ'
  result.replaceChildren(el('p', 'กำลังส่งเฟรมแรก…', 'muted'))
  timer = setInterval(() => { schedule(); if (pace.value === 'economy') renderStats() }, 60)
  if (embedded) frameTimer = setInterval(sendFrame, 1000)
  bridge({ type: 'state', running: true, products: products.size })
  schedule()
}
function stop(reason) {
  if (!running) return
  running = false
  clearInterval(timer)
  clearInterval(frameTimer)
  bridge({ type: 'state', running: false, reason: reason ?? '' })
  if (stage.dataset.state === 'running') stage.dataset.state = 'ready'
  label.textContent = 'เริ่มตรวจสด'
  if (reason) note.textContent = reason
  renderStats()
}
function syncPace() {
  const realtime = pace.value === 'realtime'
  for (const id of ['#turbo', '#skip-still']) $(id).closest('label').hidden = !realtime
}
pace.onchange = syncPace
syncPace()
$('#detect-now').onclick = () => { if (running) live.manual = true; else start().then(() => { live.manual = true }) }
// Space bar = check now, for the host while showing a product.
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || $('#live-panel').hidden || /INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName)) return
  event.preventDefault()
  $('#detect-now').click()
})
toggle.onclick = () => running ? stop('หยุดแล้ว · ส่งไป ' + live.sent + ' คำขอ') : start()
document.addEventListener('visibilitychange', () => { if (document.hidden && running && !video.srcObject) stop('หยุดเพราะสลับแท็บ') })
setMode('live')
