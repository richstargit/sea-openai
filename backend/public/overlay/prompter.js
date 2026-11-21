// The seller's prompter. Connects like the program overlay (same token in the link hash)
// but draws only 'prompter' events. Text is set with textContent, never as markup.
const token = location.hash.slice(1)
const root = document.getElementById('prompter')
const stage = document.getElementById('stage')
const lines = document.getElementById('lines')
const warning = document.getElementById('warning')
const STAGES = {
  open: 'เปิดไลฟ์',
  features: 'จุดเด่น',
  demo: 'สาธิต',
  price: 'ราคา',
  offer: 'โปรโมชัน',
  objection: 'ตอบข้อสงสัย',
  chat: 'ชวนคุยแชต',
  close: 'ปิดไลฟ์',
  unknown: 'ต่อจากที่พูด',
}
const DEFAULT_TTL = 20000
let clearTimer

function show(payload, ttl) {
  stage.textContent = STAGES[payload.stage] ?? ''
  lines.replaceChildren(
    ...payload.lines.map((text) => {
      const item = document.createElement('li')
      item.textContent = text
      return item
    }),
  )
  if (payload.warning) {
    warning.textContent = payload.warning
    warning.hidden = false
  } else {
    warning.hidden = true
    warning.textContent = ''
  }
  root.dataset.state = 'showing'
  clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    root.dataset.state = 'idle'
    stage.textContent = ''
    warning.hidden = true
  }, Math.min(Math.max(Number(ttl) || DEFAULT_TTL, 2000), 120000))
}

function connect() {
  if (!/^[\w-]{43}$/.test(token)) return
  const url = new URL('ws', location.href)
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url)
  socket.onopen = () => socket.send(token)
  socket.onmessage = ({ data }) => {
    let event
    try {
      event = JSON.parse(data)
    } catch {
      return
    }
    if (event.type === 'ready') {
      document.body.dataset.connected = 'true'
      document.getElementById('link').textContent = 'เชื่อมต่อแล้ว'
      return
    }
    if (event.type === 'prompter' && Array.isArray(event.payload?.lines)) show(event.payload, event.ttl)
  }
  socket.onclose = ({ code }) => {
    delete document.body.dataset.connected
    document.getElementById('link').textContent = 'ขาดการเชื่อมต่อ'
    if (code !== 1008) setTimeout(connect, 1500)
  }
}
connect()
