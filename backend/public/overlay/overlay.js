const token = location.hash.slice(1)
const presets = new Map(
  ['promo', 'gift', 'flash', 'transition'].map((type) => {
    const video = document.createElement('video')
    video.preload = 'auto'
    video.muted = true
    video.src = 'clips/' + type + '.webm'
    video.load()
    return [type, video]
  }),
)
const fallback = ['LIVE', 'กำลังไลฟ์']
const number = new Intl.NumberFormat('th-TH')
function copy(event) {
  switch (event.type) {
    case 'price':
      return [event.sku, '฿' + number.format(event.price)]
    case 'product':
      return ['สินค้า', event.name]
    case 'ingredients':
      return ['ส่วนผสม', event.text]
    case 'sales':
      return ['ยอดขาย', number.format(event.total)]
    default:
      return fallback
  }
}
window.__timelines = {}
function buildSlot(index) {
  const root = document
    .querySelector('#slot')
    .content.firstElementChild.cloneNode(true)
  document.querySelector('#stage').append(root)
  const scene = root.querySelector('.scene')
  const article = scene.querySelector('article')
  const id = 'live-card-' + index
  scene.id = id
  scene.dataset.compositionId = id
  const timeline = gsap
    .timeline({ paused: true })
    .fromTo(
      article,
      { x: -60, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.32, ease: 'power2.out' },
      0,
    )
    .to(article, { x: -18, opacity: 0, duration: 0.3 }, 3.7)
  window.__timelines[id] = timeline
  const video = root.querySelector('video')
  let controller
  let objectUrl
  function clear() {
    controller?.abort()
    timeline.pause(0)
    timeline.eventCallback('onComplete', null)
    video.pause()
    video.removeAttribute('src')
    video.load()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = undefined
    root.classList.remove('playing')
  }
  return {
    root,
    async play(event) {
      clear()
      controller = new AbortController()
      const { signal } = controller
      root.classList.add('playing')
      const showCard = (values, image) => {
        video.hidden = true
        scene.hidden = false
        const [label, value] = values
        scene.dataset.variableValues = JSON.stringify({ label, value })
        scene.querySelector('small').textContent = label
        scene.querySelector('strong').textContent = value
        const picture = scene.querySelector('img')
        picture.hidden = !image
        if (image) picture.src = image
        else picture.removeAttribute('src')
        timeline.eventCallback('onComplete', clear)
        timeline.restart()
      }
      if (!presets.has(event.type) && event.type !== 'clip') {
        showCard(copy(event), event.image)
        return
      }
      scene.hidden = true
      video.hidden = false
      const deadline = setTimeout(() => {
        if (!signal.aborted) {
          clear()
          root.classList.add('playing')
          showCard(fallback)
        }
      }, 900)
      signal.addEventListener('abort', () => clearTimeout(deadline), {
        once: true,
      })
      try {
        if (event.type === 'clip') {
          const response = await fetch(
            'media/' + encodeURIComponent(event.fileId),
            { headers: { Authorization: 'Bearer ' + token }, signal },
          )
          if (!response.ok) throw new Error('Clip unavailable')
          const blob = await response.blob()
          if (signal.aborted) return
          objectUrl = URL.createObjectURL(blob)
          video.src = objectUrl
        } else video.src = presets.get(event.type).src
        video.addEventListener('ended', clear, { once: true, signal })
        await video.play()
        clearTimeout(deadline)
      } catch {
        clearTimeout(deadline)
        if (!signal.aborted) showCard(fallback)
      }
    },
  }
}
const slots = [buildSlot(0), buildSlot(1)]
let sequence = 0
function connect() {
  if (!/^[\w-]{43}$/.test(token)) return
  const url = new URL('ws', location.href)
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const socket = new WebSocket(url)
  socket.onopen = () => socket.send(token)
  socket.onmessage = ({ data }) => {
    const event = JSON.parse(data)
    if (event.type === 'ready') {
      document.body.dataset.connected = 'true'
      return
    }
    const slot =
      slots.find((item) => !item.root.classList.contains('playing')) ??
      slots.reduce((a, b) => (a.order < b.order ? a : b))
    slot.order = ++sequence
    void slot.play(event)
  }
  socket.onclose = ({ code }) => {
    delete document.body.dataset.connected
    if (code !== 1008) setTimeout(connect, 1500)
  }
}
connect()
