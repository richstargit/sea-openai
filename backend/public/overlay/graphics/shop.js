// Shop graphics: live-commerce widgets (countdown, stock, buyers, CF, cart, vouchers, auction, recap).
// All motion sits on the paused timeline `tl` at explicit times (seek-safe). Event data only ever goes
// through textContent (kit.el / kit.text); kit.svg gets static markup written here.
;(() => {
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3.1 1.7-1.9 3.2-3.1 5.3-3.1 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>'
  const BAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>'
  // Material "touch_app" glyph; fingertip sits at (11.5, 6.2) of the 24-unit box
  const HAND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/></svg>'
  const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5z"/></svg>'
  const GAVEL = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="0" y="52" width="36" height="7" rx="2" fill="currentColor" opacity=".45"/><g class="ab-hammer" fill="currentColor"><rect x="22" y="29" width="38" height="6" rx="3"/><rect x="8" y="16" width="18" height="32" rx="3"/><rect x="5" y="20" width="24" height="5" rx="2"/><rect x="5" y="39" width="24" height="5" rx="2"/></g></svg>'

  const hold = (kit, fallback = 2) => kit.hold ?? fallback
  const out = (kit, tl, at, vars) => tl.to(kit.root, { autoAlpha: 0, duration: 0.35, ease: 'power2.in', ...vars }, at)
  // the toast stack sits on the side away from the face; slide in from that edge
  const edge = (kit) => (kit.away === 'right' ? 1 : -1)
  // privacy: chat names show only their first and last grapheme (สมฤดี → ส***ดี) unless maskName === false
  function mask(kit, data, name) {
    const raw = String(name ?? '').replace(/^คุณ\s*/, '').trim()
    if (data.maskName === false) return raw
    const g = kit.graphemes(raw)
    if (!g.length) return '***'
    const lead = /^[เแโใไ@]/.test(g[0]) && g.length > 2 ? 2 : 1
    return g.slice(0, lead).join('') + '***' + (g.length - lead > 1 ? g.at(-1) : '')
  }
  // tween target whose setter renders: GSAP assigns it on every render, seeks included (onUpdate is suppressed on seek)
  const live = (v, render) => ({ get v() { return v }, set v(n) { render((v = n)) } })
  const countUp = (tl, node, to, at, duration, format) =>
    tl.fromTo(live(0, (n) => (node.textContent = format(Math.round(n)))), { v: 0 }, { v: to, duration, ease: 'power2.out' }, at) && at + duration
  const clamp01 = (n) => Math.min(1, Math.max(0, n || 0))
  const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')

  // 1 ─ flash sale countdown: mm:ss inside a sweeping ring, stock bar under it
  const flash = { label: 'แฟลชเซล', seconds: 15, stockLeft: 18, stockTotal: 50 }
  defineGraphic('flash-countdown', {
    title: 'นับถอยหลังแฟลชเซล · Flash countdown',
    place: 'corner',
    defaults: flash,
    sample: { data: flash },
    presets: {
      '5min': { title: 'แฟลชเซล 5 นาที · Flash sale 5 min', data: { seconds: 300 } },
      '1min': { title: 'แฟลชเซล 1 นาที · Flash sale 1 min', data: { seconds: 60 } },
    },
    build(kit, data, tl) {
      const { el, root, vh } = kit
      root.classList.add('g-panel')
      root.dataset.urgent = '0'
      const label = el('div', 'fc-label')
      const dial = el('div', 'fc-dial')
      const sweep = kit.svg('<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" class="fc-track"/><circle cx="50" cy="50" r="44" class="fc-sweep" pathLength="100" transform="rotate(-90 50 50)"/></svg>', dial).lastElementChild
      const time = el('div', 'fc-time', null, dial)
      const stock = el('div', 'fc-stock')
      const fill = el('i', null, null, el('div', 'fc-bar', null, stock))
      const left = el('div', 'fc-left', null, stock)
      const ratio = () => clamp01(data.stockLeft / Math.max(1, data.stockTotal))
      const stockText = () => {
        stock.hidden = data.stockTotal == null
        left.textContent = data.stockLeft > 0 ? `เหลือ ${kit.num(data.stockLeft)}/${kit.num(data.stockTotal)} ชิ้น` : 'หมดแล้ว'
      }
      const total = Math.max(1, Math.round(data.seconds) || 1)
      // the displayed second is derived from timeline time, so any seek shows the right value
      let now = total
      const render = (left = now) => {
        now = left
        const s = Math.max(0, Math.ceil(left))
        time.textContent = mmss(s)
        label.textContent = s > 0 ? data.label : 'หมดเวลา'
        sweep.style.strokeDashoffset = 100 - (left / total) * 100
      }
      render()
      stockText()
      const t0 = 0.35
      tl.from(root, { x: 6 * vh, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }, 0)
      tl.fromTo(fill, { scaleX: 0 }, { scaleX: ratio(), duration: 0.6, ease: 'power2.out' }, 0.2)
      tl.fromTo(live(total, render), { v: total }, { v: 0, duration: total, ease: 'none' }, t0)
      tl.set(root, { attr: { 'data-urgent': '1' } }, t0 + Math.max(0, total - 10))
      // last 10 s: one pulse as each second lands
      for (let k = Math.min(10, total); k >= 1; k--)
        tl.fromTo(time, { scale: 1.16 }, { scale: 1, duration: 0.45, ease: 'power2.out', immediateRender: false }, t0 + total - k)
      if (!data.persist) out(kit, tl, t0 + total + 1.2, { x: 6 * vh })
      root.__update = (next) => {
        Object.assign(data, next)
        render()
        stockText()
        gsap.to(fill, { scaleX: ratio(), duration: 0.6, ease: 'power2.out' })
        return true
      }
    },
  })

  // 2 ─ stock bar: drains to what is left; amber at 20 %, red at 5 %
  const stockData = { name: 'เซรั่มวิตซีเข้มข้น 30 มล.', left: 8, total: 50 }
  defineGraphic('stock-bar', {
    title: 'แถบสต็อก · Stock bar',
    place: 'corner',
    defaults: stockData,
    sample: { data: stockData },
    presets: {
      low: { title: 'สต็อกใกล้หมด · Stock almost out', data: { left: 2, total: 50 } },
      pinned: { title: 'แถบสต็อกค้างจอ · Pinned stock bar', data: { left: 24, persist: true } },
    },
    build(kit, data, tl) {
      const { el, root, vh } = kit
      root.classList.add('g-panel')
      const name = el('div', 'g-sub sb-name', data.name)
      const count = el('div', 'sb-count')
      const fill = el('i', null, null, el('div', 'sb-bar'))
      let total = Math.max(1, data.total || 1)
      const render = (n) => {
        const v = Math.max(0, Math.round(n))
        const r = clamp01(v / total)
        fill.style.transform = `scaleX(${r})`
        root.dataset.level = r <= 0.05 ? 'out' : r <= 0.2 ? 'low' : 'ok'
        count.replaceChildren()
        if (!v) return void (count.textContent = 'หมดแล้ว')
        count.append('เหลือ ')
        el('b', null, kit.num(v), count)
        count.append(' ชิ้น')
      }
      const state = live(total, render)
      render(total)
      tl.from(root, { x: 6 * vh, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }, 0)
      tl.fromTo(state, { v: total }, { v: Math.max(0, data.left), duration: 1.2, ease: 'power2.inOut' }, 0.3)
      if (!data.persist) out(kit, tl, 1.5 + hold(kit), { x: 6 * vh })
      root.__update = (next) => {
        Object.assign(data, next)
        total = Math.max(1, data.total || 1)
        kit.text(name, data.name)
        gsap.to(state, { v: Math.max(0, data.left), duration: 0.6, ease: 'power2.out' })
        return true
      }
    },
  })

  // 3 ─ buyer toast: 'คุณ ส***ดี สั่ง 2 ชิ้น' with a small heart
  const buyer = { name: 'สมฤดี', qty: 2, product: 'เซรั่มวิตซีเข้มข้น 30 มล.' }
  defineGraphic('buyer-toast', {
    title: 'แจ้งคนสั่งซื้อ · Buyer toast',
    place: 'toast',
    defaults: buyer,
    sample: { data: buyer },
    build(kit, data, tl) {
      const { el, root, vh } = kit
      root.classList.add('g-panel')
      const badge = el('div', 'bt-badge')
      kit.svg(HEART, badge)
      const float = el('div', 'bt-float')
      kit.svg(HEART, float)
      const body = el('div', 'bt-body')
      const line = el('div', 'bt-line', null, body)
      el('b', null, 'คุณ ' + mask(kit, data, data.name), line)
      line.append(` สั่ง ${kit.num(Math.max(1, Math.round(data.qty) || 1))} ชิ้น`)
      if (data.product) el('div', 'g-sub bt-product', data.product, body)
      const dir = edge(kit)
      tl.from(root, { x: dir * 30 * vh, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }, 0)
      tl.from(badge, { scale: 0, duration: 0.35, ease: 'back.out(2.5)' }, 0.2)
      tl.fromTo(float, { y: 0, scale: 0.6, autoAlpha: 1 }, { y: -6 * vh, scale: 1, autoAlpha: 0, duration: 0.9, ease: 'power1.out' }, 0.45)
      out(kit, tl, 0.35 + hold(kit), { x: dir * 10 * vh })
    },
  })

  // 4 ─ CF keycaps: C F A 1 2 press down one by one, then the instruction
  defineGraphic('cf-keycaps', {
    title: 'ปุ่มพิมพ์ CF · CF keycaps',
    place: 'lower',
    defaults: { code: 'A12' },
    sample: { data: { code: 'A12' } },
    build(kit, data, tl) {
      const { el, vh } = kit
      const code = String(data.code ?? '').toUpperCase().replace(/\s+/g, '')
      const row = el('div', 'kc-row')
      const keys = ['C', 'F', ...kit.graphemes(code).slice(0, 6)].map((ch, i) => {
        const key = el('span', i === 2 ? 'kc-key kc-split' : 'kc-key', null, row)
        key.dataset.on = '0'
        el('span', 'kc-top', ch, key)
        return key
      })
      const caption = el('div', 'g-panel kc-caption')
      caption.append('พิมพ์ ')
      el('b', null, ('CF ' + code).trim(), caption)
      caption.append(' ใต้คอมเมนต์')
      tl.from(keys, { y: 4 * vh, autoAlpha: 0, duration: 0.3, ease: 'back.out(1.6)', stagger: 0.03 }, 0)
      keys.forEach((key, i) => {
        const at = 0.5 + i * 0.2
        tl.to(key.firstChild, { y: 0.8 * vh, duration: 0.08, ease: 'power2.in' }, at)
        tl.set(key, { attr: { 'data-on': '1' } }, at + 0.08)
        tl.to(key.firstChild, { y: 0.3 * vh, duration: 0.18, ease: 'power2.out' }, at + 0.08)
      })
      const captionAt = 0.5 + keys.length * 0.2
      tl.from(caption, { y: 2 * vh, autoAlpha: 0, duration: 0.3, ease: 'power3.out' }, captionAt)
      out(kit, tl, captionAt + 0.3 + hold(kit), { y: 2 * vh })
    },
  })

  // 5 ─ cart press: arrow + tapping hand on the platform's cart button (event x/y overrides the spot)
  // shortcut: cart spots are typical landscape-stream positions; send x/y when the layout differs
  const carts = { tiktok: { x: 0.06, y: 0.9 }, shopee: { x: 0.07, y: 0.86 }, facebook: { x: 0.94, y: 0.9 } }
  defineGraphic('cart-press', {
    title: 'ชี้ปุ่มตะกร้า · Cart press',
    place: 'full',
    defaults: { platform: 'tiktok', label: 'กดตะกร้าเลย' },
    sample: { data: { platform: 'tiktok', label: 'กดตะกร้าเลย' } },
    presets: {
      tiktok: { title: 'ชี้ตะกร้า TikTok · Cart TikTok', data: { platform: 'tiktok' } },
      shopee: { title: 'ชี้ตะกร้า Shopee · Cart Shopee', data: { platform: 'shopee' } },
      facebook: { title: 'ชี้ตะกร้า Facebook · Cart Facebook', data: { platform: 'facebook' } },
    },
    build(kit, data, tl) {
      const { el, vh } = kit
      const spot = carts[data.platform] ?? carts.tiktok
      const p = kit.point ?? { x: spot.x * innerWidth, y: spot.y * innerHeight }
      const inward = p.x < innerWidth / 2 ? 1 : -1
      const svg = kit.svg('<svg class="cp-svg" aria-hidden="true"><path class="cp-arrow" pathLength="100"/><path class="cp-head"/></svg>')
      svg.setAttribute('viewBox', `0 0 ${innerWidth} ${innerHeight}`)
      const ring = el('div', 'cp-ring')
      const ripples = [el('div', 'cp-ripple'), el('div', 'cp-ripple')]
      const label = el('div', 'g-panel cp-label')
      kit.svg(BAG, label)
      el('span', null, data.label, label)
      const hand = el('div', 'cp-hand')
      kit.svg(HAND, hand)
      // layout (static): label up and inward from the cart, arrow curving down onto it
      for (const node of [ring, ...ripples]) Object.assign(node.style, { left: p.x + 'px', top: p.y + 'px' })
      const lw = label.offsetWidth
      const lh = label.offsetHeight
      const lx = inward > 0 ? p.x + 7 * vh : p.x - 7 * vh - lw
      const ly = p.y - 26 * vh
      Object.assign(label.style, { left: lx + 'px', top: ly + 'px' })
      const a = { x: inward > 0 ? lx - 1 * vh : lx + lw + 1 * vh, y: ly + lh / 2 }
      const b = { x: p.x, y: p.y - 6 * vh }
      const c = { x: b.x, y: a.y }
      svg.querySelector('.cp-arrow').setAttribute('d', `M${a.x} ${a.y}Q${c.x} ${c.y} ${b.x} ${b.y}`)
      const head = 2.2 * vh
      svg.querySelector('.cp-head').setAttribute('d', `M${b.x - head * 0.7} ${b.y - head}L${b.x} ${b.y}L${b.x + head * 0.7} ${b.y - head}`)
      const size = 12 * vh
      Object.assign(hand.style, { width: size + 'px', height: size + 'px', left: p.x - (11.5 / 24) * size + 'px', top: p.y - (6.2 / 24) * size + 'px' })
      gsap.set(hand, { transformOrigin: `${(11.5 / 24) * 100}% ${(6.2 / 24) * 100}%` })

      tl.from(label, { y: 2 * vh, autoAlpha: 0, duration: 0.3, ease: 'power3.out' }, 0)
      tl.from(ring, { scale: 0, autoAlpha: 0, duration: 0.3, ease: 'back.out(2)' }, 0.15)
      tl.fromTo(svg.querySelector('.cp-arrow'), { strokeDashoffset: 100 }, { strokeDashoffset: 0, duration: 0.4, ease: 'power2.inOut' }, 0.2)
      tl.from(svg.querySelector('.cp-head'), { autoAlpha: 0, duration: 0.12 }, 0.55)
      tl.from(hand, { x: inward * 4 * vh, y: 9 * vh, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }, 0.3)
      ;[0.85, 1.35].forEach((at, i) => {
        tl.to(hand, { scale: 0.86, y: 0.8 * vh, duration: 0.1, ease: 'power2.in' }, at)
        tl.to(hand, { scale: 1, y: 0, duration: 0.2, ease: 'power2.out' }, at + 0.1)
        tl.fromTo(ripples[i], { scale: 0.6, autoAlpha: 1 }, { scale: 2.4, autoAlpha: 0, duration: 0.6, ease: 'power2.out', immediateRender: false }, at + 0.08)
        tl.fromTo(ring, { scale: 0.9 }, { scale: 1, duration: 0.25, ease: 'back.out(3)', immediateRender: false }, at + 0.08)
      })
      out(kit, tl, Math.max(1.95, 0.3 + hold(kit)))
    },
  })

  // 6 ─ voucher rain: tickets fall on seeded paths, one lands centre and flips open to the code
  const voucher = { code: 'LIVE100', value: 'ลด ฿100', note: 'เก็บโค้ดแล้วใช้ตอนชำระเงิน', seed: 7 }
  defineGraphic('voucher-rain', {
    title: 'ฝนคูปอง · Voucher rain',
    place: 'full',
    defaults: voucher,
    sample: { data: voucher },
    presets: { freeship: { title: 'ฝนคูปองส่งฟรี · Free-shipping rain', data: { code: 'FREESHIP', value: 'ส่งฟรี', note: 'ขั้นต่ำ ฿199 ใช้ได้ถึงเที่ยงคืน' } } },
    build(kit, data, tl) {
      const { el, vh, vw } = kit
      const rand = kit.rng(data.seed ?? 7)
      const value = typeof data.value === 'number' ? 'ลด ' + kit.money(data.value) : String(data.value ?? '')
      for (let i = 0; i < 9; i++) {
        const ticket = el('div', 'vr-ticket')
        el('span', null, value, ticket)
        const at = rand() * 1.1
        const spin = rand() * 70 - 35
        gsap.set(ticket, { x: (3 + rand() * 86) * vw, scale: 0.7 + rand() * 0.5 })
        tl.fromTo(ticket, { y: -20 * vh, rotation: spin }, { y: 115 * vh, rotation: spin + rand() * 240 - 120, duration: 1.5 + rand() * 0.7, ease: 'power1.in' }, at)
      }
      const hero = el('div', 'vr-hero')
      const front = el('div', 'vr-face vr-front', null, hero)
      el('span', null, 'คูปอง', front)
      const back = el('div', 'vr-face vr-back', null, hero)
      el('div', 'vr-value', value, back)
      const info = el('div', 'vr-info', null, back)
      el('div', 'g-sub', 'โค้ดส่วนลด', info)
      el('div', 'vr-code', data.code, info)
      if (data.note) el('div', 'g-sub vr-note', data.note, info)
      gsap.set(hero, { xPercent: -50, yPercent: -50, transformPerspective: 900 })
      tl.fromTo(hero, { y: -75 * vh, scale: 0.32, rotation: -14 }, { y: 0, rotation: 5, duration: 0.85, ease: 'power2.in' }, 0.35)
      tl.to(hero, { rotation: 0, duration: 0.3, ease: 'back.out(3)' }, 1.2)
      tl.to(hero, { scale: 1, duration: 0.45, ease: 'back.out(1.4)' }, 1.3)
      tl.to(hero, { rotationY: 90, duration: 0.15, ease: 'power2.in' }, 1.35)
      tl.set(front, { autoAlpha: 0 }, 1.5)
      tl.set(back, { autoAlpha: 1 }, 1.5)
      tl.to(hero, { rotationY: 0, duration: 0.25, ease: 'power2.out' }, 1.5)
      out(kit, tl, 1.75 + hold(kit, 2.2), { duration: 0.4 })
    },
  })

  // 7 ─ auction: the bid flips up with the (masked) bidder, the gavel closes it at the end
  const auction = { bid: 1250, prev: 1200, bidder: '@somza99' }
  defineGraphic('auction-bid', {
    title: 'ประมูลสด · Auction bid',
    place: 'lower',
    defaults: auction,
    sample: { data: auction },
    build(kit, data, tl) {
      const { el, root, vh } = kit
      root.classList.add('g-panel')
      const bid = Math.max(0, Number(data.bid) || 0)
      const prev = data.prev ?? Math.max(0, bid - 50)
      const info = el('div', 'ab-info')
      el('div', 'g-sub', 'ประมูลสด · ราคาล่าสุด', info)
      const flip = el('div', 'ab-flip', null, info)
      const was = el('div', 'ab-bid', kit.money(prev), flip)
      const now = el('div', 'ab-bid', kit.money(bid), flip)
      const by = el('div', 'ab-by', null, info)
      el('span', 'ab-up', '+' + kit.money(Math.max(0, bid - prev)), by)
      by.append(' โดย ')
      el('b', null, mask(kit, data, data.bidder), by)
      const gavel = kit.svg(GAVEL, el('div', 'ab-gavel'))
      const hammer = gavel.querySelector('.ab-hammer')
      const stamp = el('div', 'ab-stamp', 'ปิดประมูล')
      gsap.set(hammer, { svgOrigin: '58 32', rotation: 28 })
      gsap.set(stamp, { rotation: -8 })
      tl.from(root, { y: 4 * vh, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }, 0)
      tl.fromTo(was, { yPercent: 0 }, { yPercent: -100, duration: 0.3, ease: 'power2.in' }, 0.6)
      tl.fromTo(now, { yPercent: 100 }, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, 0.7)
      tl.from(by, { autoAlpha: 0, y: 1 * vh, duration: 0.3, ease: 'power3.out' }, 0.85)
      const hit = 1.1 + hold(kit)
      tl.to(hammer, { rotation: 42, duration: 0.3, ease: 'power2.out' }, hit - 0.52)
      tl.to(hammer, { rotation: -4, duration: 0.22, ease: 'power4.in' }, hit - 0.22)
      tl.to(hammer, { rotation: 8, duration: 0.3, ease: 'power2.out' }, hit)
      tl.fromTo(stamp, { scale: 1.8, autoAlpha: 0 }, { scale: 1, autoAlpha: 1, duration: 0.18, ease: 'power3.in', immediateRender: false }, hit)
      tl.fromTo(root, { x: -0.8 * vh }, { x: 0, duration: 0.35, ease: 'elastic.out(1, 0.3)', immediateRender: false }, hit)
      kit.tick(hit, 330)
      out(kit, tl, hit + 1.3, { y: 4 * vh })
    },
  })

  // 8 ─ milestone: counter reaches the count, then seeded confetti bursts from behind it
  const milestone = { count: 10000, label: 'ยอดไลก์ทะลุ', seed: 3 }
  defineGraphic('milestone-burst', {
    title: 'ฉลองยอดทะลุเป้า · Milestone burst',
    place: 'center',
    defaults: milestone,
    sample: { data: milestone },
    build(kit, data, tl) {
      const { el, vh } = kit
      const rand = kit.rng(data.seed ?? 3)
      const bits = Array.from({ length: 40 }, (_, i) => el('i', 'mb-bit mb-' + (i % 3)))
      const card = el('div', 'g-panel mb-card')
      el('div', 'g-sub mb-label', data.label, card)
      const num = el('div', 'mb-num', null, card)
      tl.from(card, { scale: 0.7, autoAlpha: 0, duration: 0.35, ease: 'back.out(1.7)' }, 0)
      const hit = countUp(tl, num, Math.max(0, Math.round(data.count) || 0), 0.3, 1.1, kit.num)
      tl.fromTo(card, { scale: 1.08 }, { scale: 1, duration: 0.4, ease: 'power2.out', immediateRender: false }, hit)
      kit.tick(hit, 1560)
      for (const bit of bits) {
        const angle = rand() * Math.PI * 2
        const reach = (16 + rand() * 24) * vh
        const lift = Math.sin(angle) * reach
        tl.set(bit, { autoAlpha: 1 }, hit)
        tl.fromTo(bit, { x: 0, scale: 0, rotation: 0 }, { x: Math.cos(angle) * reach * 1.5, scale: 0.6 + rand() * 0.7, rotation: rand() * 900 - 450, duration: 1.5, ease: 'power3.out', immediateRender: false }, hit)
        tl.fromTo(bit, { y: 0 }, { y: lift, duration: 0.55, ease: 'power3.out', immediateRender: false }, hit)
        tl.to(bit, { y: lift + (14 + rand() * 12) * vh, duration: 1, ease: 'power1.in' }, hit + 0.55)
        tl.to(bit, { autoAlpha: 0, duration: 0.4 }, hit + 1 + rand() * 0.5)
      }
      out(kit, tl, hit + Math.max(1.9, hold(kit)), { scale: 0.92 })
    },
  })

  // 9 ─ up-next rail: next products with the current one highlighted; persist + updateGraphic to advance
  const rail = {
    current: 0,
    items: [
      { name: 'เซรั่มวิตซีเข้มข้น 30 มล.', price: 299 },
      { name: 'กันแดดเนื้อน้ำนม SPF50+', price: 259 },
      { name: 'โทนเนอร์ใบบัวบก 200 มล.', price: 189 },
      { name: 'มาสก์หน้าข้าวหอมมะลิ 10 แผ่น', price: 159 },
    ],
  }
  defineGraphic('up-next-rail', {
    title: 'สินค้าถัดไป · Up next rail',
    place: 'corner',
    defaults: rail,
    sample: { data: rail },
    presets: { pinned: { title: 'สินค้าถัดไปค้างจอ · Pinned up next', data: { persist: true } } },
    build(kit, data, tl) {
      const { el, root, vh } = kit
      root.classList.add('g-panel')
      el('div', 'g-sub un-head', 'รายการถัดไป')
      const list = el('div', 'un-list')
      const hi = el('div', 'un-hi', null, list)
      let rows = []
      const fill = () => {
        rows.forEach((row) => row.remove())
        rows = (Array.isArray(data.items) ? data.items : []).slice(0, 4).map((item) => {
          const row = el('div', 'un-row', null, list)
          row.dataset.on = '0'
          el('span', 'un-name', item?.name, row)
          el('span', 'un-price', item?.price == null ? '' : kit.money(item.price), row)
          return row
        })
      }
      const current = () => rows[Math.min(Math.max(0, Math.round(data.current) || 0), rows.length - 1)]
      const spot = () => (current() ? { y: current().offsetTop, height: current().offsetHeight } : { height: 0 })
      fill()
      gsap.set(hi, spot())
      tl.from(root, { x: 8 * vh, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }, 0)
      tl.from(rows, { x: 3 * vh, autoAlpha: 0, duration: 0.3, ease: 'power3.out', stagger: 0.06 }, 0.15)
      tl.from(hi, { scaleX: 0, transformOrigin: 'left center', duration: 0.35, ease: 'power3.out' }, 0.45)
      if (current()) tl.set(current(), { attr: { 'data-on': '1' } }, 0.55)
      if (!data.persist) out(kit, tl, 0.8 + hold(kit), { x: 8 * vh })
      root.__update = (next) => {
        Object.assign(data, next)
        if (next.items) fill()
        rows.forEach((row) => (row.dataset.on = row === current() ? '1' : '0'))
        gsap.to(hi, { ...spot(), duration: 0.45, ease: 'power3.inOut' })
        return true
      }
    },
  })

  // 10 ─ recap strap cycling price → CF code → shipping → gift
  const recap = { title: 'สรุปดีล', price: 299, code: 'A12', shipping: 'ส่งฟรีทั่วไทย', gift: 'แถมสบู่ใบบัวบก 1 ก้อน' }
  defineGraphic('recap-cycle', {
    title: 'สรุปดีลวนรอบ · Recap cycle',
    place: 'lower',
    defaults: recap,
    sample: { data: recap },
    build(kit, data, tl) {
      const { el, root, vh } = kit
      root.classList.add('g-panel')
      el('div', 'rc-tag', data.title)
      const win = el('div', 'rc-win')
      const faces = [
        data.price != null && ['ราคา', typeof data.price === 'number' ? kit.money(data.price) : data.price],
        data.code && ['สั่งซื้อ', 'พิมพ์ CF ' + data.code],
        data.shipping && ['จัดส่ง', data.shipping],
        data.gift && ['ของแถม', data.gift],
      ]
        .filter(Boolean)
        .map(([label, value]) => {
          const face = el('div', 'rc-face', null, win)
          el('span', null, label, face)
          el('b', null, value, face)
          return face
        })
      const per = Math.max(1.6, hold(kit, 0) / Math.max(1, faces.length))
      tl.from(root, { y: 3 * vh, autoAlpha: 0, duration: 0.35, ease: 'power3.out' }, 0)
      faces.forEach((face, i) => {
        const at = 0.25 + i * per
        if (i) tl.fromTo(face, { yPercent: 100, autoAlpha: 0 }, { yPercent: 0, autoAlpha: 1, duration: 0.35, ease: 'power3.out', immediateRender: false }, at)
        if (i < faces.length - 1) tl.to(face, { yPercent: -100, autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, at + per - 0.3)
      })
      out(kit, tl, 0.25 + Math.max(1, faces.length) * per, { y: 3 * vh })
    },
  })

  // 11 ─ viewer join toast
  const viewer = { name: 'ส้มโอ', others: 12 }
  defineGraphic('viewer-join', {
    title: 'คนดูเพิ่งเข้ามา · Viewer join',
    place: 'toast',
    defaults: viewer,
    sample: { data: viewer },
    build(kit, data, tl) {
      const { el, root, vh } = kit
      root.classList.add('g-panel')
      const icon = el('div', 'vj-icon')
      kit.svg(PERSON, icon)
      const line = el('div', 'vj-line')
      el('b', null, 'คุณ ' + mask(kit, data, data.name), line)
      const others = Math.max(0, Math.round(data.others) || 0)
      line.append(others ? ` และอีก ${kit.num(others)} คน เพิ่งเข้ามา` : ' เพิ่งเข้ามา')
      const dir = edge(kit)
      tl.from(root, { x: dir * 20 * vh, autoAlpha: 0, duration: 0.3, ease: 'power3.out' }, 0)
      tl.from(icon, { scale: 0, duration: 0.3, ease: 'back.out(2)' }, 0.15)
      out(kit, tl, 0.3 + hold(kit, 1.8), { x: dir * 8 * vh })
    },
  })

  // 12 ─ heart burst: seeded hearts float up from a bottom corner with the like count
  defineGraphic('heart-burst', {
    title: 'หัวใจลอย · Heart burst',
    place: 'full',
    defaults: { count: 128, side: 'right', seed: 5 },
    sample: { data: { count: 128 } },
    build(kit, data, tl) {
      const { el, vh, vw } = kit
      const rand = kit.rng(data.seed ?? 5)
      const count = Math.max(0, Math.round(data.count) || 0)
      const ox = data.side === 'left' ? 9 * vw : innerWidth - 9 * vw
      const oy = innerHeight - 14 * vh
      const n = Math.min(30, Math.max(16, Math.round(count / 8)))
      const spread = Math.max(1.2, hold(kit, 0) - 1.4)
      for (let i = 0; i < n; i++) {
        const heart = el('div', 'hb-heart hb-' + (i % 3))
        kit.svg(HEART, heart)
        Object.assign(heart.style, { left: ox + (rand() * 2 - 1) * 1.5 * vh + 'px', top: oy - 4 * vh + 'px' })
        const at = 0.2 + rand() * spread
        const dur = 1.6 + rand() * 0.7
        tl.set(heart, { autoAlpha: 1 }, at)
        tl.fromTo(heart, { scale: 0 }, { scale: 0.7 + rand() * 0.6, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, at)
        tl.fromTo(heart, { y: 0 }, { y: -(30 + rand() * 30) * vh, duration: dur, ease: 'power1.out', immediateRender: false }, at)
        tl.fromTo(heart, { x: 0 }, { x: (rand() * 2 - 1) * 5 * vh, duration: dur / 2, ease: 'sine.inOut', immediateRender: false }, at)
        tl.to(heart, { x: (rand() * 2 - 1) * 7 * vh, duration: dur / 2, ease: 'sine.inOut' }, at + dur / 2)
        tl.to(heart, { autoAlpha: 0, duration: dur * 0.4 }, at + dur * 0.6)
      }
      const pill = el('div', 'g-panel hb-count')
      kit.svg(HEART, pill)
      const num = el('span', null, null, pill)
      Object.assign(pill.style, { left: ox + 'px', top: oy + 'px' })
      gsap.set(pill, { xPercent: -50, yPercent: -50 })
      tl.from(pill, { scale: 0.6, autoAlpha: 0, duration: 0.3, ease: 'back.out(2)' }, 0)
      countUp(tl, num, count, 0.2, 1, (v) => '+' + kit.num(v))
      out(kit, tl, 0.2 + spread + 1.9, { duration: 0.4 })
    },
  })
})()
