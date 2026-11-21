// LiveCut motion set: the graphics the director sends during a live
// (price_pop, price_drop, free_badge, low_stock, product_card, cf_toast, combo,
// fireworks, poll, caption, crawl, glow). Entrances 0.2–0.3 s, hold = ttl (default 1.8 s).
;(() => {
  const hold = (kit) => kit.hold ?? 1.8
  const priceOf = (data) => {
    if (Number.isFinite(data.price)) return data.price
    const digits = String(data.text ?? '').replace(/[^\d.]/g, '')
    return digits ? Number(digits) : null
  }
  const KEYWORDS = /^(\d[\d,.]*|บาท|ลด|ฟรี|แถม|ส่งฟรี|ด่วน|หมด|ชิ้นสุดท้าย|โปร|ถูก|คุ้ม)$/

  // word-by-word subtitle; key words (numbers, บาท, ลด, ฟรี…) pop in the accent
  defineGraphic('caption', {
    title: 'ซับทีละคำ · Word captions',
    place: 'caption',
    theme: 'ink',
    sound: [],
    themes: ['ink', 'paper', 'pop', 'outline'],
    sample: { data: { text: 'วันนี้ครีมกันแดด ลดเหลือ 290 บาท ส่งฟรี' } },
    build(kit, data, tl) {
      const line = kit.el('p', 'g-caption-line')
      const emphasis = new Set([].concat(data.emphasis ?? []))
      const parts = kit.words(data.text).filter((w) => w !== '')
      const nodes = parts.map((word) => {
        const span = kit.el('span', /^\s+$/.test(word) ? 'g-caption-space' : 'g-caption-word', word, line)
        if (emphasis.has(word) || KEYWORDS.test(word.trim())) span.classList.add('is-key')
        return span
      })
      const step = Math.min(0.12, 1.2 / Math.max(1, nodes.length))
      tl.fromTo(line, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power3.out' }, 0)
      nodes.forEach((node, i) => {
        const key = node.classList.contains('is-key')
        tl.fromTo(node, { opacity: 0, y: '0.35em', scale: key ? 1.35 : 1 }, { opacity: 1, y: 0, scale: 1, duration: key ? 0.3 : 0.18, ease: key ? 'back.out(2.2)' : 'power3.out' }, 0.05 + i * step)
      })
      const shown = 0.05 + nodes.length * step + hold(kit)
      tl.to(line, { opacity: 0, y: -8, duration: 0.25, ease: 'power2.in' }, shown)
    },
  })

  // big price pop with a tick
  defineGraphic('price-pop', {
    title: 'ราคาเด้ง · Price pop',
    place: 'lower',
    sample: { data: { price: 290, name: 'ครีมกันแดด A12' } },
    build(kit, data, tl) {
      const panel = kit.el('div', 'g-panel g-price-pop-box')
      const label = kit.el('span', 'g-sub', data.name ?? data.label ?? 'ราคาไลฟ์', kit.el('span', 'g-mask', null, panel))
      const value = kit.el('strong', 'g-price-pop-value', null, panel)
      const mark = kit.el('i', 'g-price-pop-mark', null, value)
      const price = priceOf(data)
      const digits = kit.el('span', null, price == null ? data.text : kit.money(price), value)
      tl.fromTo(panel, { scale: 0.6, opacity: 0, transformOrigin: '0% 100%' }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }, 0)
        .fromTo(label, { yPercent: 110 }, { yPercent: 0, duration: 0.25, ease: 'power3.out' }, 0.08)
        .fromTo(digits, { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2.4)' }, 0.1)
        .fromTo(mark, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.3, ease: 'power2.out' }, 0.35)
      kit.sound('pop-hi', 0.08)
      kit.sound('cash', 0.12)
      tl.to(panel, { y: 12, opacity: 0, duration: 0.25, ease: 'power2.in' }, 0.4 + hold(kit))
    },
  })

  // old price struck through, new price drops in with the percent off
  defineGraphic('price-drop', {
    title: 'ขีดฆ่าราคาเดิม · Price drop',
    place: 'lower',
    sample: { data: { from: 490, to: 290, name: 'ครีมกันแดด A12' } },
    build(kit, data, tl) {
      const from = data.from ?? data.originalPrice
      const to = data.to ?? priceOf(data)
      const panel = kit.el('div', 'g-panel g-price-drop-box')
      kit.el('span', 'g-sub', data.name ?? 'ราคาพิเศษ', panel)
      const row = kit.el('div', 'g-price-drop-row', null, panel)
      const old = kit.el('span', 'g-price-drop-old', kit.money(from), row)
      const strike = kit.svg('<svg class="g-price-drop-strike" viewBox="0 0 100 20" preserveAspectRatio="none"><path pathLength="1" d="M2 14 Q50 4 98 8"/></svg>', old)
      const now = kit.el('strong', 'g-price-drop-now', kit.money(to), row)
      const off = from > to ? Math.round((1 - to / from) * 100) : 0
      const chip = off ? kit.el('span', 'g-price-drop-chip', `-${off}%`, row) : null
      tl.fromTo(panel, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, 0)
        .fromTo(strike.querySelector('path'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.25, ease: 'power2.inOut' }, 0.3)
        .fromTo(old, { opacity: 1 }, { opacity: 0.55, duration: 0.2 }, 0.5)
        .fromTo(now, { y: -40, opacity: 0, scale: 1.3 }, { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, 0.55)
      if (chip) tl.fromTo(chip, { scale: 0, rotation: -20 }, { scale: 1, rotation: -6, duration: 0.28, ease: 'back.out(2.5)' }, 0.75)
      kit.sound('swoosh', 0)
      kit.sound('slash', 0.3)
      kit.sound('cash', 0.58)
      tl.to(panel, { x: -20, opacity: 0, duration: 0.25, ease: 'power2.in' }, 0.9 + hold(kit))
    },
  })

  // starburst badge: FREE / ส่งฟรี / แถม
  defineGraphic('free-badge', {
    title: 'ป้าย FREE · Free badge',
    place: 'corner',
    sound: [['stamp', 0.05], ['sparkle', 0.2]],
    defaults: { text: 'ฟรี', sub: 'ส่งฟรีทั่วไทย' },
    presets: {
      gift: { title: 'ป้ายของแถม · Gift badge', data: { text: 'แถม', sub: 'ซื้อครบ 2 ชิ้น' } },
      shipping: { title: 'ป้ายส่งฟรี · Free shipping', data: { text: 'ส่งฟรี', sub: 'ไม่มีขั้นต่ำ' } },
    },
    sample: { data: { text: 'ฟรี', sub: 'ส่งฟรีทั่วไทย' } },
    build(kit, data, tl) {
      const badge = kit.el('div', 'g-free-badge-box')
      const points = Array.from({ length: 28 }, (_, i) => {
        const r = i % 2 ? 41 : 50
        const a = (i / 28) * Math.PI * 2
        return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
      }).join(' ')
      kit.svg(`<svg viewBox="0 0 100 100"><polygon points="${points}"/></svg>`, badge)
      const copy = kit.el('div', 'g-free-badge-copy', null, badge)
      kit.el('strong', null, data.text, copy)
      if (data.sub) kit.el('span', null, data.sub, copy)
      tl.fromTo(badge, { scale: 0, rotation: -90 }, { scale: 1, rotation: -8, duration: 0.3, ease: 'back.out(1.8)' }, 0)
        .to(badge, { rotation: 4, duration: 0.6, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0.35)
        .to(badge, { scale: 0, rotation: 40, duration: 0.25, ease: 'power2.in' }, 0.35 + hold(kit))
    },
  })

  // last few in stock: bar drains to what is left, a pulse per second while it holds
  defineGraphic('low-stock', {
    title: 'ป้ายเหลือน้อย · Low stock',
    place: 'lower',
    sound: [['swoosh', 0], ['notify', 0.3]],
    sample: { data: { left: 3, total: 50, name: 'ครีมกันแดด A12' } },
    build(kit, data, tl) {
      const left = Number(data.left ?? data.qty ?? 0)
      const total = Math.max(left, Number(data.total ?? (left * 5 || 1)))
      const panel = kit.el('div', 'g-panel g-low-stock-box')
      const head = kit.el('div', 'g-low-stock-head', null, panel)
      kit.el('span', 'g-low-stock-dot', null, head)
      const label = kit.el('strong', null, null, head)
      kit.el('span', 'g-sub', data.name ?? '', panel)
      const bar = kit.el('i', 'g-low-stock-bar', null, kit.el('div', 'g-low-stock-track', null, panel))
      tl.fromTo(panel, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, 0)
        .fromTo(bar, { scaleX: 1 }, { scaleX: left / total, duration: 0.6, ease: 'power3.out' }, 0.2)
      kit.count(label, total, left, 0.2, 0.6, (n) => `เหลือ ${n} ชิ้น${n <= 3 ? 'สุดท้าย' : ''}`)
      for (let t = 0.9; t < 0.9 + hold(kit) - 0.3; t += 1) tl.fromTo(panel, { scale: 1 }, { scale: 1.04, duration: 0.12, yoyo: true, repeat: 1, ease: 'power1.out', immediateRender: false }, t)
      tl.to(panel, { y: 16, opacity: 0, duration: 0.25, ease: 'power2.in' }, 0.9 + hold(kit))
    },
  })

  // product card slides in on the side away from the host's face
  defineGraphic('product-card', {
    title: 'การ์ดสินค้า · Product card',
    place: 'card',
    sound: [['whoosh', 0], ['pop', 0.2]],
    sample: { data: { name: 'ครีมกันแดด SPF50', price: 290, productId: 'A12', note: 'กันน้ำ กันเหงื่อ' }, image: '/overlay/product.jpg' },
    build(kit, data, tl) {
      const side = kit.away
      const card = kit.el('div', 'g-panel g-product-card-box')
      card.dataset.side = side
      if (kit.image) {
        const img = kit.el('img', 'g-product-card-img', null, card)
        img.src = kit.image
        img.alt = ''
      }
      const body = kit.el('div', 'g-product-card-body', null, card)
      if (data.productId) kit.el('span', 'g-product-card-code', 'CF ' + data.productId, body)
      kit.el('strong', 'g-product-card-name', data.name ?? '', body)
      if (data.note) kit.el('span', 'g-sub', data.note, body)
      const price = priceOf(data)
      if (price != null) kit.el('span', 'g-product-card-price', kit.money(price), body)
      const dx = side === 'right' ? 60 : -60
      tl.fromTo(card, { x: kit.vw * (side === 'right' ? 40 : -40), opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'expo.out' }, 0)
        .fromTo(body.children, { x: dx / 3, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, stagger: 0.05, ease: 'power3.out' }, 0.12)
        .to(card, { x: kit.vw * (side === 'right' ? 40 : -40), opacity: 0, duration: 0.3, ease: 'power3.in' }, 0.5 + hold(kit))
    },
  })

  // "คุณแอน CF ครีมกันแดด 2 ชิ้น" strap with a heart
  defineGraphic('cf-toast', {
    title: 'แถบ CF · CF toast',
    place: 'toast',
    sound: [['notify', 0], ['heart', 0.15]],
    sample: { data: { name: 'คุณแอน', product: 'ครีมกันแดด', qty: 2, left: 3 } },
    build(kit, data, tl) {
      const strap = kit.el('div', 'g-panel g-cf-toast-box')
      const heart = kit.svg('<svg class="g-cf-toast-heart" viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.4C1 8.3 3 5 6.4 5c2 0 3.6 1.2 4.4 2.6h2.4C14 6.2 15.6 5 17.6 5 21 5 23 8.3 21.6 11.6 19.5 16.4 12 21 12 21z"/></svg>', strap)
      const text = kit.el('div', 'g-cf-toast-text', null, strap)
      const line = kit.el('strong', null, null, text)
      kit.el('span', 'g-cf-toast-name', data.name ?? 'ลูกค้า', line)
      kit.el('span', null, ` CF ${data.product ?? data.productId ?? ''} ${data.qty ?? 1} ชิ้น`, line)
      if (data.left != null) kit.el('span', 'g-sub', `สต็อกเหลือ ${data.left}`, text)
      tl.fromTo(strap, { x: kit.away === 'right' ? 80 : -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, 0)
        .fromTo(heart, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 0.15)
        .to(heart, { scale: 1.2, duration: 0.15, yoyo: true, repeat: 1, ease: 'power1.out' }, 0.5)
        .to(strap, { opacity: 0, x: kit.away === 'right' ? 40 : -40, duration: 0.25, ease: 'power2.in' }, 0.4 + hold(kit))
    },
  })

  // combo counter x2 → x3 punch
  defineGraphic('combo', {
    title: 'คอมโบ · Combo',
    place: 'corner',
    sound: [['combo', 0.1], ['impact', 0.5]],
    sample: { data: { count: 3, text: 'CF ติดกัน' } },
    build(kit, data, tl) {
      const n = Math.max(2, Number(data.count ?? 2))
      const wrap = kit.el('div', 'g-combo-box')
      const num = kit.el('strong', 'g-combo-num', null, wrap)
      kit.el('span', 'g-combo-label', data.text ?? 'คอมโบ', wrap)
      tl.fromTo(wrap, { x: 40, opacity: 0, skewX: -10 }, { x: 0, opacity: 1, skewX: 0, duration: 0.22, ease: 'power3.out' }, 0)
      const first = Math.max(1, n - 2)
      num.textContent = 'x' + first
      for (let i = first; i <= n; i++) {
        const at = 0.1 + (i - first) * 0.22
        if (i > first) kit.swap(num, 'x' + i, at)
        tl.fromTo(num, { scale: 1.7 }, { scale: 1, duration: 0.2, ease: 'back.out(3)', immediateRender: false }, at)
      }
      tl.to(wrap, { x: 40, opacity: 0, duration: 0.25, ease: 'power2.in' }, 0.7 + hold(kit))
    },
  })

  // fireworks: seeded bursts, identical on every seek
  defineGraphic('fireworks', {
    title: 'พลุ · Fireworks',
    place: 'full',
    sound: [['firework', 0], ['firework', 0.35], ['firework', 0.7]],
    themes: false,
    sample: { data: { bursts: 3 } },
    build(kit, data, tl) {
      const random = kit.rng(Number(data.seed ?? 7))
      const bursts = Math.min(5, Math.max(1, Number(data.bursts ?? 3)))
      for (let b = 0; b < bursts; b++) {
        const cx = (0.2 + random() * 0.6) * innerWidth
        const cy = (0.15 + random() * 0.35) * innerHeight
        const at = b * 0.35
        const color = ['var(--accent)', 'var(--accent2)', '#fff4d6'][b % 3]
        const trail = kit.el('i', 'g-fireworks-trail')
        trail.style.left = cx + 'px'
        trail.style.background = color
        tl.fromTo(trail, { top: innerHeight, opacity: 1, scaleY: 1 }, { top: cy, duration: 0.35, ease: 'power2.out' }, at).to(trail, { opacity: 0, duration: 0.1 }, at + 0.35)
        for (let i = 0; i < 34; i++) {
          // streaks point along their flight, so a burst reads as light, not confetti
          const dot = kit.el('i', 'g-fireworks-dot')
          dot.style.left = cx + 'px'
          dot.style.top = cy + 'px'
          dot.style.background = color
          const angle = (i / 34) * Math.PI * 2 + random() * 0.15
          const dist = (16 + random() * 12) * kit.vh
          gsap.set(dot, { rotation: (angle * 180) / Math.PI })
          tl.fromTo(dot, { x: 0, y: 0, opacity: 1, scaleX: 0.2 }, { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist + 5 * kit.vh, opacity: 0, scaleX: 1, duration: 1.2, ease: 'power3.out' }, at + 0.35)
        }
      }
    },
  })

  // live poll: bars race to their share; update in place with new votes
  defineGraphic('poll', {
    title: 'โหวตสด · Live poll',
    place: 'lower',
    sound: [['swoosh', 0], ['pop', 0.2], ['ding', 1.0]],
    sample: { data: { question: 'อยากได้สีไหน', options: [{ label: 'ชมพู', votes: 42 }, { label: 'ส้ม', votes: 31 }, { label: 'แดง', votes: 18 }] } },
    build(kit, data, tl) {
      const panel = kit.el('div', 'g-panel g-poll-box')
      kit.el('strong', 'g-poll-q', data.question ?? 'โหวต', panel)
      const rows = (data.options ?? []).slice(0, 4).map((option) => {
        const row = kit.el('div', 'g-poll-row', null, panel)
        const bar = kit.el('i', 'g-poll-bar', null, row)
        kit.el('span', 'g-poll-label', option.label, row)
        const pct = kit.el('span', 'g-poll-pct', null, row)
        return { bar, pct }
      })
      const shares = (options) => {
        const total = options.reduce((sum, o) => sum + Number(o.votes ?? o.pct ?? 0), 0) || 1
        return options.map((o) => Number(o.votes ?? o.pct ?? 0) / total)
      }
      const initial = shares(data.options ?? [])
      tl.fromTo(panel, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, 0)
      rows.forEach(({ bar, pct }, i) => {
        tl.fromTo(bar, { scaleX: 0 }, { scaleX: initial[i], duration: 0.8, ease: 'power3.out' }, 0.2 + i * 0.06)
        kit.count(pct, 0, Math.round(initial[i] * 100), 0.2 + i * 0.06, 0.8, (n) => n + '%')
      })
      kit.root.__update = (next) => {
        const share = shares(next.options ?? [])
        rows.forEach(({ bar, pct }, i) => {
          gsap.to(bar, { scaleX: share[i] ?? 0, duration: 0.6, ease: 'power3.out' })
          pct.textContent = Math.round((share[i] ?? 0) * 100) + '%'
        })
        return true
      }
      tl.to(panel, { y: 16, opacity: 0, duration: 0.3, ease: 'power2.in' }, 1.1 + (kit.hold ?? 8))
    },
  })

  // bottom ticker + QR to the comment page
  defineGraphic('crawl', {
    title: 'แถบวิ่ง + QR · Ticker with QR',
    place: 'crawl',
    sound: [['swoosh', 0]],
    sample: { data: { items: ['ส่งฟรีทั่วไทย', 'CF ใต้คอมเมนต์ได้เลย', 'ครีมกันแดด A12 เหลือ ฿290', 'ซื้อ 2 แถม 1 ถึง 3 ทุ่ม'], qrLabel: 'สแกนเพื่อคอมเมนต์' } },
    build(kit, data, tl) {
      const bar = kit.el('div', 'g-crawl-box')
      if (kit.image) {
        const qr = kit.el('div', 'g-crawl-qr', null, bar)
        const img = kit.el('img', null, null, qr)
        img.src = kit.image
        img.alt = ''
        kit.el('span', null, data.qrLabel ?? 'สแกน', qr)
      }
      const viewport = kit.el('div', 'g-crawl-viewport', null, bar)
      const strip = kit.el('div', 'g-crawl-strip', null, viewport)
      const items = [].concat(data.items ?? data.text ?? [])
      for (let copy = 0; copy < 2; copy++) for (const item of items) kit.el('span', 'g-crawl-item', item, strip)
      const seconds = Number(data.seconds ?? kit.hold ?? 20)
      tl.fromTo(bar, { yPercent: 100 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0)
      const width = strip.scrollWidth / 2 || innerWidth
      const speed = 12 * kit.vh // px per second
      const lap = width / speed
      tl.fromTo(strip, { x: 0 }, { x: -width, duration: lap, ease: 'none', repeat: Math.ceil(seconds / lap) - 1 }, 0.3)
      tl.to(bar, { yPercent: 100, duration: 0.3, ease: 'power2.in' }, 0.3 + seconds)
    },
  })

  // accent frame around the whole screen, breathing twice
  defineGraphic('edge-glow', {
    title: 'ขอบจอเรืองแสง · Edge glow',
    place: 'edge',
    sound: [['riser', 0], ['shimmer', 0.4]],
    themes: false,
    sample: { data: {} },
    build(kit, data, tl) {
      const frame = kit.el('i', 'g-edge-glow-frame')
      tl.fromTo(frame, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 0)
        .to(frame, { opacity: 0.45, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: 3 }, 0.25)
        .to(frame, { opacity: 0, duration: 0.3 }, Math.max(2.25, 0.25 + hold(kit)))
    },
  })

  // brackets lock onto the zoomed product; without OBS, dims everything else instead
  defineGraphic('zoom-focus', {
    title: 'ซูมสินค้า · Zoom focus',
    place: 'zoom',
    sound: [['whoosh-low', 0], ['click', 0.55]],
    themes: false,
    sample: { data: { name: 'ครีมกันแดด A12', dim: true }, box: { x: 0.4, y: 0.35, w: 0.22, h: 0.4 } },
    build(kit, data, tl) {
      const b = kit.box ?? { x: innerWidth * 0.34, y: innerHeight * 0.25, w: innerWidth * 0.32, h: innerHeight * 0.5 }
      const at = Number(data.delay ?? 0)
      const frame = kit.el('div', 'g-zoom-focus-frame')
      Object.assign(frame.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' })
      if (data.dim) frame.classList.add('is-dim')
      const label = data.name ? kit.el('span', 'g-zoom-focus-label', data.name, frame) : null
      tl.fromTo(frame, { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'power3.out' }, at)
      if (label) tl.fromTo(label, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power3.out' }, at + 0.2)
      tl.to(frame, { opacity: 0, duration: 0.3 }, at + 0.3 + hold(kit))
    },
  })
})()
