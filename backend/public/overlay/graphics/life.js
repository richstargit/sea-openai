// Life graphics: cooking, fitness, events, music and travel (not selling). Stationery look —
// paper cards, hand-drawn strokes, editorial serif / script type, gentle physical motion.
// Every tween sits on the paused timeline at an explicit time (seek-safe); hold = ttl (default 2.4 s).
;(() => {
  const NS = 'http://www.w3.org/2000/svg'
  const hold = (kit) => kit.hold ?? 2.4
  const r1 = (n) => Math.round(n * 10) / 10
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const list = (v) => [].concat(v ?? []).map((s) => String(s ?? '').trim()).filter(Boolean)
  const mmss = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')

  // svg nodes from computed numbers only (event text never goes into markup)
  function S(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v)
    parent.append(node)
    return node
  }
  const svgIn = (parent, w, h, cls) => S('svg', { viewBox: `0 0 ${r1(w)} ${r1(h)}`, class: cls, 'aria-hidden': 'true' }, parent)
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
  // a pen circle that overshoots its start a little
  function penRing(cx, cy, rx, ry, rnd, turns = 1.1) {
    const n = 26
    const a0 = -2.3 + rnd() * 0.5
    const pts = []
    for (let i = 0; i <= Math.round(n * turns); i++) {
      const a = a0 + (i / n) * Math.PI * 2
      const k = 1 + (rnd() - 0.5) * 0.05 + (i / n) * 0.05
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k])
    }
    return smooth(pts)
  }
  // a pen rectangle: four slightly bowed strokes that cross at the corners
  function penRect(w, h, rnd, pad = 2) {
    const j = () => (rnd() - 0.5) * pad
    const o = pad
    return [
      `M${r1(-o + j())},${r1(j())} Q${r1(w / 2)},${r1(j() * 2)} ${r1(w + o + j())},${r1(j())}`,
      `M${r1(w + j())},${r1(-o + j())} Q${r1(w + j() * 2)},${r1(h / 2)} ${r1(w + j())},${r1(h + o + j())}`,
      `M${r1(w + o + j())},${r1(h + j())} Q${r1(w / 2)},${r1(h + j() * 2)} ${r1(-o + j())},${r1(h + j())}`,
      `M${r1(j())},${r1(h + o + j())} Q${r1(j() * 2)},${r1(h / 2)} ${r1(j())},${r1(-o + j())}`,
    ].join(' ')
  }
  function pen(svg, d, cls) {
    const path = S('path', { d, class: cls, pathLength: 1, fill: 'none' }, svg)
    path.style.strokeDasharray = '1 1'
    path.style.strokeDashoffset = '1'
    return path
  }
  // opacity guards the round-cap dot a zero-length dash still paints
  function draw(tl, path, at, duration, ease = 'power2.inOut') {
    tl.fromTo(path, { opacity: 0 }, { opacity: 1, duration: 0.01 }, at)
    tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration, ease }, at)
  }
  // one linear clock over [0, end]: fn(t) derives every timeline-driven readout (seek-safe setter)
  function clock(tl, end, fn) {
    let t = 0
    const proxy = {
      get t() {
        return t
      },
      set t(next) {
        t = next
        fn(next)
      },
    }
    tl.fromTo(proxy, { t: 0 }, { t: end, duration: end, ease: 'none' }, 0)
  }
  const masked = (kit, parent, cls, text) => kit.el('span', null, text, kit.el('span', 'g-mask ' + cls, null, parent))
  const rise = (tl, node, at, duration = 0.4) => tl.fromTo(node, { yPercent: 110 }, { yPercent: 0, duration, ease: 'power3.out' }, at)
  // safety net: the root is invisible at the timeline's end whatever the exits did
  const finish = (kit, tl, end) => tl.fromTo(kit.root, { opacity: 1 }, { opacity: 0, duration: 0.05, immediateRender: false }, end - 0.05)

  // 1 · recipe step: inked circle around the step number, instruction, ingredient tags
  const recipe = { step: 3, text: 'ผัดกระเทียมกับพริกให้หอม แล้วใส่หมูสับลงไปผัดจนสุก', items: ['กระเทียม 5 กลีบ', 'พริกขี้หนู 8 เม็ด', 'หมูสับ 200 ก.'] }
  defineGraphic('recipe-step', {
    title: 'ขั้นตอนทำอาหาร · Recipe step',
    place: 'lower',
    sound: [['paper', 0], ['pop', 0.2], ['click-soft', 0.5]],
    defaults: { step: 1 },
    sample: { data: recipe },
    presets: {
      bake: { title: 'ขั้นตอนทำขนม · Baking step', data: { step: 2, text: 'ร่อนแป้งเค้กกับผงฟู แล้วตะล่อมเข้ากับเนยที่ตีจนฟู', items: ['แป้งเค้ก 150 ก.', 'ผงฟู 1 ช้อนชา', 'เนยจืด 100 ก.'] } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const card = kit.el('div', 'lf-card wrap')
      const badge = kit.el('div', 'badge', null, card)
      const ring = pen(svgIn(badge, 100, 100, 'ring'), penRing(50, 52, 40, 38, kit.rng(3)), 'ink')
      const num = kit.el('span', 'num', String(data.step ?? ''), badge)
      const body = kit.el('div', 'body', null, card)
      const label = masked(kit, body, 'label', `ขั้นตอนที่ ${data.step ?? ''}`)
      const line = masked(kit, body, 'line', data.text ?? '')
      const items = list(data.items).slice(0, 5)
      const chips = kit.el('div', 'chips', null, body)
      const tags = items.map((item) => {
        const chip = kit.el('span', 'chip', null, chips)
        kit.el('i', null, null, chip)
        kit.el('span', null, item, chip)
        return chip
      })
      if (!items.length) chips.remove()
      tl.fromTo(card, { y: 3 * vh, rotation: -1.2, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 0.45, ease: 'power3.out' }, 0)
      draw(tl, ring, 0.12, 0.5)
      tl.fromTo(num, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, 0.15)
      rise(tl, label, 0.18, 0.35)
      rise(tl, line, 0.26)
      tags.forEach((chip, i) => tl.fromTo(chip, { y: 1.5 * vh, opacity: 0, rotation: i % 2 ? 5 : -5 }, { y: 0, opacity: 1, rotation: 0, duration: 0.35, ease: 'back.out(1.8)' }, 0.42 + i * 0.07))
      const out = 0.6 + hold(kit)
      tl.to(card, { y: 2 * vh, opacity: 0, duration: 0.35, ease: 'power2.in' }, out)
    },
  })

  // 2 · ingredient checklist: a taped notepad page, items ticked one by one with pen checks
  const pantry = { title: 'ของที่ต้องเตรียม', items: ['ข้าวสวย 2 ถ้วย', 'ไข่ไก่ 3 ฟอง', 'ซีอิ๊วขาว 1 ช้อนโต๊ะ', 'ต้นหอมซอย', 'น้ำมันพืช'] }
  defineGraphic('ingredient-checklist', {
    title: 'เช็กลิสต์วัตถุดิบ · Ingredient checklist',
    place: 'corner',
    defaults: { title: 'ของที่ต้องเตรียม' },
    sample: { data: pantry },
    presets: {
      packing: { title: 'เช็กลิสต์จัดกระเป๋า · Packing list', data: { title: 'ของต้องพกไปทริป', items: ['พาวเวอร์แบงก์', 'ครีมกันแดด', 'ร่มพับ', 'บัตรประชาชน'] } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const pad = kit.el('div', 'lf-card pad')
      const tape = kit.el('i', 'tape', null, pad)
      const title = masked(kit, pad, 'title', data.title)
      const rnd = kit.rng(11)
      const rows = list(data.items).slice(0, 8).map((item) => {
        const row = kit.el('div', 'row', null, pad)
        const svg = svgIn(row, 40, 40, 'box')
        const box = pen(svg, penRect(30, 30, rnd, 1.5), 'frame')
        box.setAttribute('transform', 'translate(5 7)')
        const check = pen(svg, 'M7,22 C10,25 13,29 16,32 C21,22 27,12 37,3', 'check')
        const label = kit.el('span', 'item', item, row)
        return { row, box, check, label }
      })
      tl.fromTo(pad, { y: -4 * vh, rotation: 3, opacity: 0 }, { y: 0, rotation: -1, opacity: 1, duration: 0.5, ease: 'back.out(1.4)' }, 0)
      tl.fromTo(tape, { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: 'power2.out' }, 0.28)
      rise(tl, title, 0.15)
      rows.forEach(({ row, box }, i) => {
        tl.fromTo(row, { x: -1 * vh, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.2 + i * 0.05)
        draw(tl, box, 0.2 + i * 0.05, 0.35)
      })
      kit.sound('paper', 0)
      const step = clamp((hold(kit) - 0.6) / Math.max(1, rows.length), 0.18, 0.45)
      rows.forEach(({ check, label }, i) => {
        const at = 0.65 + i * step
        draw(tl, check, at, 0.22, 'power2.out')
        tl.fromTo(label, { opacity: 1 }, { opacity: 0.5, duration: 0.2, immediateRender: false }, at + 0.1)
        kit.sound('click-soft', at)
      })
      const out = Math.max(0.6 + hold(kit), 0.65 + rows.length * step + 0.35)
      tl.to(pad, { y: 3 * vh, rotation: 2, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
    },
  })

  // 3 · kitchen timer: the dial winds up to the set time, then ticks down in real seconds
  defineGraphic('cooking-timer', {
    title: 'นาฬิกาจับเวลาทำอาหาร · Cooking timer',
    place: 'corner',
    defaults: { seconds: 300, label: 'ต้มเส้นก๋วยเตี๋ยว' },
    sample: { data: { seconds: 300, label: 'ต้มเส้นก๋วยเตี๋ยว' } },
    presets: {
      egg: { title: 'จับเวลาต้มไข่ · Egg timer', data: { seconds: 420, label: 'ต้มไข่ยางมะตูม' } },
      pinned: { title: 'จับเวลาค้างจอ · Pinned timer', data: { seconds: 600, label: 'อบขนมปัง', persist: true } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const total = Math.max(1, Math.round(Number(data.seconds)) || 60)
      const card = kit.el('div', 'lf-card wrap')
      const svg = svgIn(card, 100, 100, 'dial')
      S('circle', { cx: 50, cy: 50, r: 47, class: 'face' }, svg)
      for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2
        const r0 = i % 5 ? 42 : 38.5
        S('line', { x1: r1(50 + Math.sin(a) * r0), y1: r1(50 - Math.cos(a) * r0), x2: r1(50 + Math.sin(a) * 45), y2: r1(50 - Math.cos(a) * 45), class: i % 5 ? 'minor' : 'major' }, svg)
      }
      const wedge = S('circle', { cx: 50, cy: 50, r: 17, class: 'wedge', pathLength: 100, transform: 'rotate(-90 50 50)' }, svg)
      const hand = S('line', { x1: 50, y1: 50, x2: 50, y2: 13, class: 'hand' }, svg)
      S('circle', { cx: 50, cy: 50, r: 5.5, class: 'knob' }, svg)
      const copy = kit.el('div', 'copy', null, card)
      const label = kit.el('div', 'label', data.label, copy)
      const time = kit.el('div', 'time', mmss(total), copy)
      kit.el('div', 'set', `ตั้งไว้ ${total >= 60 ? Math.round(total / 60) + ' นาที' : total + ' วินาที'}`, copy)
      time.style.minWidth = time.offsetWidth + 'px'
      const wind = gsap.parseEase('power2.inOut')
      const T0 = 0.9
      const D = data.persist ? total : Math.min(total, hold(kit))
      const done = D >= total
      const out = T0 + D + (done ? 1 : 0)
      const end = data.persist ? out : out + 0.4
      clock(tl, end, (t) => {
        let left
        let shown
        if (t < T0) {
          const p = wind(clamp((t - 0.25) / 0.6, 0, 1))
          left = p * total
          shown = Math.round(left)
        } else {
          left = Math.max(0, total - (t - T0))
          shown = Math.ceil(left - 1e-6)
        }
        const p = (left / total) * 100
        wedge.style.strokeDasharray = `${r1(p)} 100`
        hand.setAttribute('transform', `rotate(${r1(p * 3.6)} 50 50)`)
        time.textContent = mmss(shown)
        label.textContent = t >= T0 && left <= 0 ? 'เสร็จแล้ว!' : data.label ?? ''
      })
      tl.fromTo(card, { x: 4 * vh, rotation: 4, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.5)' }, 0)
      kit.sound('pop', 0)
      kit.sound('click', 0.85)
      if (done) {
        tl.fromTo(card, { rotation: 0 }, { rotation: 5, duration: 0.07, yoyo: true, repeat: 7, ease: 'sine.inOut', immediateRender: false }, T0 + D)
        kit.sound('bell', T0 + D)
      }
      if (!data.persist) tl.to(card, { x: 4 * vh, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
    },
  })

  // 4 · rep counter: big count steps up rep by rep inside a progress ring; one small ring per set
  const reps = { reps: 12, target: 15, exercise: 'สควอท', set: 2, sets: 3 }
  defineGraphic('rep-counter', {
    title: 'นับจำนวนครั้ง · Rep counter',
    place: 'corner',
    defaults: { target: 10, set: 1, sets: 3 },
    sample: { data: reps },
    presets: {
      pushup: { title: 'นับวิดพื้น · Push-up counter', data: { reps: 20, target: 20, exercise: 'วิดพื้น', set: 3, sets: 3 } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const count = Math.max(0, Math.round(Number(data.reps)) || 0)
      const target = Math.max(1, Math.round(Number(data.target)) || count || 1)
      const sets = clamp(Math.round(Number(data.sets)) || 1, 1, 8)
      const set = clamp(Math.round(Number(data.set)) || 1, 1, sets)
      const card = kit.el('div', 'lf-card wrap')
      const dial = kit.el('div', 'dial', null, card)
      const svg = svgIn(dial, 100, 100, 'ring')
      S('circle', { cx: 50, cy: 50, r: 44, class: 'track' }, svg)
      const arc = S('circle', { cx: 50, cy: 50, r: 44, class: 'arc', pathLength: 100, transform: 'rotate(-90 50 50)' }, svg)
      const num = kit.el('div', 'num', '0', dial)
      kit.el('div', 'of', `/ ${target}`, dial)
      const side = kit.el('div', 'side', null, card)
      kit.el('div', 'name', data.exercise ?? '', side)
      kit.el('div', 'set', `เซต ${set} จาก ${sets}`, side)
      const dots = kit.el('div', 'sets', null, side)
      let current
      for (let i = 0; i < sets; i++) {
        const s = svgIn(dots, 20, 20, 'dot')
        S('circle', { cx: 10, cy: 10, r: 7.5, class: i < set - 1 ? 'full' : 'track' }, s)
        if (i === set - 1) current = S('circle', { cx: 10, cy: 10, r: 7.5, class: 'arc', pathLength: 100, transform: 'rotate(-90 10 10)' }, s)
      }
      const from = Math.max(0, count - 20)
      const t0 = 0.45
      const span = Math.min(1.8, hold(kit) * 0.7)
      const step = span / Math.max(1, count - from)
      const out = Math.max(t0 + span + 0.7, 0.45 + hold(kit))
      clock(tl, out + 0.4, (t) => {
        const n = t < t0 ? from : Math.min(count, from + Math.floor((t - t0) / step) + 1)
        const p = `${r1(Math.min(1, n / target) * 100)} 100`
        num.textContent = String(n)
        arc.style.strokeDasharray = p
        current.style.strokeDasharray = p
      })
      tl.fromTo(card, { x: 4 * vh, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0)
      kit.sound('whoosh-low', 0)
      for (let n = from + 1; n <= count; n++) {
        const at = t0 + (n - from - 1) * step
        tl.fromTo(num, { scale: 1.16 }, { scale: 1, duration: 0.25, ease: 'power2.out', immediateRender: false }, at)
        kit.sound('click-soft', at)
      }
      if (count >= target) {
        tl.fromTo(dial, { scale: 1 }, { scale: 1.06, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.out', immediateRender: false }, t0 + span)
        kit.sound('success', t0 + span)
      }
      tl.to(card, { x: 4 * vh, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
    },
  })

  // 5 · heart rate: bpm counts up, an ECG trace writes across graph paper, the heart beats on each R peak
  defineGraphic('heart-rate', {
    title: 'อัตราการเต้นหัวใจ · Heart rate',
    place: 'lower',
    defaults: { bpm: 128, zone: 'โซน 3 · แอโรบิก' },
    sample: { data: { bpm: 128, zone: 'โซน 3 · แอโรบิก' } },
    presets: {
      rest: { title: 'ชีพจรขณะพัก · Resting heart rate', data: { bpm: 72, zone: 'พักฟื้น' } },
      peak: { title: 'ชีพจรสูงสุด · Peak heart rate', data: { bpm: 172, zone: 'โซน 5 · เต็มกำลัง' } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const bpm = clamp(Math.round(Number(data.bpm)) || 80, 30, 230)
      const card = kit.el('div', 'lf-card wrap')
      const left = kit.el('div', 'left', null, card)
      const heart = kit.svg('<svg class="heart" viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21S2.6 15.2 1.3 9.1C.5 5.2 2.9 1.5 6.6 1.5c2.3 0 4.1 1.3 5.4 3.2 1.3-1.9 3.1-3.2 5.4-3.2 3.7 0 6.1 3.7 5.3 7.6C21.4 15.2 12 21 12 21z"/></svg>', left)
      const read = kit.el('div', 'read', null, left)
      const num = kit.el('div', 'num', String(bpm), read)
      kit.el('div', 'unit', 'ครั้ง/นาที', read)
      if (data.zone) kit.el('div', 'zone', data.zone, read)
      num.style.minWidth = num.offsetWidth + 'px'
      const strip = kit.el('div', 'strip', null, card)
      const W = 440
      const H = 120
      const svg = svgIn(strip, W, H, 'trace')
      const rnd = kit.rng(bpm)
      const beatW = W / ((3 * bpm) / 60) // strip shows 3 seconds
      const g = (x, c, w) => Math.exp(-((x - c) ** 2) / (2 * w * w))
      const pts = []
      const peaks = []
      const amps = Array.from({ length: 12 }, () => 0.85 + rnd() * 0.3)
      for (let x = 0; x <= W; x += 1) {
        const k = Math.floor(x / beatW)
        const ph = x - k * beatW
        const a = amps[k % amps.length]
        const y = 74 - 7 * g(ph, beatW * 0.16, 4) + 9 * g(ph, beatW * 0.3, 1.6) - 56 * a * g(ph, beatW * 0.33, 1.8) + 16 * g(ph, beatW * 0.36, 1.8) - 11 * g(ph, beatW * 0.56, 7) + (rnd() - 0.5) * 1.2
        pts.push(`${x},${r1(y)}`)
      }
      for (let k = 0; k * beatW + beatW * 0.33 <= W; k++) peaks.push((k * beatW + beatW * 0.33) / W)
      S('path', { d: 'M' + pts.join('L'), class: 'line', fill: 'none' }, svg)
      const head = kit.el('i', 'head', null, strip)
      const t0 = 0.35
      const dur = Math.max(1, hold(kit) - 0.1)
      tl.fromTo(card, { y: 3 * vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0)
      kit.count(num, Math.round(bpm * 0.75), bpm, 0.3, 1)
      tl.fromTo(svg, { clipPath: 'inset(-10% 100% -10% 0%)' }, { clipPath: 'inset(-10% 0% -10% 0%)', duration: dur, ease: 'none' }, t0)
      tl.fromTo(head, { left: '0%', opacity: 0 }, { left: '100%', opacity: 1, duration: dur, ease: 'none' }, t0)
      for (const p of peaks) {
        const at = t0 + p * dur
        tl.fromTo(heart, { scale: 1.28 }, { scale: 1, duration: 0.3, ease: 'power2.out', immediateRender: false }, at)
        kit.sound('beep', at)
      }
      const out = t0 + dur + 0.15
      tl.to(card, { y: 2 * vh, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
    },
  })

  // 6 · event title: a pen frame closes around the card, the names are written in script, a flourish and date line
  const wedding = { title: 'งานมงคลสมรส', names: 'ต้น & ฝน', date: 'วันเสาร์ที่ 12 ธันวาคม 2569', venue: 'ห้องบอลรูม โรงแรมริมน้ำ เชียงใหม่' }
  defineGraphic('event-title', {
    title: 'ชื่องาน · Event title',
    place: 'center',
    sound: [['chime', 0.1], ['shimmer', 0.45]],
    defaults: wedding,
    sample: { data: wedding },
    presets: {
      ordination: { title: 'งานอุปสมบท · Ordination', data: { title: 'ขอเชิญร่วมงานอุปสมบท', names: 'นาคธนพล ใจดี', date: 'วันอาทิตย์ที่ 7 มีนาคม 2570', venue: 'วัดศรีสุดาราม จังหวัดนนทบุรี' } },
      graduation: { title: 'งานรับปริญญา · Graduation', data: { title: 'ยินดีกับบัณฑิตใหม่', names: 'ภัทรา ศรีสุข', date: 'วันจันทร์ที่ 18 มกราคม 2570', venue: 'คณะนิเทศศาสตร์ รุ่นที่ 52' } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const card = kit.el('div', 'lf-card wrap')
      const kicker = kit.el('div', 'kicker', data.title, card)
      const names = kit.el('div', 'names', data.names, card)
      const flo = svgIn(card, 400, 40, 'flourish')
      const swash = 'M200,20 C212,6 232,5 236,16 C240,27 222,31 219,20 C216,9 246,6 284,17 C316,26 350,25 392,12'
      const flourish = [pen(flo, swash, 'ink'), pen(flo, swash, 'ink')]
      flourish[1].setAttribute('transform', 'matrix(-1 0 0 1 400 0)')
      const dateRow = kit.el('div', 'date', null, card)
      const rules = [kit.el('i', null, null, dateRow)]
      const date = kit.el('span', null, data.date ?? '', dateRow)
      rules.push(kit.el('i', null, null, dateRow))
      const venue = data.venue ? kit.el('div', 'venue', data.venue, card) : null
      // frame measured after layout, two strokes from top centre meeting at the bottom
      const w = card.offsetWidth
      const h = card.offsetHeight
      const inset = 1.2 * vh
      const fw = w - inset * 2
      const fh = h - inset * 2
      const frameSvg = svgIn(card, fw, fh, 'frame')
      frameSvg.style.cssText = `left:${inset}px;top:${inset}px;width:${fw}px;height:${fh}px`
      const c = 0.8 * vh
      const half = (dir) => {
        const x = (v) => r1(fw / 2 + dir * (v - fw / 2))
        return `M${x(fw / 2)},0 L${x(fw - c)},0 Q${x(fw)},0 ${x(fw)},${r1(c)} L${x(fw)},${r1(fh - c)} Q${x(fw)},${r1(fh)} ${x(fw - c)},${r1(fh)} L${x(fw / 2)},${r1(fh)}`
      }
      const frame = [pen(frameSvg, half(1), 'line'), pen(frameSvg, half(-1), 'line')]
      tl.fromTo(card, { scale: 0.97, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: 'power2.out' }, 0)
      frame.forEach((p) => draw(tl, p, 0.1, 0.7, 'power2.inOut'))
      tl.fromTo(kicker, { y: 1 * vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.15)
      tl.fromTo(names, { clipPath: 'inset(-30% 100% -30% -6%)' }, { clipPath: 'inset(-30% -6% -30% -6%)', duration: 0.6, ease: 'power1.inOut' }, 0.22)
      flourish.forEach((p) => draw(tl, p, 0.45, 0.5, 'power2.out'))
      tl.fromTo(rules, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'power2.out' }, 0.5)
      tl.fromTo([date, venue].filter(Boolean), { opacity: 0, y: 0.6 * vh }, { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, ease: 'power2.out' }, 0.5)
      const out = 0.7 + hold(kit)
      tl.to(card, { y: -1.5 * vh, opacity: 0, duration: 0.45, ease: 'power2.in' }, out)
    },
  })

  // 7 · birthday card: the card drops in, the age counts up, paper confetti drifts down
  defineGraphic('birthday-card', {
    title: 'การ์ดวันเกิด · Birthday card',
    place: 'center',
    sound: [['pop', 0.05], ['chime', 0.2], ['sparkle', 0.55]],
    defaults: { greeting: 'สุขสันต์วันเกิด', unit: 'ปี' },
    sample: { data: { name: 'น้องมายด์', age: 25 } },
    presets: {
      anniversary: { title: 'การ์ดครบรอบ · Anniversary card', data: { greeting: 'สุขสันต์วันครบรอบ', name: 'ร้านครัวบ้านแม่', age: 5, unit: 'ปี' } },
    },
    build(kit, data, tl) {
      const { vh, vw } = kit
      const card = kit.el('div', 'lf-card wrap')
      kit.el('div', 'greet', data.greeting, card)
      const name = kit.el('div', 'name', data.name ?? '', card)
      const under = pen(svgIn(card, 300, 24, 'under'), 'M6,16 C60,8 120,20 170,13 C215,7 255,12 294,9', 'ink')
      const age = Math.round(Number(data.age))
      let ageNum = null
      if (Number.isFinite(age) && age > 0) {
        const row = kit.el('div', 'age', null, card)
        kit.el('span', null, 'ครบ', row)
        ageNum = kit.el('span', 'n', String(age), row)
        kit.el('span', null, data.unit ?? 'ปี', row)
      }
      const out = 0.6 + hold(kit)
      const end = out + 0.45
      // confetti: seeded paper bits falling at their own pace, swaying and flipping
      const sky = kit.el('div', 'sky')
      const rnd = kit.rng(25)
      for (let i = 0; i < 44; i++) {
        const bit = kit.el('i', `bit s${i % 3} c${i % 4}`, null, sky)
        const x = rnd() * 100 * vw
        const y0 = -6 * vh - rnd() * 70 * vh
        const speed = (16 + rnd() * 14) * vh
        const spin = (rnd() - 0.5) * 360
        const r0 = rnd() * 360
        tl.fromTo(bit, { x, y: y0, rotation: r0 }, { y: y0 + speed * end, rotation: r0 + spin * end, duration: end, ease: 'none' }, 0)
        const period = 0.6 + rnd() * 0.6
        const reps = Math.ceil(end / period)
        tl.fromTo(bit, { xPercent: -120 }, { xPercent: 120, duration: period, yoyo: true, repeat: reps, ease: 'sine.inOut' }, 0)
        tl.fromTo(bit, { scaleX: 1 }, { scaleX: 0.25, duration: period * 0.7, yoyo: true, repeat: Math.ceil(end / (period * 0.7)), ease: 'sine.inOut' }, rnd() * 0.3)
      }
      tl.fromTo(card, { y: -5 * vh, rotation: -4, opacity: 0 }, { y: 0, rotation: 1.5, opacity: 1, duration: 0.55, ease: 'back.out(1.6)' }, 0)
      draw(tl, under, 0.4, 0.4, 'power2.out')
      if (ageNum) kit.count(ageNum, 0, age, 0.35, 0.8)
      tl.to(card, { y: 4 * vh, rotation: -2, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
      tl.to(sky, { opacity: 0, duration: 0.4, ease: 'power1.in' }, out)
    },
  })

  // 8 · quote: pen-drawn quote marks fill with ink, the words arrive one by one, attribution on a rule
  defineGraphic('quote-type', {
    title: 'คำคม · Quote',
    place: 'center',
    sound: [['paper', 0], ['typing', 0.35]],
    sample: { data: { quote: 'น้ำหยดลงหินทุกวัน หินมันยังกร่อน', by: 'สุนทรภู่ · พระอภัยมณี' } },
    presets: {
      proverb: { title: 'สุภาษิต · Proverb', data: { quote: 'ช้า ๆ ได้พร้าเล่มงาม', by: 'สุภาษิตไทย' } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const card = kit.el('div', 'lf-card wrap')
      const qs = svgIn(card, 90, 70, 'marks')
      const comma = 'M34,8 C18,12 7,26 8,44 C9,55 16,62 25,62 C34,62 40,55 40,47 C40,38 33,32 25,32 C21,32 18,33 16,35 C18,25 24,18 36,14 Z'
      const marks = [pen(qs, comma, 'ink'), pen(qs, comma, 'ink')]
      marks[1].setAttribute('transform', 'translate(42 0)')
      const quote = kit.el('div', 'quote', null, card)
      const words = kit.words(data.quote).filter((w) => w !== '').map((w) => kit.el('span', /^\s+$/.test(w) ? 'sp' : 'w', w, quote))
      const shown = words.filter((n) => n.className === 'w')
      const by = kit.el('div', 'by', null, card)
      const rule = kit.el('i', null, null, by)
      kit.el('span', null, data.by ?? '', by)
      if (!data.by) by.remove()
      tl.fromTo(card, { y: 2 * vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0)
      marks.forEach((m, i) => {
        draw(tl, m, 0.1 + i * 0.08, 0.45)
        tl.fromTo(m, { fillOpacity: 0 }, { fillOpacity: 1, duration: 0.25, ease: 'power1.out' }, 0.45 + i * 0.08)
      })
      const step = Math.min(0.11, 1.3 / Math.max(1, shown.length))
      shown.forEach((w, i) => tl.fromTo(w, { opacity: 0, y: '0.4em' }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0.35 + i * step))
      const wEnd = 0.35 + shown.length * step + 0.2
      if (data.by) {
        tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'power2.out' }, wEnd - 0.1)
        tl.fromTo(by.lastElementChild, { opacity: 0, x: -1 * vh }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, wEnd)
      }
      const out = Math.max(wEnd + hold(kit) * 0.6, 0.6 + hold(kit))
      tl.to(card, { y: -1.5 * vh, opacity: 0, duration: 0.45, ease: 'power2.in' }, out)
    },
  })

  // 9 · karaoke: the fill sweeps word by word while a ball hops onto each word; the next line waits below
  defineGraphic('karaoke-line', {
    title: 'เนื้อเพลงคาราโอเกะ · Karaoke line',
    place: 'caption',
    sound: [],
    sample: { data: { line: 'คิดถึงเธอทุกทีที่ฝนพรำ', next: 'ยังจำได้ไหมคืนนั้นที่เราเจอ' } },
    build(kit, data, tl) {
      const { vh } = kit
      const box = kit.el('div', 'lf-card wrap')
      const line = kit.el('div', 'line', null, box)
      const ball = kit.el('i', 'ball', null, line)
      const words = kit.words(data.line).filter((w) => w !== '').map((w) => {
        if (/^\s+$/.test(w)) return kit.el('span', 'sp', w, line) && null
        const span = kit.el('span', 'w', w, line)
        const fill = kit.el('span', 'fill', w, span)
        return { span, fill, weight: kit.graphemes(w).length }
      }).filter(Boolean)
      const next = data.next ? kit.el('div', 'next', data.next, box) : null
      const total = words.reduce((s, w) => s + w.weight, 0) || 1
      const t0 = 0.4
      const sweep = Math.max(1.2, hold(kit) * 0.8)
      let cum = 0
      let px = null
      words.forEach((w, i) => {
        const at = t0 + (sweep * cum) / total
        const dur = (sweep * w.weight) / total
        cum += w.weight
        const cx = w.span.offsetLeft + w.span.offsetWidth / 2
        tl.fromTo(w.fill, { clipPath: 'inset(-20% 100% -20% 0%)' }, { clipPath: 'inset(-20% 0% -20% 0%)', duration: dur, ease: 'none' }, at)
        if (px == null) tl.fromTo(ball, { x: cx, opacity: 0, y: -1.5 * vh }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }, at - 0.25)
        else {
          const hop = Math.min(0.24, dur)
          tl.fromTo(ball, { x: px }, { x: cx, duration: hop, ease: 'none', immediateRender: false }, at - hop)
          tl.fromTo(ball, { y: 0 }, { y: -1.4 * vh, duration: hop / 2, yoyo: true, repeat: 1, ease: 'sine.out', immediateRender: false }, at - hop)
        }
        px = cx
      })
      tl.fromTo(box, { y: 1.5 * vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'power3.out' }, 0)
      if (next) tl.fromTo(next, { opacity: 0, y: 0.5 * vh }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, t0 + sweep * 0.5)
      const out = Math.max(t0 + sweep + 0.45, 0.4 + hold(kit))
      tl.to(ball, { opacity: 0, duration: 0.2 }, t0 + sweep + 0.1)
      tl.to(box, { y: -1 * vh, opacity: 0, duration: 0.35, ease: 'power2.in' }, out)
    },
  })

  // 10 · location title: a dashed route draws to a pin, the place name rises letter by letter
  const place = { place: 'เชียงคาน', region: 'จังหวัดเลย · ริมแม่น้ำโขง', coords: '17.8986° N, 101.6676° E' }
  defineGraphic('location-title', {
    title: 'ชื่อสถานที่ · Location title',
    place: 'lower',
    sound: [['whoosh', 0], ['pop', 0.8]],
    defaults: place,
    sample: { data: place },
    presets: {
      island: { title: 'ชื่อเกาะ · Island title', data: { place: 'เกาะหลีเป๊ะ', region: 'จังหวัดสตูล · ทะเลอันดามัน', coords: '6.4897° N, 99.3022° E' } },
      city: { title: 'ชื่อย่านเมือง · City title', data: { place: 'เยาวราช', region: 'กรุงเทพมหานคร', coords: '13.7400° N, 100.5090° E' } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const card = kit.el('div', 'lf-card wrap')
      const svg = svgIn(card, 300, 56, 'route')
      const rnd = kit.rng(String(data.place ?? '').length + 4)
      const pts = Array.from({ length: 8 }, (_, i) => [8 + (i / 7) * 268, 34 + (rnd() - 0.5) * 22 - (i / 7) * 8])
      S('path', { d: smooth(pts), class: 'path', fill: 'none' }, svg)
      S('circle', { cx: pts[0][0], cy: r1(pts[0][1]), r: 4, class: 'start' }, svg)
      const end = pts[pts.length - 1]
      const pin = S('g', { class: 'pin' }, svg)
      S('path', { d: `M${r1(end[0])},${r1(end[1])} c-7,-9 -10,-13 -10,-18 a10,10 0 0 1 20,0 c0,5 -3,9 -10,18z`, class: 'drop' }, pin)
      S('circle', { cx: r1(end[0]), cy: r1(end[1] - 18), r: 3.6, class: 'eye' }, pin)
      const coords = data.coords ? kit.el('div', 'coords', data.coords, card) : null
      const name = kit.el('div', 'g-mask name', null, card)
      const letters = kit.graphemes(data.place).map((g) => kit.el('span', null, g, name))
      const region = data.region ? masked(kit, kit.el('div', 'region', null, card), '', data.region) : null
      tl.fromTo(card, { x: -3 * vh, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0)
      tl.fromTo(svg, { clipPath: 'inset(-40% 100% -10% 0%)' }, { clipPath: 'inset(-40% 0% -10% 0%)', duration: 0.6, ease: 'power1.inOut' }, 0.2)
      tl.fromTo(pin, { y: -14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'bounce.out' }, 0.75)
      if (coords) tl.fromTo(coords, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.45, ease: 'power2.out' }, 0.25)
      const stagger = Math.min(0.04, 0.4 / Math.max(1, letters.length))
      letters.forEach((l, i) => rise(tl, l, 0.15 + i * stagger, 0.45))
      if (region) rise(tl, region, 0.45)
      const out = 0.7 + hold(kit)
      tl.to(card, { x: -2 * vh, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
    },
  })

  // 11 · credits roll: a veil, then the roles and names scroll up at a constant pace
  const credits = {
    sections: [
      { role: 'ดำเนินรายการ', names: ['ครูแพร'] },
      { role: 'ถ่ายทำ', names: ['ต้นกล้า', 'บอส ลาดพร้าว'] },
      { role: 'ตัดต่อ', names: ['มายด์'] },
      { role: 'เพลงประกอบ', names: ['วงสายลม'] },
      { role: 'ขอบคุณสถานที่', names: ['ครัวบ้านสวน นนทบุรี'] },
    ],
    end: 'ขอบคุณที่รับชม',
  }
  defineGraphic('credits-roll', {
    title: 'เครดิตท้ายคลิป · Credits roll',
    place: 'full',
    sound: [['whoosh-low', 0]],
    defaults: { end: 'ขอบคุณที่รับชม' },
    sample: { data: credits },
    build(kit, data, tl) {
      const { vh } = kit
      const veil = kit.el('div', 'veil')
      const view = kit.el('div', 'view')
      const col = kit.el('div', 'col', null, view)
      for (const s of [].concat(data.sections ?? []).slice(0, 30)) {
        const sec = kit.el('div', 'sec', null, col)
        if (s?.role) kit.el('div', 'role', s.role, sec)
        for (const n of list(s?.names).slice(0, 20)) kit.el('div', 'who', n, sec)
      }
      if (data.end) kit.el('div', 'end', data.end, col)
      const H = innerHeight
      const ch = col.offsetHeight
      // shortcut: ttl sets the scroll time; without it the pace is a readable 13 vh/s
      const roll = kit.hold ?? (H + ch) / (13 * vh)
      tl.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power1.out' }, 0)
      tl.fromTo(col, { y: H }, { y: -ch, duration: roll, ease: 'none' }, 0.2)
      tl.to(veil, { opacity: 0, duration: 0.4, ease: 'power1.in' }, 0.2 + roll - 0.3)
      finish(kit, tl, 0.3 + roll)
    },
  })

  // 12 · end card: two pen-drawn video frames for the editor's end screens, and a follow button press
  defineGraphic('end-card', {
    title: 'การ์ดท้ายคลิป · End card',
    place: 'full',
    sound: [['whoosh', 0], ['click', 1.3], ['success', 1.4]],
    defaults: { title: 'ดูคลิปต่อได้เลย', handle: '@kruabaanmae', sub: 'กดติดตามไว้ ไม่พลาดสูตรใหม่ทุกสัปดาห์' },
    sample: { data: { title: 'ดูคลิปต่อได้เลย', handle: '@kruabaanmae' } },
    presets: {
      travel: { title: 'การ์ดท้ายคลิปเที่ยว · Travel end card', data: { title: 'เที่ยวต่อกับเรา', handle: '@paiteawkan', sub: 'ทริปหน้าไปไหนดี คอมเมนต์บอกกันได้เลย' } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const veil = kit.el('div', 'veil')
      const stage = kit.el('div', 'stage')
      const title = masked(kit, stage, 'title', data.title)
      const row = kit.el('div', 'vids', null, stage)
      const rnd = kit.rng(9)
      const vids = ['คลิปแนะนำ', 'คลิปล่าสุด'].map((cap) => {
        const v = kit.el('div', 'vid', null, row)
        const fill = kit.el('div', 'fill', null, v)
        kit.svg('<svg class="play" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18"/><path d="M16 12.5v15l12-7.5z"/></svg>', fill)
        kit.el('span', 'cap', cap, fill)
        const w = v.offsetWidth
        const h = v.offsetHeight
        const s = svgIn(v, w, h, 'edge')
        return { fill, path: pen(s, penRect(w, h, rnd, 0.6 * vh), 'ink') }
      })
      const me = kit.el('div', 'me', null, stage)
      const avatar = kit.el('div', 'avatar', null, me)
      if (kit.image) {
        const img = kit.el('img', 'face', null, avatar)
        img.src = kit.image
        img.alt = ''
      } else kit.el('span', null, kit.graphemes(String(data.handle ?? '').replace(/^@/, ''))[0]?.toUpperCase() ?? '', avatar)
      const who = kit.el('div', 'who', null, me)
      kit.el('div', 'handle', data.handle ?? '', who)
      if (data.sub) kit.el('div', 'sub', data.sub, who)
      const btn = kit.el('div', 'btn', null, me)
      kit.el('span', null, 'ติดตาม', btn)
      const done = kit.el('span', 'done', null, btn)
      kit.svg('<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', done)
      kit.el('span', null, 'ติดตามแล้ว', done)
      const cursor = kit.svg('<svg class="cursor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 2.5l13.5 12.2-6.1.6 3.6 6.9-2.8 1.4-3.6-7-4.6 4.1z"/></svg>')
      // measure before any tween sets a transform
      const b = btn.getBoundingClientRect()
      const bx = b.left + b.width * 0.62
      const by = b.top + b.height * 0.55
      tl.fromTo(veil, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power1.out' }, 0)
      rise(tl, title, 0.1, 0.45)
      vids.forEach(({ fill, path }, i) => {
        draw(tl, path, 0.15 + i * 0.1, 0.5)
        tl.fromTo(fill, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' }, 0.45 + i * 0.1)
      })
      tl.fromTo(me, { y: 2 * vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0.5)
      tl.fromTo(cursor, { x: bx + 30 * vh, y: by + 22 * vh, opacity: 0 }, { x: bx, y: by, opacity: 1, duration: 0.5, ease: 'power2.inOut' }, 0.78)
      tl.fromTo([btn, cursor], { scale: 1 }, { scale: 0.9, duration: 0.09, yoyo: true, repeat: 1, ease: 'power1.inOut', immediateRender: false }, 1.3)
      tl.fromTo(done, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: 'power1.out' }, 1.36)
      tl.to(cursor, { x: bx + 6 * vh, y: by + 8 * vh, opacity: 0, duration: 0.45, ease: 'power2.in' }, 1.6)
      const out = Math.max(2, 0.6 + hold(kit))
      tl.to([stage, veil], { opacity: 0, duration: 0.45, ease: 'power2.in' }, out)
    },
  })

  // 13 · tear-off calendar: yesterday's page flips over the binding, then today's date gets a pen circle
  const today = { day: 14, month: 'กุมภาพันธ์', weekday: 'วันอาทิตย์', note: 'วันวาเลนไทน์' }
  defineGraphic('date-flip', {
    title: 'ปฏิทินพลิกวัน · Date flip',
    place: 'corner',
    sound: [['pop', 0], ['flap', 0.45], ['swoosh', 0.95]],
    defaults: today,
    sample: { data: today },
    presets: {
      newyear: { title: 'ปฏิทินวันปีใหม่ · New year date', data: { day: 1, month: 'มกราคม', weekday: 'วันศุกร์', note: 'สวัสดีปีใหม่ 2570' } },
      songkran: { title: 'ปฏิทินสงกรานต์ · Songkran date', data: { day: 13, month: 'เมษายน', weekday: 'วันอังคาร', note: 'วันสงกรานต์' } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const cal = kit.el('div', 'cal')
      const bind = kit.el('div', 'bind', null, cal)
      kit.el('i', null, null, bind)
      kit.el('i', null, null, bind)
      const stack = kit.el('div', 'stack', null, cal)
      const page = (cls, day, weekday, note) => {
        const p = kit.el('div', 'page ' + cls, null, stack)
        kit.el('div', 'month', data.month ?? '', p)
        const d = kit.el('div', 'day', String(day ?? ''), p)
        kit.el('div', 'wd', weekday ?? '', p)
        kit.el('div', 'note', note ?? '', p)
        return { p, d }
      }
      const now = page('now', data.day, data.weekday, data.note)
      const prevDay = Number(data.day) > 1 ? Number(data.day) - 1 : ''
      const old = page('old', prevDay, '', '')
      const shade = kit.el('i', 'shade', null, now.p)
      const ringSvg = svgIn(now.p, 100, 80, 'ring')
      const ring = pen(ringSvg, penRing(50, 40, 34, 26, kit.rng(5)), 'ink')
      tl.fromTo(cal, { y: -3 * vh, rotation: 3, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.5)' }, 0)
      tl.fromTo(old.p, { rotationX: 0 }, { rotationX: -115, duration: 0.45, ease: 'power2.in' }, 0.42)
      tl.fromTo(old.p, { opacity: 1 }, { opacity: 0, duration: 0.1 }, 0.8)
      tl.fromTo(shade, { opacity: 0.35 }, { opacity: 0, duration: 0.45, ease: 'power1.in' }, 0.42)
      tl.fromTo(now.d, { scale: 0.92 }, { scale: 1, duration: 0.4, ease: 'back.out(2)' }, 0.8)
      draw(tl, ring, 0.95, 0.5, 'power2.out')
      const out = 0.6 + hold(kit)
      tl.to(cal, { y: -2 * vh, opacity: 0, duration: 0.35, ease: 'power2.in' }, out)
    },
  })

  // 14 · mood meter: a needle swings along a pen-ruled scale and settles on the value
  const spicy = { label: 'ระดับความเผ็ด', value: 80, left: 'ไม่เผ็ด', right: 'เผ็ดสุด' }
  defineGraphic('mood-meter', {
    title: 'มาตรวัดระดับ · Mood meter',
    place: 'lower',
    sound: [['swipe', 0.35], ['click', 1.15]],
    defaults: spicy,
    sample: { data: spicy },
    presets: {
      sweet: { title: 'ระดับความหวาน · Sweetness meter', data: { label: 'ระดับความหวาน', value: 25, left: 'หวานน้อย', right: 'หวานมาก' } },
      mood: { title: 'อารมณ์วันนี้ · Today’s mood', data: { label: 'อารมณ์วันนี้', value: 70, left: 'เหนื่อย', right: 'สดใส' } },
    },
    build(kit, data, tl) {
      const { vh } = kit
      const value = clamp(Math.round(Number(data.value)) || 0, 0, 100)
      const card = kit.el('div', 'lf-card wrap')
      const head = kit.el('div', 'head', null, card)
      kit.el('div', 'label', data.label ?? '', head)
      const num = kit.el('div', 'num', String(value), head)
      num.style.minWidth = num.offsetWidth + 'px'
      const track = kit.el('div', 'track', null, card)
      const svg = svgIn(track, 400, 40, 'scale')
      const base = pen(svg, 'M2,24 C90,22 180,26 260,23 C320,21 360,25 398,23', 'base')
      const ticks = Array.from({ length: 11 }, (_, i) => S('line', { x1: r1(4 + i * 39.2), y1: i % 5 ? 28 : 31, x2: r1(4 + i * 39.2), y2: i % 5 ? 18 : 14, class: 'tickmark' }, svg))
      const fill = kit.el('i', 'fill', null, track)
      const needle = kit.el('div', 'needle', null, track)
      kit.el('i', null, null, needle)
      const ends = kit.el('div', 'ends', null, card)
      kit.el('span', null, data.left ?? '', ends)
      kit.el('span', null, data.right ?? '', ends)
      const tw = track.offsetWidth
      tl.fromTo(card, { y: 3 * vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0)
      draw(tl, base, 0.1, 0.45)
      tl.fromTo(ticks, { opacity: 0 }, { opacity: 1, duration: 0.15, stagger: 0.03 }, 0.15)
      tl.fromTo(needle, { x: 0, rotation: 0, opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.3)
      tl.fromTo(needle, { x: 0 }, { x: (tw * value) / 100, duration: 0.85, ease: 'back.out(1.4)', immediateRender: false }, 0.35)
      tl.fromTo(needle, { rotation: 18 }, { rotation: 0, duration: 1, ease: 'elastic.out(1, 0.4)', immediateRender: false }, 0.35)
      tl.fromTo(fill, { scaleX: 0 }, { scaleX: value / 100, duration: 0.85, ease: 'back.out(1.4)' }, 0.35)
      kit.count(num, 0, value, 0.35, 0.85)
      const out = Math.max(1.6, 0.6 + hold(kit))
      tl.to(card, { y: 2 * vh, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
    },
  })

  // 15 · thanks roll: a bottom band with a script "ขอบคุณ" tab, supporter names drifting past
  const fans = ['คุณแอน', 'พี่โอ๊ต', 'น้องมายด์', 'คุณป้าสมศรี', 'เฟิร์น บางนา', 'ต้นกล้า', 'หมอเก่ง', 'พิมพ์ชนก', 'บอส ลาดพร้าว', 'ครูนก']
  defineGraphic('thanks-roll', {
    title: 'ขอบคุณผู้สนับสนุน · Thanks roll',
    place: 'crawl',
    sound: [['swoosh', 0], ['chime', 0.25]],
    defaults: { title: 'ขอบคุณ' },
    sample: { data: { names: fans } },
    build(kit, data, tl) {
      const { vh, vw } = kit
      const band = kit.el('div', 'band')
      const tab = kit.el('div', 'tab', null, band)
      const word = masked(kit, tab, 'word', data.title)
      const view = kit.el('div', 'view', null, band)
      const track = kit.el('div', 'track', null, view)
      const names = list(data.names).slice(0, 60)
      const set = () => names.forEach((n) => {
        kit.el('span', 'who', n, track)
        kit.svg('<svg class="sep" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 16.5S3.5 12.6 3.5 8.3C3.5 6 5.1 4.5 7 4.5c1.3 0 2.4.7 3 1.8.6-1.1 1.7-1.8 3-1.8 1.9 0 3.5 1.5 3.5 3.8 0 4.3-6.5 8.2-6.5 8.2z"/></svg>', track)
      })
      set()
      const one = track.scrollWidth || 1
      const speed = 9 * vw
      const roll = kit.hold ?? clamp(one / speed, 2.4, 12)
      const end = 0.4 + roll + 0.45
      const need = view.offsetWidth + speed * end
      for (let i = 1; i < 12 && track.scrollWidth < need; i++) set()
      tl.fromTo(band, { yPercent: 105 }, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, 0)
      rise(tl, word, 0.15)
      tl.fromTo(track, { x: 0 }, { x: -speed * end, duration: end, ease: 'none' }, 0)
      tl.to(band, { yPercent: 105, duration: 0.4, ease: 'power2.in' }, 0.4 + roll)
      finish(kit, tl, end)
    },
  })

  // 16 · photo stack: three prints of the shot (different crops) drop onto a taped scrapbook pile
  defineGraphic('photo-stack', {
    title: 'กองรูปสแครปบุ๊ก · Photo stack',
    place: 'card',
    sound: [['shutter', 0.02], ['paper', 0.3], ['paper', 0.5], ['paper', 0.7]],
    defaults: { caption: 'ทริปเชียงใหม่กับแก๊งเพื่อน' },
    sample: { data: { caption: 'ทริปเชียงใหม่กับแก๊งเพื่อน', date: 'ธ.ค. 2569' }, image: '/overlay/product.jpg' },
    build(kit, data, tl) {
      const { vh, vw } = kit
      const side = kit.away
      const stack = kit.el('div', 'stack')
      stack.dataset.side = side
      const s = side === 'right' ? 1 : -1
      const spots = [
        { x: -4 * vh, y: 3 * vh, r: -9, pos: '22% 35%', zoom: 1.6 },
        { x: 5 * vh, y: -1 * vh, r: 7, pos: '78% 30%', zoom: 1.35 },
        { x: 0, y: 2 * vh, r: -2.5, pos: '50% 55%', zoom: 1.1 },
      ]
      const prints = spots.map((spot, i) => {
        const p = kit.el('div', 'print', null, stack)
        const win = kit.el('div', 'win', null, p)
        if (kit.image) {
          const img = kit.el('img', 'ph', null, win)
          img.src = kit.image
          img.alt = ''
          img.style.objectPosition = spot.pos
          img.style.transform = `scale(${spot.zoom})`
        }
        const tape = kit.el('i', 'tape', null, p)
        tape.style.transform = `translateX(-50%) rotate(${i % 2 ? 4 : -5}deg)`
        return p
      })
      const top = prints[2]
      const cap = kit.el('div', 'cap', data.caption ?? '', top)
      if (data.date) kit.el('div', 'when', data.date, top)
      prints.forEach((p, i) => {
        const { x, y, r } = spots[i]
        const at = 0.05 + i * 0.2
        tl.fromTo(p, { x: x + s * 3 * vh, y: y - 10 * vh, rotation: r + (i % 2 ? -12 : 12), scale: 1.12, opacity: 0 }, { x, y, rotation: r, scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(1.2)' }, at)
      })
      tl.fromTo(cap, { clipPath: 'inset(-30% 100% -30% -4%)' }, { clipPath: 'inset(-30% -4% -30% -4%)', duration: 0.5, ease: 'power1.inOut' }, 0.85)
      const out = 0.7 + hold(kit)
      prints.slice().reverse().forEach((p, i) => tl.to(p, { x: `+=${s * 12 * vw}`, rotation: `+=${s * 10}`, opacity: 0, duration: 0.4, ease: 'power2.in' }, out + i * 0.05))
    },
  })

  // 17 · daily goals: round boxes fill and tick in order while the progress ring climbs; pinned preset updates live
  const goals = {
    title: 'เป้าหมายวันนี้',
    items: [
      { text: 'ดื่มน้ำ 8 แก้ว', done: true },
      { text: 'เดิน 10,000 ก้าว', done: true },
      { text: 'นอนก่อนห้าทุ่ม', done: false },
      { text: 'อ่านหนังสือ 20 นาที', done: true },
    ],
  }
  defineGraphic('checklist-goal', {
    title: 'เป้าหมายประจำวัน · Daily goals',
    place: 'corner',
    defaults: { title: 'เป้าหมายวันนี้' },
    sample: { data: goals },
    presets: {
      pinned: { title: 'เป้าหมายค้างจอ · Pinned goals', data: { persist: true } },
    },
    build(kit, data, tl) {
      const { vh, root } = kit
      const norm = (items) => [].concat(items ?? []).slice(0, 8).map((it) => (typeof it === 'object' && it ? { text: String(it.text ?? ''), done: !!it.done } : { text: String(it ?? ''), done: false })).filter((it) => it.text)
      let items = norm(data.items)
      const card = kit.el('div', 'lf-card wrap')
      const head = kit.el('div', 'head', null, card)
      const titles = kit.el('div', 'titles', null, head)
      kit.el('div', 'title', data.title ?? '', titles)
      const tally = kit.el('div', 'tally', '', titles)
      const dial = kit.el('div', 'dial', null, head)
      const svg = svgIn(dial, 100, 100, 'ring')
      S('circle', { cx: 50, cy: 50, r: 42, class: 'track' }, svg)
      const arc = S('circle', { cx: 50, cy: 50, r: 42, class: 'arc', pathLength: 100, transform: 'rotate(-90 50 50)' }, svg)
      const pct = kit.el('div', 'pct', '', dial)
      const listEl = kit.el('div', 'list', null, card)
      const rnd = kit.rng(17)
      const rowOf = (item) => {
        const row = kit.el('div', 'row', null, listEl)
        const s = svgIn(row, 40, 40, 'box')
        const edge = pen(s, penRing(20, 20, 14, 14, rnd, 1.05), 'edge')
        const disk = S('circle', { cx: 20, cy: 20, r: 14, class: 'disk' }, s)
        const check = pen(s, 'M13,20.5 L18,25.5 L27.5,14.5', 'check')
        const label = kit.el('span', 'item', item.text, row)
        return { row, edge, disk, check, label, done: item.done }
      }
      const show = (done, total) => {
        const p = total ? done / total : 0
        arc.style.strokeDasharray = `${r1(p * 100)} 100`
        pct.textContent = Math.round(p * 100) + '%'
        tally.textContent = `ทำแล้ว ${Math.round(done)} จาก ${total}`
      }
      let rows = items.map(rowOf)
      const doneRows = rows.filter((r) => r.done)
      const step = clamp((hold(kit) - 0.6) / Math.max(1, doneRows.length), 0.2, 0.4)
      const times = doneRows.map((_, k) => 0.65 + k * step)
      const out = Math.max(0.6 + hold(kit), (times.at(-1) ?? 0.6) + 0.7)
      const end = data.persist ? out : out + 0.4
      clock(tl, end, (t) => show(times.reduce((s, at) => s + clamp((t - at) / 0.3, 0, 1), 0), items.length))
      tl.fromTo(card, { x: 4 * vh, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0)
      kit.sound('whoosh-low', 0)
      rows.forEach(({ row, edge }, i) => {
        tl.fromTo(row, { x: 1.5 * vh, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.15 + i * 0.05)
        draw(tl, edge, 0.15 + i * 0.05, 0.35)
      })
      doneRows.forEach(({ disk, check, label }, k) => {
        const at = times[k]
        tl.fromTo(disk, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.3, ease: 'back.out(2.2)' }, at)
        draw(tl, check, at + 0.12, 0.2, 'power2.out')
        tl.fromTo(label, { opacity: 1 }, { opacity: 0.55, duration: 0.2, immediateRender: false }, at + 0.1)
        kit.sound('pop-hi', at)
      })
      if (items.length && doneRows.length === items.length) {
        tl.fromTo(dial, { scale: 1 }, { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1, ease: 'power1.out', immediateRender: false }, times.at(-1) + 0.3)
        kit.sound('success', times.at(-1) + 0.3)
      }
      if (!data.persist) tl.to(card, { x: 4 * vh, opacity: 0, duration: 0.4, ease: 'power2.in' }, out)
      // live update (pinned): rebuild the rows in their final state, newly done ones pop
      root.__update = (next) => {
        const before = new Set(items.filter((it) => it.done).map((it) => it.text))
        Object.assign(data, next)
        items = norm(data.items)
        listEl.replaceChildren()
        rows = items.map(rowOf)
        rows.forEach((r) => {
          r.edge.style.strokeDashoffset = '0'
          r.disk.style.transformOrigin = '50% 50%'
          gsap.set(r.disk, { scale: r.done ? 1 : 0 })
          r.check.style.strokeDashoffset = r.done ? '0' : '1'
          r.label.style.opacity = r.done ? 0.55 : 1
          if (r.done && !before.has(r.label.textContent)) gsap.from(r.disk, { scale: 0, duration: 0.3, ease: 'back.out(2.2)' })
        })
        show(rows.filter((r) => r.done).length, items.length)
        return true
      }
    },
  })
})()
