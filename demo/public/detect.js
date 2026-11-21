import { api, el, fileData } from './shared.js'
import { detectFrame } from './frame-events.js'
import { freezeIfAnimated, snapshotJpeg } from './still-frame.js'
import { displayMatch as renderMatch } from './result-view.js'
const displayMatch = data => renderMatch(result, data)
const form = document.querySelector('#detect-form')
const input = document.querySelector('#frame')
const drop = document.querySelector('#drop')
const preview = document.querySelector('#preview')
const result = document.querySelector('#result')
const latency = document.querySelector('#latency')
const run = document.querySelector('#run')
const chooseLabel = document.querySelector('#choose-label')
const runLabel = document.querySelector('#run-label')
const still = document.querySelector('#still')
const stillLabel = document.querySelector('#still-label')
const stage = document.querySelector('#stage')
const bbox = document.querySelector('#bbox')
const locationNote = document.querySelector('#location-note')
const video = document.querySelector('#clip')
const videoPanel = document.querySelector('#video-panel')
const examples = [...document.querySelectorAll('[data-example]')]
let revision = 0
let pending = null
let selected = null
let sourceUrl = ''
let isVideo = false
let box = null
let fileRevision = 0
let frozenStill = null

function syncRun() {
  run.disabled = !selected || pending !== null || (isVideo && (video.seeking || video.readyState < 2 || !!video.error))
}
function drawBox() {
  if (!box || still.hidden || !preview.naturalWidth || !preview.naturalHeight) {
    bbox.hidden = true
    return
  }
  const scale = Math.min(stage.clientWidth / preview.naturalWidth, stage.clientHeight / preview.naturalHeight)
  const width = preview.naturalWidth * scale
  const height = preview.naturalHeight * scale
  bbox.style.left = (stage.clientWidth - width) / 2 + box.x * width + 'px'
  bbox.style.top = (stage.clientHeight - height) / 2 + box.y * height + 'px'
  bbox.style.width = box.width * width + 'px'
  bbox.style.height = box.height * height + 'px'
  bbox.hidden = false
}
new ResizeObserver(drawBox).observe(stage)
preview.addEventListener('load', drawBox)
function resetResult() {
  revision++
  pending?.abort()
  pending = null
  box = null
  drawBox()
  syncRun()
  latency.textContent = ''
  locationNote.textContent = ''
  result.replaceChildren(el('p', 'ผลลัพธ์และอันดับสินค้าจะแสดงที่นี่', 'muted'))
}
async function selectMedia(file, sample) {
  const version = ++fileRevision
  isVideo = false
  selected = null
  frozenStill = null
  video.pause()
  video.removeAttribute('src')
  video.load()
  preview.removeAttribute('src')
  still.hidden = true
  videoPanel.hidden = true
  document.querySelector('#sample-credit').hidden = sample?.dataset.example !== '/examples/room-photo.jpg'
  if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  sourceUrl = ''
  for (const button of examples) button.setAttribute('aria-pressed', String(button === sample))
  drop.classList.toggle('compact', !!file || !!sample)
  chooseLabel.textContent = sample ? 'เลือกไฟล์ของคุณ' : file ? 'เปลี่ยนไฟล์' : 'เลือกรูปหรือวิดีโอ หรือลากมาวาง'
  document.querySelector('#filename').textContent = sample ? 'ตัวอย่าง · ' + sample.textContent : file?.name || 'ยังไม่ได้เลือกไฟล์'
  runLabel.textContent = 'ตรวจจับสินค้า'
  resetResult()
  if (sample) {
    input.value = ''
    try {
      const response = await fetch(sample.dataset.example)
      if (!response.ok) throw new Error()
      file = new File([await response.blob()], 'example.jpg', { type: 'image/jpeg' })
    } catch {
      if (version === fileRevision) {
        sample.setAttribute('aria-pressed', 'false')
        result.replaceChildren(el('p', 'โหลดภาพตัวอย่างไม่ได้ กรุณาลองอีกครั้งหรือเลือกไฟล์ของคุณ', 'error'))
      }
      return
    }
    if (version !== fileRevision) return
  }
  if (!file) return
  isVideo = /^(video\/mp4|video\/webm)$/i.test(file.type) || (!file.type && /\.(mp4|webm)$/i.test(file.name))
  if (!isVideo && !['image/jpeg','image/png','image/apng','image/webp'].includes(file.type)) {
    result.replaceChildren(el('p', 'รองรับไฟล์ JPEG, PNG, WebP, MP4 และ WebM', 'error'))
    return
  }
  if (isVideo) {
    sourceUrl = URL.createObjectURL(file)
    videoPanel.hidden = false
    runLabel.textContent = 'จับเฟรมนี้และตรวจจับ'
    video.src = sourceUrl
  } else {
    try {
      const frozen = await freezeIfAnimated(file)
      if (version !== fileRevision) return
      frozenStill = frozen
    } catch (error) {
      if (version === fileRevision) result.replaceChildren(el('p', file.size > 8 * 1024 * 1024 ? error.message : 'อ่านเฟรมแรกไม่ได้ กรุณาใช้ภาพนิ่ง JPEG หรือ PNG', 'error'))
      return
    }
    if (!frozenStill) sourceUrl = URL.createObjectURL(file)
    stillLabel.textContent = frozenStill ? 'เฟรมแรกของภาพเคลื่อนไหวที่ส่งตรวจ' : 'เฟรมที่เลือก'
    preview.src = frozenStill || sourceUrl
    still.hidden = false
  }
  selected = file
  syncRun()
}
input.onchange = () => selectMedia(input.files[0])
// Switching modes cancels any file request so it cannot write over live results.
document.addEventListener('detect-mode', resetResult)
for (const button of examples) button.onclick = () => selectMedia(null, button)
function invalidateVideoFrame() {
  if (!isVideo) return
  still.hidden = true
  preview.removeAttribute('src')
  resetResult()
}
video.addEventListener('seeking', invalidateVideoFrame)
video.addEventListener('play', invalidateVideoFrame)
for (const event of ['loadeddata', 'canplay', 'seeked']) video.addEventListener(event, syncRun)
video.addEventListener('error', () => {
  if (!isVideo || !video.error || video.currentSrc !== sourceUrl) return
  invalidateVideoFrame()
  result.replaceChildren(el('p', 'เบราว์เซอร์อ่านวิดีโอนี้ไม่ได้ ลอง MP4 หรือ WebM ที่ใช้ codec อื่น', 'error'))
})
function captureVideoFrame() {
  if (!video.videoWidth || video.seeking || video.readyState < 2) throw new Error('กรุณารอให้วิดีโอแสดงเฟรมที่เลือก')
  video.pause()
  const jpeg = snapshotJpeg(video, video.videoWidth, video.videoHeight)
  stillLabel.textContent = 'เฟรมที่ส่งตรวจ · ' + video.currentTime.toFixed(2) + ' วินาที'
  preview.src = jpeg
  still.hidden = false
  return jpeg
}
drop.ondragover = event => { event.preventDefault(); drop.classList.add('over') }
drop.ondragleave = () => drop.classList.remove('over')
drop.ondrop = event => {
  event.preventDefault()
  drop.classList.remove('over')
  if (event.dataTransfer.files.length !== 1) {
    input.value = ''
    input.dispatchEvent(new Event('change'))
    result.replaceChildren(el('p', 'เลือกทีละหนึ่งไฟล์', 'error'))
    return
  }
  input.files = event.dataTransfer.files
  input.dispatchEvent(new Event('change'))
}
function displayLocation(event) {
  const b = event.bbox
  if (event.localization_status === 'found' && b && [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
      b.x >= 0 && b.y >= 0 && b.width > 0 && b.height > 0 && b.x + b.width <= 1.000001 && b.y + b.height <= 1.000001) {
    box = b
    drawBox()
    locationNote.textContent = 'กรอบสีเขียวแสดงตำแหน่งสินค้าโดยประมาณ'
  } else {
    locationNote.textContent = event.localization_status === 'unavailable' ? 'บริการระบุตำแหน่งไม่พร้อมใช้งาน' : 'ยังระบุตำแหน่งสินค้าในภาพไม่ได้'
  }
}
form.onsubmit = async event => {
  event.preventDefault()
  if (run.disabled || !selected) return
  const current = ++revision
  const controller = new AbortController()
  pending = controller
  box = null
  drawBox()
  syncRun()
  latency.textContent = ''
  locationNote.textContent = ''
  result.replaceChildren(el('p', 'กำลังประเมินเฟรม…', 'muted'))
  let match
  let locationReceived = false
  try {
    const image = isVideo ? captureVideoFrame() : (frozenStill || await fileData(selected))
    if (current !== revision) return
    for await (const event of detectFrame(image, controller.signal)) {
      if (current !== revision) return
      if (event.type === 'error') throw Object.assign(new Error(event.error || 'ตรวจจับสินค้าไม่สำเร็จ'), {latency: event.latency_ms})
      if (event.type === 'match' && !match) {
        displayMatch(event)
        match = event
        latency.textContent = 'ผลสินค้า ' + event.latency_ms + ' ms'
        if (match.product_id !== 'none') locationNote.textContent = 'กำลังหาตำแหน่งสินค้าในภาพ…'
      } else if (event.type === 'location' && match && !locationReceived) {
        locationReceived = true
        if (match.product_id !== 'none') {
          displayLocation(event)
          latency.textContent = 'ผลสินค้า ' + match.latency_ms + ' ms · รวม ' + event.latency_ms + ' ms'
        }
      }
    }
    if (!match) throw new Error('ไม่ได้รับผลสินค้า กรุณาลองใหม่')
    if (match.product_id !== 'none' && !locationReceived) throw new Error('ได้รับผลตำแหน่งสินค้าไม่ครบ')
  } catch (error) {
    if (current !== revision) return
    if (match) locationNote.textContent = 'แสดงผลสินค้าแล้ว แต่รับตำแหน่งในภาพไม่สำเร็จ'
    else {
      if (Number.isFinite(error.latency)) latency.textContent = error.latency + ' ms'
      result.replaceChildren(el('p', error instanceof TypeError ? 'รับข้อมูลจากเซิร์ฟเวอร์ไม่สำเร็จ' : error.message, 'error'))
    }
  } finally {
    controller.abort()
    if (pending === controller) { pending = null; syncRun() }
  }
}
syncRun()
selectMedia(null, examples[0])
api('/api/catalog').then(products => {
  document.querySelector('#catalog-link').textContent = 'คลังสินค้า (' + products.length + ') ↗'
  if (!products.length && !revision) result.replaceChildren(el('p', 'เพิ่มสินค้าในหน้า Catalog ก่อนตรวจจับเฟรมแรก', 'muted'))
}).catch(error => { if (!revision) result.replaceChildren(el('p', error.message, 'error')) })
