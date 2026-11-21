const token = location.hash.slice(1)
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
    case 'promo':
      return ['เฉพาะไลฟ์นี้', 'โปรพิเศษ']
    case 'gift':
      return ['เมื่อร่วมรายการ', 'มีของแถม']
    case 'flash':
      return ['ช่วงเวลาพิเศษ', 'FLASH DEAL']
    case 'transition':
      return ['พบกันในอีกสักครู่', 'ช่วงต่อไป']
    default:
      return fallback
  }
}
// marker inks that read on paper and carry white text on stickers
const accents = {
  price: '#d23b2a',
  product: '#2f7d4f',
  ingredients: '#5a4fcf',
  sales: '#c2571a',
  promo: '#d23b2a',
  gift: '#2f7d4f',
  flash: '#c2571a',
  transition: '#5a4fcf',
}
// each preset gets its own look unless the event picks one
const presetStyles = { promo: 'sticker', gift: 'tag', flash: 'flap', transition: 'receipt' }
const styles = new Set(['tag', 'sticker', 'receipt', 'flap'])
const graphemes = (value) =>
  [...new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(value)].map((part) => part.segment)
const isNumber = (event) => event.type === 'price' || event.type === 'sales'

// odometer digits laid over the real text; returns when the last reel lands
function rollDigits(timeline, strong, text, value, at) {
  const fx = document.createElement('span')
  fx.className = 'fx'
  fx.setAttribute('aria-hidden', 'true')
  const reels = []
  for (const char of value) {
    if (!/\d/.test(char)) {
      fx.append(char)
      continue
    }
    const reel = document.createElement('span')
    const column = document.createElement('span')
    reel.className = 'reel'
    column.textContent = [...'01234567890123456789'].join('\n')
    reel.append(column)
    fx.append(reel)
    reels.push([column, Number(char)])
  }
  strong.append(fx)
  reels.forEach(([column, digit], i) =>
    timeline.fromTo(column, { yPercent: 0 }, { yPercent: (-100 * (10 + digit)) / 20, duration: 0.9, ease: 'expo.out' }, at + (reels.length - 1 - i) * 0.06),
  )
  const landed = at + 0.9 + Math.max(0, reels.length - 1) * 0.06
  timeline
    .fromTo(fx, { yPercent: 60, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }, at)
    .fromTo(text, { opacity: 0 }, { opacity: 1, duration: 0.01 }, landed)
    .to(fx, { opacity: 0, duration: 0.01 }, landed)
  return landed
}

// Prebuilt HyperFrames-style templates. Each style owns its look (overlay.css)
// and its choreography below; all motion lives on the slot's seekable timeline.
const choreographies = {
  // paper hang-tag drops and swings on its eyelet, marker lands behind the value
  tag(timeline, { article, labelText, strong, text, mark, picture, slot }, event, value) {
    mark.style.width = text.offsetWidth + 'px'
    const pivot = slot.offsetWidth * 0.036 + 'px 50%'
    timeline
      .fromTo(article, { y: -28, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }, 0)
      .fromTo(article, { rotation: -7, transformOrigin: pivot }, { rotation: 4, duration: 0.35, ease: 'sine.out' }, 0)
      .to(article, { rotation: -1.5, duration: 0.3, ease: 'sine.inOut' }, 0.35)
      .to(article, { rotation: 0, duration: 0.3, ease: 'sine.inOut' }, 0.65)
      .fromTo(picture, { clipPath: 'inset(100% 0% 0% 0%)', scale: 1.12 }, { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 0.6, ease: 'power3.out' }, 0.15)
      .fromTo(labelText, { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out' }, 0.22)
    const landed = isNumber(event)
      ? rollDigits(timeline, strong, text, value, 0.3)
      : (timeline.fromTo(text, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'power4.out' }, 0.3), 0.75)
    timeline
      .fromTo(mark, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.45, ease: 'power2.inOut' }, Math.min(landed - 0.2, 2.6))
      .to(mark, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.25, ease: 'power2.in' }, 3.35)
      .to(article, { y: -14, opacity: 0, duration: 0.3, ease: 'power2.in' }, 3.55)
  },
  // price sticker slapped onto the screen: falls, squashes on impact, peels off
  sticker(timeline, { article, labelText, strong, text, picture }, event, value) {
    timeline
      .fromTo(article, { scale: 1.7, rotation: -16, opacity: 0, transformOrigin: '50% 50%' }, { scale: 1, rotation: -3, opacity: 1, duration: 0.28, ease: 'power4.in' }, 0)
      .to(article, { scaleX: 1.05, scaleY: 0.94, duration: 0.07, ease: 'power1.out' }, 0.28)
      .to(article, { scaleX: 1, scaleY: 1, duration: 0.22, ease: 'power2.out' }, 0.35)
      .fromTo(picture, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' }, 0.3)
      .fromTo(labelText, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.3)
    if (isNumber(event)) rollDigits(timeline, strong, text, value, 0.3)
    timeline.to(article, { rotation: 9, y: -24, scale: 0.92, opacity: 0, duration: 0.32, ease: 'power2.in' }, 3.5)
  },
  // thermal receipt feeds out in steps, then the value types across
  receipt(timeline, { article, text, picture }, event, value) {
    const steps = Math.max(4, graphemes(value).length)
    timeline
      .fromTo(article, { clipPath: 'inset(0% 0% 100% 0%)', y: -12, opacity: 1 }, { clipPath: 'inset(0% 0% 0% 0%)', y: 0, duration: 0.8, ease: 'steps(10)' }, 0)
      .fromTo(picture, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: 'steps(3)' }, 0.3)
      .fromTo(text, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: Math.min(0.9, steps * 0.06), ease: `steps(${steps})` }, 0.55)
      .to(article, { y: 18, rotation: 2, opacity: 0, duration: 0.3, ease: 'power2.in' }, 3.55)
  },
  // split-flap board: each character scrambles, then flips onto its final glyph
  flap(timeline, { article, labelText, strong }, event, value) {
    const fx = document.createElement('span')
    fx.className = 'fx'
    fx.setAttribute('aria-hidden', 'true')
    const pool = isNumber(event) ? '0123456789' : 'กขคงจฉชซญดตถทนบปผพฟมยรลวสหอฮABCDEFGHJKLMNPRSTUVWXYZ'
    const tiles = graphemes(value).map((char, i) => {
      const tile = document.createElement('span')
      tile.className = 'tile'
      tile.textContent = char === ' ' ? ' ' : char
      fx.append(tile)
      // setter, not onUpdate: callbacks are suppressed while seeking, setters are not
      let step = 7
      const glyph = (k) => (k >= 7 || char === ' ' ? (char === ' ' ? ' ' : char) : pool[(Math.floor(k) * 7 + i * 3) % pool.length])
      const spin = {
        get k() {
          return step
        },
        set k(next) {
          step = next
          tile.textContent = glyph(next)
        },
      }
      timeline
        .fromTo(tile, { rotationX: -90 }, { rotationX: 0, duration: 0.14, ease: 'power2.out' }, 0.2 + i * 0.045)
        .fromTo(spin, { k: 0 }, { k: 7, duration: 0.42, ease: 'none' }, 0.2 + i * 0.045)
      return tile
    })
    strong.append(fx)
    timeline
      .fromTo(article, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, 0)
      .fromTo(labelText, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.12)
      .to(tiles, { rotationX: 90, duration: 0.12, ease: 'power2.in', stagger: 0.02 }, 3.35)
      .to(article, { opacity: 0, duration: 0.25 }, 3.65)
  },
}
function choreograph(timeline, article, event, [label, value]) {
  const parts = {
    article,
    slot: article.closest('.slot'),
    labelText: article.querySelector('small span'),
    strong: article.querySelector('strong'),
    text: article.querySelector('.text'),
    mark: article.querySelector('.mark'),
    picture: article.querySelector('img'),
  }
  const style = styles.has(event.style) ? event.style : presetStyles[event.type] ?? 'tag'
  parts.strong.querySelector('.fx')?.remove()
  // a slot can switch styles, so drop inline state left by the previous choreography
  gsap.set([article, parts.labelText, parts.text, parts.mark, parts.picture], { clearProps: 'all' })
  article.dataset.style = style
  article.style.setProperty('--accent', accents[event.type] ?? accents.price)
  parts.labelText.textContent = label
  parts.text.textContent = value
  timeline.clear()
  choreographies[style](timeline, parts, event, value)
  // sound per style; calls are skipped while seeking, so scrubbing stays silent
  const cues = { tag: [['swoosh', 0], ['pop', 0.35]], sticker: [['stamp', 0.26]], receipt: [['printer', 0]], flap: [['flap', 0.2], ['flap', 0.5]] }[style]
  if (isNumber(event)) cues.push(['cash', 0.9])
  for (const [name, at] of cues) timeline.call(() => window.playSound?.(name), [], at)
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
  const timeline = gsap.timeline({ paused: true })
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
      const showCard = (values, image, source = event) => {
        video.hidden = true
        scene.hidden = false
        const [label, value] = values
        scene.dataset.variableValues = JSON.stringify({ label, value })
        choreograph(timeline, article, source, values)
        const picture = scene.querySelector('img')
        picture.hidden = !image
        if (image) picture.src = image
        else picture.removeAttribute('src')
        timeline.eventCallback('onComplete', clear)
        timeline.restart()
      }
      if (event.type !== 'clip') {
        showCard(copy(event), event.image)
        return
      }
      scene.hidden = true
      video.hidden = false
      const deadline = setTimeout(() => {
        if (!signal.aborted) {
          clear()
          root.classList.add('playing')
          showCard(fallback, undefined, { type: 'default' })
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
        }
        video.addEventListener('ended', clear, { once: true, signal })
        await video.play()
        clearTimeout(deadline)
      } catch {
        clearTimeout(deadline)
        if (!signal.aborted) showCard(fallback, undefined, { type: 'default' })
      }
    },
  }
}
const slots = [buildSlot(0), buildSlot(1)]
// Spotlight: the product pops out of a point (the host's fingertip), floats, then
// shrinks back into it. One at a time; a new spotlight replaces the current one.
const spot = document.querySelector('#spot')
const spotline = gsap.timeline({ paused: true })
window.__timelines.spotlight = spotline
function spotlight(event) {
  const find = (selector) => spot.querySelector(selector)
  const figure = find('figure')
  const picture = find('.spot-media img')
  const shadow = find('.spot-shadow')
  const name = find('.spot-name')
  const price = find('.spot-price')
  const priceText = price.querySelector('.text')
  const mark = price.querySelector('.mark')
  const box = find('.spot-box')
  const dot = find('.spot-dot')
  const line = find('.spot-line')
  const rings = [...spot.querySelectorAll('.spot-ring')]
  spotline.pause(0).clear()
  price.querySelector('.fx')?.remove()
  gsap.set([figure, picture, shadow, name, priceText, mark, box, dot, line, ...rings], { clearProps: 'all' })
  const motion = ['pop', 'bubble', 'rise', 'flip'].includes(event.motion) ? event.motion : 'pop'
  const vh = innerHeight / 100
  const x = event.x * innerWidth
  const y = event.y * innerHeight
  const half = 17 * vh + 2 * vh
  const cx = Math.min(innerWidth - half, Math.max(half, x))
  const gap = (motion === 'bubble' ? 3.5 : 7) * vh
  const above = event.y >= 0.42
  const toward = above ? gap : -gap
  spot.dataset.side = above ? 'above' : 'below'
  spot.dataset.motion = motion
  for (const [key, value] of [['x', x], ['y', y], ['cx', cx], ['gap', gap]]) spot.style.setProperty('--' + key, value + 'px')
  // keep the opening point on the fingertip even when the card was clamped away from the edge
  spot.style.setProperty('--ox', 'calc(50% + ' + (x - cx) + 'px)')
  // a PNG with transparent corners is a cutout: float it on the backdrop instead of cropping
  delete spot.dataset.cutout
  picture.onload = () => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 8
      const context = canvas.getContext('2d')
      context.drawImage(picture, 0, 0, 8, 8)
      const alpha = context.getImageData(0, 0, 8, 8).data
      if ([3, 31, 227, 255].every((i) => alpha[i] < 16)) spot.dataset.cutout = ''
    } catch {}
  }
  picture.src = event.image
  name.textContent = event.name ?? ''
  const value = event.price === undefined ? '' : '฿' + number.format(event.price)
  priceText.textContent = value
  if (event.box) {
    spot.dataset.box = ''
    for (const [key, size] of [['bx', event.box.x * innerWidth], ['by', event.box.y * innerHeight], ['bw', event.box.w * innerWidth], ['bh', event.box.h * innerHeight]])
      spot.style.setProperty('--' + key, size + 'px')
  } else delete spot.dataset.box
  spot.hidden = false
  mark.style.width = priceText.offsetWidth + 'px'
  const width = figure.offsetWidth
  const height = figure.offsetHeight
  const origin = [width / 2 + (x - cx), above ? height : 0]
  const at = origin[0] + 'px ' + origin[1] + 'px'
  const iris = (radius) => 'circle(' + radius + 'px at ' + at + ')'
  gsap.set(figure, { transformOrigin: at })

  // the tap: brackets lock on, the fingertip pulses twice, a leader line reaches out
  if (event.box)
    spotline
      .fromTo(box, { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'power3.out' }, 0)
      .to(box, { opacity: 0, duration: 0.25 }, 4.1)
  rings.forEach((ring, i) =>
    spotline.fromTo(ring, { scale: 0.3, opacity: 0.9 }, { scale: 2.2, opacity: 0, duration: 0.8, ease: 'power2.out' }, i * 0.14),
  )
  spotline
    .fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.22, ease: 'power3.out' }, 0)
    .fromTo(line, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: 'power3.out' }, 0.08)

  if (motion === 'pop')
    // iris: the card opens out of the fingertip
    spotline.fromTo(
      figure,
      { clipPath: iris(0), scale: 0.9, y: toward * 0.3 },
      { clipPath: iris(Math.hypot(width, height) * 1.1), scale: 1, y: 0, duration: 0.75, ease: 'expo.out' },
      0.2,
    )
  if (motion === 'bubble')
    spotline.fromTo(figure, { scale: 0.1, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.7)' }, 0.1)
  if (motion === 'rise')
    spotline
      .fromTo(figure, { y: toward, scale: 0.3, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.8, ease: 'expo.out' }, 0.1)
      .fromTo(picture, { rotation: -10 }, { rotation: 0, duration: 1.1, ease: 'power3.out' }, 0.1)
  if (motion === 'flip')
    spotline.fromTo(figure, { rotationY: -90, opacity: 0, transformPerspective: 1000 }, { rotationY: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 0.2)

  // inside the card: the photo settles, the name rises out of its mask, the price rolls in
  spotline
    .fromTo(picture, { scale: 1.25 }, { scale: 1, duration: 1.2, ease: 'power3.out' }, 0.2)
    .fromTo(shadow, { scaleX: 0.4, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.8, ease: 'power3.out' }, 0.35)
    .fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: 0.45, ease: 'power4.out' }, 0.5)
  if (value) {
    const landed = rollDigits(spotline, price, priceText, value, 0.55)
    spotline
      .fromTo(mark, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, landed - 0.15)
      .to(mark, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.25, ease: 'power2.in' }, 3.9)
  }

  // hold: a slow float, then each motion leaves the way it came
  spotline.to(figure, { y: -0.8 * vh, rotation: 0.6, duration: 1.3, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 1.1)
  const exit = {
    pop: { clipPath: iris(0), scale: 0.92, duration: 0.4, ease: 'power2.in' },
    bubble: { scale: 0.1, opacity: 0, duration: 0.3, ease: 'back.in(1.7)' },
    rise: { y: toward, scale: 0.3, opacity: 0, duration: 0.35, ease: 'power2.in' },
    flip: { rotationY: 90, opacity: 0, duration: 0.3, ease: 'power2.in' },
  }[motion]
  spotline
    .to(figure, exit, 4.1)
    .to(line, { scaleY: 0, duration: 0.2, ease: 'power2.in' }, 4.35)
    .to(dot, { scale: 0, duration: 0.15 }, 4.5)
  for (const [name, at] of [['pop', 0], ['whoosh-high', 0.15], ['sparkle', 0.5], ...(value ? [['cash', 1.2]] : [])])
    spotline.call(() => window.playSound?.(name), [], at)
  spotline.eventCallback('onComplete', () => {
    spot.hidden = true
  })
  spotline.restart()
}
// LiveCut events ({ type, payload, ttl }) map onto graphics presets
const livecut = {
  price_pop: 'price-pop',
  price_drop: 'price-drop',
  free_badge: 'free-badge',
  low_stock: 'low-stock',
  product_card: 'product-card',
  cf_toast: 'cf-toast',
  combo: 'combo',
  fireworks: 'fireworks',
  poll: 'poll',
  caption: 'caption',
  crawl: 'crawl',
  glow: 'edge-glow',
}
function route(event) {
  if (event.type === 'graphic') return playGraphic(event), true
  if (event.type === 'sound') return window.playSound?.(event.name ?? event.payload?.name), true
  if (event.type === 'theme') return applyShopTheme(event.payload ?? event), true
  if (event.type === 'face_box') return setFaceBox(event.payload), true
  // camera cuts happen in OBS; the overlay has nothing to draw
  if (event.type === 'jump_zoom') return true
  if (event.type === 'zoom') return zoomCamera({ ...event.payload, ttl: event.ttl ?? event.payload?.ttl }), true
  if (event.type === 'zoom_out') return zoomOut(), true
  if (event.type === 'poll' && updateGraphic('lower', event.payload)) return true
  const preset = livecut[event.type]
  if (!preset) return false
  const { x, y, box, image, ...data } = event.payload ?? {}
  playGraphic({ preset, data, x, y, box, image, ttl: event.ttl })
  return true
}
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
    if (event.type === 'spotlight') {
      spotlight(event)
      return
    }
    if (route(event)) return
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
