// Hand graphics: annotations that follow the host's fingertip (kit.point) or the held product (kit.box).
// Place 'spot': the root covers the frame, children sit in px inside a 5% safe area and open toward
// the side away from the face / nearest frame edge. Entrance ≤0.6 s, hold = ttl (default 2.2 s), exit ≤0.5 s.
;(() => {
  const NS = 'http://www.w3.org/2000/svg'
  const HEX = /^#[0-9a-f]{6}$/i
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const r1 = (n) => Math.round(n * 10) / 10
  const priceText = (kit, v) => (Number.isFinite(v) ? kit.money(v) : String(v ?? ''))
  const SAMPLE = { x: 0.6, y: 0.6, box: { x: 0.5, y: 0.45, w: 0.2, h: 0.35 } }

  function S(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    parent.append(node)
    return node
  }

  // shared geometry: fingertip (fallback 62%/55%), product box (fallback around the point), side to open toward
  function frame(kit) {
    const W = innerWidth
    const H = innerHeight
    const vh = kit.vh
    const box = kit.box
    const p = kit.point ?? (box ? { x: box.x + box.w / 2, y: box.y + box.h / 2 } : { x: 0.62 * W, y: 0.55 * H })
    const b = box ?? { x: p.x - 9 * vh, y: p.y - 15 * vh, w: 18 * vh, h: 26 * vh }
    const fx = p.x / W
    const side = fx > 0.7 ? 'left' : fx < 0.3 ? 'right' : kit.face ? kit.away : fx >= 0.5 ? 'right' : 'left'
    const [L, R, T, B] = [0.05 * W, 0.95 * W, 0.05 * H, 0.95 * H]
    // absolutely place a measured node with its (ax, ay) anchor at (x, y), clamped to the safe area
    const put = (node, x, y, ax = 0, ay = 0) => {
      node.style.position = 'absolute'
      const w = node.offsetWidth
      const h = node.offsetHeight
      const left = clamp(x - ax * w, L, R - w)
      const top = clamp(y - ay * h, T, B - h)
      node.style.left = left + 'px'
      node.style.top = top + 'px'
      return { x: left, y: top, w, h }
    }
    const svg = (parent = kit.root) => {
      const node = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parent)
      node.style.cssText = 'position:absolute;inset:0;overflow:visible'
      return node
    }
    return { W, H, vh, p, b, side, s: side === 'right' ? 1 : -1, L, R, T, B, hold: kit.hold ?? 2.2, put, svg }
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
  const poly = (pts) => 'M' + pts.map((q) => `${r1(q[0])},${r1(q[1])}`).join('L')

  function stroke(svg, d, cls) {
    const path = S('path', { d, class: cls, pathLength: 1, fill: 'none' }, svg)
    path.style.strokeDasharray = '1 1'
    return path
  }
  // opacity guards the round-cap dot a zero-length dash still paints
  function draw(tl, path, at, duration, ease = 'power2.inOut') {
    tl.fromTo(path, { opacity: 0 }, { opacity: 1, duration: 0.01 }, at)
    tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration, ease }, at)
  }
  function undraw(tl, path, at, duration) {
    tl.to(path, { strokeDashoffset: -1, duration, ease: 'power2.in' }, at)
    tl.to(path, { opacity: 0, duration: 0.01 }, at + duration)
  }
  // write-on wipe away from the anchor; the open state is padded so drop shadows are not clipped
  const wipe = (s, open) => (open ? 'inset(-60% -12% -60% -12%)' : s > 0 ? 'inset(-60% 100% -60% 0%)' : 'inset(-60% 0% -60% 100%)')
  const reveal = (tl, node, s, at, duration = 0.3) => tl.fromTo(node, { clipPath: wipe(s, false) }, { clipPath: wipe(s, true), duration, ease: 'power3.out' }, at)
  const conceal = (tl, node, s, at, duration = 0.25) => tl.to(node, { clipPath: wipe(s, false), duration, ease: 'power2.in' }, at)
  // safety net: the root is invisible at the timeline's end whatever the exits did
  const finish = (kit, tl, end) => tl.fromTo(kit.root, { opacity: 1 }, { opacity: 0, duration: 0.1 }, end - 0.1)

  // 1 · the frame dims except a soft circle that grows from the fingertip onto the product
  defineGraphic('spotlight-dim', {
    title: 'สปอตไลต์ · Spotlight dim',
    place: 'spot',
    sound: [['whoosh-low', 0]],
    themes: false, // a dimming veil has no surface to theme
    sample: { data: {}, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const veil = kit.el('div', 'g-spotlight-dim-veil')
      const c = { x: f.b.x + f.b.w / 2, y: f.b.y + f.b.h / 2 }
      const r = Math.max(f.b.w, f.b.h) * 0.6 + 3 * f.vh
      tl.fromTo(veil, { opacity: 0, '--x': f.p.x + 'px', '--y': f.p.y + 'px', '--r': '0px' }, { opacity: 1, '--x': c.x + 'px', '--y': c.y + 'px', '--r': r + 'px', duration: 0.55, ease: 'power3.out' }, 0)
      const out = 0.55 + f.hold
      tl.to(veil, { opacity: 0, '--r': r * 1.5 + 'px', duration: 0.45, ease: 'power2.in' }, out)
      finish(kit, tl, out + 0.45)
    },
  })

  // 2 · hand-drawn ellipse around the product, a scribbled arrow and a written label
  defineGraphic('callout-ring', {
    title: 'วงกลมชี้ · Callout ring',
    place: 'spot',
    sound: [['swipe', 0], ['pop', 0.4]],
    defaults: { label: 'ตัวนี้เลย' },
    sample: { data: { label: 'ตัวนี้เลย!' }, ...SAMPLE },
    presets: {
      best: { title: 'วงกลมชี้ ขายดี · Callout best seller', data: { label: 'ขายดีอันดับ 1' } },
      new: { title: 'วงกลมชี้ ของใหม่ · Callout new', data: { label: 'ของใหม่' }, theme: 'ink' },
    },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, s } = f
      const rnd = kit.rng(7)
      const c = { x: f.b.x + f.b.w / 2, y: f.b.y + f.b.h / 2 }
      const rx = f.b.w / 2 + 3 * vh
      const ry = f.b.h / 2 + 2.5 * vh
      const svg = f.svg()
      const pts = []
      const a0 = s > 0 ? -2.1 : -1.0
      for (let i = 0, n = 28; i <= n; i++) {
        const a = a0 + (i / n) * (Math.PI * 2 + 0.45) * s
        const k = 1 + (rnd() - 0.5) * 0.05 + (i / n) * 0.06
        pts.push([c.x + Math.cos(a) * rx * k, c.y + Math.sin(a) * ry * k])
      }
      const ring = stroke(svg, smooth(pts), 'g-callout-ring-stroke')

      const label = kit.el('div', 'g-callout-ring-label', data.label)
      const at = f.put(label, c.x + s * (rx * 0.75 + 5 * vh), c.y - ry - 1 * vh, s > 0 ? 0 : 1, 1)
      // arrow from the label's lower inner corner to the ellipse rim
      const start = [s > 0 ? at.x + 2 * vh : at.x + at.w - 2 * vh, at.y + at.h + 1 * vh]
      const ang = Math.atan2((start[1] - c.y) / ry, (start[0] - c.x) / rx)
      const end = [c.x + Math.cos(ang) * rx * 1.1, c.y + Math.sin(ang) * ry * 1.1]
      const mid = [(start[0] + end[0]) / 2 + s * 2 * vh, (start[1] + end[1]) / 2 - 1.5 * vh]
      const arrow = stroke(svg, `M${r1(start[0])},${r1(start[1])}Q${r1(mid[0])},${r1(mid[1])} ${r1(end[0])},${r1(end[1])}`, 'g-callout-ring-stroke')
      const dir = Math.atan2(end[1] - mid[1], end[0] - mid[0])
      const tip = (o) => [end[0] - Math.cos(dir + o) * 2.2 * vh, end[1] - Math.sin(dir + o) * 2.2 * vh]
      const head = stroke(svg, poly([tip(0.5), end, tip(-0.5)]), 'g-callout-ring-stroke')

      draw(tl, ring, 0, 0.45)
      draw(tl, arrow, 0.3, 0.2, 'power1.out')
      draw(tl, head, 0.48, 0.1, 'none')
      reveal(tl, label, s, 0.38, 0.3)
      tl.fromTo(label, { rotation: s * -3, y: 0.8 * vh }, { rotation: s * -3, y: 0, duration: 0.3, ease: 'power3.out' }, 0.38)
      const out = 0.68 + f.hold
      conceal(tl, label, s, out, 0.25)
      undraw(tl, head, out, 0.1)
      undraw(tl, arrow, out + 0.05, 0.18)
      undraw(tl, ring, out + 0.05, 0.38)
      finish(kit, tl, out + 0.45)
    },
  })

  // 3 · elbow leader lines from points on the product out to feature labels
  defineGraphic('leader-callouts', {
    title: 'เส้นชี้จุดเด่น · Leader callouts',
    place: 'spot',
    sound: [['swoosh', 0], ['click-soft', 0.22]],
    sample: { data: { items: [{ label: 'ขวดแก้วหนา' }, { label: 'หัวสเปรย์ละเอียด' }, { label: 'ติดทน 8 ชม.' }, { label: 'ขนาด 50 ml' }] }, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, b } = f
      const items = [].concat(data.items ?? []).filter((it) => it && it.label).slice(0, 4)
      const room = { right: f.R - (b.x + b.w), left: b.x - f.L }
      const flip = (side) => (room[side] < 26 * vh && room[side === 'right' ? 'left' : 'right'] > room[side] ? (side === 'right' ? 'left' : 'right') : side)
      const sides = items.map((it, i) => flip(it.side === 'left' || it.side === 'right' ? it.side : items.length === 1 ? f.side : i % 2 ? 'left' : 'right'))
      const svg = f.svg()
      const rows = []
      for (const side of ['right', 'left']) {
        const group = items.map((it, i) => ({ it, i })).filter((g) => sides[g.i] === side)
        const s = side === 'right' ? 1 : -1
        let floor = -Infinity
        const placed = group.map(({ it, i }, j) => {
          const ay = b.y + b.h * (0.2 + (0.6 * (j + 0.5)) / group.length)
          const label = kit.el('div', 'g-leader-callouts-label', it.label)
          const at = f.put(label, s > 0 ? b.x + b.w + 7 * vh : b.x - 7 * vh, ay, s > 0 ? 0 : 1, 0.5)
          const top = Math.max(at.y, floor + 1.4 * vh)
          floor = top + at.h
          return { i, s, label, at: { ...at, y: top }, anchor: [b.x + b.w * (0.5 + s * 0.2), ay] }
        })
        const spill = floor - f.B
        for (const row of placed) {
          if (spill > 0) row.at.y -= spill
          row.label.style.top = row.at.y + 'px'
          rows.push(row)
        }
      }
      rows.sort((a, b) => a.i - b.i)
      rows.forEach((row, n) => {
        const { s, at, anchor } = row
        const ly = at.y + at.h / 2
        const lx = s > 0 ? at.x - 0.6 * vh : at.x + at.w + 0.6 * vh
        const elbow = [s > 0 ? Math.min(b.x + b.w + 3 * vh, lx - 1 * vh) : Math.max(b.x - 3 * vh, lx + 1 * vh), ly]
        const path = stroke(svg, poly([anchor, elbow, [lx, ly]]), 'g-leader-callouts-line')
        const dot = kit.el('i', 'g-leader-callouts-dot')
        dot.style.left = anchor[0] + 'px'
        dot.style.top = anchor[1] + 'px'
        const t = n * 0.1
        tl.fromTo(dot, { scale: 0, xPercent: -50, yPercent: -50 }, { scale: 1, xPercent: -50, yPercent: -50, duration: 0.2, ease: 'back.out(2.5)' }, t)
        draw(tl, path, t + 0.05, 0.28, 'power2.out')
        reveal(tl, row.label, s, t + 0.22, 0.28)
        row.dot = dot
        row.path = path
      })
      const out = 0.1 * Math.max(0, rows.length - 1) + 0.5 + f.hold
      rows.forEach((row, n) => {
        const t = out + (rows.length - 1 - n) * 0.04
        conceal(tl, row.label, row.s, t, 0.2)
        undraw(tl, row.path, t + 0.1, 0.2)
        tl.to(row.dot, { scale: 0, duration: 0.15, ease: 'power2.in' }, t + 0.25)
      })
      finish(kit, tl, out + 0.04 * Math.max(0, rows.length - 1) + 0.45)
    },
  })

  // 4 · fragrance pyramid: base → heart → top tiers stacked beside the hand
  defineGraphic('scent-pyramid', {
    title: 'พีระมิดกลิ่น · Scent pyramid',
    place: 'spot',
    sound: [['whoosh-low', 0], ['chime', 0.3]],
    sample: { data: { name: 'น้ำหอม Aurum', notes: { top: ['เบอร์กาม็อต', 'ส้มยูซุ'], heart: ['กุหลาบ', 'มะลิ'], base: ['อำพัน', 'ไม้จันทน์', 'มัสก์'] } }, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const notes = data.notes ?? {}
      const wrap = kit.el('div', 'g-scent-pyramid-wrap')
      const head = data.name ? kit.el('div', 'g-scent-pyramid-head', data.name, wrap) : null
      const tiers = [
        ['top', 'ท็อปโน้ต'],
        ['heart', 'มิดเดิลโน้ต'],
        ['base', 'เบสโน้ต'],
      ].map(([key, name], i) => {
        const tier = kit.el('div', 'g-scent-pyramid-tier' + (i ? '' : ' is-top'), null, wrap)
        tier.style.width = 36 + i * 9 + 'vh'
        kit.el('span', 'g-scent-pyramid-k', name, tier)
        kit.el('span', 'g-scent-pyramid-v', [].concat(notes[key] ?? []).slice(0, 3).join(' · ') || '—', tier)
        return tier
      })
      f.put(wrap, f.p.x + f.s * 7 * f.vh, f.p.y - 2 * f.vh, f.s > 0 ? 0 : 1, 0.5)
      // build from the base up
      ;[...tiers].reverse().forEach((tier, i) => {
        tl.fromTo(tier, { opacity: 0, y: 3 * f.vh, scaleX: 0.86 }, { opacity: 1, y: 0, scaleX: 1, duration: 0.38, ease: 'power3.out' }, i * 0.1)
      })
      if (head) tl.fromTo(head, { opacity: 0, y: 1 * f.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.28)
      const out = 0.6 + f.hold
      ;[head, ...tiers].filter(Boolean).forEach((node, i) => tl.to(node, { opacity: 0, y: -1.5 * f.vh, duration: 0.25, ease: 'power2.in' }, out + i * 0.06))
      finish(kit, tl, out + 0.45)
    },
  })

  // 5 · thin wisps rise from the fingertip, note words ride along them
  defineGraphic('scent-wisp', {
    title: 'ควันกลิ่น · Scent wisp',
    place: 'spot',
    sound: [['shimmer', 0]],
    sample: { data: { words: ['สดชื่น', 'ละมุน', 'อบอุ่น'] }, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p, s } = f
      const rnd = kit.rng(11)
      const svg = f.svg()
      const words = [].concat(data.words ?? []).filter(Boolean).slice(0, 3)
      const wisps = [0, 1, 2].map((i) => {
        const h = Math.min((36 + i * 5 + rnd() * 4) * vh, p.y - f.T)
        const spread = ((i - 1) * 15 + s * 4) * vh
        const amp = (2 + rnd() * 1.5) * vh
        const phase = rnd() * 6
        const pts = []
        for (let j = 0; j <= 7; j++) {
          const t = j / 7
          pts.push([p.x + (i - 1) * 0.8 * vh + spread * t * t + Math.sin(t * 5 + phase) * amp * t, p.y - 1 * vh - h * t])
        }
        return stroke(svg, smooth(pts), 'g-scent-wisp-line')
      })
      wisps.forEach((path, i) => draw(tl, path, i * 0.08, 0.55, 'power1.out'))
      const out = 0.7 + f.hold
      words.forEach((word, i) => {
        const chip = kit.el('span', 'g-scent-wisp-word', word)
        const path = wisps[i]
        const len = path.getTotalLength()
        const w = chip.offsetWidth
        const h = chip.offsetHeight
        const [t0, t1] = [0.3 + i * 0.2, 0.5 + i * 0.22]
        const at = (t) => {
          const q = path.getPointAtLength(t * len)
          return { x: clamp(q.x - w / 2, f.L, f.R - w), y: clamp(q.y - h / 2, f.T, f.B - h) }
        }
        const steps = [1, 2, 3, 4, 5, 6].map((k) => at(t0 + ((t1 - t0) * k) / 6))
        const start = 0.25 + i * 0.12
        tl.fromTo(chip, { ...at(t0), opacity: 0 }, { ...at(t0), opacity: 1, duration: 0.3, ease: 'power1.out' }, start)
        tl.to(chip, { keyframes: { x: steps.map((q) => q.x), y: steps.map((q) => q.y) }, duration: out + 0.4 - start, ease: 'sine.out' }, start)
        tl.to(chip, { opacity: 0, duration: 0.3, ease: 'power1.in' }, out + i * 0.04)
      })
      wisps.forEach((path, i) => undraw(tl, path, out + i * 0.05, 0.35))
      finish(kit, tl, out + 0.45)
    },
  })

  // 6 · loupe: a ring draws off the fingertip and a detail image scales up inside it
  defineGraphic('loupe', {
    title: 'แว่นขยาย · Loupe',
    place: 'spot',
    sound: [['blip', 0], ['whoosh-high', 0.2]],
    sample: { data: { caption: 'หัวฉีดโลหะ ฉีดละเอียด' }, ...SAMPLE, image: '/overlay/perfume.png' },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p, s } = f
      const D = 30 * vh
      const cx = clamp(p.x + s * (D / 2 + 9 * vh), f.L + D / 2, f.R - D / 2)
      const cy = clamp(p.y - 9 * vh, f.T + D / 2, f.B - D / 2 - 6 * vh)
      const svg = f.svg()
      const lens = kit.el('div', 'g-loupe-lens')
      Object.assign(lens.style, { left: cx - D / 2 + 'px', top: cy - D / 2 + 'px', width: D + 'px', height: D + 'px' })
      const img = kit.image ? kit.el('img', 'g-loupe-img', null, lens) : null
      if (img) img.src = kit.image
      const rr = D / 2 + 0.8 * vh
      const ring = stroke(svg, `M${r1(cx)},${r1(cy - rr)}a${r1(rr)},${r1(rr)} 0 1 ${s > 0 ? 1 : 0} 0,${r1(2 * rr)}a${r1(rr)},${r1(rr)} 0 1 ${s > 0 ? 1 : 0} 0,${r1(-2 * rr)}`, 'g-loupe-ring')
      const ang = Math.atan2(cy - p.y, cx - p.x)
      const near = [cx - Math.cos(ang) * rr, cy - Math.sin(ang) * rr]
      const from = [p.x + Math.cos(ang) * 1.6 * vh, p.y + Math.sin(ang) * 1.6 * vh]
      const link = stroke(svg, poly([from, near]), 'g-loupe-link')
      const dot = kit.el('i', 'g-loupe-dot')
      Object.assign(dot.style, { left: p.x + 'px', top: p.y + 'px' })
      const cap = data.caption ? kit.el('div', 'g-loupe-cap', data.caption) : null
      if (cap) f.put(cap, cx, cy + D / 2 + 2 * vh, 0.5, 0)

      tl.fromTo(dot, { scale: 0, xPercent: -50, yPercent: -50 }, { scale: 1, xPercent: -50, yPercent: -50, duration: 0.2, ease: 'back.out(2)' }, 0)
      draw(tl, link, 0.08, 0.2, 'power2.out')
      draw(tl, ring, 0.2, 0.4)
      tl.fromTo(lens, { clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(50% at 50% 50%)', duration: 0.4, ease: 'power3.out' }, 0.22)
      const out = 0.62 + f.hold
      if (img) tl.fromTo(img, { scale: 0.7 }, { scale: 1.6, duration: 0.5, ease: 'power3.out' }, 0.22).to(img, { scale: 1.75, duration: out - 0.72, ease: 'none' }, 0.72)
      if (cap) {
        tl.fromTo(cap, { opacity: 0, y: -1 * vh }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }, 0.45)
        tl.to(cap, { opacity: 0, duration: 0.2 }, out)
      }
      tl.to(lens, { clipPath: 'circle(0% at 50% 50%)', duration: 0.35, ease: 'power2.in' }, out)
      undraw(tl, ring, out + 0.05, 0.35)
      undraw(tl, link, out + 0.15, 0.2)
      tl.to(dot, { scale: 0, duration: 0.15 }, out + 0.3)
      finish(kit, tl, out + 0.45)
    },
  })

  // 7 · tick rulers run along the product edges with the dimensions
  defineGraphic('size-ruler', {
    title: 'ไม้บรรทัดขนาด · Size ruler',
    place: 'spot',
    sound: [['swipe', 0], ['click', 0.35]],
    sample: { data: { width: '6 ซม.', height: '12 ซม.', volume: '50 ml' }, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, b, s } = f
      const gap = 2.5 * vh
      const below = b.y + b.h + gap + 6 * vh < f.B
      const rulers = []
      // one ruler: a div wrapping its own svg so it can wipe on with clip-path
      const ruler = (horizontal, len, flipTicks) => {
        const thick = 3 * vh
        const box = kit.el('div', 'g-size-ruler-rule')
        const w = horizontal ? len : thick
        const h = horizontal ? thick : len
        Object.assign(box.style, { width: w + 'px', height: h + 'px' })
        const svg = S('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}` }, box)
        const n = Math.max(4, Math.round(len / (1.4 * vh)))
        let d = horizontal ? `M0,${thick / 2}H${len}M0,0V${thick}M${len},0V${thick}` : `M${thick / 2},0V${len}M0,0H${thick}M0,${len}H${thick}`
        for (let i = 1; i < n; i++) {
          const at = r1((len * i) / n)
          const tk = (i % 5 === 0 ? 0.5 : 0.25) * thick
          const base = thick / 2
          const tip = flipTicks ? base + tk : base - tk
          d += horizontal ? `M${at},${base}V${r1(tip)}` : `M${base},${at}H${r1(tip)}`
        }
        S('path', { d, class: 'g-size-ruler-ticks' }, svg)
        rulers.push({ box, horizontal })
        return box
      }
      const labels = []
      const chip = (k, v) => {
        const node = kit.el('div', 'g-size-ruler-chip')
        kit.el('span', 'g-size-ruler-k', k, node)
        kit.el('b', null, v, node)
        labels.push(node)
        return node
      }
      if (data.width) {
        const y = below ? b.y + b.h + gap : b.y - gap
        const box = ruler(true, b.w, !below)
        Object.assign(box.style, { left: b.x + 'px', top: y - 1.5 * vh + 'px' })
        f.put(chip('กว้าง', data.width), b.x + b.w / 2, below ? y + 2.4 * vh : y - 2.4 * vh, 0.5, below ? 0 : 1)
      }
      if (data.height) {
        const x = s > 0 ? b.x + b.w + gap : b.x - gap
        const box = ruler(false, b.h, s < 0)
        Object.assign(box.style, { left: x - 1.5 * vh + 'px', top: b.y + 'px' })
        f.put(chip('สูง', data.height), x + s * 2.4 * vh, b.y + b.h / 2, s > 0 ? 0 : 1, 0.5)
      }
      if (data.volume) f.put(chip('ปริมาณ', data.volume), s > 0 ? b.x + b.w + gap : b.x - gap, b.y - 1.5 * vh, s > 0 ? 0 : 1, 1)
      rulers.forEach(({ box, horizontal }, i) => {
        tl.fromTo(box, { clipPath: horizontal ? 'inset(0% 100% 0% 0%)' : 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.42, ease: 'power3.inOut' }, i * 0.1)
      })
      labels.forEach((node, i) => tl.fromTo(node, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)' }, 0.32 + i * 0.08))
      const out = 0.6 + f.hold
      labels.forEach((node) => tl.to(node, { opacity: 0, duration: 0.2, ease: 'power1.in' }, out))
      rulers.forEach(({ box, horizontal }) => tl.to(box, { clipPath: horizontal ? 'inset(0% 0% 0% 100%)' : 'inset(100% 0% 0% 0%)', duration: 0.3, ease: 'power2.in' }, out + 0.12))
      finish(kit, tl, out + 0.45)
    },
  })

  // 8 · product card flies in from the nearest edge and snaps onto the fingertip on a leader
  defineGraphic('magnet-snap', {
    title: 'การ์ดดูดติดนิ้ว · Magnet snap',
    place: 'spot',
    sound: [['whoosh', 0], ['click', 0.4]],
    sample: { data: { name: 'น้ำหอม Aurum 50 ml', price: 2490 }, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p, s } = f
      const lead = kit.el('i', 'g-magnet-snap-lead')
      const mover = kit.el('div', 'g-magnet-snap-mover')
      const card = kit.el('div', 'g-panel g-magnet-snap-card', null, mover)
      kit.el('div', 'g-sub', data.name, card)
      kit.el('div', 'g-magnet-snap-price', priceText(kit, data.price), card)
      const at = f.put(mover, p.x + s * 7 * vh, p.y, s > 0 ? 0 : 1, 0.5)
      const dot = kit.el('i', 'g-magnet-snap-dot')
      Object.assign(dot.style, { left: p.x + 'px', top: p.y + 'px' })
      // leader spans fingertip → card edge; scaling it with the card's ease keeps its end on the card
      const edge = s > 0 ? at.x : at.x + at.w
      const len = Math.max(1, Math.abs(edge - p.x))
      const ly = clamp(p.y, at.y + 1.5 * vh, at.y + at.h - 1.5 * vh)
      Object.assign(lead.style, { left: Math.min(edge, p.x) + 'px', top: ly + 'px', width: len + 'px', transformOrigin: s > 0 ? '0% 50%' : '100% 50%' })
      const travel = s > 0 ? f.W + 2 * vh - at.x : -at.w - 2 * vh - at.x
      tl.fromTo(mover, { x: travel }, { x: 0, duration: 0.55, ease: 'back.out(2.2)' }, 0)
      tl.fromTo(lead, { scaleX: (len + Math.abs(travel)) / len }, { scaleX: 1, duration: 0.55, ease: 'back.out(2.2)' }, 0)
      tl.fromTo(card, { rotation: s * 7 }, { rotation: 0, duration: 0.6, ease: 'back.out(3)' }, 0)
      tl.fromTo(lead, { opacity: 0 }, { opacity: 1, duration: 0.15 }, 0.05)
      tl.fromTo(dot, { scale: 0, xPercent: -50, yPercent: -50 }, { scale: 1, xPercent: -50, yPercent: -50, duration: 0.2, ease: 'back.out(3)' }, 0.38)
      const out = 0.6 + f.hold
      tl.to(card, { scale: 0.85, opacity: 0, duration: 0.3, ease: 'power2.in', transformOrigin: s > 0 ? '0% 50%' : '100% 50%' }, out)
      tl.to(lead, { scaleX: 0, duration: 0.3, ease: 'power2.in' }, out + 0.1)
      tl.to(dot, { scale: 0, duration: 0.15 }, out + 0.25)
      finish(kit, tl, out + 0.45)
    },
  })

  // 9 · product cutout builds up in scan slices above the palm, floats, then collapses
  defineGraphic('palm-materialize', {
    title: 'ของลอยเหนือมือ · Palm materialize',
    place: 'spot',
    sound: [['riser', 0], ['sparkle', 0.45]],
    sample: { data: { name: 'น้ำหอม Aurum' }, ...SAMPLE, image: '/overlay/perfume.png' },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p } = f
      const w = 24 * vh
      const h = 34 * vh
      const N = 12
      const sh = h / N
      const pad = kit.el('i', 'g-palm-materialize-pad')
      Object.assign(pad.style, { left: p.x + 'px', top: p.y + 'px' })
      const wrap = kit.el('div', 'g-palm-materialize-wrap')
      Object.assign(wrap.style, { width: w + 'px', height: h + 'px' })
      f.put(wrap, p.x, p.y - 3 * vh, 0.5, 1)
      const slices = []
      for (let i = 0; i < N; i++) {
        const slice = kit.el('div', 'g-palm-materialize-slice', null, wrap)
        Object.assign(slice.style, { top: i * sh + 'px', height: sh + 1 + 'px' })
        const inner = kit.el('div', 'g-palm-materialize-inner', null, slice)
        Object.assign(inner.style, { top: -i * sh + 'px', width: w + 'px', height: h + 'px' })
        if (kit.image) kit.el('img', null, null, inner).src = kit.image
        else kit.el('div', 'g-palm-materialize-name', data.name, inner)
        slices.push(slice)
      }
      const scan = kit.el('i', 'g-palm-materialize-scan', null, wrap)
      tl.fromTo(pad, { scale: 0, xPercent: -50, yPercent: -50, opacity: 0 }, { scale: 1, xPercent: -50, yPercent: -50, opacity: 1, duration: 0.3, ease: 'power3.out' }, 0)
      ;[...slices].reverse().forEach((slice, i) => tl.fromTo(slice, { opacity: 0, scaleX: 0.2 }, { opacity: 1, scaleX: 1, duration: 0.22, ease: 'power3.out' }, 0.05 + i * 0.03))
      tl.fromTo(scan, { y: h, opacity: 1 }, { y: 0, opacity: 1, duration: 0.45, ease: 'none' }, 0.05).to(scan, { opacity: 0, duration: 0.1 }, 0.5)
      const out = 0.6 + f.hold
      tl.fromTo(wrap, { y: 0 }, { y: -1.2 * vh, duration: f.hold / 2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0.6)
      slices.forEach((slice, i) => tl.to(slice, { scaleY: 0, opacity: 0, duration: 0.2, ease: 'power2.in' }, out + i * 0.02))
      tl.to(pad, { scale: 0, opacity: 0, duration: 0.25, ease: 'power2.in' }, out + 0.15)
      finish(kit, tl, out + 0.45)
    },
  })

  // 10 · feature chips swing in on an arc around the hand
  defineGraphic('orbit-chips', {
    title: 'ชิปโคจรรอบมือ · Orbit chips',
    place: 'spot',
    sound: [['swoosh', 0.05], ['pop', 0.55]],
    sample: { data: { chips: ['ติดทน 8 ชม.', 'กลิ่นไม่ฉุน', 'ขวดพกพา'] }, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p, s } = f
      const R = 20 * vh
      const deg = Math.PI / 180
      const svg = f.svg()
      const arcPts = []
      for (let a = -75; a <= 55; a += 10) arcPts.push([p.x + s * Math.cos(a * deg) * R, p.y + Math.sin(a * deg) * R])
      const arc = stroke(svg, smooth(arcPts), 'g-orbit-chips-arc')
      draw(tl, arc, 0, 0.45, 'power2.out')
      const finals = [-52, -14, 24]
      const chips = [].concat(data.chips ?? []).filter(Boolean).slice(0, 3)
      const out = 0.7 + f.hold
      const mirror = (a) => (s > 0 ? a : 180 - a)
      chips.forEach((text, i) => {
        const arm = kit.el('div', 'g-orbit-chips-arm')
        Object.assign(arm.style, { left: p.x + 'px', top: p.y + 'px' })
        const holder = kit.el('div', 'g-orbit-chips-holder', null, arm)
        holder.style.left = R + 1.2 * vh + 'px'
        const chip = kit.el('div', 'g-orbit-chips-chip', null, holder)
        kit.el('i', null, null, chip)
        kit.el('span', null, text, chip)
        const w = chip.offsetWidth
        const h = chip.offsetHeight
        // settle position clamped into the safe area; the offset rides along the whole swing
        const a = mirror(finals[i]) * deg
        const x = p.x + Math.cos(a) * (R + 1.2 * vh) - (s > 0 ? 0 : w)
        const y = p.y + Math.sin(a) * (R + 1.2 * vh) - h / 2
        chip.style.transform = `translate(${r1(clamp(x, f.L, f.R - w) - x - (s > 0 ? 0 : w))}px,${r1(clamp(y, f.T, f.B - h) - y - h / 2)}px)`
        const [from, to, away] = [finals[i] - 95, finals[i], finals[i] + 35].map(mirror)
        const t = 0.05 + i * 0.1
        tl.fromTo(arm, { rotation: from }, { rotation: to, duration: 0.55, ease: 'power3.out' }, t)
        tl.fromTo(holder, { rotation: -from }, { rotation: -to, duration: 0.55, ease: 'power3.out' }, t)
        tl.fromTo(chip, { opacity: 0 }, { opacity: 1, duration: 0.2 }, t)
        tl.to(arm, { rotation: away, duration: 0.4, ease: 'power2.in' }, out + i * 0.04)
        tl.to(holder, { rotation: -away, duration: 0.4, ease: 'power2.in' }, out + i * 0.04)
        tl.to(chip, { opacity: 0, duration: 0.3, ease: 'power1.in' }, out + 0.08 + i * 0.04)
      })
      undraw(tl, arc, out, 0.4)
      finish(kit, tl, out + 0.5)
    },
  })

  // 11 · colour drops fall from the fingertip and land as a labelled shade row
  defineGraphic('swatch-drop', {
    title: 'หยดเฉดสี · Swatch drop',
    place: 'spot',
    sound: [['water', 0.3]],
    sample: {
      data: {
        shades: [
          { hex: '#b4544a', name: 'อิฐ' },
          { hex: '#c97b6b', name: 'โรสวู้ด' },
          { hex: '#d9a089', name: 'พีช' },
          { hex: '#8e3b46', name: 'เบอร์รี่' },
        ],
      },
      ...SAMPLE,
    },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p } = f
      const shades = [].concat(data.shades ?? []).filter((sh) => sh && HEX.test(sh.hex)).slice(0, 5)
      const row = kit.el('div', 'g-panel g-swatch-drop-row')
      const items = shades.map((sh) => {
        const item = kit.el('div', 'g-swatch-drop-item', null, row)
        const chip = kit.el('i', 'g-swatch-drop-chip', null, item)
        chip.style.backgroundColor = sh.hex
        const name = kit.el('span', 'g-swatch-drop-name', sh.name, item)
        return { chip, name, hex: sh.hex }
      })
      const below = p.y + 9 * vh + row.offsetHeight < f.B
      const at = f.put(row, p.x, below ? p.y + 8 * vh : p.y - 8 * vh, 0.5, below ? 0 : 1)
      tl.fromTo(row, { opacity: 0, y: 1 * vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.05)
      items.forEach(({ chip, name, hex }, i) => {
        const cx = at.x + chip.offsetLeft + chip.offsetWidth / 2
        const cy = at.y + chip.offsetTop + chip.offsetHeight / 2
        const drop = kit.el('i', 'g-swatch-drop-drop')
        Object.assign(drop.style, { left: p.x + 'px', top: p.y + 'px', backgroundColor: hex })
        const t = i * 0.08
        tl.fromTo(drop, { x: 0, opacity: 0, scale: 0.4, rotation: -45, xPercent: -50, yPercent: -50 }, { x: cx - p.x, opacity: 1, scale: 1, rotation: -45, xPercent: -50, yPercent: -50, duration: 0.36, ease: 'power1.out' }, t)
        tl.fromTo(drop, { y: 0 }, { y: cy - p.y, duration: 0.36, ease: 'power2.in' }, t)
        tl.to(drop, { opacity: 0, duration: 0.05 }, t + 0.36)
        tl.fromTo(chip, { opacity: 0 }, { opacity: 1, duration: 0.01 }, t + 0.34)
        tl.fromTo(chip, { scaleX: 0.4, scaleY: 0.3 }, { scaleX: 1, scaleY: 1, duration: 0.3, ease: 'back.out(2.6)' }, t + 0.34)
        tl.fromTo(name, { opacity: 0 }, { opacity: 1, duration: 0.2 }, t + 0.4)
      })
      const out = 0.08 * Math.max(0, items.length - 1) + 0.7 + f.hold
      items.forEach(({ chip, name }, i) => {
        tl.to(chip, { scaleX: 0, scaleY: 0, duration: 0.2, ease: 'power2.in' }, out + i * 0.04)
        tl.to(name, { opacity: 0, duration: 0.15 }, out + i * 0.04)
      })
      tl.to(row, { opacity: 0, y: 1 * vh, duration: 0.25, ease: 'power2.in' }, out + 0.2)
      finish(kit, tl, out + 0.45)
    },
  })

  // 12 · a teardrop map pin drops onto the fingertip with a squash, price inside
  defineGraphic('price-pin', {
    title: 'หมุดราคา · Price pin',
    place: 'spot',
    sound: [['thud', 0.32], ['cash', 0.45]],
    sample: { data: { price: 2490 }, ...SAMPLE },
    presets: {
      live: { title: 'หมุดราคาไลฟ์ · Price pin live', data: { label: 'ราคาไลฟ์' } },
    },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p } = f
      const a = 14 * vh
      const drop = a * 0.707 + a / 2 + 0.6 * vh
      const tipY = Math.max(p.y, f.T + drop)
      const wrap = kit.el('div', 'g-price-pin-wrap')
      Object.assign(wrap.style, { width: a + 'px', height: a + 'px', left: clamp(p.x, f.L + a / 2, f.R - a / 2) - a / 2 + 'px', top: tipY - drop + 'px', transformOrigin: `50% ${r1(drop)}px` })
      kit.el('i', 'g-price-pin-body', null, wrap)
      const face = kit.el('div', 'g-price-pin-face', null, wrap)
      if (data.label) kit.el('span', 'g-price-pin-label', data.label, face)
      kit.el('b', 'g-price-pin-price', priceText(kit, data.price), face)
      const shadow = kit.el('i', 'g-price-pin-shadow')
      Object.assign(shadow.style, { left: p.x + 'px', top: tipY + 'px' })
      tl.fromTo(wrap, { y: -30 * vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: 'power2.in' }, 0)
      tl.fromTo(wrap, { scaleX: 1, scaleY: 1 }, { scaleX: 1.12, scaleY: 0.84, duration: 0.08, ease: 'power1.out' }, 0.32)
      tl.to(wrap, { scaleX: 1, scaleY: 1, duration: 0.3, ease: 'back.out(3)' }, 0.4)
      tl.fromTo(shadow, { scale: 0.2, opacity: 0, xPercent: -50, yPercent: -50 }, { scale: 1, opacity: 1, xPercent: -50, yPercent: -50, duration: 0.32, ease: 'power2.in' }, 0)
      const out = 0.7 + f.hold
      tl.to(wrap, { y: -2 * vh, opacity: 0, scale: 0.9, duration: 0.3, ease: 'power2.in' }, out)
      tl.to(shadow, { opacity: 0, scale: 0.4, duration: 0.3 }, out)
      finish(kit, tl, out + 0.4)
    },
  })

  // 13 · a polaroid falls from the fingertip, tilts and develops from blank to full colour
  defineGraphic('polaroid-drop', {
    title: 'โพลารอยด์ · Polaroid drop',
    place: 'spot',
    sound: [['shutter', 0], ['paper', 0.4]],
    sample: { data: { caption: 'Aurum ขวดจริง สวยมาก' }, ...SAMPLE, image: '/overlay/product.jpg' },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p, s } = f
      const card = kit.el('div', 'g-polaroid-drop-card')
      const photo = kit.el('div', 'g-polaroid-drop-photo', null, card)
      const img = kit.image ? kit.el('img', null, null, photo) : null
      if (img) img.src = kit.image
      const veil = kit.el('i', 'g-polaroid-drop-veil', null, photo)
      kit.el('div', 'g-polaroid-drop-cap', data.caption ?? '', card)
      const at = f.put(card, p.x + s * 18 * vh, p.y + 4 * vh, 0.5, 0.5)
      const dx = p.x - (at.x + at.w / 2)
      const dy = p.y - (at.y + at.h / 2)
      tl.fromTo(card, { x: dx, y: dy, scale: 0.2, rotation: 0, opacity: 0 }, { x: 0, y: 0, scale: 1, rotation: s * 5, opacity: 1, duration: 0.55, ease: 'power3.out' }, 0)
      tl.to(card, { rotation: s * 3.5, duration: 0.5, ease: 'sine.inOut' }, 0.55)
      tl.fromTo(veil, { opacity: 1 }, { opacity: 0, duration: 1.4, ease: 'power1.inOut' }, 0.5)
      if (img) tl.fromTo(img, { filter: 'saturate(0) brightness(1.4) contrast(0.7)' }, { filter: 'saturate(1) brightness(1) contrast(1)', duration: 1.6, ease: 'power1.out' }, 0.5)
      const out = 0.6 + Math.max(f.hold, 1.6)
      tl.to(card, { y: 5 * vh, rotation: s * 10, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
      finish(kit, tl, out + 0.4)
    },
  })

  // 14 · two thin rings ripple once from the fingertip (attention ping, no hold)
  defineGraphic('tap-ripple', {
    title: 'แตะกระเพื่อม · Tap ripple',
    place: 'spot',
    sound: [['ping', 0]],
    themes: false, // two hairline rings; colour variants would be indistinguishable
    sample: { data: {}, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const dot = kit.el('i', 'g-tap-ripple-dot')
      Object.assign(dot.style, { left: f.p.x + 'px', top: f.p.y + 'px' })
      tl.fromTo(dot, { scale: 0, xPercent: -50, yPercent: -50 }, { scale: 1, xPercent: -50, yPercent: -50, duration: 0.18, ease: 'back.out(3)' }, 0)
      ;[0.05, 0.27].forEach((t) => {
        const ring = kit.el('i', 'g-tap-ripple-ring')
        Object.assign(ring.style, { left: f.p.x + 'px', top: f.p.y + 'px' })
        // size, not scale, so the hairline keeps its weight as it grows
        tl.fromTo(ring, { width: '2.4vh', height: '2.4vh', xPercent: -50, yPercent: -50 }, { width: '18vh', height: '18vh', xPercent: -50, yPercent: -50, duration: 0.85, ease: 'power2.out' }, t)
        tl.fromTo(ring, { opacity: 1 }, { opacity: 0, duration: 0.85, ease: 'power2.in' }, t)
      })
      tl.to(dot, { scale: 0, duration: 0.2, ease: 'power2.in' }, 0.95)
      finish(kit, tl, 1.2)
    },
  })

  // 15 · a light cone from the fingertip projects a translucent card
  defineGraphic('hologram-card', {
    title: 'การ์ดโฮโลแกรม · Hologram card',
    place: 'spot',
    sound: [['whoosh-high', 0.05], ['shimmer', 0.3]],
    sample: { data: { name: 'น้ำหอม Aurum 50 ml', price: 2490, label: 'ราคาไลฟ์' }, ...SAMPLE },
    build(kit, data, tl) {
      const f = frame(kit)
      const { vh, p } = f
      const cone = kit.el('i', 'g-hologram-card-cone')
      const card = kit.el('div', 'g-hologram-card-card')
      const scan = kit.el('i', 'g-hologram-card-scan', null, card)
      if (data.label) kit.el('div', 'g-hologram-card-label', data.label, card)
      kit.el('div', 'g-hologram-card-name', data.name, card)
      kit.el('div', 'g-hologram-card-price', priceText(kit, data.price), card)
      const at = f.put(card, p.x, p.y - 15 * vh, 0.5, 1)
      const top = at.y + at.h
      const left = Math.min(at.x, p.x - vh)
      const width = Math.max(at.x + at.w, p.x + vh) - left
      const height = Math.max(0, p.y - top)
      const px = (n) => r1(n - left) + 'px'
      Object.assign(cone.style, {
        left: left + 'px',
        top: top + 'px',
        width: width + 'px',
        height: height + 'px',
        clipPath: `polygon(${px(at.x + at.w * 0.06)} 0, ${px(at.x + at.w * 0.94)} 0, ${px(p.x + 0.5 * vh)} 100%, ${px(p.x - 0.5 * vh)} 100%)`,
        transformOrigin: `${px(p.x)} 100%`,
      })
      const dot = kit.el('i', 'g-hologram-card-dot')
      Object.assign(dot.style, { left: p.x + 'px', top: p.y + 'px' })
      tl.fromTo(dot, { scale: 0, xPercent: -50, yPercent: -50 }, { scale: 1, xPercent: -50, yPercent: -50, duration: 0.15 }, 0)
      tl.fromTo(cone, { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.05)
      tl.fromTo(card, { scaleX: 0.4, scaleY: 0.04, opacity: 0 }, { scaleX: 1, scaleY: 0.04, opacity: 1, duration: 0.16, ease: 'power2.out' }, 0.22)
      tl.to(card, { scaleY: 1, duration: 0.24, ease: 'power3.out' }, 0.38)
      tl.to(card, { opacity: 0.6, duration: 0.04, yoyo: true, repeat: 1 }, 0.64)
      const out = 0.72 + f.hold
      tl.fromTo(scan, { backgroundPositionY: '0vh' }, { backgroundPositionY: '4vh', duration: out, ease: 'none' }, 0)
      tl.to(card, { scaleY: 0.04, duration: 0.2, ease: 'power2.in' }, out)
      tl.to(card, { opacity: 0, scaleX: 0.4, duration: 0.15, ease: 'power2.in' }, out + 0.2)
      tl.to(cone, { scaleY: 0, opacity: 0, duration: 0.3, ease: 'power2.in' }, out + 0.1)
      tl.to(dot, { scale: 0, duration: 0.15 }, out + 0.3)
      finish(kit, tl, out + 0.45)
    },
  })
})()
