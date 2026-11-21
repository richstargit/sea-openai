// Broadcast set: TV-craft straps, telops, stats, comparisons and stings.
// Every tween sits on the paused timeline at an explicit time (seek-safe); hold = ttl (default 2.2 s).
;(() => {
  const hold = (kit) => kit.hold ?? 2.2
  const CLIP = {
    full: 'inset(0% 0% 0% 0%)',
    l: 'inset(0% 100% 0% 0%)', // collapsed onto the left edge
    r: 'inset(0% 0% 0% 100%)',
    b: 'inset(100% 0% 0% 0%)',
    t: 'inset(0% 0% 100% 0%)',
  }
  const wipe = (tl, node, from, to, at, duration = 0.35, ease = 'power3.out') =>
    tl.fromTo(node, { clipPath: CLIP[from] }, { clipPath: CLIP[to], duration, ease, immediateRender: from !== 'full' }, at)
  // [enter-from, exit-to]: lower-thirds wipe outward from the side they sit on
  const sides = (kit) => (kit.away === 'right' ? ['r', 'l'] : ['l', 'r'])
  const masked = (kit, parent, cls, text) => kit.el('span', null, text, kit.el('span', 'g-mask ' + cls, null, parent))
  const decimals = (v) => Math.min(2, (String(v).split('.')[1] ?? '').length)
  // count a possibly-fractional value by counting scaled integers
  const countTo = (kit, node, value, at, duration) => {
    const d = decimals(value)
    const scale = 10 ** d
    const format = new Intl.NumberFormat('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })
    const end = kit.count(node, 0, Math.round((Number(value) || 0) * scale), at, duration, (n) => format.format(n / scale))
    node.style.minWidth = node.offsetWidth + 'px' // reserve the final width so the row does not jitter
    node.textContent = format.format(0)
    return end
  }

  // 1 name-strap: accent bar, then brand tab, then product name
  const strap = { brand: 'Mali Beauty', name: 'เซรั่มวิตซีเข้มข้น 20% ขนาด 30 มล.' }
  defineGraphic('name-strap', {
    title: 'ชื่อแบรนด์ + สินค้า · Name strap',
    place: 'lower',
    defaults: strap,
    sample: { data: strap },
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const wrap = kit.el('div', 'wrap')
      const bar = kit.el('i', 'bar', null, wrap)
      const col = kit.el('div', 'col', null, wrap)
      const tab = kit.el('div', 'tab', null, col)
      const brand = kit.el('span', null, data.brand, tab)
      const plate = kit.el('div', 'plate', null, col)
      const name = kit.el('span', null, data.name, plate)
      if (!data.brand) tab.remove()
      tl.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: 0.25, ease: 'power3.out' }, 0)
      wipe(tl, tab, from, 'full', 0.1, 0.3)
      tl.fromTo(brand, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.18)
      wipe(tl, plate, from, 'full', 0.18, 0.38)
      tl.fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: 0.34, ease: 'power3.out' }, 0.28)
      const out = 0.62 + hold(kit)
      wipe(tl, [plate, tab], 'full', to, out, 0.35, 'power3.in')
      tl.to(bar, { scaleY: 0, duration: 0.25, ease: 'power3.in' }, out + 0.15)
    },
  })

  // 2 telop-pop: variety-show telop, double outline, pops in word by word; emphasis in accent
  const telop = { text: 'กันน้ำ กันเหงื่อ ติดทนทั้งวัน', emphasis: 'ติดทนทั้งวัน' }
  defineGraphic('telop-pop', {
    title: 'เทลอปตัวใหญ่ · Telop pop',
    place: 'center',
    defaults: telop,
    sample: { data: telop },
    presets: {
      wow: { title: 'เทลอป · ว้าว', data: { text: 'ว้าว! เนื้อบางเบา ไม่เหนียวเลย', emphasis: 'ไม่เหนียว' } },
      deal: { title: 'เทลอป · ดีล', data: { text: 'ลดเหลือ 199 บาท วันนี้เท่านั้น', emphasis: '199 บาท' } },
    },
    build(kit, data, tl) {
      const line = kit.el('div', 'line')
      const text = String(data.text ?? '')
      const at = data.emphasis ? text.indexOf(data.emphasis) : -1
      const end = at + String(data.emphasis ?? '').length
      // clusters: the emphasis stays whole; other text splits at spaces, long runs into ~8-grapheme word groups
      const parts = at >= 0 ? [[text.slice(0, at)], [data.emphasis, true], [text.slice(end)]] : [[text]]
      const words = []
      const add = (chunk, em) => {
        const node = kit.el('span', em ? 'w em' : 'w', chunk, line)
        node.dataset.text = chunk // drawn again by ::before as the outer outline
        words.push(node)
      }
      for (const [part, em] of parts) {
        if (em) add(part, true)
        else for (const chunk of part.split(/(\s+)/)) {
          if (!chunk.trim()) chunk && line.append(chunk)
          else if (kit.graphemes(chunk).length <= 12) add(chunk)
          else {
            let group = ''
            for (const word of kit.words(chunk)) {
              if (group && kit.graphemes(group + word).length > 8) add(group), (group = '')
              group += word
            }
            if (group) add(group)
          }
        }
      }
      const step = Math.min(0.07, 0.4 / Math.max(1, words.length))
      words.forEach((node, i) => {
        const em = node.classList.contains('em')
        tl.fromTo(node, { scale: 0.2, yPercent: 30, rotation: em ? -6 : 0, opacity: 0 }, {
          scale: 1, yPercent: 0, rotation: 0, opacity: 1, duration: em ? 0.34 : 0.26, ease: em ? 'back.out(3.4)' : 'back.out(2.4)',
        }, 0.02 + i * step + (em ? 0.06 : 0))
      })
      const last = 0.02 + words.length * step + 0.4
      const out = Math.max(0.5, last) + hold(kit)
      tl.to(words, { scale: 0.6, yPercent: -20, opacity: 0, duration: 0.2, ease: 'power2.in', stagger: Math.min(0.03, 0.2 / Math.max(1, words.length)) }, out)
    },
  })

  // 3 kinetic-claim: claim lines mask up from the baseline, one after another
  const claims = { claims: ['ติดทน', '12 ชม.', 'ไม่ฉุน'] }
  defineGraphic('kinetic-claim', {
    title: 'คำเคลมเรียงบรรทัด · Kinetic claims',
    place: 'lower',
    defaults: claims,
    sample: { data: claims },
    presets: {
      sun: { title: 'คำเคลม · กันแดด', data: { claims: ['SPF50+ PA++++', 'กันน้ำ 80 นาที', 'ไม่วอก ไม่เหนียว'] } },
    },
    build(kit, data, tl) {
      const list = typeof data.claims === 'string' ? data.claims.split(/\s*·\s*/) : [].concat(data.claims ?? [])
      const wrap = kit.el('div', 'wrap')
      const rule = kit.el('i', 'rule', null, wrap)
      const stack = kit.el('div', 'stack', null, wrap)
      const lines = list.filter(Boolean).slice(0, 5).map((claim) => {
        const node = masked(kit, stack, 'line', claim)
        if (/\d/.test(claim)) node.classList.add('hot')
        return node
      })
      tl.fromTo(rule, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: 'power2.out' }, 0)
      lines.forEach((node, i) => tl.fromTo(node, { yPercent: 105 }, { yPercent: 0, duration: 0.36, ease: 'power3.out' }, 0.08 + i * 0.1))
      const out = 0.44 + lines.length * 0.1 + hold(kit)
      tl.to(lines, { yPercent: -105, duration: 0.3, ease: 'power3.in', stagger: 0.05 }, out)
      tl.to(rule, { scaleY: 0, transformOrigin: '50% 0%', duration: 0.25, ease: 'power3.in' }, out + 0.12)
    },
  })

  // 4 stat-callout: sports-stat number counting up, unit, hairline rule, label
  const stat = { value: 12500, unit: 'ชิ้น', label: 'ขายแล้วในไลฟ์นี้' }
  defineGraphic('stat-callout', {
    title: 'ตัวเลขสถิติ · Stat callout',
    place: 'lower',
    defaults: stat,
    sample: { data: stat },
    presets: {
      moist: { title: 'ตัวเลข · ผลทดสอบ', data: { value: 98, unit: '%', label: 'ผิวชุ่มชื้นขึ้นใน 7 วัน (ทดสอบ 30 คน)' } },
    },
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const card = kit.el('div', 'g-panel card')
      const label = masked(kit, card, 'label', data.label)
      const rule = kit.el('i', 'rule', null, card)
      const row = kit.el('div', 'row', null, card)
      const value = kit.el('b', 'value', null, row)
      const unit = kit.el('span', 'unit', data.unit, row)
      wipe(tl, card, 'b', 'full', 0, 0.32)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out', transformOrigin: from === 'l' ? '0% 50%' : '100% 50%' }, 0.12)
      tl.fromTo(label, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.18)
      const counted = countTo(kit, value, data.value, 0.2, 1)
      tl.fromTo(unit, { opacity: 0, x: -0.8 * kit.vh }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, 0.4)
      const out = Math.max(0.5 + hold(kit), counted + 0.6)
      wipe(tl, card, 'full', to, out, 0.35, 'power3.in')
    },
  })

  // 5 review-stars: stars fill one by one (fractional last), rating, count, one quote line
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.95 6.1 6.65.85-4.9 4.6 1.25 6.6L12 17.3l-5.95 3.25 1.25-6.6-4.9-4.6 6.65-.85z"/></svg>'
  const review = { rating: 4.9, count: 2300, quote: 'กลิ่นหอมติดผิวทั้งวัน ซื้อซ้ำรอบที่ 3 แล้วค่ะ' }
  defineGraphic('review-stars', {
    title: 'ดาวรีวิว · Review stars',
    place: 'lower',
    defaults: review,
    sample: { data: review },
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const rating = Math.max(0, Math.min(5, Number(data.rating) || 0))
      const card = kit.el('div', 'g-panel card')
      const row = kit.el('div', 'row', null, card)
      const stars = kit.el('div', 'stars', null, row)
      const fills = []
      for (let i = 0; i < 5; i++) {
        const star = kit.el('span', 'star', null, stars)
        kit.svg(STAR, star)
        fills.push([star, kit.svg(`<span class="fill">${STAR}</span>`, star), Math.max(0, Math.min(1, rating - i))])
      }
      const score = kit.el('b', 'score', null, row)
      const n = data.count
      const count = typeof n === 'number' ? (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : kit.num(n)) : String(n ?? '')
      const meta = kit.el('span', 'meta', count ? '· ' + count + ' รีวิว' : '', row)
      const quote = data.quote ? masked(kit, card, 'quote', '“' + data.quote + '”') : null
      wipe(tl, card, from, 'full', 0, 0.32)
      fills.forEach(([star, fill, f], i) => {
        const at = 0.22 + i * 0.12
        tl.fromTo(star, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2.6)' }, at)
        tl.fromTo(fill, { width: '0%' }, { width: f * 100 + '%', duration: 0.18, ease: 'power1.inOut' }, at + 0.08)
      })
      countTo(kit, score, rating.toFixed(1), 0.22, 0.6)
      tl.fromTo(meta, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.5)
      if (quote) tl.fromTo(quote, { yPercent: 105 }, { yPercent: 0, duration: 0.36, ease: 'power3.out' }, 0.55)
      const out = Math.max(0.6 + hold(kit), 1.4)
      wipe(tl, card, 'full', to, out, 0.35, 'power3.in')
    },
  })

  // 6 before-after: divider sweeps across two images; 'before' falls back to a dulled kit.image
  const compare = { before: null, after: null, beforeLabel: 'ก่อน', afterLabel: 'หลัง' }
  defineGraphic('before-after', {
    title: 'ก่อน/หลัง · Before–after',
    place: 'center',
    defaults: compare,
    sample: { data: compare, image: '/overlay/product.jpg' },
    build(kit, data, tl) {
      const after = data.after ?? kit.image ?? data.before ?? ''
      const frame = kit.el('div', 'frame')
      const a = kit.el('img', 'after', null, frame)
      const top = kit.el('div', 'before', null, frame)
      const b = kit.el('img', null, null, top)
      a.alt = b.alt = ''
      a.src = after
      b.src = data.before ?? after
      if (!data.before) top.classList.add('dull')
      const tagB = kit.el('span', 'tag tb', data.beforeLabel, frame)
      const tagA = kit.el('span', 'tag ta', data.afterLabel, frame)
      const divider = kit.el('i', 'divider', null, frame)
      kit.svg('<span class="knob"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 6.5 4 12l5.5 5.5M14.5 6.5 20 12l-5.5 5.5"/></svg></span>', divider)
      const at = (x) => ({ clipPath: `inset(0% ${100 - x}% 0% 0%)` })
      tl.fromTo(frame, { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.35, ease: 'power3.out' }, 0)
      tl.fromTo(top, at(100), { ...at(12), duration: 0.75, ease: 'power2.inOut' }, 0.45)
      tl.fromTo(divider, { left: '100%' }, { left: '12%', duration: 0.75, ease: 'power2.inOut' }, 0.45)
      tl.to(top, { ...at(50), duration: 0.45, ease: 'power2.inOut' }, 1.25)
      tl.to(divider, { left: '50%', duration: 0.45, ease: 'power2.inOut' }, 1.25)
      tl.fromTo([tagB, tagA], { opacity: 0, y: -1 * kit.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.25 }, 0.3)
      const out = Math.max(0.5 + hold(kit), 2)
      tl.to(frame, { opacity: 0, scale: 0.96, duration: 0.35, ease: 'power2.in' }, out)
    },
  })

  // 7 versus-spec: two products, spec rows tick ✓/✗ one after another (SVG strokes)
  const CHECK = '<svg class="mk ok" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.8l4.4 4.4L19 7.6"/></svg>'
  const CROSS = '<svg class="mk no" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M7.5 7.5l9 9"/><path pathLength="1" d="M16.5 7.5l-9 9"/></svg>'
  const versus = {
    a: 'กันแดดสูตรน้ำ', b: 'กันแดดทั่วไป',
    rows: [
      { label: 'กันน้ำ กันเหงื่อ', a: true, b: false },
      { label: 'ไม่วอก ไม่เหนียว', a: true, b: false },
      { label: 'ทาก่อนแต่งหน้าได้', a: true, b: true },
      { label: 'มีน้ำหอม', a: false, b: true },
    ],
  }
  defineGraphic('versus-spec', {
    title: 'เทียบสเปก · Versus spec',
    place: 'lower',
    defaults: versus,
    sample: { data: versus },
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const card = kit.el('div', 'g-panel card')
      const head = kit.el('div', 'r head', null, card)
      kit.el('span', null, null, head)
      kit.el('span', 'name a', data.a, head)
      kit.el('span', 'name', data.b, head)
      wipe(tl, card, from, 'full', 0, 0.35)
      tl.fromTo(head.children, { opacity: 0, y: 0.8 * kit.vh }, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out', stagger: 0.06 }, 0.15)
      let at = 0.35
      for (const spec of [].concat(data.rows ?? []).slice(0, 6)) {
        const row = kit.el('div', 'r', null, card)
        kit.el('span', 'label', spec.label, row)
        const marks = [spec.a, spec.b].map((ok, i) => kit.svg(ok ? CHECK : CROSS, kit.el('span', i ? 'cell' : 'cell a', null, row)))
        tl.fromTo(row, { opacity: 0, x: (from === 'l' ? -1 : 1) * kit.vh }, { opacity: 1, x: 0, duration: 0.25, ease: 'power2.out' }, at)
        marks.forEach((mark, i) => tl.fromTo(mark.querySelectorAll('path'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.2, ease: 'power2.out', stagger: 0.06 }, at + 0.1 + i * 0.1))
        at += 0.3
      }
      const out = Math.max(0.5 + hold(kit), at + 0.6)
      wipe(tl, card, 'full', to, out, 0.35, 'power3.in')
    },
  })

  // 8 comment-follow: viewer comment bubble floats beside a point, name masked in
  const comment = { name: 'นุ่น_ชอบช้อป', text: 'สีนี้ทาแล้วไม่ติดแมสใช่ไหมคะ อยากได้ 2 แท่ง' }
  defineGraphic('comment-follow', {
    title: 'คอมเมนต์ลอยตามจุด · Comment follow',
    place: 'spot',
    defaults: comment,
    sample: { data: comment, x: 0.6, y: 0.55 },
    build(kit, data, tl) {
      const W = innerWidth
      const H = innerHeight
      const p = kit.point ?? { x: W * 0.6, y: H * 0.55 }
      const dot = kit.el('i', 'dot')
      dot.style.left = p.x + 'px'
      dot.style.top = p.y + 'px'
      const bubble = kit.el('div', 'bubble')
      kit.el('span', 'avatar', kit.graphemes(data.name)[0] ?? '', bubble)
      const body = kit.el('div', 'body', null, bubble)
      const name = masked(kit, body, 'name', data.name)
      const text = kit.el('p', 'msg', data.text, body)
      const gap = 2.2 * kit.vh
      const w = bubble.offsetWidth
      const h = bubble.offsetHeight
      const flip = p.x + gap + w > W - 3 * kit.vw
      bubble.classList.toggle('flip', flip)
      bubble.style.left = (flip ? Math.max(3 * kit.vw, p.x - gap - w) : p.x + gap) + 'px'
      bubble.style.top = Math.min(H - h - 3 * kit.vh, Math.max(3 * kit.vh, p.y - h - gap * 0.4)) + 'px'
      bubble.style.transformOrigin = flip ? '100% 100%' : '0% 100%'
      tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' }, 0)
      tl.fromTo(bubble, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.8)' }, 0.06)
      tl.fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.22)
      tl.fromTo(text, { opacity: 0, y: 0.8 * kit.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.3)
      const out = 0.55 + hold(kit)
      tl.fromTo(bubble, { y: 0 }, { y: -1.2 * kit.vh, duration: out - 0.4, ease: 'sine.inOut', immediateRender: false }, 0.4)
      tl.to(bubble, { opacity: 0, scale: 0.92, duration: 0.3, ease: 'power2.in' }, out)
      tl.to(dot, { scale: 0, duration: 0.25, ease: 'power2.in' }, out + 0.05)
    },
  })

  // 9 iris-swap: two discs grow from the point to fill the frame, next product name, discs shrink away (~1.1 s)
  const swap = { kicker: 'ต่อไป', name: 'ลิปแมตต์ เบอร์ 07 โรสวู้ด' }
  defineGraphic('iris-swap', {
    title: 'ไอริสเปลี่ยนสินค้า · Iris swap',
    place: 'full',
    defaults: swap,
    sample: { data: swap, x: 0.5, y: 0.5 },
    build(kit, data, tl) {
      const W = innerWidth
      const H = innerHeight
      const p = kit.point ?? { x: W / 2, y: H / 2 }
      const r = Math.hypot(Math.max(p.x, W - p.x), Math.max(p.y, H - p.y)) + 4
      const discs = ['lead', 'body'].map((cls) => {
        const disc = kit.el('i', 'disc ' + cls)
        Object.assign(disc.style, { width: 2 * r + 'px', height: 2 * r + 'px', left: p.x - r + 'px', top: p.y - r + 'px' })
        return disc
      })
      const title = kit.el('div', 'title')
      const kicker = data.kicker ? masked(kit, title, 'kicker', data.kicker) : null
      const name = masked(kit, title, 'name', data.name)
      const words = [kicker, name].filter(Boolean)
      tl.fromTo(discs[0], { scale: 0 }, { scale: 1, duration: 0.36, ease: 'power2.inOut' }, 0)
      tl.fromTo(discs[1], { scale: 0 }, { scale: 1, duration: 0.34, ease: 'power2.inOut' }, 0.07)
      tl.fromTo(words, { yPercent: 105 }, { yPercent: 0, duration: 0.28, ease: 'power3.out', stagger: 0.05 }, 0.28)
      tl.to(words, { yPercent: -105, duration: 0.18, ease: 'power2.in', stagger: 0.03 }, 0.7)
      tl.to(discs[1], { scale: 0, duration: 0.3, ease: 'power2.in' }, 0.76)
      tl.to(discs[0], { scale: 0, duration: 0.3, ease: 'power2.in' }, 0.82)
    },
  })

  // 10 blinds-sting: 8 vertical bars stagger down, wordmark midway, bars continue out (~1 s)
  const blinds = { text: 'มะลิ บิวตี้' }
  defineGraphic('blinds-sting', {
    title: 'บานเกล็ดคั่น · Blinds sting',
    place: 'full',
    defaults: blinds,
    sample: { data: blinds },
    build(kit, data, tl) {
      const bars = []
      const leads = []
      for (let i = 0; i < 8; i++) {
        const bar = kit.el('i', 'bar')
        bar.style.left = i * 12.5 + '%'
        leads.push(kit.el('b', 'lead', null, bar))
        bars.push(kit.el('b', 'body', null, bar))
      }
      const mark = kit.el('div', 'wordmark')
      const glyphs = kit.graphemes(data.text).map((g) => (g.trim() ? masked(kit, mark, 'glyph', g) : (kit.el('i', 'gap', null, mark), null))).filter(Boolean)
      const rule = kit.el('i', 'rule', null, mark)
      const stagger = 0.028
      tl.fromTo(leads, { yPercent: -100 }, { yPercent: 0, duration: 0.22, ease: 'power2.out', stagger }, 0)
      tl.fromTo(bars, { yPercent: -100 }, { yPercent: 0, duration: 0.22, ease: 'power2.out', stagger }, 0.05)
      tl.fromTo(glyphs, { yPercent: 105 }, { yPercent: 0, duration: 0.22, ease: 'power3.out', stagger: Math.min(0.02, 0.12 / Math.max(1, glyphs.length)) }, 0.3)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.25, ease: 'power3.out' }, 0.36)
      tl.to(glyphs, { yPercent: -105, duration: 0.16, ease: 'power2.in' }, 0.64)
      tl.to(rule, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.16, ease: 'power2.in' }, 0.64)
      tl.to(bars, { yPercent: 100, duration: 0.2, ease: 'power2.in', stagger }, 0.68)
      tl.to(leads, { yPercent: 100, duration: 0.2, ease: 'power2.in', stagger }, 0.74)
    },
  })

  // 11 countdown-321: big numerals with a ring sweep each second, then the start label (~3.5 s)
  const countdown = { label: 'เริ่ม!' }
  defineGraphic('countdown-321', {
    title: 'นับถอยหลัง 3-2-1 · Countdown',
    place: 'center',
    defaults: countdown,
    sample: { data: countdown },
    presets: { flash: { title: 'นับถอยหลัง · แฟลชเซล', data: { label: 'แฟลชเซล!' } } },
    build(kit, data, tl) {
      const plate = kit.el('div', 'plate')
      const flash = kit.el('i', 'flash', null, plate)
      kit.svg('<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="46"/><circle class="sweep" cx="50" cy="50" r="46" pathLength="1"/></svg>', plate)
      const sweep = plate.querySelector('.sweep')
      const nums = ['3', '2', '1'].map((n) => kit.el('b', 'n', n, plate))
      const label = kit.el('b', 'go', data.label, plate)
      label.style.fontSize = Math.min(9, 26 / (0.6 * Math.max(1, kit.graphemes(data.label).length))) + 'vh'
      tl.fromTo(plate, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' }, 0)
      nums.forEach((n, i) => {
        const at = 0.12 + i * 0.9
        tl.fromTo(n, { scale: 1.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'power3.out' }, at)
        tl.fromTo(sweep, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.82, ease: 'none', immediateRender: i === 0 }, at)
        tl.to(n, { scale: 0.7, opacity: 0, duration: 0.14, ease: 'power2.in' }, at + 0.74)
      })
      tl.fromTo(flash, { scale: 0 }, { scale: 1, duration: 0.25, ease: 'power3.out' }, 2.84)
      tl.fromTo(label, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(2.6)' }, 2.86)
      tl.to(plate, { scale: 1.12, opacity: 0, duration: 0.25, ease: 'power2.in' }, 3.25)
    },
  })

  // 12 chapter-card: section title slab slides in from the side it sits on
  const chapter = { kicker: 'ช่วงที่ 2', title: 'โปรเซ็ตคู่' }
  defineGraphic('chapter-card', {
    title: 'การ์ดเปิดช่วง · Chapter card',
    place: 'lower',
    defaults: chapter,
    sample: { data: chapter },
    presets: { qa: { title: 'การ์ดเปิดช่วง · ถามตอบ', data: { kicker: 'ช่วงที่ 3', title: 'ตอบคำถามสด' } } },
    build(kit, data, tl) {
      const dir = kit.away === 'right' ? 1 : -1
      const card = kit.el('div', 'card')
      const kicker = data.kicker ? masked(kit, card, 'kicker', data.kicker) : null
      const title = kit.el('div', 'title', data.title, card)
      const rule = kit.el('i', 'rule', null, card)
      const off = dir * (card.offsetWidth + 10 * kit.vw) // clear the 5vw inset plus the drop shadow
      tl.fromTo(card, { x: off }, { x: 0, duration: 0.5, ease: 'expo.out' }, 0)
      tl.fromTo(title, { x: dir * 6 * kit.vw }, { x: 0, duration: 0.6, ease: 'expo.out' }, 0.04)
      if (kicker) tl.fromTo(kicker, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.25)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out', transformOrigin: dir < 0 ? '0% 50%' : '100% 50%' }, 0.3)
      const out = 0.6 + hold(kit)
      tl.to(card, { x: off, duration: 0.4, ease: 'power3.in' }, out)
    },
  })

  // 13 quote-card: large customer pull-quote, words settle in, name masked
  const quote = { quote: 'ใช้มา 2 เดือน รอยสิวจางลงจริง เนื้อบางเบาไม่อุดตันเลยค่ะ', name: 'คุณพิมพ์ชนก ส.', meta: 'ลูกค้ายืนยันการซื้อ' }
  defineGraphic('quote-card', {
    title: 'คำพูดลูกค้า · Quote card',
    place: 'lower',
    defaults: quote,
    sample: { data: quote },
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const card = kit.el('div', 'g-panel card')
      const mark = kit.el('span', 'qmark', '“', card)
      const text = kit.el('p', 'quote', null, card)
      const words = []
      for (const word of kit.words(data.quote)) word.trim() ? words.push(kit.el('span', 'w', word, text)) : text.append(word)
      const by = kit.el('div', 'by', null, card)
      const rule = kit.el('i', 'rule', null, by)
      const name = masked(kit, by, 'name', data.meta ? data.name + ' · ' + data.meta : data.name)
      wipe(tl, card, from, 'full', 0, 0.35)
      tl.fromTo(mark, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2.2)' }, 0.1)
      const step = Math.min(0.03, 0.5 / Math.max(1, words.length))
      tl.fromTo(words, { opacity: 0, y: 0.8 * kit.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: step }, 0.2)
      const said = 0.2 + words.length * step + 0.3
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: 'power3.out' }, said - 0.1)
      tl.fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, said)
      const out = Math.max(0.5 + hold(kit), said + 1.2)
      wipe(tl, card, 'full', to, out, 0.35, 'power3.in')
    },
  })
})()
