// Deals graphics: live price drops, coupons, stamps and reveals for Thai live commerce.
// Every motion sits on the paused timeline `tl` at an explicit time, so any seek renders correctly.
;(() => {
  let uid = 0 // unique ids for inline SVG defs when two graphics are on screen together
  const IN = 0.3
  const OUT = 0.4
  // baht from a number or numeric string; other strings pass through ('ฟรี')
  const baht = (kit, v) => (v !== '' && v != null && !isNaN(v) ? kit.money(+v) : String(v ?? ''))
  // exit time: the hold after the entrance, but never before the reveal has had ~0.8s on screen
  const exitAt = (kit, revealEnd) => Math.max(IN + (kit.hold ?? 2), revealEnd + 0.8)
  const enter = (tl, node, kit, at = 0) =>
    tl.fromTo(node, { autoAlpha: 0, y: 3 * kit.vh }, { autoAlpha: 1, y: 0, duration: IN, ease: 'power3.out' }, at)
  const leave = (tl, node, kit, at, vars) =>
    tl.to(node, { autoAlpha: 0, y: 2 * kit.vh, duration: OUT, ease: 'power2.in', ...vars }, at)
  // seek-safe value driver: GSAP writes `v` and the setter redraws (onUpdate is suppressed while seeking)
  const driver = (v, draw) => ({ get v() { return v }, set v(n) { v = n; draw(n) } })
  // rubber-stamp ink: speckled holes + rough edge, deterministic (fixed turbulence seeds)
  const inkFilter = (kit) => {
    const id = 'dl-ink-' + ++uid
    kit.svg(
      `<svg class="dl-defs" width="0" height="0" aria-hidden="true"><filter id="${id}" x="-4%" y="-8%" width="108%" height="116%">` +
        '<feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="7" result="n"/>' +
        '<feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -12 8.6" result="holes"/>' +
        '<feComposite in="SourceGraphic" in2="holes" operator="in" result="inked"/>' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.05" numOctaves="2" seed="3" result="w"/>' +
        '<feDisplacementMap in="inked" in2="w" scale="5" xChannelSelector="R" yChannelSelector="G"/>' +
        '</filter></svg>',
    )
    return `url(#${id})`
  }
  // slam a stamp in: drop from big, thud, tiny shake
  const slam = (kit, tl, node, at) => {
    tl.fromTo(node, { autoAlpha: 0, scale: 2.4 }, { autoAlpha: 1, scale: 1, duration: 0.18, ease: 'power4.in' }, at)
    tl.to(node, { keyframes: { x: [0.5 * kit.vh, -0.4 * kit.vh, 0.25 * kit.vh, -0.1 * kit.vh, 0] }, duration: 0.2, ease: 'none' }, at + 0.18)
    kit.tick(at + 0.18, 260)
    return at + 0.38
  }

  defineGraphic('price-countdown', {
    title: 'ราคาไลฟ์ลดสด · Live price countdown',
    place: 'lower',
    defaults: { label: 'ราคาไลฟ์' },
    sample: { data: { name: 'เซรั่มวิตามินซี 30 ml', from: 1290, to: 590 } },
    presets: {
      flash: { title: 'แฟลชเซล · Flash sale drop', data: { label: 'แฟลชเซล 5 นาที', name: 'น้ำหอม Velvet Oud 50 ml', from: 2490, to: 1290 } },
    },
    build(kit, d, tl) {
      const from = +d.from || 0
      const to = +d.to || 0
      const card = kit.el('div', 'g-panel pc-card')
      const head = kit.el('div', 'pc-head', null, card)
      kit.el('span', 'pc-label', d.label, head)
      if (d.name) kit.el('span', 'g-sub pc-name', d.name, head)
      const row = kit.el('div', 'pc-row', null, card)
      const price = kit.el('span', 'pc-price', kit.money(from), row)
      const was = kit.el('span', 'pc-was', null, row)
      const old = kit.el('span', 'pc-old', 'ปกติ ' + kit.money(from), was)
      const strike = kit.el('span', 'pc-strike', null, old)
      price.style.minWidth = price.getBoundingClientRect().width + 'px' // no width jump while digits drop
      const off = from > to ? kit.el('span', 'pc-off', '-' + Math.round((1 - to / from) * 100) + '%', was) : null

      enter(tl, card, kit)
      const roll = driver(from, (n) => kit.text(price, kit.money(Math.round(n))))
      const land = 0.35 + 1.1
      tl.fromTo(roll, { v: from }, { v: to, duration: 1.1, ease: 'power2.inOut' }, 0.35)
      tl.fromTo(price, { '--k': 0, scale: 1 }, { '--k': 1, scale: 1, duration: 0.01 }, land)
      tl.fromTo(price, { scale: 1.14 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, land)
      kit.tick(land)
      tl.fromTo(was, { autoAlpha: 0, x: -1.5 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.25, ease: 'power2.out' }, land + 0.05)
      tl.fromTo(strike, { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: 'power2.inOut' }, land + 0.2)
      if (off) tl.fromTo(off, { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, land + 0.35)
      leave(tl, card, kit, exitAt(kit, land + 0.65))
    },
  })

  defineGraphic('slot-price', {
    title: 'สล็อตราคา · Slot price reels',
    place: 'lower',
    defaults: { label: 'ราคาพิเศษวันนี้' },
    sample: { data: { price: 1290, name: 'ครีมกันแดด Aqua SPF50+' } },
    build(kit, d, tl) {
      const card = kit.el('div', 'g-panel sp-card')
      const head = kit.el('div', 'sp-head', null, card)
      kit.el('span', 'g-sub', d.label, head)
      if (d.name) kit.el('span', 'sp-name', d.name, head)
      const row = kit.el('div', 'sp-row', null, card)
      const rng = kit.rng(+d.price || 7)
      let reel = 0
      let end = IN
      for (const ch of kit.money(+d.price || 0)) {
        if (!/\d/.test(ch)) {
          kit.el('span', 'sp-static', ch, row)
          continue
        }
        const win = kit.el('span', 'sp-win', null, row)
        const strip = kit.el('span', 'sp-strip', null, win)
        const n = 14 + reel * 5 + Math.floor(rng() * 4)
        const start = (((+ch - (n - 1)) % 10) + 10) % 10
        // first cell blank so no fake price shows before the spin
        for (let k = 0; k < n; k++) kit.el('span', null, k ? String((start + k) % 10) : '', strip)
        const duration = 0.75 + reel * 0.22
        tl.fromTo(strip, { yPercent: 0 }, { yPercent: (-100 * (n - 1)) / n, duration, ease: 'back.out(0.9)' }, IN)
        kit.tick(IN + duration - 0.08, 900 + reel * 140)
        end = IN + duration
        reel++
      }
      enter(tl, card, kit)
      // all reels stopped: the row inks in with the highlight colour
      tl.fromTo(row, { '--k': 0 }, { '--k': 1, duration: 0.2, ease: 'power1.out' }, end)
      tl.fromTo(row, { scale: 1.06 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, end)
      leave(tl, card, kit, exitAt(kit, end + 0.3))
    },
  })

  defineGraphic('price-ladder', {
    title: 'ยิ่งซื้อยิ่งคุ้ม · Price ladder',
    place: 'lower',
    defaults: { label: 'ยิ่งซื้อยิ่งคุ้ม', unit: 'ชิ้น', best: 'คุ้มสุด' },
    sample: { data: { tiers: [{ qty: 1, price: 299 }, { qty: 2, price: 549 }, { qty: 3, price: 749 }] } },
    presets: {
      snack: { title: 'ขนมแพ็กคุ้ม · Snack ladder', data: { label: 'สาหร่ายอบกรอบ ยิ่งซื้อยิ่งถูก', unit: 'ซอง', tiers: [{ qty: 3, price: 99 }, { qty: 6, price: 179 }, { qty: 12, price: 299 }] } },
    },
    build(kit, d, tl) {
      const tiers = (Array.isArray(d.tiers) ? d.tiers : []).slice(0, 5)
      const each = tiers.map((t) => +t.price / (+t.qty || 1))
      const best = each.indexOf(Math.min(...each))
      const card = kit.el('div', 'g-panel pl-card')
      kit.el('div', 'g-sub pl-label', d.label, card)
      const steps = kit.el('div', 'pl-steps', null, card)
      let t = IN
      tiers.forEach((tier, i) => {
        const col = kit.el('div', 'pl-col' + (i === best ? ' is-best' : ''), null, steps)
        const tag = i === best ? kit.el('span', 'pl-tag', d.best, col) : null
        const bar = kit.el('div', 'pl-bar', null, col)
        bar.style.height = 12 + (i * 8) / Math.max(1, tiers.length - 1) + 'vh'
        const body = kit.el('div', 'pl-body', null, bar)
        kit.el('span', 'pl-qty', tier.qty + ' ' + d.unit, body)
        kit.el('span', 'pl-price', baht(kit, tier.price), body)
        if (+tier.qty > 1) kit.el('span', 'pl-each', d.unit + 'ละ ' + kit.money(Math.round(each[i])), body)
        t = 0.15 + i * 0.16
        tl.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: 'power3.out' }, t)
        tl.fromTo(body, { autoAlpha: 0, y: kit.vh }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power2.out' }, t + 0.18)
        if (tag) {
          tl.fromTo(tag, { autoAlpha: 0, y: kit.vh, scale: 0.6 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, 0.15 + tiers.length * 0.16 + 0.2)
          kit.tick(0.15 + tiers.length * 0.16 + 0.2)
        }
      })
      enter(tl, card, kit)
      leave(tl, card, kit, exitAt(kit, 0.15 + tiers.length * 0.16 + 0.5))
    },
  })

  defineGraphic('bundle-math', {
    title: 'เซ็ตคู่คุ้ม · Bundle math',
    place: 'lower',
    defaults: { label: 'จับคู่ราคาพิเศษ' },
    sample: { data: { items: [{ name: 'เซรั่มวิตซี 30 ml' }, { name: 'ครีมกันแดด SPF50+' }], total: 590, was: 980 } },
    presets: {
      bogo: { title: 'ซื้อ 1 แถม 1 · Buy one get one', data: { label: 'ซื้อ 1 แถม 1', items: [{ name: 'ลิปทินท์ Rosy Glow' }, { name: 'ลิปทินท์ Rosy Glow', free: true }], total: 259, was: 518 } },
      trio: { title: 'เซ็ตสาม · Trio set', data: { label: 'เซ็ตขนมยามบ่าย', items: [{ name: 'ทองม้วนกรอบ' }, { name: 'คุกกี้เนยสด' }, { name: 'ชาไทยผง' }], total: 349, was: 447 } },
    },
    build(kit, d, tl) {
      const items = (Array.isArray(d.items) ? d.items : []).slice(0, 3)
      const card = kit.el('div', 'g-panel bm-card')
      kit.el('div', 'g-sub', d.label, card)
      const row = kit.el('div', 'bm-row', null, card)
      let t = 0.15
      items.forEach((item, i) => {
        if (i) {
          const plus = kit.el('span', 'bm-op', '+', row)
          tl.fromTo(plus, { autoAlpha: 0, scale: 0.3 }, { autoAlpha: 1, scale: 1, duration: 0.2, ease: 'back.out(2)' }, t - 0.08)
        }
        const term = kit.el('div', 'bm-term', null, row)
        kit.el('span', 'bm-name', item?.name, term)
        if (item?.free) kit.el('span', 'bm-free', 'ฟรี', term)
        tl.fromTo(term, { autoAlpha: 0, y: -6 * kit.vh, rotation: i % 2 ? 4 : -4 }, { autoAlpha: 1, y: 0, rotation: 0, duration: 0.3, ease: 'back.out(1.6)' }, t)
        t += 0.3
      })
      const eq = kit.el('span', 'bm-eq', null, row)
      const bars = [kit.el('i', null, null, eq), kit.el('i', null, null, eq)]
      tl.fromTo(bars, { scaleX: 0 }, { scaleX: 1, duration: 0.18, ease: 'power2.out', stagger: 0.06 }, t)
      const total = kit.el('span', 'bm-total', null, row)
      if (d.was) kit.el('span', 'bm-was', kit.money(+d.was), total)
      kit.el('span', 'bm-sum', baht(kit, d.total), total)
      const pop = t + 0.25
      tl.fromTo(total, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2.2)' }, pop)
      kit.tick(pop + 0.05)
      enter(tl, card, kit)
      leave(tl, card, kit, exitAt(kit, pop + 0.35))
    },
  })

  // zigzag edge as a clip-path; side 'right' cuts the right edge, 'left' the left edge (teeth interlock)
  const zigzag = (side, teeth, depth) => {
    const pts = []
    for (let k = 0; k <= teeth * 2; k++) {
      const y = ((k / (teeth * 2)) * 100).toFixed(2) + '%'
      const tip = k % 2 === 1
      pts.push(side === 'right' ? (tip ? '100%' : `calc(100% - ${depth})`) + ' ' + y : (tip ? depth : '0') + ' ' + y)
    }
    return side === 'right' ? `polygon(0 0, ${pts.join(', ')}, 0 100%)` : `polygon(${pts.join(', ')}, 100% 100%, 100% 0)`
  }

  defineGraphic('coupon-tear', {
    title: 'ฉีกคูปอง · Coupon tear',
    place: 'lower',
    defaults: { label: 'คูปองในไลฟ์', stub: 'ฉีกเลย' },
    sample: { data: { discount: 'ลด ฿100', code: 'GLOW100', minSpend: 599, expiry: 'ถึง 23:59 คืนนี้' } },
    presets: {
      'free-ship': { title: 'คูปองส่งฟรี · Free-shipping coupon', data: { discount: 'ส่งฟรี', code: 'FREESHIP', minSpend: 0, expiry: 'ใช้ได้ถึงเที่ยงคืน' } },
      percent: { title: 'คูปองลด % · Percent coupon', data: { discount: 'ลด 15%', code: 'SCENT15', minSpend: 990, expiry: 'จำกัด 50 สิทธิ์แรก' } },
    },
    build(kit, d, tl) {
      const wrap = kit.el('div', 'ct-wrap')
      const body = kit.el('div', 'ct-body', null, wrap)
      const stub = kit.el('div', 'ct-stub', null, wrap)
      body.style.clipPath = zigzag('right', 9, '0.9vh')
      stub.style.clipPath = zigzag('left', 9, '0.9vh')
      kit.el('span', 'g-sub ct-label', d.label, body)
      kit.el('span', 'ct-off', d.discount, body)
      const min = d.minSpend == null || d.minSpend === '' ? '' : +d.minSpend ? 'ขั้นต่ำ ' + baht(kit, d.minSpend) : isNaN(d.minSpend) ? String(d.minSpend) : 'ไม่มีขั้นต่ำ'
      kit.el('span', 'ct-meta', [min, d.expiry].filter(Boolean).join(' · '), body)
      const code = kit.el('span', 'ct-code', null, body)
      kit.el('span', 'ct-code-k', 'โค้ด', code)
      kit.el('span', 'ct-code-v', d.code, code)
      kit.el('span', 'ct-stub-t', d.stub, stub)

      enter(tl, wrap, kit)
      const tear = IN + 0.45
      tl.to(stub, { rotation: -3, duration: 0.08, ease: 'power1.inOut', yoyo: true, repeat: 1, transformOrigin: '0% 0%' }, tear - 0.16)
      tl.to(stub, { x: 1.5 * kit.vh, y: 34 * kit.vh, rotation: 38, duration: 0.8, ease: 'power2.in', transformOrigin: '0% 0%' }, tear)
      tl.to(stub, { autoAlpha: 0, duration: 0.25 }, tear + 0.55)
      tl.fromTo(code, { '--k': 0, scale: 1 }, { '--k': 1, scale: 1.06, duration: 0.15, ease: 'power2.out' }, tear + 0.2)
      tl.to(code, { scale: 1, duration: 0.25, ease: 'back.out(3)' }, tear + 0.35)
      kit.tick(tear + 0.2)
      leave(tl, wrap, kit, exitAt(kit, tear + 0.6))
    },
  })

  defineGraphic('scratch-reveal', {
    title: 'ขูดลุ้นโค้ด · Scratch reveal',
    place: 'lower',
    defaults: { label: 'ขูดลุ้นโค้ดลับ', hint: 'ขูดตรงนี้' },
    sample: { data: { code: 'LIVE88', note: 'ลดเพิ่ม ฿88 ทั้งร้าน' } },
    presets: {
      price: { title: 'ขูดลุ้นราคา · Scratch price', data: { label: 'ขูดดูราคาไลฟ์', price: 399, code: '', note: 'จากปกติ ฿890' } },
    },
    build(kit, d, tl) {
      const id = 'dl-sr-' + ++uid
      const card = kit.el('div', 'g-panel sr-card')
      kit.el('span', 'g-sub', d.label, card)
      const field = kit.el('div', 'sr-field', null, card)
      const value = kit.el('span', 'sr-value' + (d.code ? ' is-code' : ''), d.code || baht(kit, d.price), field)
      const foil = kit.svg(
        `<svg class="sr-foil" viewBox="0 0 102 30" preserveAspectRatio="none" aria-hidden="true">` +
          `<defs><pattern id="${id}-p" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3" height="3" fill="#bcb7ad"/><rect width="1.1" height="3" fill="#cfcac0"/></pattern>` +
          `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="102" height="30"><rect width="102" height="30" fill="#fff"/>` +
          '<path class="sr-stroke" d="M -6 3 L 108 6 L -6 11 L 108 15 L -6 19 L 108 23 L -6 27 L 108 31" fill="none" stroke="#000" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/></mask></defs>' +
          `<rect width="102" height="30" fill="url(#${id}-p)" mask="url(#${id}-m)"/></svg>`,
        field,
      )
      const hint = kit.el('span', 'sr-hint', d.hint, field)
      const note = d.note ? kit.el('span', 'sr-note', d.note, card) : null

      enter(tl, card, kit)
      const s = IN + 0.15
      tl.to(hint, { autoAlpha: 0, duration: 0.15 }, s)
      tl.fromTo(foil.querySelector('.sr-stroke'), { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, duration: 0.95, ease: 'none' }, s)
      tl.to(foil, { autoAlpha: 0, duration: 0.15 }, s + 0.9)
      tl.fromTo(value, { scale: 0.92 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, s + 0.95)
      kit.tick(s + 0.95)
      if (note) tl.fromTo(note, { autoAlpha: 0, y: kit.vh }, { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power2.out' }, s + 1.05)
      leave(tl, card, kit, exitAt(kit, s + 1.2))
    },
  })

  // clip a W×H rectangle to the half-plane x + y <= c (below) or >= c (above)
  const halfPlane = (w, h, c, below) => {
    const f = ([x, y]) => (below ? c - x - y : x + y - c)
    const rect = [[0, 0], [w, 0], [w, h], [0, h]]
    const out = []
    rect.forEach((p, i) => {
      const q = rect[(i + 1) % 4]
      if (f(p) >= 0) out.push(p)
      if (f(p) * f(q) < 0) {
        const t = f(p) / (f(p) - f(q))
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
      }
    })
    return out.length ? `polygon(${out.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})` : 'polygon(0 0,0 0,0 0)'
  }

  defineGraphic('sticker-peel', {
    title: 'แกะสติกเกอร์ราคา · Sticker peel',
    place: 'lower',
    defaults: { label: 'ราคาเปิดตัว', sticker: '?' },
    sample: { data: { price: 790, name: 'น้ำหอม Velvet Oud 50 ml' }, image: '/overlay/perfume.png' },
    build(kit, d, tl) {
      const card = kit.el('div', 'g-panel sk-card')
      kit.el('span', 'g-sub', d.label, card)
      if (d.name) kit.el('span', 'sk-name', d.name, card)
      const spot = kit.el('div', 'sk-spot', null, card)
      const price = kit.el('span', 'sk-price', baht(kit, d.price), spot)
      const front = kit.el('div', 'sk-sticker', null, spot)
      kit.el('span', 'sk-q', d.sticker, front)
      const flapWrap = kit.el('div', 'sk-flapwrap', null, spot)
      const flap = kit.el('div', 'sk-flap', null, flapWrap)
      const { width: w, height: h } = front.getBoundingClientRect()
      flap.style.width = w + 'px'
      flap.style.height = h + 'px'
      const fold = driver(w + h, (c) => {
        front.style.clipPath = halfPlane(w, h, c, true)
        flap.style.clipPath = halfPlane(w, h, c, false)
        // reflect the peeled part across the fold line x + y = c: (x, y) -> (c - y, c - x)
        flap.style.transform = `matrix(0,-1,-1,0,${c},${c})`
      })
      fold.v = w + h
      enter(tl, card, kit)
      const lift = IN + 0.05
      const peel = IN + 0.5
      tl.fromTo(fold, { v: w + h }, { v: w + h - 2.2 * kit.vh, duration: 0.25, ease: 'power2.out' }, lift)
      tl.to(fold, { v: -0.2 * h, duration: 0.65, ease: 'power2.in' }, peel)
      tl.fromTo(flapWrap, { autoAlpha: 1 }, { autoAlpha: 0, duration: 0.2, ease: 'power1.in' }, peel + 0.45)
      tl.fromTo(price, { scale: 0.9 }, { scale: 1, duration: 0.35, ease: 'back.out(3)', immediateRender: false }, peel + 0.5)
      kit.tick(peel + 0.5)
      leave(tl, card, kit, exitAt(kit, peel + 0.85))
    },
  })

  defineGraphic('stamp', {
    title: 'ตรายาง · Rubber stamp',
    place: 'spot',
    defaults: { text: 'ราคาพิเศษ', sub: 'เฉพาะในไลฟ์' },
    sample: { data: { text: 'ราคาพิเศษ', sub: 'เฉพาะในไลฟ์' } },
    presets: {
      'free-ship': { title: 'ส่งฟรี · Free shipping stamp', data: { text: 'ส่งฟรี', sub: 'ทั่วไทย' } },
      genuine: { title: 'ของแท้ 100% · Genuine stamp', data: { text: 'ของแท้ 100%', sub: 'จากแบรนด์โดยตรง' } },
      bestseller: { title: 'ขายดี · Bestseller stamp', data: { text: 'ขายดี', sub: 'อันดับ 1 ของร้าน' } },
      new: { title: 'มาใหม่ · New arrival stamp', data: { text: 'มาใหม่', sub: 'ล็อตแรกของปี' } },
      last: { title: 'ชิ้นสุดท้าย · Last piece stamp', data: { text: 'ชิ้นสุดท้าย', sub: 'หมดแล้วหมดเลย' } },
    },
    build(kit, d, tl) {
      const p = kit.point ?? (kit.box ? { x: kit.box.x + kit.box.w * 0.8, y: kit.box.y + kit.box.h * 0.2 } : { x: (kit.away === 'right' ? 0.76 : 0.24) * innerWidth, y: 0.3 * innerHeight })
      const stamp = kit.el('div', 'st-stamp')
      stamp.style.left = p.x + 'px'
      stamp.style.top = p.y + 'px'
      const ink = kit.el('div', 'st-ink', null, stamp)
      ink.style.filter = inkFilter(kit)
      kit.el('span', 'st-text', d.text, ink)
      if (d.sub) kit.el('span', 'st-sub', d.sub, ink)
      tl.set(stamp, { xPercent: -50, yPercent: -50, rotation: -8 }, 0)
      const end = slam(kit, tl, stamp, 0.05)
      tl.to(stamp, { autoAlpha: 0, scale: 1.05, duration: 0.35, ease: 'power2.in' }, Math.max(end + (kit.hold ?? 2), end + 0.8))
    },
  })

  defineGraphic('gift-unwrap', {
    title: 'แกะของแถม · Gift unwrap',
    place: 'lower',
    defaults: { label: 'ของแถมในไลฟ์' },
    sample: { data: { giftName: 'น้ำหอมขนาดพกพา 10 ml', condition: 'ซื้อครบ ฿500' }, image: '/overlay/perfume.png' },
    presets: {
      snack: { title: 'ของแถมขนม · Snack gift', data: { label: 'แถมฟรีทุกออเดอร์', giftName: 'ทองม้วนกรอบ 1 กล่อง', condition: 'ซื้อครบ ฿300' } },
    },
    build(kit, d, tl) {
      const card = kit.el('div', 'g-panel gu-card')
      const stage = kit.el('div', 'gu-stage', null, card)
      const rise = kit.el('div', 'gu-rise', null, stage)
      const gift = kit.el('div', 'gu-gift', null, rise)
      if (kit.image) {
        const img = kit.el('img', 'gu-img', null, gift)
        img.src = kit.image
        img.alt = ''
      } else
        kit.svg(
          '<svg class="gu-jar" viewBox="0 0 40 56" aria-hidden="true"><rect x="9" y="2" width="22" height="12" rx="2.5" class="gu-jar-cap"/><rect x="4" y="14" width="32" height="40" rx="6" class="gu-jar-body"/><rect x="4" y="26" width="32" height="14" class="gu-jar-band"/></svg>',
          gift,
        )
      const box = kit.el('div', 'gu-box', null, stage)
      kit.el('i', 'gu-strap', null, box)
      const lid = kit.el('div', 'gu-lid', null, stage)
      const lidStrap = kit.el('i', 'gu-strap', null, lid)
      const bow = kit.el('div', 'gu-bow', null, lid)
      const loops = [kit.el('i', 'gu-loop is-l', null, bow), kit.el('i', 'gu-loop is-r', null, bow)]
      const knot = kit.el('i', 'gu-knot', null, bow)
      const copy = kit.el('div', 'gu-copy', null, card)
      kit.el('span', 'g-sub', d.label, copy)
      const name = kit.el('span', 'gu-name', d.giftName, copy)
      const cond = d.condition ? kit.el('span', 'gu-cond', d.condition, copy) : null

      enter(tl, card, kit)
      const u = IN + 0.1
      tl.to(loops[0], { rotation: -70, scale: 0, duration: 0.3, ease: 'power2.in' }, u)
      tl.to(loops[1], { rotation: 70, scale: 0, duration: 0.3, ease: 'power2.in' }, u)
      tl.to(knot, { scale: 0, duration: 0.2, ease: 'power2.in' }, u + 0.15)
      tl.to(lidStrap, { scaleY: 0, duration: 0.2, ease: 'power2.in' }, u + 0.2)
      const pop = u + 0.35
      tl.to(lid, { y: -9 * kit.vh, x: -3 * kit.vh, rotation: -24, duration: 0.4, ease: 'power2.out' }, pop)
      tl.to(lid, { autoAlpha: 0, duration: 0.2 }, pop + 0.25)
      tl.fromTo(gift, { yPercent: 105 }, { yPercent: 0, duration: 0.45, ease: 'back.out(1.5)' }, pop + 0.1)
      kit.tick(pop + 0.35)
      tl.fromTo(name, { autoAlpha: 0, y: 1.5 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.out' }, pop + 0.3)
      if (cond) tl.fromTo(cond, { autoAlpha: 0, y: 1.5 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.out' }, pop + 0.42)
      leave(tl, card, kit, exitAt(kit, pop + 0.75))
    },
  })

  defineGraphic('free-ship-truck', {
    title: 'รถส่งฟรี · Free-shipping truck',
    place: 'lower',
    defaults: { text: 'ส่งฟรีทั่วไทย' },
    sample: { data: { text: 'ส่งฟรีทั่วไทย', sub: 'ทุกออเดอร์ในไลฟ์นี้' } },
    presets: {
      express: { title: 'ส่งด่วน · Express shipping', data: { text: 'สั่งวันนี้ ส่งพรุ่งนี้', sub: 'กรุงเทพฯ และปริมณฑล' } },
    },
    build(kit, d, tl) {
      const dir = kit.away === 'right' ? -1 : 1 // drive in from the near edge
      const rig = kit.el('div', 'ft-rig' + (dir < 0 ? ' is-flip' : ''))
      const banner = kit.el('div', 'ft-banner', null, rig)
      kit.el('span', 'ft-text', d.text, banner)
      if (d.sub) kit.el('span', 'ft-sub', d.sub, banner)
      kit.el('i', 'ft-rope', null, rig)
      const truck = kit.svg(
        '<svg class="ft-truck" viewBox="0 0 124 66" aria-hidden="true">' +
          '<g class="ft-body"><rect x="2" y="4" width="76" height="44" rx="3" class="ft-cargo"/><rect x="8" y="10" width="64" height="32" rx="1.5" class="ft-panel"/>' +
          '<path d="M80 16 H104 Q110 16 113 22 L120 34 Q122 37 122 41 V50 Q122 52 120 52 H80 Z" class="ft-cab"/>' +
          '<path d="M86 21 H102 Q106 21 108 25 L113 34 H86 Z" class="ft-glass"/><rect x="0" y="48" width="124" height="5" rx="2" class="ft-chassis"/></g>' +
          '<g class="ft-wheel"><circle cx="24" cy="54" r="10" class="ft-tyre"/><circle cx="24" cy="54" r="4.5" class="ft-hub"/><rect x="23" y="45" width="2" height="18" class="ft-spoke"/><rect x="15" y="53" width="18" height="2" class="ft-spoke"/></g>' +
          '<g class="ft-wheel"><circle cx="100" cy="54" r="10" class="ft-tyre"/><circle cx="100" cy="54" r="4.5" class="ft-hub"/><rect x="99" y="45" width="2" height="18" class="ft-spoke"/><rect x="91" y="53" width="18" height="2" class="ft-spoke"/></g></svg>',
        rig,
      )
      const wheels = truck.querySelectorAll('.ft-wheel')
      const body = truck.querySelector('.ft-body')
      // wheels turn exactly with travel: degrees = distance / radius
      const radius = (10 / 124) * truck.getBoundingClientRect().width
      const deg = (px) => (px / radius) * (180 / Math.PI)
      const inDist = 70 * kit.vw
      const outDist = 45 * kit.vw
      tl.fromTo(rig, { x: -dir * inDist, autoAlpha: 1 }, { x: 0, duration: 0.4, ease: 'power3.out' }, 0)
      tl.fromTo(wheels, { rotation: 0, transformOrigin: '50% 50%' }, { rotation: deg(inDist), duration: 0.4, ease: 'power3.out' }, 0)
      // parking: body dips on the suspension, banner swings on its rope
      tl.fromTo(body, { y: 0 }, { keyframes: { y: [1.6, -0.8, 0] }, duration: 0.35, ease: 'none' }, 0.36)
      tl.fromTo(banner, { rotation: dir * 6, transformOrigin: dir > 0 ? '100% 0%' : '0% 0%' }, { rotation: 0, duration: 0.6, ease: 'elastic.out(1, 0.45)' }, 0.38)
      const out = exitAt(kit, 1)
      tl.to(rig, { x: dir * outDist, duration: 0.45, ease: 'power2.in' }, out)
      tl.to(wheels, { rotation: deg(inDist + outDist), duration: 0.45, ease: 'power2.in' }, out)
      tl.to(rig, { autoAlpha: 0, duration: 0.2, ease: 'none' }, out + 0.25)
    },
  })

  defineGraphic('sold-out', {
    title: 'สินค้าหมด · Sold out',
    place: 'lower',
    defaults: { stamp: 'หมด', label: 'ขอบคุณที่ช้อปกันถล่มทลาย' },
    sample: { data: { name: 'เซรั่มวิตามินซี 30 ml', price: 590, nextRound: '20:00' }, image: '/overlay/perfume.png' },
    presets: {
      restock: { title: 'หมดแล้ว รอของเข้า · Restock soon', data: { name: 'ทองม้วนกรอบ ไส้งาดำ', price: 129, nextRound: 'พรุ่งนี้ 12:00', label: 'ของเข้าใหม่' } },
    },
    build(kit, d, tl) {
      const wrap = kit.el('div', 'so-wrap')
      const card = kit.el('div', 'g-panel so-card', null, wrap)
      const veil = kit.el('i', 'so-veil', null, card)
      const inner = kit.el('div', 'so-inner', null, card)
      if (kit.image) {
        const img = kit.el('img', 'so-img', null, inner)
        img.src = kit.image
        img.alt = ''
      }
      const copy = kit.el('div', 'so-copy', null, inner)
      kit.el('span', 'g-sub', d.label, copy)
      kit.el('span', 'so-name', d.name, copy)
      if (d.price != null) kit.el('span', 'so-price', baht(kit, d.price), copy)
      const stamp = kit.el('div', 'so-stamp', null, wrap)
      const ink = kit.el('div', 'st-ink', null, stamp)
      ink.style.filter = inkFilter(kit)
      kit.el('span', 'st-text', d.stamp, ink)
      const next = d.nextRound ? kit.el('span', 'so-next', 'รอบหน้า ' + d.nextRound, wrap) : null

      enter(tl, wrap, kit)
      const grey = IN + 0.2
      tl.fromTo(inner, { filter: 'grayscale(0)', opacity: 1 }, { filter: 'grayscale(1)', opacity: 0.55, duration: 0.4, ease: 'power1.inOut' }, grey)
      tl.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.inOut' }, grey)
      tl.set(stamp, { rotation: -12 }, 0)
      const end = slam(kit, tl, stamp, grey + 0.3)
      if (next) {
        tl.fromTo(next, { autoAlpha: 0, y: -1.5 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'back.out(2)' }, end + 0.05)
        kit.tick(end + 0.1, 1100)
      }
      leave(tl, wrap, kit, exitAt(kit, end + 0.4))
    },
  })
})()
