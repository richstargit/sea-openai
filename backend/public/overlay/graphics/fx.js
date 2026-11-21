// FX motion library: transitions (cover the frame at their midpoint, empty at the end), text effects,
// emphasis marks that follow kit.box / kit.point, and whole-frame effects. Everything sits on the paused
// timeline at explicit times; layouts come from kit.rng so every seek draws the same frame.
;(() => {
  const NS = 'http://www.w3.org/2000/svg'
  const hold = (kit) => kit.hold ?? 2
  const r1 = (n) => Math.round(n * 10) / 10
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  let uid = 0

  function S(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    parent.append(node)
    return node
  }
  // full-frame svg in px (or a 0–100 box stretched over the frame)
  function canvas(kit, stretch) {
    const W = innerWidth
    const H = innerHeight
    const node = S('svg', stretch ? { viewBox: '0 0 100 100', preserveAspectRatio: 'none' } : { viewBox: `0 0 ${W} ${H}` }, kit.root)
    node.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible'
    return node
  }
  // Catmull-Rom through points → cubic bezier path data
  function smooth(pts) {
    let d = `M${r1(pts[0][0])},${r1(pts[0][1])}`
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i - 1] ?? pts[i]
      const b = pts[i]
      const c = pts[i + 1]
      const e = pts[i + 2] ?? c
      d += `C${r1(b[0] + (c[0] - a[0]) / 6)},${r1(b[1] + (c[1] - a[1]) / 6)} ${r1(c[0] - (e[0] - b[0]) / 6)},${r1(c[1] - (e[1] - b[1]) / 6)} ${r1(c[0])},${r1(c[1])}`
    }
    return d
  }
  function stroke(svg, d, cls) {
    const path = S('path', { d, class: cls, pathLength: 1, fill: 'none' }, svg)
    path.style.strokeDasharray = '1 1'
    return path
  }
  // opacity hides the round-cap dot a zero-length dash still paints
  function draw(tl, path, at, duration, ease = 'power2.inOut') {
    tl.fromTo(path, { opacity: 0 }, { opacity: 1, duration: 0.01 }, at)
    tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration, ease }, at)
  }
  function undraw(tl, path, at, duration) {
    tl.to(path, { strokeDashoffset: -1, duration, ease: 'power2.in' }, at)
    tl.to(path, { opacity: 0, duration: 0.01 }, at + duration)
  }
  // masked line for slide-up word reveals
  function masked(kit, parent, cls, text) {
    const wrap = kit.el('span', 'g-mask fx-mask ' + cls, null, parent)
    return kit.el('span', null, text, wrap)
  }
  // fingertip / product box with fallbacks around each other
  function spot(kit) {
    const W = innerWidth
    const H = innerHeight
    const vh = kit.vh
    const p = kit.point ?? (kit.box ? { x: kit.box.x + kit.box.w / 2, y: kit.box.y + kit.box.h / 2 } : { x: 0.55 * W, y: 0.5 * H })
    const b = kit.box ?? { x: p.x - 10 * vh, y: p.y - 14 * vh, w: 20 * vh, h: 28 * vh }
    return { W, H, vh, p, b }
  }
  const str = (v, fallback) => (v == null || v === '' ? fallback : String(v))

  /* ───────────── Transitions (place full) ───────────── */

  // 1 · three slanted panels sweep across and off; the body covers the frame at ~0.6 s
  defineGraphic('wipe-diagonal', {
    title: 'ปาดเฉียง · Diagonal wipe',
    place: 'full',
    sound: [['whoosh-big', 0], ['impact', 0.5]],
    presets: { reverse: { title: 'ปาดเฉียงย้อนทาง · Diagonal wipe (right to left)', data: { dir: -1 } } },
    sample: { data: {} },
    build(kit, data, tl) {
      const W = innerWidth
      const H = innerHeight
      const s = Number(data.dir) === -1 ? -1 : 1
      const slant = 0.4 * H
      const width = W + slant * 2
      const off = width + 0.3 * H
      const panels = ['fx-a2', 'fx-a', 'fx-body'].map((cls) => {
        const node = kit.el('i', 'fx-panel ' + cls)
        Object.assign(node.style, { width: width + 'px', left: -slant + 'px' })
        gsap.set(node, { skewX: -20 * s })
        return node
      })
      panels.forEach((node, i) => {
        tl.fromTo(node, { x: -s * off }, { x: 0, duration: 0.46, ease: 'expo.inOut' }, i * 0.07)
        tl.to(node, { x: s * off, duration: 0.46, ease: 'expo.inOut' }, 0.62 + (2 - i) * 0.06)
      })
    },
  })

  // 2 · wavy liquid rises to fill, then drains back down
  defineGraphic('liquid-wipe', {
    title: 'ของเหลวท่วมจอ · Liquid wipe',
    place: 'full',
    sound: [['water', 0], ['whoosh-low', 0.62]],
    sample: { data: {} },
    build(kit, data, tl) {
      const svg = canvas(kit, true)
      const wave = (level, phase, amp) => {
        const pts = []
        for (let x = -5; x <= 105; x += 5) pts.push([x, level + amp * Math.sin((x / 100) * Math.PI * 3 + phase) + amp * 0.45 * Math.sin((x / 100) * Math.PI * 7 - phase * 1.4)])
        return smooth(pts) + ' L105,112 L-5,112 Z'
      }
      // getter/setter proxy: the path redraws from tweened numbers, so seeking redraws too
      const liquid = (cls, amp) => {
        const path = S('path', { class: cls }, svg)
        let lv = 112
        let ph = 0
        const set = () => path.setAttribute('d', wave(lv, ph, amp))
        set()
        return {
          get lv() { return lv },
          set lv(v) { lv = v; set() },
          get ph() { return ph },
          set ph(v) { ph = v; set() },
        }
      }
      const back = liquid('fx-back', 4)
      const front = liquid('fx-front', 5)
      tl.fromTo(back, { lv: 112 }, { lv: -14, duration: 0.5, ease: 'power2.inOut' }, 0)
        .fromTo(front, { lv: 112 }, { lv: -14, duration: 0.5, ease: 'power2.inOut' }, 0.08)
        .fromTo(back, { ph: 0 }, { ph: 9, duration: 1.24, ease: 'none' }, 0)
        .fromTo(front, { ph: 2 }, { ph: -6, duration: 1.24, ease: 'none' }, 0)
        .to(front, { lv: 114, duration: 0.5, ease: 'power2.inOut' }, 0.66)
        .to(back, { lv: 114, duration: 0.5, ease: 'power2.inOut' }, 0.74)
    },
  })

  // 3 · torn-edged sheets slide over, then drop away
  defineGraphic('paper-tear', {
    title: 'กระดาษฉีก · Paper tear',
    place: 'full',
    sound: [['paper', 0], ['swoosh', 0.62]],
    sample: { data: {} },
    build(kit, data, tl) {
      const W = innerWidth
      const H = innerHeight
      const vh = kit.vh
      const SW = W + 26 * vh
      const SH = H + 24 * vh
      const random = kit.rng(Number(data.seed ?? 11))
      // walk the perimeter, nudging each point inward: a torn edge with fibre-sized teeth
      const torn = (jag) => {
        const pts = []
        const step = () => (0.8 + random() * 1.8) * vh
        const bite = () => random() * jag + (random() < 0.15 ? jag * 0.8 : 0)
        for (let x = 0; x < SW; x += step()) pts.push([x, bite()])
        for (let y = 0; y < SH; y += step()) pts.push([SW - bite(), y])
        for (let x = SW; x > 0; x -= step()) pts.push([x, SH - bite()])
        for (let y = SH; y > 0; y -= step()) pts.push([bite(), y])
        return pts.map((q) => r1(q[0]) + ',' + r1(q[1])).join(' ')
      }
      const sheets = ['fx-under', 'fx-sheet'].map((cls) => {
        const svg = S('svg', { class: 'fx-paper ' + cls, viewBox: `0 0 ${r1(SW)} ${r1(SH)}`, width: r1(SW), height: r1(SH) }, kit.root)
        S('polygon', { points: torn(2.6 * vh) }, svg)
        Object.assign(svg.style, { left: -13 * vh + 'px', top: -12 * vh + 'px' })
        return svg
      })
      sheets.forEach((sheet, i) => {
        tl.fromTo(sheet, { x: -SW - 4 * vh, rotation: -5 }, { x: 0, rotation: 0, duration: 0.48, ease: 'power3.out' }, i * 0.08)
        tl.to(sheet, { y: SH + 6 * vh, rotation: i ? 7 : -5, duration: 0.46, ease: 'power3.in' }, 0.66 + (1 - i) * 0.08)
      })
    },
  })

  // 4 · seeded ink drops spread to cover, then dry up patch by patch
  defineGraphic('ink-bleed', {
    title: 'หมึกซึม · Ink bleed',
    place: 'full',
    sound: [['water', 0], ['whoosh-low', 0.66]],
    sample: { data: {} },
    build(kit, data, tl) {
      const W = innerWidth
      const H = innerHeight
      const vh = kit.vh
      const id = 'fx-ink-' + ++uid
      const random = kit.rng(Number(data.seed ?? 5))
      // oversized svg so the edge displacement never pulls a gap in from the frame border
      const pad = 6 * vh
      const svg = S('svg', { viewBox: `${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}` }, kit.root)
      svg.style.cssText = `position:absolute;left:${-pad}px;top:${-pad}px;width:${W + 2 * pad}px;height:${H + 2 * pad}px`
      const filter = S('filter', { id, x: '-10%', y: '-10%', width: '120%', height: '120%' }, S('defs', {}, svg))
      S('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.011', numOctaves: '2', seed: String(uid % 97) }, filter)
      S('feDisplacementMap', { in: 'SourceGraphic', scale: r1(4 * vh), xChannelSelector: 'R', yChannelSelector: 'G' }, filter)
      const cols = 5
      const rows = 3
      const cw = W / cols
      const ch = H / rows
      ;[['fx-a', 0], ['fx-b', 0.1]].forEach(([cls, lag], layer) => {
        const g = S('g', { class: cls, filter: `url(#${id})` }, svg)
        for (let c = 0; c < cols; c++)
          for (let r = 0; r < rows; r++) {
            const cx = (c + 0.5 + (random() - 0.5) * 0.5) * cw
            const cy = (r + 0.5 + (random() - 0.5) * 0.5) * ch
            const R = Math.hypot(cw, ch) * (0.82 + random() * 0.15)
            const dot = S('circle', { cx: r1(cx), cy: r1(cy), r: 0 }, g)
            tl.fromTo(dot, { attr: { r: 0 } }, { attr: { r: R }, duration: 0.34, ease: 'power2.out' }, lag + random() * 0.14)
            tl.to(dot, { attr: { r: 0 }, duration: 0.3, ease: 'power2.in' }, 0.66 + (1 - layer) * 0.08 + random() * 0.16)
          }
        // a few satellite droplets land just ahead of the spread
        for (let i = 0; i < 6; i++) {
          const drop = S('circle', { cx: r1(random() * W), cy: r1(random() * H), r: 0 }, g)
          const R = (1 + random() * 2.5) * vh
          tl.fromTo(drop, { attr: { r: 0 } }, { attr: { r: R }, duration: 0.16, ease: 'back.out(3)' }, lag + random() * 0.08)
          tl.to(drop, { attr: { r: 0 }, duration: 0.2 }, 0.9 + random() * 0.1)
        }
      })
    },
  })

  // 5 · a grid of squares fills along a noisy diagonal, then clears the other way
  defineGraphic('pixel-dissolve', {
    title: 'พิกเซลสลาย · Pixel dissolve',
    place: 'full',
    sound: [['glitch', 0], ['glitch', 0.64]],
    sample: { data: {} },
    build(kit, data, tl) {
      const cols = 16
      const rows = 9
      const cw = innerWidth / cols
      const ch = innerHeight / rows
      const random = kit.rng(Number(data.seed ?? 9))
      const cells = []
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          const roll = random()
          const cell = kit.el('i', 'fx-px' + (roll > 0.88 ? ' fx-hi' : roll > 0.8 ? ' fx-a2' : ''))
          Object.assign(cell.style, { left: c * cw + 'px', top: r * ch + 'px', width: cw + 1 + 'px', height: ch + 1 + 'px' })
          const d = (c / cols + r / rows) / 2
          cells.push({ cell, inAt: d * 0.6 + random() * 0.4, outAt: (1 - d) * 0.6 + random() * 0.4 })
        }
      cells.forEach(({ cell, inAt, outAt }) => {
        tl.fromTo(cell, { scale: 0 }, { scale: 1, duration: 0.1, ease: 'power2.out' }, inAt * 0.42)
        tl.to(cell, { scale: 0, duration: 0.1, ease: 'power2.in' }, 0.66 + outAt * 0.42)
      })
    },
  })

  // 6 · horizontal blades shut from alternate sides, centre first, then carry on through
  defineGraphic('shutter', {
    title: 'ชัตเตอร์ · Shutter',
    place: 'full',
    sound: [['shutter', 0.2], ['whoosh', 0.62]],
    sample: { data: {} },
    build(kit, data, tl) {
      const n = 7
      const h = innerHeight / n
      const W = innerWidth * 1.04
      for (let i = 0; i < n; i++) {
        const s = i % 2 ? -1 : 1
        const blade = kit.el('i', 'fx-blade' + (s < 0 ? ' fx-rev' : ''))
        Object.assign(blade.style, { top: i * h + 'px', height: h + 1 + 'px' })
        const order = Math.abs(i - (n - 1) / 2)
        tl.fromTo(blade, { x: -s * W }, { x: 0, duration: 0.36, ease: 'expo.out' }, order * 0.05)
        tl.to(blade, { x: s * W, duration: 0.36, ease: 'expo.in' }, 0.62 + order * 0.05)
      }
    },
  })

  // 7 · rings punch out from the centre into a full cover with a word, then open from the middle
  defineGraphic('zoom-punch', {
    title: 'ซูมพันช์ · Zoom punch',
    place: 'full',
    defaults: { text: 'ต่อไป' },
    sound: [['whoosh-big', 0], ['impact', 0.5], ['whoosh-high', 0.7]],
    presets: {
      go: { title: 'ซูมพันช์ · ไปกันเลย', data: { text: 'ไปกันเลย!' } },
      wow: { title: 'ซูมพันช์ · ว้าว', data: { text: 'ว้าว!' } },
    },
    sample: { data: { text: 'ต่อไป' } },
    build(kit, data, tl) {
      const W = innerWidth
      const H = innerHeight
      const R = Math.hypot(W, H) / 2 + 4
      const svg = canvas(kit)
      // a ring is a circle stroke: r = (outer+inner)/2, width = outer−inner; both linear, so a tween keeps the shape
      const rings = ['fx-r1', 'fx-r2', 'fx-r3', 'fx-r4'].map((cls) => S('circle', { cx: W / 2, cy: H / 2, r: 0, 'stroke-width': 0, fill: 'none', class: cls }, svg))
      rings.forEach((ring, i) => {
        tl.fromTo(ring, { attr: { r: 0, 'stroke-width': 0 } }, { attr: { r: R / 2, 'stroke-width': R }, duration: 0.38, ease: 'power3.in' }, i * 0.07)
        tl.to(ring, { attr: { r: R, 'stroke-width': 0 }, duration: 0.38, ease: 'power3.in' }, 0.7 + (3 - i) * 0.05)
      })
      const word = kit.el('span', 'fx-word', str(data.text, 'ต่อไป'))
      tl.fromTo(word, { scale: 2.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2)' }, 0.34)
        .to(word, { scale: 3, opacity: 0, duration: 0.24, ease: 'power2.in' }, 0.68)
    },
  })

  // 8 · top and bottom halves slam together, then part sideways
  defineGraphic('split-slide', {
    title: 'แยกบนล่าง · Split slide',
    place: 'full',
    sound: [['whoosh', 0], ['impact', 0.42], ['swipe', 0.62]],
    sample: { data: {} },
    build(kit, data, tl) {
      const top = kit.el('i', 'fx-half fx-top')
      const bottom = kit.el('i', 'fx-half fx-bottom')
      const seam = kit.el('i', 'fx-seam', null, top)
      tl.fromTo(top, { yPercent: -100 }, { yPercent: 0, duration: 0.42, ease: 'power4.inOut' }, 0)
        .fromTo(bottom, { yPercent: 100 }, { yPercent: 0, duration: 0.42, ease: 'power4.inOut' }, 0.04)
        .fromTo(seam, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power3.out' }, 0.34)
        .to(top, { xPercent: -101, duration: 0.44, ease: 'power4.in' }, 0.64)
        .to(bottom, { xPercent: 101, duration: 0.44, ease: 'power4.in' }, 0.68)
    },
  })

  // 9 · five coloured bands race across in a staircase
  defineGraphic('stripe-sweep', {
    title: 'แถบสีกวาด · Stripe sweep',
    place: 'full',
    sound: [['swipe', 0], ['whoosh', 0.64]],
    sample: { data: {} },
    build(kit, data, tl) {
      ;['fx-c1', 'fx-c2', 'fx-c3', 'fx-c4', 'fx-c5'].forEach((cls, i) => {
        const band = kit.el('i', 'fx-band ' + cls)
        band.style.top = i * 20 + '%'
        tl.fromTo(band, { xPercent: -101 }, { xPercent: 0, duration: 0.4, ease: 'expo.inOut' }, i * 0.05)
        tl.to(band, { xPercent: 101, duration: 0.4, ease: 'expo.inOut' }, 0.64 + i * 0.05)
      })
    },
  })

  // 10 · bars close over the frame with a title lockup, open to cinema bars carrying it, then leave
  defineGraphic('letterbox', {
    title: 'แถบภาพยนตร์ · Letterbox',
    place: 'full',
    defaults: { title: 'ไฮไลต์ของวันนี้', kicker: '' },
    sound: [['whoosh-low', 0], ['impact', 0.42], ['swoosh', 0.8]],
    presets: {
      chapter: { title: 'แถบภาพยนตร์ · ตอนต่อไป', data: { kicker: 'ตอนต่อไป', title: 'รีวิวแบบจัดเต็ม' } },
      intro: { title: 'แถบภาพยนตร์ · เปิดไลฟ์', data: { kicker: 'LIVE', title: 'ยินดีต้อนรับทุกคน' } },
    },
    sample: { data: { kicker: 'ตอนต่อไป', title: 'ไฮไลต์ของวันนี้' } },
    build(kit, data, tl) {
      const top = kit.el('div', 'fx-bar fx-top')
      const bottom = kit.el('div', 'fx-bar fx-bottom')
      const kickRow = data.kicker ? kit.el('div', 'fx-kick', null, top) : null
      const kick = kickRow ? masked(kit, kickRow, '', String(data.kicker)) : null
      const head = kit.el('div', 'fx-head', null, bottom)
      const rule = kit.el('i', 'fx-rule', null, head)
      const title = masked(kit, head, '', str(data.title, ''))
      const words = [kick, title].filter(Boolean)
      // open: each bar keeps 12% of the frame (24% of its own 50% height)
      tl.fromTo(top, { yPercent: -100 }, { yPercent: 0, duration: 0.45, ease: 'expo.inOut' }, 0)
        .fromTo(bottom, { yPercent: 100 }, { yPercent: 0, duration: 0.45, ease: 'expo.inOut' }, 0)
        .fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.4, ease: 'power3.out', stagger: 0.06 }, 0.32)
        .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out' }, 0.42)
        // the lockup reads big while the frame is covered, then settles into the bars
        .fromTo(head, { scale: 1.9, transformOrigin: '50% 0%' }, { scale: 1, duration: 0.5, ease: 'expo.inOut' }, 0.8)
        .to(top, { yPercent: -76, duration: 0.5, ease: 'expo.inOut' }, 0.8)
        .to(bottom, { yPercent: 76, duration: 0.5, ease: 'expo.inOut' }, 0.8)
      if (kickRow) tl.fromTo(kickRow, { scale: 1.9, transformOrigin: '50% 100%' }, { scale: 1, duration: 0.5, ease: 'expo.inOut' }, 0.8)
      const out = 1.3 + hold(kit)
      tl.to(words, { yPercent: -110, duration: 0.28, ease: 'power2.in' }, out)
        .to(rule, { scaleX: 0, duration: 0.28, ease: 'power2.in' }, out)
        .to(top, { yPercent: -100, duration: 0.4, ease: 'power3.in' }, out + 0.12)
        .to(bottom, { yPercent: 100, duration: 0.4, ease: 'power3.in' }, out + 0.12)
    },
  })

  /* ───────────── Text effects (place center) ───────────── */

  // 11 · graphemes drop onto a plate and bounce to rest
  defineGraphic('type-bounce', {
    title: 'ตัวอักษรเด้ง · Type bounce',
    place: 'center',
    defaults: { text: 'สวัสดีทุกคน' },
    sound: [['pop', 0.1], ['typing', 0.2]],
    presets: { welcome: { title: 'ตัวอักษรเด้ง · ยินดีต้อนรับ', data: { text: 'ยินดีต้อนรับ!' } } },
    sample: { data: { text: 'สวัสดีทุกคน' } },
    build(kit, data, tl) {
      const plate = kit.el('div', 'fx-plate')
      const random = kit.rng(4)
      const glyphs = kit.graphemes(str(data.text, '')).map((g) => kit.el('span', g.trim() ? 'fx-g' : 'fx-sp', g, plate))
      const step = Math.min(0.06, 0.3 / Math.max(1, glyphs.length))
      tl.fromTo(plate, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.25, ease: 'power3.out' }, 0)
      glyphs.forEach((g, i) => tl.fromTo(g, { yPercent: -150, opacity: 0, rotation: (random() - 0.5) * 30 }, { yPercent: 0, opacity: 1, rotation: 0, duration: 0.5, ease: 'bounce.out' }, 0.08 + i * step))
      const out = 0.6 + hold(kit)
      tl.to(glyphs, { yPercent: 70, opacity: 0, duration: 0.22, ease: 'power2.in', stagger: Math.min(0.02, 0.15 / glyphs.length) }, out)
        .to(plate, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.25, ease: 'power3.in' }, out + 0.15)
    },
  })

  // 12 · each word lands from huge onto its own block; the last word in the highlight
  defineGraphic('split-scale', {
    title: 'คำซูมลง · Split scale',
    place: 'center',
    defaults: { text: 'ของดี ต้องบอกต่อ' },
    sound: [['whoosh-high', 0], ['impact', 0.3]],
    presets: { hype: { title: 'คำซูมลง · ห้ามพลาด', data: { text: 'ห้ามพลาด เด็ดที่สุด' } } },
    sample: { data: { text: 'ของดี ต้องบอกต่อ' } },
    build(kit, data, tl) {
      const line = kit.el('div', 'fx-line')
      const words = kit.words(str(data.text, '')).filter((w) => w.trim()).map((w) => kit.el('span', 'fx-w', w, line))
      if (words.length) words[words.length - 1].classList.add('fx-hi')
      const step = Math.min(0.12, 0.45 / Math.max(1, words.length))
      words.forEach((w, i) => tl.fromTo(w, { scale: 3.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.36, ease: 'power4.out' }, i * step))
      tl.to(words, { scale: 0.85, opacity: 0, duration: 0.3, ease: 'power2.in', stagger: 0.03 }, 0.5 + hold(kit))
    },
  })

  // 13 · words flip through one window that resizes to each word
  defineGraphic('stack-cycle', {
    title: 'คำหมุนวน · Stack cycle',
    place: 'center',
    defaults: { lead: 'วันนี้มี', words: ['ของใหม่', 'ของแถม', 'ราคาพิเศษ'] },
    sound: [['pop', 0.1], ['click', 0.6], ['click', 1.3], ['click', 2]],
    presets: { vibe: { title: 'คำหมุนวน · บรรยากาศ', data: { lead: 'ไลฟ์นี้', words: ['สนุก', 'คุ้ม', 'ไม่มีบท'] } } },
    sample: { data: { lead: 'วันนี้มี', words: ['ของใหม่', 'ของแถม', 'ราคาพิเศษ'] } },
    build(kit, data, tl) {
      const list = [].concat(data.words ?? []).map(String).filter((w) => w.trim()).slice(0, 8)
      if (!list.length) list.push(...kit.words(str(data.text, '')).filter((w) => w.trim()))
      const plate = kit.el('div', 'fx-plate')
      const lead = data.lead ? kit.el('span', 'fx-lead', String(data.lead), plate) : null
      const win = kit.el('span', 'fx-win', null, plate)
      const nodes = list.map((w) => kit.el('span', 'fx-w', w, win))
      const pad = 2.4 * kit.vh
      const widths = nodes.map((n) => n.offsetWidth + pad)
      const step = Math.max(0.6, hold(kit) / Math.max(1, list.length))
      gsap.set(win, { width: widths[0] ?? 0 })
      tl.fromTo(plate, { y: 2 * kit.vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'power3.out' }, 0)
      if (lead) tl.fromTo(lead, { opacity: 0 }, { opacity: 1, duration: 0.25 }, 0.08)
      nodes.forEach((node, i) => {
        const at = 0.2 + i * step
        tl.fromTo(node, { yPercent: 100, rotationX: -80, opacity: 0, transformPerspective: 500 }, { yPercent: 0, rotationX: 0, opacity: 1, duration: 0.38, ease: 'power3.out' }, at)
        if (i) tl.to(win, { width: widths[i], duration: 0.34, ease: 'power3.inOut' }, at - 0.04)
        if (i < nodes.length - 1) tl.to(node, { yPercent: -100, rotationX: 80, opacity: 0, duration: 0.3, ease: 'power3.in' }, at + step - 0.06)
      })
      const out = 0.2 + (nodes.length - 1) * step + Math.max(0.9, step)
      tl.to(plate, { y: -2 * kit.vh, opacity: 0, duration: 0.3, ease: 'power2.in' }, out)
    },
  })

  // 14 · a huge outlined title drifts slowly behind a solid one
  defineGraphic('marquee-title', {
    title: 'ชื่อเรื่องวิ่ง · Marquee title',
    place: 'center',
    defaults: { text: 'เปิดตัวสินค้าใหม่' },
    sound: [['whoosh-low', 0], ['pop', 0.3]],
    presets: { live: { title: 'ชื่อเรื่องวิ่ง · ไลฟ์สด', data: { text: 'ไลฟ์สดตอนนี้' } } },
    sample: { data: { text: 'เปิดตัวสินค้าใหม่' } },
    build(kit, data, tl) {
      const text = str(data.text, '')
      const row = kit.el('div', 'fx-row')
      for (let i = 0; i < 4; i++) kit.el('span', null, text, row)
      const plate = kit.el('div', 'fx-plate')
      const line = masked(kit, plate, '', text)
      const out = 0.6 + hold(kit)
      const end = out + 0.4
      tl.fromTo(row, { x: 0 }, { x: -28 * kit.vw, duration: end, ease: 'none' }, 0)
        .fromTo(row, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 0)
        .fromTo(plate, { clipPath: 'inset(0% 50% 0% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.4, ease: 'power3.out' }, 0.1)
        .fromTo(line, { yPercent: 110 }, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, 0.25)
        .to(line, { yPercent: -110, duration: 0.25, ease: 'power2.in' }, out)
        .to(plate, { clipPath: 'inset(0% 50% 0% 50%)', duration: 0.3, ease: 'power3.in' }, out + 0.1)
        .to(row, { opacity: 0, duration: 0.35, ease: 'power2.in' }, out + 0.05)
    },
  })

  // 15 · a rubber stamp slams down with rough inked edges and a few splats
  defineGraphic('stamp-word', {
    title: 'ตราประทับ · Stamp word',
    place: 'center',
    defaults: { text: 'ของแท้' },
    sound: [['whoosh-high', 0], ['stamp', 0.27]],
    presets: {
      sold: { title: 'ตราประทับ · ขายแล้ว', data: { text: 'ขายแล้ว' } },
      approved: { title: 'ตราประทับ · ผ่าน', data: { text: 'ผ่าน!' } },
      hot: { title: 'ตราประทับ · มาแรง', data: { text: 'มาแรง' } },
    },
    sample: { data: { text: 'ของแท้' } },
    build(kit, data, tl) {
      const id = 'fx-stamp-' + ++uid
      const vh = kit.vh
      const defs = S('svg', { width: 0, height: 0 }, kit.root)
      defs.style.position = 'absolute'
      const filter = S('filter', { id, x: '-5%', y: '-5%', width: '110%', height: '110%' }, defs)
      // rough the edges, then knock speckled holes out of the ink
      S('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.05', numOctaves: '2', seed: '3', result: 'n' }, filter)
      S('feDisplacementMap', { in: 'SourceGraphic', in2: 'n', scale: r1(0.9 * vh), result: 'rough' }, filter)
      S('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.7', numOctaves: '1', seed: '8', result: 'g' }, filter)
      S('feColorMatrix', { in: 'g', type: 'matrix', values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -4 0 0 0 3.1', result: 'holes' }, filter)
      S('feComposite', { in: 'rough', in2: 'holes', operator: 'in' }, filter)
      const wrap = kit.el('div', 'fx-wrap')
      const stamp = kit.el('div', 'fx-stamp', null, wrap)
      stamp.style.filter = `url(#${id})`
      kit.el('span', 'fx-word', str(data.text, ''), stamp)
      const random = kit.rng(13)
      const splats = Array.from({ length: 7 }, () => {
        const dot = kit.el('i', 'fx-splat', null, wrap)
        const a = random() * Math.PI * 2
        const size = (0.5 + random() * 1.3) * vh
        Object.assign(dot.style, { width: size + 'px', height: size + 'px', left: `calc(50% + ${r1(Math.cos(a) * (55 + random() * 25))}%)`, top: `calc(50% + ${r1(Math.sin(a) * (70 + random() * 30))}%)` })
        return dot
      })
      tl.fromTo(stamp, { scale: 2.6, opacity: 0, rotation: -18 }, { scale: 1, opacity: 1, rotation: -7, duration: 0.22, ease: 'power4.in' }, 0.05)
        .to(stamp, { scale: 0.95, duration: 0.06, ease: 'power1.out', yoyo: true, repeat: 1 }, 0.27)
        .fromTo(wrap, { x: 0 }, { keyframes: { x: [0, -1.2 * vh, 1 * vh, -0.6 * vh, 0.3 * vh, 0] }, duration: 0.28, ease: 'none' }, 0.27)
        .fromTo(splats, { scale: 0 }, { scale: 1, duration: 0.14, ease: 'back.out(3)', stagger: 0.015 }, 0.27)
      const out = 0.45 + hold(kit)
      tl.to(wrap, { opacity: 0, scale: 1.05, duration: 0.35, ease: 'power2.in' }, out)
    },
  })

  // 16 · giant number counts up with its unit and a growing rule
  defineGraphic('counter-hero', {
    title: 'ตัวเลขใหญ่ · Counter hero',
    place: 'center',
    defaults: { value: 1000, unit: 'คน', label: 'ยอดผู้ชม' },
    sound: [['riser', 0.1], ['ding', 1.3]],
    presets: {
      percent: { title: 'ตัวเลขใหญ่ · เปอร์เซ็นต์', data: { value: 98, unit: '%', label: 'รีวิวพอใจ' } },
      likes: { title: 'ตัวเลขใหญ่ · ยอดไลก์', data: { value: 25000, unit: 'ไลก์', label: 'ขอบคุณทุกหัวใจ' } },
    },
    sample: { data: { value: 1280, unit: 'คน', label: 'ผู้ชมตอนนี้' } },
    build(kit, data, tl) {
      const value = Number(data.value)
      const to = Number.isFinite(value) ? value : 0
      const plate = kit.el('div', 'fx-plate')
      const label = data.label ? masked(kit, plate, 'fx-label', String(data.label)) : null
      const row = kit.el('div', 'fx-row', null, plate)
      const num = kit.el('span', 'fx-num', null, row)
      const unit = data.unit ? kit.el('span', 'fx-unit', String(data.unit), row) : null
      const bar = kit.el('i', 'fx-bar', null, plate)
      kit.count(num, 0, to, 0.15, 1.2)
      num.style.minWidth = num.offsetWidth + 'px'
      tl.fromTo(plate, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.6)' }, 0)
        .fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 1.2, ease: 'power2.out' }, 0.15)
      if (label) tl.fromTo(label, { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out' }, 0.1)
      if (unit) tl.fromTo(unit, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.5)' }, 1.15)
      const out = Math.max(1.8, 0.4 + hold(kit))
      tl.to(plate, { y: -2 * kit.vh, opacity: 0, duration: 0.35, ease: 'power2.in' }, out)
    },
  })

  /* ───────────── Emphasis marks (place spot) ───────────── */

  // 17 · a hand-drawn loop around the box that overshoots its start
  defineGraphic('circle-mark', {
    title: 'วงกลมมือวาด · Circle mark',
    place: 'spot',
    sound: [['swipe', 0]],
    sample: { data: {}, x: 0.55, y: 0.5, box: { x: 0.42, y: 0.3, w: 0.2, h: 0.4 } },
    build(kit, data, tl) {
      const { b, vh } = spot(kit)
      const random = kit.rng(Number(data.seed ?? 3))
      const cx = b.x + b.w / 2
      const cy = b.y + b.h / 2
      const rx = b.w / 2 * 1.12 + 2 * vh
      const ry = b.h / 2 * 1.08 + 2 * vh
      const pts = []
      const n = 30
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const a = -Math.PI * 0.62 + t * Math.PI * 2 * 1.14
        const k = 1 + (random() - 0.5) * 0.05 + t * 0.06
        pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
      }
      const path = stroke(canvas(kit), smooth(pts), 'fx-ink')
      draw(tl, path, 0, 0.55)
      undraw(tl, path, 0.55 + hold(kit), 0.35)
    },
  })

  // 18 · marker under the box: marker / double / wave / scribble
  defineGraphic('underline-swipe', {
    title: 'ขีดเส้นใต้ · Underline swipe',
    place: 'spot',
    defaults: { style: 'marker' },
    sound: [['swipe', 0]],
    presets: {
      double: { title: 'ขีดเส้นใต้ · สองเส้น', data: { style: 'double' } },
      wave: { title: 'ขีดเส้นใต้ · คลื่น', data: { style: 'wave' } },
      scribble: { title: 'ขีดเส้นใต้ · ขีดเขี่ย', data: { style: 'scribble' } },
    },
    sample: { data: {}, x: 0.55, y: 0.5, box: { x: 0.42, y: 0.3, w: 0.2, h: 0.4 } },
    build(kit, data, tl) {
      const { b, vh, H } = spot(kit)
      const svg = canvas(kit)
      const x0 = b.x - 1.5 * vh
      const x1 = b.x + b.w + 1.5 * vh
      const y = Math.min(b.y + b.h + 2 * vh, 0.93 * H)
      const style = ['double', 'wave', 'scribble'].includes(data.style) ? data.style : 'marker'
      const paths = []
      if (style === 'marker') paths.push(stroke(svg, smooth([[x0, y + 0.6 * vh], [(x0 + x1) / 2, y - 0.2 * vh], [x1, y - 0.8 * vh]]), 'fx-ink fx-marker'))
      if (style === 'double') {
        paths.push(stroke(svg, smooth([[x0, y], [(x0 + x1) / 2, y - 0.5 * vh], [x1, y - 0.2 * vh]]), 'fx-ink fx-thin'))
        paths.push(stroke(svg, smooth([[x0 + 2 * vh, y + 1.8 * vh], [(x0 + x1) / 2, y + 1.3 * vh], [x1 - 1 * vh, y + 1.5 * vh]]), 'fx-ink fx-thin'))
      }
      if (style === 'wave') {
        const pts = []
        const waves = Math.max(3, Math.round((x1 - x0) / (7 * vh)))
        for (let i = 0; i <= waves * 4; i++) pts.push([x0 + ((x1 - x0) * i) / (waves * 4), y + Math.sin((i / 4) * Math.PI * 2) * 1.3 * vh])
        paths.push(stroke(svg, smooth(pts), 'fx-ink fx-thin'))
      }
      if (style === 'scribble') {
        const pts = []
        for (let i = 0; i < 6; i++) pts.push([i % 2 ? x1 - i * 0.6 * vh : x0 + i * 0.8 * vh, y - 0.6 * vh + i * 0.55 * vh])
        paths.push(stroke(svg, smooth(pts), 'fx-ink fx-thin'))
      }
      paths.forEach((path, i) => draw(tl, path, i * 0.18, style === 'scribble' ? 0.55 : 0.38, 'power2.out'))
      const out = 0.6 + hold(kit)
      paths.forEach((path) => undraw(tl, path, out, 0.3))
    },
  })

  // 19 · label off to the side, a curved hand-drawn arrow into the point
  defineGraphic('arrow-callout', {
    title: 'ลูกศรชี้ · Arrow callout',
    place: 'spot',
    defaults: { label: 'ดูตรงนี้' },
    sound: [['pop', 0], ['swipe', 0.15]],
    presets: { new: { title: 'ลูกศรชี้ · ของใหม่', data: { label: 'ของใหม่!' } } },
    sample: { data: { label: 'ดูตรงนี้' }, x: 0.55, y: 0.5, box: { x: 0.42, y: 0.3, w: 0.2, h: 0.4 } },
    build(kit, data, tl) {
      const { p, W, H, vh } = spot(kit)
      const s = p.x > 0.5 * W ? -1 : 1
      const v = p.y < 0.38 * H ? 1 : -1
      const label = kit.el('div', 'fx-label', str(data.label, 'ดูตรงนี้'))
      const lw = label.offsetWidth
      const lh = label.offsetHeight
      const lx = clamp(p.x + s * 26 * vh - (s < 0 ? lw : 0), 0.04 * W, 0.96 * W - lw)
      const ly = clamp(p.y + v * 20 * vh - lh / 2, 0.05 * H, 0.95 * H - lh)
      Object.assign(label.style, { left: lx + 'px', top: ly + 'px' })
      // arrow leaves the label's near edge and stops just short of the point
      const a = [s < 0 ? lx + lw + 1.2 * vh : lx - 1.2 * vh, ly + lh / 2]
      const len = Math.hypot(p.x - a[0], p.y - a[1])
      const e = [p.x - ((p.x - a[0]) / len) * 2.5 * vh, p.y - ((p.y - a[1]) / len) * 2.5 * vh]
      const nx = -(e[1] - a[1]) / len
      const ny = (e[0] - a[0]) / len
      const bend = 0.28 * len * s * v
      const c1 = [a[0] + (e[0] - a[0]) * 0.25 + nx * bend, a[1] + (e[1] - a[1]) * 0.25 + ny * bend]
      const c2 = [a[0] + (e[0] - a[0]) * 0.7 + nx * bend * 0.8, a[1] + (e[1] - a[1]) * 0.7 + ny * bend * 0.8]
      const svg = canvas(kit)
      const shaft = stroke(svg, `M${r1(a[0])},${r1(a[1])}C${r1(c1[0])},${r1(c1[1])} ${r1(c2[0])},${r1(c2[1])} ${r1(e[0])},${r1(e[1])}`, 'fx-ink')
      const ang = Math.atan2(e[1] - c2[1], e[0] - c2[0])
      const head = [0.5, -0.5].map((d) => stroke(svg, `M${r1(e[0])},${r1(e[1])}L${r1(e[0] - Math.cos(ang + d) * 2.6 * vh)},${r1(e[1] - Math.sin(ang + d) * 2.6 * vh)}`, 'fx-ink'))
      tl.fromTo(label, { scale: 0.5, opacity: 0, rotation: -10 }, { scale: 1, opacity: 1, rotation: -3, duration: 0.32, ease: 'back.out(2.2)' }, 0)
      draw(tl, shaft, 0.15, 0.42)
      head.forEach((h, i) => draw(tl, h, 0.55 + i * 0.05, 0.12, 'power2.out'))
      const out = 0.7 + hold(kit)
      undraw(tl, shaft, out, 0.3)
      tl.to(head, { opacity: 0, duration: 0.15 }, out)
      tl.to(label, { scale: 0.7, opacity: 0, duration: 0.3, ease: 'power2.in' }, out + 0.05)
    },
  })

  // 20 · 3–5 drawn sparkles (stars, crosses, shine dashes) pop around the point and twinkle
  defineGraphic('sparkle-doodle', {
    title: 'ประกายมือวาด · Sparkle doodle',
    place: 'spot',
    defaults: { count: 4 },
    sound: [['sparkle', 0]],
    presets: { burst: { title: 'ประกายมือวาด · ห้าดวง', data: { count: 5, seed: 21 } } },
    sample: { data: {}, x: 0.55, y: 0.5, box: { x: 0.42, y: 0.3, w: 0.2, h: 0.4 } },
    build(kit, data, tl) {
      const { p, b, vh } = spot(kit)
      const random = kit.rng(Number(data.seed ?? 7))
      const n = clamp(Math.round(Number(data.count) || 4), 3, 5)
      const svg = canvas(kit)
      const reach = Math.max(13 * vh, Math.min(b.w, b.h) * 0.45)
      const shapes = {
        star: (s) => `M0,${-s}Q${0.14 * s},${-0.14 * s} ${s},0Q${0.14 * s},${0.14 * s} 0,${s}Q${-0.14 * s},${0.14 * s} ${-s},0Q${-0.14 * s},${-0.14 * s} 0,${-s}Z`,
        cross: (s) => `M0,${-s}L0,${s}M${-s},0L${s},0`,
        shine: (s) => `M${0.3 * s},${-0.3 * s}L${s},${-s}M${0.45 * s},0L${1.2 * s},0M${0.3 * s},${0.3 * s}L${s},${s}`,
      }
      const kinds = ['star', 'cross', 'star', 'shine', 'star']
      const out = 0.6 + hold(kit)
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (random() - 0.5) * 0.7
        const d = reach * (0.8 + random() * 0.5)
        const size = (kinds[i] === 'star' ? 4.6 : 3) * vh * (0.8 + random() * 0.6)
        const g = S('g', {}, svg)
        const inner = S('g', { transform: `translate(${r1(p.x + Math.cos(a) * d)},${r1(p.y + Math.sin(a) * d)})` }, g)
        const path = stroke(inner, shapes[kinds[i]](r1(size)), 'fx-ink' + (kinds[i] === 'star' ? '' : ' fx-thin'))
        const at = i * 0.07
        draw(tl, path, at, 0.28, 'power2.out')
        tl.fromTo(g, { scale: 0.3, rotation: -40, svgOrigin: `${r1(p.x + Math.cos(a) * d)} ${r1(p.y + Math.sin(a) * d)}` }, { scale: 1, rotation: 0, duration: 0.4, ease: 'back.out(2.6)' }, at)
        for (let t = at + 0.6; t < out - 0.5; t += 0.7) tl.to(g, { scale: 0.78, duration: 0.2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, t + random() * 0.2)
        tl.to(g, { scale: 0, rotation: 60, duration: 0.3, ease: 'back.in(2)' }, out + i * 0.04)
      }
    },
  })

  // 21 · corner brackets snap onto the box, a label tab on the top-left
  defineGraphic('bracket-frame', {
    title: 'กรอบมุม · Bracket frame',
    place: 'spot',
    defaults: { label: 'โฟกัส' },
    sound: [['click', 0.15], ['pop', 0.3]],
    presets: { detail: { title: 'กรอบมุม · ดูใกล้ ๆ', data: { label: 'ดูใกล้ ๆ' } } },
    sample: { data: { label: 'โฟกัส' }, x: 0.55, y: 0.5, box: { x: 0.42, y: 0.3, w: 0.2, h: 0.4 } },
    build(kit, data, tl) {
      const { b, vh, H } = spot(kit)
      const pad = 1.4 * vh
      const arm = clamp(Math.min(b.w, b.h) * 0.22, 2.5 * vh, 7 * vh)
      const box = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad }
      const corners = [['tl', 0, 0, -1, -1], ['tr', 1, 0, 1, -1], ['bl', 0, 1, -1, 1], ['br', 1, 1, 1, 1]].map(([cls, fx, fy, dx, dy]) => {
        const c = kit.el('i', 'fx-corner fx-' + cls)
        Object.assign(c.style, { width: arm + 'px', height: arm + 'px', left: box.x + fx * box.w - fx * arm + 'px', top: box.y + fy * box.h - fy * arm + 'px' })
        return { c, dx, dy }
      })
      corners.forEach(({ c, dx, dy }, i) => {
        tl.fromTo(c, { x: dx * 4 * vh, y: dy * 4 * vh, opacity: 0 }, { x: 0, y: 0, opacity: 1, duration: 0.32, ease: 'back.out(3)' }, i * 0.04)
      })
      const label = data.label ? kit.el('span', 'fx-label', String(data.label)) : null
      if (label) {
        const above = box.y - label.offsetHeight - 0.8 * vh > 0.04 * H
        Object.assign(label.style, { left: box.x + 'px', top: (above ? box.y - label.offsetHeight - 0.8 * vh : box.y + box.h + 0.8 * vh) + 'px' })
        tl.fromTo(label, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.3, ease: 'power3.out' }, 0.25)
      }
      const out = 0.55 + hold(kit)
      corners.forEach(({ c, dx, dy }) => tl.to(c, { x: dx * 3 * vh, y: dy * 3 * vh, opacity: 0, duration: 0.3, ease: 'power2.in' }, out))
      if (label) tl.to(label, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.25, ease: 'power2.in' }, out)
    },
  })

  // 22 · translucent highlighter strokes sweep the box, alternating direction like a real hand
  defineGraphic('highlight-box', {
    title: 'ปากกาไฮไลต์ · Highlight box',
    place: 'spot',
    sound: [['swipe', 0]],
    sample: { data: {}, x: 0.55, y: 0.5, box: { x: 0.42, y: 0.3, w: 0.2, h: 0.4 } },
    build(kit, data, tl) {
      const { b, vh } = spot(kit)
      const random = kit.rng(Number(data.seed ?? 2))
      const n = clamp(Math.round(b.h / (10 * vh)), 1, 4)
      const band = b.h / n
      const strokes = Array.from({ length: n }, (_, i) => {
        const s = kit.el('i', 'fx-stroke')
        Object.assign(s.style, { left: b.x - 1.2 * vh + 'px', width: b.w + 2.4 * vh + 'px', top: b.y + i * band - 0.4 * vh + 'px', height: band + 0.8 * vh + 'px' })
        gsap.set(s, { rotation: (random() - 0.5) * 1.6 })
        return s
      })
      strokes.forEach((s, i) => {
        const from = i % 2 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)'
        tl.fromTo(s, { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.26, ease: 'power2.out' }, i * 0.13)
      })
      tl.to(strokes, { opacity: 0, duration: 0.35, ease: 'power2.in' }, 0.3 + n * 0.13 + hold(kit))
    },
  })

  /* ───────────── Frame effects (place edge) ───────────── */

  // 23 · soft vignette closes in, breathes, and lifts
  defineGraphic('vignette-pulse', {
    title: 'ขอบมืด · Vignette pulse',
    place: 'edge',
    themes: false,
    defaults: { strength: 0.8 },
    sound: [],
    presets: { deep: { title: 'ขอบมืด · เข้ม', data: { strength: 1 } } },
    sample: { data: {} },
    build(kit, data, tl) {
      const veil = kit.el('i', 'fx-veil')
      const k = clamp(Number(data.strength) || 0.8, 0.2, 1)
      tl.fromTo(veil, { opacity: 0, scale: 1.15 }, { opacity: k, scale: 1, duration: 0.5, ease: 'sine.inOut' }, 0)
      const out = 0.5 + hold(kit)
      for (let t = 0.6; t + 1 <= out; t += 1) tl.to(veil, { opacity: k * 0.7, scale: 1.05, duration: 0.5, ease: 'sine.inOut', yoyo: true, repeat: 1 }, t)
      tl.to(veil, { opacity: 0, scale: 1.12, duration: 0.5, ease: 'sine.inOut' }, out)
    },
  })

  // 24 · one hard flash frame that decays fast: for beat hits
  defineGraphic('flash-cut', {
    title: 'แฟลชตัด · Flash cut',
    place: 'edge',
    themes: false,
    sound: [['impact', 0]],
    presets: { accent: { title: 'แฟลชตัด · สีแบรนด์', data: { color: 'accent' } } },
    sample: { data: {} },
    build(kit, data, tl) {
      const flash = kit.el('i', 'fx-flash' + (data.color === 'accent' ? ' fx-accent' : ''))
      tl.fromTo(flash, { opacity: 0 }, { opacity: 1, duration: 0.03, ease: 'none' }, 0)
        .to(flash, { opacity: 0, duration: 0.36, ease: 'power2.out' }, 0.1)
    },
  })

  // 25 · a border draws itself around the whole frame, with viewfinder ticks at the corners and edges
  defineGraphic('frame-border', {
    title: 'กรอบทั้งจอ · Frame border',
    place: 'edge',
    sound: [['swoosh', 0]],
    presets: { live: { title: 'กรอบทั้งจอ · ไลฟ์สด', data: { label: 'LIVE' } } },
    sample: { data: {} },
    build(kit, data, tl) {
      const W = innerWidth
      const H = innerHeight
      const vh = kit.vh
      const m = 2.6 * vh
      const svg = canvas(kit)
      // two halves from top-centre round to bottom-centre, drawn together
      const halves = [
        `M${W / 2},${m}L${m},${m}L${m},${H - m}L${W / 2},${H - m}`,
        `M${W / 2},${m}L${W - m},${m}L${W - m},${H - m}L${W / 2},${H - m}`,
      ].map((d) => stroke(svg, d, 'fx-line'))
      const t = 1.4 * vh
      const g = 0.6 * vh
      const ticks = S('g', { class: 'fx-ticks' }, svg)
      for (const [x, y, sx, sy] of [[m, m, -1, -1], [W - m, m, 1, -1], [m, H - m, -1, 1], [W - m, H - m, 1, 1]]) {
        S('path', { d: `M${x + sx * g},${y}L${x + sx * (g + t)},${y}M${x},${y + sy * g}L${x},${y + sy * (g + t)}` }, ticks)
      }
      for (const [x, y, dx, dy] of [[W / 2, m, 0, 1], [W / 2, H - m, 0, -1], [m, H / 2, 1, 0], [W - m, H / 2, -1, 0]]) {
        S('path', { d: `M${x},${y}L${x + dx * t},${y + dy * t}` }, ticks)
      }
      halves.forEach((h) => draw(tl, h, 0, 0.6))
      tl.fromTo(ticks, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.45)
      const label = data.label ? kit.el('span', 'fx-label', String(data.label)) : null
      if (label) {
        Object.assign(label.style, { left: m + 1.6 * vh + 'px', top: m + 1.6 * vh + 'px' })
        tl.fromTo(label, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.3, ease: 'power3.out' }, 0.5)
      }
      const out = 0.6 + hold(kit)
      halves.forEach((h) => undraw(tl, h, out, 0.45))
      tl.to(ticks, { opacity: 0, duration: 0.2 }, out)
      if (label) tl.to(label, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.25, ease: 'power2.in' }, out)
    },
  })
})()
