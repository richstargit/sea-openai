// Info set: news, sports, education and data graphics.
// Every tween sits on the paused timeline at an explicit time (seek-safe); hold = ttl (default 2.4 s).
// "pinned" presets set data.persist (no exit) and take live changes through root.__update.
;(() => {
  const hold = (kit) => kit.hold ?? 2.4
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
  const masked = (kit, parent, text, cls = '') => kit.el('span', null, text, kit.el('span', ('g-mask ' + cls).trim(), null, parent))
  const rise = (tl, nodes, at, stagger = 0.06, duration = 0.4) =>
    tl.fromTo(nodes, { yPercent: 115 }, { yPercent: 0, duration, ease: 'power3.out', stagger }, at)
  const draw = (tl, paths, at, duration = 0.4, stagger = 0) =>
    tl.fromTo(paths, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration, ease: 'power2.inOut', stagger }, at)
  const list = (v) => [].concat(v ?? []).filter((x) => x != null && x !== '')
  const THAI_KEYS = ['ก', 'ข', 'ค', 'ง', 'จ', 'ฉ']
  const CHECK = '<svg class="check" viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  const pad = (n) => String(n).padStart(2, '0')
  // count with decimals kept (1.8 → "1.8"); starts showing `from`, not the final value
  const countTo = (kit, node, value, at, duration = 0.9, from = 0, suffix = '') => {
    const d = Math.min(2, (String(value).split('.')[1] ?? '').length)
    const s = 10 ** d
    const f = new Intl.NumberFormat('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d })
    const fmt = (n) => f.format(n / s) + suffix
    const end = kit.count(node, Math.round(from * s), Math.round((Number(value) || 0) * s), at, duration, fmt)
    node.textContent = fmt(Math.round(from * s))
    return end
  }
  // linear counter through a setter (kit.count eases; a clock must not). Works on tl or gsap.
  const linear = (timeline, node, from, to, at, duration, format) => {
    let value = from
    const proxy = {
      get v() {
        return value
      },
      set v(n) {
        value = n
        node.textContent = format(n)
      },
    }
    node.textContent = format(from)
    return timeline.fromTo(proxy, { v: from }, { v: to, duration, ease: 'none' }, at)
  }

  // ───────────────────────────── NEWS ─────────────────────────────

  // 1 breaking-banner: accent tag slams in, headline strap wipes after it
  const breaking = { tag: 'ข่าวด่วน', headline: 'กรมอุตุฯ เตือนพายุฤดูร้อน 32 จังหวัด ระวังฝนตกหนัก ลมกระโชกแรง', sub: 'อัปเดต 14:32 น.' }
  defineGraphic('breaking-banner', {
    title: 'ข่าวด่วน · Breaking banner',
    place: 'lower',
    defaults: breaking,
    sample: { data: breaking },
    presets: {
      live: { title: 'แถบถ่ายทอดสด · Live banner', data: { tag: 'ถ่ายทอดสด', headline: 'นายกฯ แถลงมาตรการลดค่าครองชีพ ที่ทำเนียบรัฐบาล', sub: 'สด · 10:00 น.' } },
      update: { title: 'แถบอัปเดตข่าว · News update', data: { tag: 'อัปเดต', headline: 'ทางพิเศษศรีรัช เปิดการจราจรตามปกติแล้ว', sub: 'การทางพิเศษฯ · 17:05 น.' } },
    },
    sound: [['riser', 0], ['impact', 0.2]],
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const wrap = kit.el('div', 'wrap')
      const row = kit.el('div', 'row', null, wrap)
      const tag = kit.el('div', 'tag', null, row)
      const tagText = kit.el('span', null, data.tag, tag)
      const plate = kit.el('div', 'plate', null, row)
      const head = masked(kit, plate, data.headline)
      const rule = kit.el('i', 'rule', null, wrap)
      rule.style.transformOrigin = from === 'l' ? '0% 50%' : '100% 50%'
      const foot = data.sub ? kit.el('div', 'foot', null, wrap) : null
      const sub = foot ? masked(kit, foot, data.sub) : null
      // slam: falls onto the frame fast, the whole strap takes the impact
      tl.fromTo(tag, { scale: 1.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: 'power4.in' }, 0)
        .fromTo(wrap, { y: 0 }, { y: kit.vh * 0.7, duration: 0.05, yoyo: true, repeat: 3, ease: 'power1.inOut', immediateRender: false }, 0.2)
        .fromTo(tagText, { scale: 1.25 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 0.2)
        .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.inOut' }, 0.24)
      wipe(tl, plate, from, 'full', 0.28, 0.4)
      rise(tl, head, 0.38)
      if (foot) wipe(tl, foot, 't', 'full', 0.5, 0.3), rise(tl, sub, 0.52)
      const out = 0.85 + hold(kit)
      wipe(tl, plate, 'full', to, out, 0.35, 'power3.in')
      if (foot) wipe(tl, foot, 'full', 't', out, 0.25, 'power3.in')
      tl.to(rule, { scaleX: 0, duration: 0.3, ease: 'power3.in' }, out + 0.05)
      tl.to(tag, { scaleX: 0, transformOrigin: from === 'l' ? '0% 50%' : '100% 50%', duration: 0.25, ease: 'power3.in' }, out + 0.2)
    },
  })

  // 2 headline-ticker: label block + clock, headlines with a category chip crawl past
  const ticker = {
    label: 'ข่าวล่าสุด',
    time: '14:35',
    items: [
      { category: 'การเมือง', text: 'สภาฯ ผ่านร่าง พ.ร.บ.งบประมาณ ปี 2570 วาระแรก' },
      { category: 'เศรษฐกิจ', text: 'ทองคำแท่งขายออกบาทละ 46,350 บาท ปรับขึ้น 150 บาท' },
      { category: 'กีฬา', text: 'ทีมชาติไทยลงสนามพบเวียดนาม คืนนี้ 19:30 น.' },
      { category: 'จราจร', text: 'วิภาวดีฯ ขาออกช่วงดอนเมือง รถหนาแน่น' },
    ],
  }
  defineGraphic('headline-ticker', {
    title: 'แถบข่าววิ่ง · Headline ticker',
    place: 'crawl',
    defaults: ticker,
    sample: { data: ticker },
    presets: {
      sports: {
        title: 'แถบผลบอล · Score ticker',
        data: { label: 'ผลการแข่งขัน', time: 'FT', items: [{ category: 'ไทยลีก', text: 'บุรีรัมย์ 2–1 เมืองทอง' }, { category: 'ไทยลีก', text: 'บีจี ปทุม 0–0 การท่าเรือ' }, { category: 'ไทยลีก', text: 'ชลบุรี 3–2 ราชบุรี' }] },
      },
    },
    sound: [['swipe', 0]],
    build(kit, data, tl) {
      const bar = kit.el('div', 'bar')
      const label = kit.el('div', 'label', null, bar)
      const name = masked(kit, label, data.label)
      const time = data.time ? masked(kit, label, data.time, 'time') : null
      const viewport = kit.el('div', 'viewport', null, bar)
      const strip = kit.el('div', 'strip', null, viewport)
      const items = list(data.items ?? data.text).map((item) => (typeof item === 'object' ? item : { text: String(item) }))
      for (let copy = 0; copy < 2; copy++)
        for (const item of items) {
          const node = kit.el('span', 'item', null, strip)
          if (item.category) kit.el('span', 'chip', item.category, node)
          if (item.time) kit.el('span', 'at', item.time, node)
          kit.el('span', 'txt', item.text, node)
        }
      const seconds = Number(data.seconds ?? kit.hold ?? 20)
      tl.fromTo(bar, { yPercent: 100 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0)
      wipe(tl, label, 'l', 'full', 0.12, 0.35)
      rise(tl, [name, time].filter(Boolean), 0.2)
      const width = strip.scrollWidth / 2 || innerWidth
      // one linear tween over the whole crawl; the modifier wraps it onto the duplicated strip
      tl.fromTo(strip, { x: 0 }, { x: -13 * kit.vh * seconds, duration: seconds, ease: 'none', modifiers: { x: gsap.utils.unitize((x) => parseFloat(x) % width) } }, 0.3)
      tl.fromTo(viewport, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.25)
      tl.to(bar, { yPercent: 100, duration: 0.35, ease: 'power2.in' }, 0.3 + seconds)
    },
  })

  // ───────────────────────────── SPORTS ─────────────────────────────

  const clockText = (s) => pad(Math.floor(s / 60)) + ':' + pad(Math.floor(s % 60))
  const parseClock = (v) => {
    const [m, s = 0] = String(v ?? '').split(':').map(Number)
    return Number.isFinite(m) ? m * 60 + (Number(s) || 0) : null
  }

  // 3 scoreboard-bug: team codes + scores; the scoring side flips; clock runs on the timeline
  const bug = { home: 'BRU', away: 'MTU', homeScore: 2, awayScore: 1, period: 'ครึ่งหลัง', clock: '67:12', scored: 'home' }
  defineGraphic('scoreboard-bug', {
    title: 'สกอร์บอร์ด · Score bug',
    place: 'corner',
    defaults: bug,
    sample: { data: bug },
    presets: {
      pinned: { title: 'สกอร์บอร์ดค้างจอ · Pinned score bug', data: { persist: true, scored: null } },
      basketball: { title: 'สกอร์บาส · Basketball bug', data: { home: 'THA', away: 'PHI', homeScore: 78, awayScore: 74, period: 'Q4', clock: '06:41', scored: 'home', countdown: true } },
    },
    sound: [['whoosh-low', 0]],
    build(kit, data, tl) {
      const box = kit.el('div', 'bug')
      const team = (code, cls) => {
        const cell = kit.el('div', 'team ' + cls, null, box)
        kit.el('i', 'stripe', null, cell)
        const text = kit.el('span', 'code', code, cell)
        return { cell, text, bar: kit.el('i', 'goal', null, cell) }
      }
      const home = team(data.home, 'home')
      const scores = kit.el('div', 'scores', null, box)
      const hs = kit.el('span', 'n', null, kit.el('span', 'flip', null, scores))
      kit.el('i', 'sep', null, scores)
      const as = kit.el('span', 'n', null, kit.el('span', 'flip', null, scores))
      const away = team(data.away, 'away')
      const meta = kit.el('div', 'meta', null, box)
      const period = kit.el('span', 'period', data.period ?? '', meta)
      const clock = kit.el('span', 'clock', null, meta)
      if (!data.period) period.remove()
      const val = (n) => String(Number(n) || 0)
      const side = { home: [hs, data.homeScore, home], away: [as, data.awayScore, away] }
      hs.textContent = val(data.homeScore)
      as.textContent = val(data.awayScore)
      const flip = (timeline, node, value, at) => {
        timeline.to(node, { rotationX: 90, duration: 0.12, ease: 'power2.in' }, at)
        // live updates run in real time, so a callback is fine there; the paused tl needs swap
        if (timeline === tl) kit.swap(node, value, at + 0.12)
        else timeline.call(() => (node.textContent = value), [], at + 0.12)
        timeline.fromTo(node, { rotationX: -90 }, { rotationX: 0, duration: 0.25, ease: 'back.out(2.2)', immediateRender: false }, at + 0.12)
      }
      wipe(tl, box, 'r', 'full', 0, 0.4, 'power4.out')
      tl.fromTo([home.text, hs, as, away.text, meta], { yPercent: 120 }, { yPercent: 0, duration: 0.35, ease: 'power3.out', stagger: 0.04 }, 0.15)
      const scored = side[data.scored]
      if (scored && Number(scored[1]) > 0) {
        scored[0].textContent = val(scored[1] - 1)
        flip(tl, scored[0], val(scored[1]), 0.85)
        kit.sound('flap', 0.85)
        tl.fromTo(scored[2].bar, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out' }, 0.95)
      }
      const out = 0.6 + hold(kit)
      const start = parseClock(data.clock)
      let run = null
      if (start != null) {
        const down = !!data.countdown
        // pinned bugs keep ticking to full time (or 0:00 counting down); a one-shot runs while visible
        const length = data.persist ? (down ? start : Math.max(1, Number(data.until ?? 5400) - start)) : out + 0.4
        const span = data.running === false ? 0 : Math.min(length, down ? start : Infinity)
        run = linear(tl, clock, start, down ? start - span : start + span, 0, Math.max(0.001, span), clockText)
      } else clock.remove()
      if (!data.persist) wipe(tl, box, 'full', 'r', out, 0.4, 'power3.in')
      kit.root.__update = (next) => {
        for (const key of ['home', 'away']) {
          const value = next[key + 'Score']
          if (value != null && val(value) !== side[key][0].textContent) flip(gsap.timeline(), side[key][0], val(value), 0), window.playSound?.('flap')
        }
        if (next.period != null) period.textContent = next.period
        const at = parseClock(next.clock)
        if (at != null) {
          run?.kill()
          run = next.running === false ? (clock.textContent = clockText(at), null) : linear(gsap, clock, at, at + 5400, 0, 5400, clockText)
        }
        return true
      }
    },
  })

  // 4 match-stats: values either side, bars grow out from the centre; the leader takes the accent
  const stats = {
    home: 'BRU',
    away: 'MTU',
    title: 'สถิติครึ่งแรก',
    rows: [
      { label: 'ครองบอล', home: 58, away: 42, unit: '%' },
      { label: 'ยิงทั้งหมด', home: 11, away: 6 },
      { label: 'ยิงเข้ากรอบ', home: 5, away: 2 },
      { label: 'เตะมุม', home: 6, away: 3 },
      { label: 'ฟาวล์', home: 9, away: 12 },
    ],
  }
  defineGraphic('match-stats', {
    title: 'สถิติการแข่งขัน · Match stats',
    place: 'lower',
    defaults: stats,
    sample: { data: stats },
    presets: {
      fulltime: { title: 'สถิติจบเกม · Full-time stats', data: { title: 'สถิติตลอดเกม', rows: [{ label: 'ครองบอล', home: 61, away: 39, unit: '%' }, { label: 'xG', home: 2.4, away: 0.9 }, { label: 'ยิงเข้ากรอบ', home: 8, away: 3 }, { label: 'ผ่านบอลสำเร็จ', home: 88, away: 79, unit: '%' }, { label: 'ใบเหลือง', home: 1, away: 4 }] } },
    },
    sound: [['swoosh', 0], ['blip', 0.4]],
    build(kit, data, tl) {
      const [, to] = sides(kit)
      const card = kit.el('div', 'card')
      const head = kit.el('div', 'head', null, card)
      const codes = [masked(kit, head, data.home, 'code home'), masked(kit, head, data.title ?? 'สถิติ', 'title'), masked(kit, head, data.away, 'code away')]
      const rule = kit.el('i', 'rule', null, card)
      const rows = list(data.rows).slice(0, 7).map((r) => {
        const row = kit.el('div', 'row', null, card)
        const nums = kit.el('div', 'nums', null, row)
        const hv = kit.el('b', 'v', null, nums)
        const label = kit.el('span', 'lab', r.label, nums)
        const av = kit.el('b', 'v', null, nums)
        const bars = kit.el('div', 'bars', null, row)
        const h = Number(r.home) || 0
        const a = Number(r.away) || 0
        const max = Math.max(h, a) || 1
        const fill = (v, cls) => {
          const node = kit.el('i', 'fill' + (v > (cls === 'l' ? a : h) ? ' lead' : ''), null, kit.el('span', 'half ' + cls, null, bars))
          return [node, v / max]
        }
        return { hv, av, label, h, a, unit: r.unit ?? '', fills: [fill(h, 'l'), fill(a, 'r')] }
      })
      wipe(tl, card, 'b', 'full', 0, 0.35)
      rise(tl, codes, 0.12)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'power3.inOut' }, 0.18)
      rows.forEach((r, i) => {
        const at = 0.35 + i * 0.08
        tl.fromTo(r.label, { opacity: 0, y: kit.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, at)
        for (const [node, w] of r.fills) tl.fromTo(node, { scaleX: 0 }, { scaleX: w, duration: 0.7, ease: 'power3.out' }, at + 0.05)
        countTo(kit, r.hv, r.h, at + 0.05, 0.7, 0, r.unit)
        countTo(kit, r.av, r.a, at + 0.05, 0.7, 0, r.unit)
      })
      const out = Math.max(1.2, 0.5 + rows.length * 0.08) + hold(kit)
      wipe(tl, card, 'full', to, out, 0.4, 'power3.in')
    },
  })

  // 5 goal-moment: an accent band sweeps the frame, the word punches through, scorer strap below
  const goal = { word: 'ประตู!', player: 'ศุภชัย ใจเด็ด', minute: 67, team: 'บุรีรัมย์ ยูไนเต็ด', score: '2–1' }
  defineGraphic('goal-moment', {
    title: 'จังหวะประตู · Goal moment',
    place: 'full',
    defaults: goal,
    sample: { data: goal },
    presets: {
      penalty: { title: 'ประตูจากจุดโทษ · Penalty goal', data: { word: 'ประตู!', player: 'ธีรศิลป์ แดงดา', minute: 88, team: 'ทีมชาติไทย', score: '1–0', note: 'จุดโทษ' } },
      try: { title: 'ทำแต้ม · Point scored', data: { word: 'สุดยอด!', player: 'ชนาธิป สรงกระสินธ์', minute: 34, team: 'ทีมชาติไทย', score: null } },
    },
    sound: [['whoosh-big', 0], ['boom', 0.14], ['applause', 0.3]],
    build(kit, data, tl) {
      const band = kit.el('div', 'band')
      const ghost = kit.el('div', 'ghost', null, band)
      for (let i = 0; i < 6; i++) kit.el('span', null, data.word, ghost)
      const edgeTop = kit.el('i', 'edge top', null, band)
      const edgeBottom = kit.el('i', 'edge bottom', null, band)
      const word = kit.el('div', 'word', null, band)
      const letters = kit.graphemes(data.word).map((g) => kit.el('span', null, g, word))
      const strap = kit.el('div', 'strap', null, kit.root)
      const minute = kit.el('span', 'minute', data.minute != null ? data.minute + "'" : '', strap)
      const body = kit.el('div', 'body', null, strap)
      const player = masked(kit, body, data.player, 'player')
      const team = masked(kit, body, [data.team, data.note].filter(Boolean).join(' · '), 'team')
      const score = data.score ? kit.el('span', 'score', data.score, strap) : null
      if (data.minute == null) minute.remove()
      wipe(tl, band, 'l', 'full', 0, 0.35, 'power4.out')
      tl.fromTo([edgeTop, edgeBottom], { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.out', stagger: 0.06 }, 0.1)
      tl.fromTo(letters, { yPercent: 120, skewX: -14 }, { yPercent: 0, skewX: 0, duration: 0.45, ease: 'expo.out', stagger: 0.04 }, 0.14)
      tl.fromTo(word, { scale: 1.12 }, { scale: 1, duration: 0.6, ease: 'power3.out' }, 0.14)
        .to(word, { scale: 1.035, duration: hold(kit), ease: 'none' }, 0.74)
      wipe(tl, strap, 'l', 'full', 0.5, 0.4)
      if (data.minute != null) tl.fromTo(minute, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, 0.62)
      rise(tl, [player, team], 0.6, 0.08)
      if (score) tl.fromTo(score, { opacity: 0, x: 2 * kit.vh }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, 0.8)
      const out = 0.9 + hold(kit)
      tl.fromTo(ghost, { x: 0 }, { x: -24 * kit.vw, duration: out + 0.5, ease: 'none' }, 0)
      tl.to(letters, { yPercent: -120, duration: 0.3, ease: 'power3.in', stagger: 0.03 }, out)
      wipe(tl, strap, 'full', 'r', out, 0.35, 'power3.in')
      wipe(tl, band, 'full', 'r', out + 0.12, 0.38, 'power3.in')
    },
  })

  // ───────────────────────────── WEATHER & PLACE ─────────────────────────────

  // icons are fixed markup chosen from an enum; event data never reaches the SVG
  const RAYS = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    const p = (r) => `${(32 + r * Math.cos(a)).toFixed(1)} ${(32 + r * Math.sin(a)).toFixed(1)}`
    return `<path pathLength="1" d="M${p(17)}L${p(23)}"/>`
  }).join('')
  const CLOUD = 'M18 46H46A9 9 0 0 0 46 28A13 13 0 0 0 21 26A10 10 0 0 0 18 46Z'
  const ICONS = {
    sun: `<g class="sun"><circle pathLength="1" cx="32" cy="32" r="11"/><g class="rays">${RAYS}</g></g>`,
    cloud: `<path class="cloud" pathLength="1" d="${CLOUD}"/>`,
    partly: `<g class="sun" transform="translate(-9 -9) scale(.8)"><circle pathLength="1" cx="32" cy="32" r="11"/><g class="rays">${RAYS}</g></g><path class="cloud" pathLength="1" d="${CLOUD}" transform="translate(4 4)"/>`,
    rain: `<path class="cloud" pathLength="1" d="${CLOUD}" transform="translate(0 -8)"/><g class="drops"><path pathLength="1" d="M24 44l-2 7"/><path pathLength="1" d="M33 44l-2 7"/><path pathLength="1" d="M42 44l-2 7"/></g>`,
    storm: `<path class="cloud" pathLength="1" d="${CLOUD}" transform="translate(0 -8)"/><path class="bolt" pathLength="1" d="M34 40l-6 10h7l-5 10"/>`,
  }
  const CONDITION = { sun: 'แดดจัด', partly: 'มีเมฆบางส่วน', cloud: 'เมฆมาก', rain: 'ฝนตก', storm: 'พายุฝนฟ้าคะนอง' }

  // 6 weather-card: city, drawn condition icon, temperature counts up, high / low
  const weather = { city: 'กรุงเทพมหานคร', time: 'วันนี้ 14:00 น.', temp: 34, condition: 'sun', high: 36, low: 27, rain: 10 }
  defineGraphic('weather-card', {
    title: 'การ์ดสภาพอากาศ · Weather card',
    place: 'corner',
    defaults: weather,
    sample: { data: weather },
    presets: {
      rain: { title: 'อากาศ · ฝนตก', data: { city: 'เชียงใหม่', time: 'พรุ่งนี้', temp: 24, condition: 'rain', high: 27, low: 21, rain: 80 } },
      storm: { title: 'อากาศ · พายุ', data: { city: 'ภูเก็ต', time: 'คืนนี้', temp: 28, condition: 'storm', high: 30, low: 25, rain: 90 } },
      partly: { title: 'อากาศ · เมฆบางส่วน', data: { city: 'ขอนแก่น', time: 'วันนี้ 09:00 น.', temp: 31, condition: 'partly', high: 34, low: 24, rain: 30 } },
    },
    sound: [['swoosh', 0], ['shimmer', 0.3]],
    build(kit, data, tl) {
      const kind = ICONS[data.condition] ? data.condition : 'cloud'
      const card = kit.el('div', 'card')
      const head = kit.el('div', 'head', null, card)
      const city = masked(kit, head, data.city, 'city')
      const time = data.time ? masked(kit, head, data.time, 'time') : null
      const mid = kit.el('div', 'mid', null, card)
      const icon = kit.svg(`<svg class="icon is-${kind}" viewBox="0 0 64 64" aria-hidden="true">${ICONS[kind]}</svg>`, mid)
      const right = kit.el('div', 'right', null, mid)
      const temp = kit.el('b', 'temp', null, right)
      const cond = masked(kit, right, data.label ?? CONDITION[kind], 'cond')
      const rule = kit.el('i', 'rule', null, card)
      const foot = kit.el('div', 'foot', null, card)
      const stat = (label, value) => {
        const cell = kit.el('span', 'stat', null, foot)
        kit.el('span', 'k', label, cell)
        return kit.el('b', null, value, cell)
      }
      if (data.high != null) stat('สูงสุด', Math.round(data.high) + '°')
      if (data.low != null) stat('ต่ำสุด', Math.round(data.low) + '°')
      if (data.rain != null) stat('โอกาสฝน', Math.round(data.rain) + '%')
      wipe(tl, card, 't', 'full', 0, 0.4)
      rise(tl, [city, time].filter(Boolean), 0.12)
      draw(tl, icon.querySelectorAll('[pathLength]'), 0.25, 0.55, 0.03)
      const t = Number(data.temp) || 0
      kit.count(temp, Math.round(Number(data.low ?? t - 8)), Math.round(t), 0.3, 0.9, (n) => n + '°')
      temp.textContent = Math.round(Number(data.low ?? t - 8)) + '°'
      rise(tl, cond, 0.45)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'power3.inOut' }, 0.4)
      tl.fromTo(foot.children, { opacity: 0, y: kit.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.06 }, 0.55)
      const out = 0.9 + hold(kit)
      const rays = icon.querySelector('.rays')
      if (rays) tl.fromTo(rays, { rotation: 0 }, { rotation: 45, svgOrigin: '32 32', duration: out, ease: 'none' }, 0)
      const drops = icon.querySelectorAll('.drops path')
      if (drops.length) tl.fromTo(drops, { y: -3, opacity: 0 }, { y: 5, opacity: 1, duration: 0.6, ease: 'none', stagger: 0.18, repeat: Math.max(1, Math.floor(out / 0.6) - 1) }, 0.8)
      const bolt = icon.querySelector('.bolt')
      if (bolt) tl.fromTo(bolt, { opacity: 1 }, { opacity: 0.25, duration: 0.07, yoyo: true, repeat: 3, immediateRender: false }, 1.3)
      wipe(tl, card, 'full', 't', out, 0.35, 'power3.in')
    },
  })

  // 7 map-pin: the pin drops onto kit.point, ripples, a place card opens beside it
  const pin = { place: 'สยามสแควร์', detail: 'เขตปทุมวัน กรุงเทพฯ', coords: '13.7455° N, 100.5340° E' }
  defineGraphic('map-pin', {
    title: 'หมุดแผนที่ · Map pin',
    place: 'spot',
    defaults: pin,
    sample: { data: pin, x: 0.42, y: 0.55 },
    presets: {
      event: { title: 'หมุดจุดเกิดเหตุ · Incident pin', data: { place: 'แยกอโศก', detail: 'อุบัติเหตุ รถติดสะสม 2 กม.', coords: null } },
    },
    sound: [['thud', 0.22], ['ping', 0.4]],
    build(kit, data, tl) {
      const p = kit.point ?? { x: innerWidth * 0.5, y: innerHeight * 0.55 }
      const flip = p.x > innerWidth * 0.64
      const at = kit.el('div', 'at')
      Object.assign(at.style, { left: p.x + 'px', top: p.y + 'px' })
      const shadow = kit.el('i', 'shadow', null, at)
      const rings = [kit.el('i', 'ring', null, at), kit.el('i', 'ring', null, at)]
      const marker = kit.svg('<svg class="pin" viewBox="0 0 48 64" aria-hidden="true"><path d="M24 62C24 62 5 39 5 24a19 19 0 0 1 38 0c0 15-19 38-19 38z"/><circle cx="24" cy="24" r="7.5"/></svg>', at)
      const card = kit.el('div', 'card' + (flip ? ' flip' : ''), null, at)
      const place = masked(kit, card, data.place, 'place')
      const detail = data.detail ? masked(kit, card, data.detail, 'detail') : null
      const coords = data.coords ? masked(kit, card, data.coords, 'coords') : null
      tl.fromTo(marker, { y: -45 * kit.vh, opacity: 1 }, { y: 0, duration: 0.6, ease: 'bounce.out' }, 0)
        .fromTo(shadow, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: 'bounce.out' }, 0)
      const out = 0.95 + hold(kit)
      rings.forEach((ring, i) => {
        tl.fromTo(ring, { scale: 0.1, opacity: 0.9 }, { scale: 1, opacity: 0, duration: 1.2, ease: 'power2.out', repeat: Math.max(0, Math.floor((out - 0.4) / 1.2) - 1) }, 0.38 + i * 0.6)
      })
      wipe(tl, card, flip ? 'r' : 'l', 'full', 0.55, 0.4)
      rise(tl, [place, detail, coords].filter(Boolean), 0.62, 0.07)
      wipe(tl, card, 'full', flip ? 'r' : 'l', out, 0.3, 'power3.in')
      tl.to(marker, { scale: 0, transformOrigin: '50% 100%', duration: 0.3, ease: 'back.in(2)' }, out + 0.15)
        .to(shadow, { scale: 0, opacity: 0, duration: 0.3, ease: 'power2.in' }, out + 0.15)
    },
  })

  // ───────────────────────────── EDUCATION ─────────────────────────────

  // 8 quiz-question: question, options, a draining timer, then the answer fills and gets a drawn check
  const quiz = { number: 'ข้อ 3', question: 'จังหวัดใดอยู่เหนือสุดของประเทศไทย', options: ['เชียงใหม่', 'เชียงราย', 'แม่ฮ่องสอน', 'น่าน'], answer: 1, think: 3 }
  defineGraphic('quiz-question', {
    title: 'คำถามควิซ · Quiz question',
    place: 'lower',
    defaults: quiz,
    sample: { data: quiz },
    presets: {
      'true-false': { title: 'ควิซ ถูก/ผิด · True or false', data: { number: 'ข้อ 5', question: 'ดวงอาทิตย์เป็นดาวฤกษ์', options: ['จริง', 'ไม่จริง'], answer: 0 } },
      fast: { title: 'ควิซเฉลยเร็ว · Quick reveal', data: { think: 1.2 } },
    },
    sound: [['whoosh', 0]],
    build(kit, data, tl) {
      const [, to] = sides(kit)
      const card = kit.el('div', 'card')
      const head = kit.el('div', 'head', null, card)
      const chip = kit.el('span', 'chip', data.number ?? 'คำถาม', head)
      const count = kit.el('b', 'count', null, head)
      const timer = kit.el('i', 'timer', null, kit.el('span', 'track', null, card))
      const question = masked(kit, card, data.question, 'q')
      const grid = kit.el('div', 'grid', null, card)
      const options = list(data.options).slice(0, 4)
      const answer = Number(data.answer)
      const opts = options.map((text, i) => {
        const opt = kit.el('div', 'opt', null, grid)
        const fill = (cls) => {
          const layer = kit.el('div', cls, null, opt)
          kit.el('span', 'key', THAI_KEYS[i], layer)
          kit.el('span', 'txt', text, layer)
          return layer
        }
        fill('face')
        const over = i === answer ? fill('face over') : null
        if (over) kit.svg(CHECK, over)
        return { opt, over }
      })
      wipe(tl, card, 'b', 'full', 0, 0.35)
      tl.fromTo(chip, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, 0.12)
      rise(tl, question, 0.15)
      tl.fromTo(opts.map((o) => o.opt), { opacity: 0, y: 1.6 * kit.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out', stagger: 0.07 }, 0.35)
      const think = Math.max(0.6, Number(data.think ?? 3))
      const start = 0.45 + opts.length * 0.07
      const reveal = start + think
      tl.fromTo(timer, { scaleX: 1 }, { scaleX: 0, duration: think, ease: 'none' }, start)
      linear(tl, count, think, 0, start, think, (n) => String(Math.ceil(n - 1e-6)))
      tl.fromTo(count, { opacity: 0 }, { opacity: 1, duration: 0.2 }, start - 0.15)
      tl.to(count, { opacity: 0, duration: 0.2 }, reveal)
      const right = opts[answer]
      if (right) {
        wipe(tl, right.over, 'l', 'full', reveal, 0.35, 'power3.inOut')
        tl.fromTo(right.opt, { scale: 1 }, { scale: 1.04, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, reveal + 0.25)
        draw(tl, right.over.querySelector('.check path'), reveal + 0.3, 0.35)
      }
      const picked = opts[Number(data.picked)]
      if (picked && picked !== right) {
        picked.opt.classList.add('miss')
        tl.fromTo(picked.opt, { x: 0 }, { x: 0.8 * kit.vh, duration: 0.05, yoyo: true, repeat: 5, ease: 'power1.inOut', immediateRender: false }, reveal + 0.1)
        kit.sound('error', reveal + 0.1)
      } else kit.sound(right ? 'success' : 'error', reveal + 0.3)
      const wrong = opts.filter((o, i) => i !== answer && o !== picked).map((o) => o.opt)
      if (wrong.length) tl.to(wrong, { opacity: 0.38, duration: 0.3, ease: 'power2.out' }, reveal + 0.1)
      const out = reveal + 0.5 + hold(kit)
      wipe(tl, card, 'full', to, out, 0.4, 'power3.in')
    },
  })

  // 9 tutorial-steps: numbered steps on a rail; done ones checked, current one highlighted
  const steps = { title: 'ตั้งค่า OBS สำหรับไลฟ์', steps: ['ติดตั้ง OBS Studio', 'เพิ่ม Browser Source', 'วางลิงก์โอเวอร์เลย์', 'ตั้งขนาด 1920 × 1080', 'กดเริ่มสตรีม'], current: 3 }
  defineGraphic('tutorial-steps', {
    title: 'ขั้นตอนสอน · Tutorial steps',
    place: 'corner',
    defaults: steps,
    sample: { data: steps },
    presets: {
      pinned: { title: 'ขั้นตอนค้างจอ · Pinned steps', data: { persist: true } },
      recipe: { title: 'ขั้นตอนทำอาหาร · Recipe steps', data: { title: 'ผัดกะเพราหมูสับ', steps: ['ตำพริกกับกระเทียม', 'ผัดให้หอม ใส่หมูสับ', 'ปรุงรสด้วยซอส', 'ใส่ใบกะเพรา ปิดไฟ'], current: 2 } },
    },
    sound: [['swoosh', 0]],
    build(kit, data, tl) {
      const items = list(data.steps).slice(0, 7)
      const clamp = (n) => Math.max(1, Math.min(items.length, Math.round(Number(n) || 1)))
      let current = clamp(data.current) // 1-based step number
      const card = kit.el('div', 'card')
      const head = kit.el('div', 'head', null, card)
      const title = masked(kit, head, data.title ?? 'ขั้นตอน', 'title')
      const counter = kit.el('b', 'counter', null, head)
      const body = kit.el('div', 'body', null, card)
      const rail = kit.el('i', 'rail', null, body)
      const fill = kit.el('i', 'fill', null, rail)
      const rows = items.map((text, i) => {
        const row = kit.el('div', 'row', null, body)
        const hl = kit.el('i', 'hl', null, row)
        const node = kit.el('span', 'node', null, row)
        kit.el('span', 'num', String(i + 1), node)
        kit.svg(CHECK, node)
        kit.el('span', 'txt', text, row)
        return { row, hl, node }
      })
      const paint = (n) => {
        rows.forEach(({ row }, i) => {
          row.classList.toggle('done', i < n - 1)
          row.classList.toggle('now', i === n - 1)
        })
        counter.textContent = `${n}/${items.length}`
      }
      // rail runs node-centre to node-centre: share of the gap up to the current step
      const share = (n) => (items.length > 1 ? (n - 1) / (items.length - 1) : 0)
      paint(current)
      wipe(tl, card, 't', 'full', 0, 0.4)
      rise(tl, title, 0.12)
      tl.fromTo(counter, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.2)
      tl.fromTo(rows.map((r) => r.row), { opacity: 0, x: 2 * kit.vh }, { opacity: 1, x: 0, duration: 0.35, ease: 'power3.out', stagger: 0.06 }, 0.2)
      const railAt = 0.3 + rows.length * 0.06
      tl.fromTo(fill, { scaleY: 0 }, { scaleY: share(current), duration: 0.5, ease: 'power2.inOut' }, railAt)
      draw(tl, rows.slice(0, current - 1).map((r) => r.node.querySelector('.check path')), railAt, 0.3, 0.08)
      const now = rows[current - 1]
      if (now) {
        tl.fromTo(now.hl, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out' }, railAt + 0.35)
        kit.sound('ding', railAt + 0.35)
        tl.fromTo(now.node, { scale: 1 }, { scale: 1.18, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, railAt + 0.4)
      }
      const out = railAt + 0.8 + hold(kit)
      if (!data.persist) wipe(tl, card, 'full', 't', out, 0.35, 'power3.in')
      kit.root.__update = (next) => {
        if (next.current == null) return false
        current = clamp(next.current)
        paint(current)
        gsap.to(fill, { scaleY: share(current), duration: 0.5, ease: 'power2.inOut' })
        rows.forEach((r, i) => {
          gsap.set(r.node.querySelector('.check path'), { strokeDashoffset: i < current - 1 ? 0 : 1 })
          gsap.to(r.hl, { scaleX: i === current - 1 ? 1 : 0, duration: 0.4, ease: 'power3.out' })
        })
        return true
      }
    },
  })

  // 10 keyboard-shortcut: keycaps drop in, press down in order, release together
  const shortcut = { keys: ['Ctrl', 'Shift', 'P'], label: 'เปิดหน้าต่างคำสั่ง (Command Palette)', app: 'VS Code' }
  defineGraphic('keyboard-shortcut', {
    title: 'คีย์ลัด · Keyboard shortcut',
    place: 'lower',
    defaults: shortcut,
    sample: { data: shortcut },
    presets: {
      mac: { title: 'คีย์ลัด Mac · Mac shortcut', data: { keys: ['⌘', 'Shift', 'P'], app: 'VS Code · macOS' } },
      copy: { title: 'คีย์ลัดคัดลอก · Copy', data: { keys: ['Ctrl', 'C'], label: 'คัดลอกข้อความที่เลือก', app: 'Windows' } },
      screenshot: { title: 'คีย์ลัดจับภาพ · Screenshot', data: { keys: ['Win', 'Shift', 'S'], label: 'จับภาพหน้าจอบางส่วน', app: 'Windows' } },
    },
    sound: [['swoosh', 0]],
    build(kit, data, tl) {
      const [, to] = sides(kit)
      const card = kit.el('div', 'card')
      const row = kit.el('div', 'keys', null, card)
      const caps = list(data.keys).slice(0, 4).map((key, i) => {
        if (i) kit.el('span', 'plus', '+', row)
        const k = kit.el('span', 'key' + (kit.graphemes(key).length > 2 ? ' wide' : ''), null, row)
        kit.el('i', 'base', null, k)
        return kit.el('span', 'cap', key, k)
      })
      const plus = row.querySelectorAll('.plus')
      const foot = kit.el('div', 'foot', null, card)
      const rule = kit.el('i', 'rule', null, foot)
      const label = masked(kit, foot, data.label, 'label')
      const app = data.app ? masked(kit, foot, data.app, 'app') : null
      wipe(tl, card, 'b', 'full', 0, 0.35)
      tl.fromTo(row.querySelectorAll('.key'), { y: -2.4 * kit.vh, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.8)', stagger: 0.07 }, 0.12)
      tl.fromTo(plus, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.25, ease: 'back.out(2)', stagger: 0.07 }, 0.2)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'power3.inOut' }, 0.3)
      rise(tl, [label, app].filter(Boolean), 0.38, 0.08)
      const press = 0.75
      caps.forEach((cap, i) => {
        tl.fromTo(cap, { y: 0 }, { y: 0.75 * kit.vh, duration: 0.09, ease: 'power2.in', immediateRender: false }, press + i * 0.2)
        kit.sound('click', press + i * 0.2 + 0.08)
      })
      const release = press + caps.length * 0.2 + 0.4
      tl.to(caps, { y: 0, duration: 0.3, ease: 'back.out(3)' }, release)
      const out = Math.max(release + 0.4, 0.6 + hold(kit))
      wipe(tl, card, 'full', to, out, 0.35, 'power3.in')
    },
  })

  // 11 code-snippet: mono card, lines type out (stepped clip) behind a caret, numbered gutter
  const code = {
    language: 'JavaScript',
    file: 'price.js',
    lines: ['// คำนวณราคาหลังหักส่วนลด', 'function finalPrice(price, percent) {', '  const discount = price * percent / 100', '  return Math.round(price - discount)', '}', '', 'finalPrice(1290, 15) // 1097'],
  }
  defineGraphic('code-snippet', {
    title: 'โค้ดพิมพ์ทีละบรรทัด · Code snippet',
    place: 'card',
    defaults: code,
    sample: { data: code },
    presets: {
      python: { title: 'โค้ด Python', data: { language: 'Python', file: 'grade.py', lines: ['def grade(score):', '    if score >= 80:', '        return "A"', '    elif score >= 70:', '        return "B"', '    return "C"', '', 'print(grade(75))  # B'] } },
      terminal: { title: 'คำสั่งเทอร์มินัล · Terminal', data: { language: 'Terminal', file: 'zsh', lines: ['$ npm install gsap', '$ npm run dev', '> ready on http://localhost:3000'] } },
    },
    sound: [['whoosh', 0]],
    build(kit, data, tl) {
      const side = kit.away
      const card = kit.el('div', 'card')
      card.dataset.side = side
      const bar = kit.el('div', 'bar', null, card)
      kit.el('span', 'lang', data.language ?? 'code', bar)
      if (data.file) kit.el('span', 'file', data.file, bar)
      const lines = [].concat(data.lines ?? String(data.code ?? '').split('\n')).slice(0, 14)
      const body = kit.el('div', 'body', null, card)
      const rows = lines.map((line, i) => {
        const row = kit.el('div', 'line', null, body)
        const num = kit.el('span', 'num', String(i + 1), row)
        const text = String(line ?? '').replace(/\t/g, '  ')
        const src = kit.el('span', 'src', text || ' ', row)
        return { row, num, src, len: kit.graphemes(text).length }
      })
      const caret = kit.el('i', 'caret', null, body)
      const dx = (side === 'right' ? 1 : -1) * 6 * kit.vh
      tl.fromTo(card, { x: dx, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'expo.out' }, 0)
      const total = rows.reduce((sum, r) => sum + r.len, 0) || 1
      const perChar = Math.min(0.045, 2.2 / total)
      let at = 0.35
      tl.set(caret, { opacity: 1 }, 0.3)
      for (const r of rows) {
        const y = r.row.offsetTop
        const x0 = r.src.offsetLeft
        const w = r.src.offsetWidth
        tl.fromTo(r.num, { opacity: 0.35 }, { opacity: 1, duration: 0.1 }, at)
        if (r.len) {
          const d = r.len * perChar
          kit.sound('typing', at)
          tl.fromTo(r.src, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: d, ease: `steps(${r.len})` }, at)
          tl.fromTo(caret, { x: x0, y }, { x: x0 + w, y, duration: d, ease: `steps(${r.len})`, immediateRender: at === 0.35 }, at)
          at += d + 0.08
        } else {
          tl.fromTo(caret, { x: x0, y }, { x: x0, y, duration: 0.01, immediateRender: false }, at)
          at += 0.12
        }
      }
      const out = Math.max(at + 0.6, 0.8 + hold(kit))
      // caret blinks while the finished snippet holds (finite, so it stays seekable)
      const blinks = Math.max(1, Math.floor((out - at) / 0.5))
      tl.fromTo(caret, { opacity: 1 }, { opacity: 0, duration: 0.25, ease: 'steps(1)', yoyo: true, repeat: blinks * 2 - 1, immediateRender: false }, at)
      tl.to(card, { x: dx, opacity: 0, duration: 0.35, ease: 'power3.in' }, out)
    },
  })

  // 12 definition-card: dictionary entry; headword, reading, part of speech, numbered senses
  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙'
  const thaiNum = (n) => String(n).replace(/\d/g, (d) => THAI_DIGITS[d])
  const define = { label: 'คำศัพท์น่ารู้', word: 'อัลกอริทึม', reading: 'อัน-กอ-ริ-ทึม', pos: 'น.', meaning: 'ขั้นตอนหรือวิธีการที่เรียงลำดับไว้ชัดเจน เพื่อแก้ปัญหาหรือทำงานให้สำเร็จ', example: 'ฟีดโซเชียลจัดลำดับโพสต์ด้วยอัลกอริทึม' }
  defineGraphic('definition-card', {
    title: 'การ์ดคำศัพท์ · Definition card',
    place: 'lower',
    defaults: define,
    sample: { data: define },
    presets: {
      english: { title: 'ศัพท์อังกฤษ · English word', data: { label: 'English word', word: 'Serendipity', reading: '/ˌser.ənˈdɪp.ə.ti/', pos: 'n.', meaning: ['การบังเอิญพบสิ่งดี ๆ โดยไม่ได้ตั้งใจ', 'โชคดีที่เกิดขึ้นเองตามธรรมชาติ'], example: 'Finding this café was pure serendipity.' } },
      slang: { title: 'ศัพท์วัยรุ่น · Slang', data: { label: 'ศัพท์วัยรุ่น', word: 'ตึงมาก', reading: 'ตึง-มาก', pos: 'ว.', meaning: 'เก่ง เจ๋ง หรือโดดเด่นจนน่าทึ่ง', example: 'โชว์เมื่อกี้ตึงมาก' } },
    },
    sound: [['swoosh', 0], ['chime', 0.45]],
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const card = kit.el('div', 'card')
      const label = masked(kit, card, data.label ?? 'คำศัพท์', 'label')
      const top = kit.el('div', 'top', null, card)
      const word = masked(kit, top, data.word, 'word')
      const reading = data.reading ? kit.el('span', 'reading', data.reading, top) : null
      const pos = data.pos ? kit.el('span', 'pos', data.pos, top) : null
      const rule = kit.el('i', 'rule', null, card)
      const senses = list(data.meaning)
      const lines = senses.map((text, i) => {
        const line = kit.el('div', 'sense', null, card)
        if (senses.length > 1) kit.el('b', 'n', thaiNum(i + 1), line)
        return masked(kit, line, text, 'mean')
      })
      const example = data.example ? masked(kit, card, '“' + data.example + '”', 'ex') : null
      wipe(tl, card, from, 'full', 0, 0.4)
      rise(tl, label, 0.12)
      tl.fromTo(word, { yPercent: 115 }, { yPercent: 0, duration: 0.5, ease: 'expo.out' }, 0.18)
      if (reading) tl.fromTo(reading, { opacity: 0, x: -1.2 * kit.vh }, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, 0.35)
      if (pos) tl.fromTo(pos, { scale: 0, rotation: -12 }, { scale: 1, rotation: 0, duration: 0.3, ease: 'back.out(2.4)' }, 0.42)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.inOut', transformOrigin: from === 'l' ? '0% 50%' : '100% 50%' }, 0.3)
      rise(tl, lines, 0.5, 0.1)
      if (example) rise(tl, example, 0.6 + lines.length * 0.1)
      const out = 0.9 + lines.length * 0.1 + hold(kit)
      wipe(tl, card, 'full', to, out, 0.4, 'power3.in')
    },
  })

  // 13 chapter-progress: chapters on one rail; the marker travels from the last chapter to the current one
  const chapters = { title: 'สเต๊กหมูพริกไทยดำ', chapters: ['แนะนำ', 'เตรียมวัตถุดิบ', 'หมักเนื้อ', 'ย่างบนกระทะ', 'ทำซอส', 'จัดจาน'], current: 3 }
  defineGraphic('chapter-progress', {
    title: 'ความคืบหน้าบท · Chapter progress',
    place: 'lower',
    defaults: chapters,
    sample: { data: chapters },
    presets: {
      pinned: { title: 'บทค้างจอ · Pinned chapters', data: { persist: true } },
      lesson: { title: 'บทเรียน · Lesson chapters', data: { title: 'คณิต ม.3 · สมการกำลังสอง', chapters: ['ทบทวน', 'แยกตัวประกอบ', 'สูตรกำลังสอง', 'โจทย์ปัญหา', 'สรุป'], current: 2 } },
    },
    sound: [['swoosh', 0]],
    build(kit, data, tl) {
      const names = list(data.chapters).slice(0, 8)
      const n = Math.max(1, names.length)
      const clamp = (v) => Math.max(1, Math.min(n, Math.round(Number(v) || 1)))
      let current = clamp(data.current) // 1-based
      const [from, to] = sides(kit)
      const card = kit.el('div', 'card')
      const head = kit.el('div', 'head', null, card)
      const count = kit.el('b', 'count', null, head)
      const name = kit.el('span', 'name', null, kit.el('span', 'g-mask name-mask', null, head))
      const sub = data.title ? masked(kit, head, data.title, 'sub') : null
      const rail = kit.el('div', 'rail', null, card)
      const track = kit.el('i', 'track', null, rail)
      const fill = kit.el('i', 'fill', null, rail)
      const ticks = Array.from({ length: n + 1 }, (_, i) => {
        const t = kit.el('i', 'tick', null, rail)
        t.style.left = (i / n) * 100 + '%'
        return t
      })
      const marker = kit.el('span', 'marker', null, rail)
      const mnum = kit.el('b', null, null, marker)
      const labels = kit.el('div', 'labels', null, card)
      labels.style.gridTemplateColumns = `repeat(${n}, minmax(0, 1fr))`
      const cells = names.map((text, i) => kit.el('span', 'lab', text, labels))
      const mid = (c) => ((c - 0.5) / n) * 100
      const paint = (c) => {
        cells.forEach((cell, i) => (cell.className = 'lab' + (i < c - 1 ? ' done' : i === c - 1 ? ' now' : '')))
        count.textContent = `บทที่ ${c}/${n}`
        name.textContent = names[c - 1] ?? ''
        mnum.textContent = pad(c)
      }
      paint(current)
      const prev = Math.max(1, current - 1)
      wipe(tl, card, 'b', 'full', 0, 0.35)
      tl.fromTo(count, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.12)
      rise(tl, [name, sub].filter(Boolean), 0.15, 0.08)
      tl.fromTo(track, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.inOut', transformOrigin: from === 'l' ? '0% 50%' : '100% 50%' }, 0.2)
      tl.fromTo(ticks, { scaleY: 0 }, { scaleY: 1, duration: 0.25, ease: 'back.out(2)', stagger: 0.04 }, 0.3)
      tl.fromTo(cells, { opacity: 0, y: kit.vh }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.04 }, 0.35)
      tl.fromTo(marker, { scale: 0, left: mid(prev) + '%' }, { scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, 0.55)
      tl.fromTo(fill, { scaleX: 0 }, { scaleX: mid(prev) / 100, duration: 0.4, ease: 'power2.out' }, 0.45)
      if (current !== prev) {
        mnum.textContent = pad(prev)
        kit.swap(mnum, pad(current), 0.9)
        kit.sound('whoosh-low', 0.9)
        tl.to(marker, { left: mid(current) + '%', duration: 0.6, ease: 'power3.inOut' }, 0.9)
          .to(fill, { scaleX: mid(current) / 100, duration: 0.6, ease: 'power3.inOut' }, 0.9)
      }
      const out = 1.5 + hold(kit)
      if (!data.persist) wipe(tl, card, 'full', to, out, 0.4, 'power3.in')
      kit.root.__update = (next) => {
        if (next.current == null) return false
        current = clamp(next.current)
        paint(current)
        gsap.to(marker, { left: mid(current) + '%', duration: 0.6, ease: 'power3.inOut' })
        gsap.to(fill, { scaleX: mid(current) / 100, duration: 0.6, ease: 'power3.inOut' })
        return true
      }
    },
  })

  // ───────────────────────────── DATA ─────────────────────────────

  // 14 leaderboard: rows slide in from the bottom rank up; the leader's row carries the accent
  const board = {
    title: 'อันดับคะแนนตอบคำถาม',
    unit: 'คะแนน',
    rows: [
      { name: 'คุณมายด์', value: 2450 },
      { name: 'ต้นกล้า_99', value: 2310 },
      { name: 'ป๊อปปี้', value: 1980 },
      { name: 'Nong Bam', value: 1725 },
      { name: 'พี่เอก', value: 1640 },
    ],
  }
  defineGraphic('leaderboard', {
    title: 'ตารางอันดับ · Leaderboard',
    place: 'corner',
    defaults: board,
    sample: { data: board },
    presets: {
      gifters: { title: 'อันดับผู้สนับสนุน · Top gifters', data: { title: 'ผู้สนับสนุนสูงสุดคืนนี้', unit: 'เหรียญ', rows: [{ name: 'เจ๊หน่อย', value: 12800 }, { name: 'ป๋าโต้ง', value: 9450 }, { name: 'แพรวา', value: 6200 }, { name: 'บอสใหญ่', value: 3900 }] } },
    },
    sound: [['swoosh', 0]],
    build(kit, data, tl) {
      const rows = list(data.rows).slice(0, 8)
      const max = Math.max(1, ...rows.map((r) => Number(r.value) || 0))
      const card = kit.el('div', 'card')
      const head = kit.el('div', 'head', null, card)
      const title = masked(kit, head, data.title ?? 'อันดับ', 'title')
      const unit = data.unit ? kit.el('span', 'unit', data.unit, head) : null
      const rule = kit.el('i', 'rule', null, card)
      const nodes = rows.map((r, i) => {
        const row = kit.el('div', 'row' + (i === 0 ? ' top' : ''), null, card)
        kit.el('b', 'rank', String(i + 1), row)
        const mid = kit.el('div', 'mid', null, row)
        kit.el('span', 'name', r.name, mid)
        const bar = kit.el('i', 'bar', null, kit.el('span', 'track', null, mid))
        const value = kit.el('b', 'value', null, row)
        return { row, bar, value, v: Number(r.value) || 0 }
      })
      wipe(tl, card, 't', 'full', 0, 0.35)
      rise(tl, title, 0.1)
      if (unit) tl.fromTo(unit, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.2)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'power3.inOut', transformOrigin: '100% 50%' }, 0.15)
      const last = nodes.length - 1
      nodes.forEach((r, i) => {
        const at = 0.25 + (last - i) * 0.08
        tl.fromTo(r.row, { x: 6 * kit.vh, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'expo.out' }, at)
        tl.fromTo(r.bar, { scaleX: 0 }, { scaleX: r.v / max, duration: 0.7, ease: 'power3.out' }, at + 0.1)
        kit.count(r.value, 0, r.v, at + 0.1, 0.7)
        r.value.textContent = '0'
      })
      const topAt = 0.25 + last * 0.08
      if (nodes[0]) kit.sound('levelup', topAt + 0.4)
      if (nodes[0]) tl.fromTo(nodes[0].row.querySelector('.rank'), { scale: 1 }, { scale: 1.3, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, topAt + 0.4)
      const out = topAt + 0.9 + hold(kit)
      tl.to(nodes.map((r) => r.row), { x: 4 * kit.vh, opacity: 0, duration: 0.3, ease: 'power3.in', stagger: 0.03 }, out)
      wipe(tl, card, 'full', 't', out + 0.15, 0.35, 'power3.in')
    },
  })

  // 15 bar-race: bars grow to their first values, then race to the new ones and re-rank once
  const race = {
    title: 'เมนูที่คนดูโหวตมากที่สุด',
    unit: 'โหวต',
    items: [
      { label: 'ผัดกะเพรา', from: 820, value: 1240 },
      { label: 'ข้าวมันไก่', from: 960, value: 1110 },
      { label: 'ส้มตำ', from: 640, value: 1385 },
      { label: 'ต้มยำกุ้ง', from: 710, value: 905 },
      { label: 'ข้าวผัด', from: 420, value: 560 },
    ],
  }
  defineGraphic('bar-race', {
    title: 'กราฟแท่งแข่งกัน · Bar race',
    place: 'lower',
    defaults: race,
    sample: { data: race },
    presets: {
      static: { title: 'กราฟแท่งจัดอันดับ · Ranked bars', data: { title: 'ยอดขายแยกตามภาค (ล้านบาท)', unit: 'ล้านบาท', items: [{ label: 'ภาคกลาง', value: 48 }, { label: 'ภาคเหนือ', value: 21 }, { label: 'ภาคอีสาน', value: 33 }, { label: 'ภาคใต้', value: 17 }] } },
    },
    sound: [['swoosh', 0]],
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const items = list(data.items).slice(0, 8).map((it, i) => ({ i, label: it.label, from: Number(it.from ?? it.value) || 0, value: Number(it.value) || 0 }))
      const rank = (key) => [...items].sort((a, b) => b[key] - a[key] || a.i - b.i)
      const raced = items.some((it) => it.from !== it.value)
      const first = raced ? rank('from') : items
      const final = rank('value')
      const max = Math.max(1, ...items.flatMap((it) => [it.from, it.value]))
      const card = kit.el('div', 'card')
      const head = kit.el('div', 'head', null, card)
      const title = masked(kit, head, data.title ?? '', 'title')
      const unit = data.unit ? kit.el('span', 'unit', data.unit, head) : null
      const rule = kit.el('i', 'rule', null, card)
      const rowH = 5.2 * kit.vh
      const chart = kit.el('div', 'chart', null, card)
      chart.style.height = items.length * rowH + 'px'
      const trackW = 54 * kit.vh
      const leader = final[0]
      const rows = items.map((it) => {
        const row = kit.el('div', 'row' + (it === leader ? ' lead' : ''), null, chart)
        kit.el('span', 'lab', it.label, row)
        const track = kit.el('span', 'track', null, row)
        track.style.width = trackW + 'px'
        const bar = kit.el('i', 'bar', null, track)
        const value = kit.el('b', 'value', null, track)
        return { it, row, bar, value }
      })
      wipe(tl, card, 'b', 'full', 0, 0.35)
      rise(tl, title, 0.12)
      if (unit) tl.fromTo(unit, { opacity: 0 }, { opacity: 1, duration: 0.3 }, 0.2)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'power3.inOut', transformOrigin: from === 'l' ? '0% 50%' : '100% 50%' }, 0.15)
      const grow = 0.35
      const raceAt = grow + 0.95
      const reorder = final.some((it, i) => first[i] !== it)
      rows.forEach((r) => {
        const y0 = first.indexOf(r.it) * rowH
        const y1 = final.indexOf(r.it) * rowH
        const at = grow + first.indexOf(r.it) * 0.05
        tl.fromTo(r.row, { y: y0, opacity: 0 }, { y: y0, opacity: 1, duration: 0.25, ease: 'power2.out' }, at - 0.1)
        tl.fromTo(r.bar, { scaleX: 0 }, { scaleX: r.it.from / max, duration: 0.7, ease: 'power3.out' }, at)
        tl.fromTo(r.value, { x: 0 }, { x: (r.it.from / max) * trackW, duration: 0.7, ease: 'power3.out' }, at)
        kit.count(r.value, 0, r.it.from, at, 0.7)
        if (raced) {
          tl.to(r.bar, { scaleX: r.it.value / max, duration: 1.1, ease: 'power2.inOut' }, raceAt)
          tl.to(r.value, { x: (r.it.value / max) * trackW, duration: 1.1, ease: 'power2.inOut' }, raceAt)
          kit.count(r.value, r.it.from, r.it.value, raceAt, 1.1)
        }
        if (reorder) tl.to(r.row, { y: y1, duration: 0.6, ease: 'power3.inOut' }, raceAt + (raced ? 0.45 : 0))
        r.value.textContent = '0'
      })
      const end = raced || reorder ? raceAt + 1.15 : grow + 0.8
      if (raced || reorder) kit.sound('whoosh', raceAt), kit.sound('ding', end - 0.1)
      const out = end + hold(kit)
      wipe(tl, card, 'full', to, out, 0.4, 'power3.in')
    },
  })

  // 16 dual-subtitle: Thai line + translation line, accent tick binds the pair
  const subs = { text: 'วันนี้เราจะมาเรียนวิธีปลูกผักสวนครัวในคอนโดกันครับ', translation: 'Today we’ll learn how to grow a kitchen garden in a condo.' }
  defineGraphic('dual-subtitle', {
    title: 'ซับสองภาษา · Dual subtitle',
    place: 'caption',
    theme: 'ink',
    themes: ['ink', 'paper', 'pop'],
    defaults: subs,
    sample: { data: subs },
    presets: {
      speaker: { title: 'ซับสองภาษา + ผู้พูด · With speaker', theme: 'ink', data: { speaker: 'ดร.ภาวินี', text: 'ดินที่ดีควรระบายน้ำได้ และมีอินทรียวัตถุสูง', translation: 'Good soil should drain well and be rich in organic matter.' } },
      'en-th': { title: 'ซับอังกฤษ-ไทย · English → Thai', theme: 'ink', data: { text: 'Let’s start with the basics.', translation: 'เรามาเริ่มจากพื้นฐานกันก่อน' } },
    },
    sound: [],
    build(kit, data, tl) {
      const box = kit.el('div', 'box')
      const tick = kit.el('i', 'tick', null, box)
      const col = kit.el('div', 'col', null, box)
      const speaker = data.speaker ? masked(kit, col, data.speaker, 'speaker') : null
      const main = masked(kit, col, data.text, 'main')
      const trans = data.translation ? masked(kit, col, data.translation, 'trans') : null
      tl.fromTo(box, { opacity: 0, y: 1.2 * kit.vh }, { opacity: 1, y: 0, duration: 0.25, ease: 'power3.out' }, 0)
        .fromTo(tick, { scaleY: 0 }, { scaleY: 1, duration: 0.35, ease: 'power3.out' }, 0.05)
      rise(tl, [speaker, main, trans].filter(Boolean), 0.08, 0.1, 0.35)
      const out = 0.5 + hold(kit)
      tl.to(box, { opacity: 0, y: -0.8 * kit.vh, duration: 0.3, ease: 'power2.in' }, out)
    },
  })

  // 17 lower-third-name: classic two-tier strap; name plate, offset role plate, accent bar
  const person = { name: 'ผศ.ดร.ปิยะนุช วงศ์สวัสดิ์', role: 'นักวิชาการด้านภูมิอากาศ', tag: null }
  defineGraphic('lower-third-name', {
    title: 'ชื่อ + ตำแหน่ง · Name lower third',
    place: 'lower',
    defaults: person,
    sample: { data: person },
    presets: {
      guest: { title: 'แขกรับเชิญ · Guest', data: { tag: 'แขกรับเชิญ', name: 'ชลธิชา บุญมา', role: 'ผู้ก่อตั้งแบรนด์ผ้าทอมือ จ.น่าน' } },
      reporter: { title: 'ผู้สื่อข่าว · Reporter', data: { tag: 'ผู้สื่อข่าว', name: 'ธนวัฒน์ แก้วมณี', role: 'รายงานจากทำเนียบรัฐบาล' } },
    },
    sound: [['swoosh', 0]],
    build(kit, data, tl) {
      const [from, to] = sides(kit)
      const wrap = kit.el('div', 'wrap')
      const bar = kit.el('i', 'bar', null, wrap)
      const col = kit.el('div', 'col', null, wrap)
      const tag = data.tag ? kit.el('span', 'tag', data.tag, col) : null
      const plate = kit.el('div', 'plate', null, col)
      const name = masked(kit, plate, data.name)
      const role = data.role ? kit.el('div', 'role', null, col) : null
      const roleText = role ? masked(kit, role, data.role) : null
      tl.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: 'power3.out' }, 0)
      wipe(tl, plate, from, 'full', 0.1, 0.4)
      rise(tl, name, 0.2)
      if (role) wipe(tl, role, from, 'full', 0.24, 0.38), rise(tl, roleText, 0.32)
      if (tag) wipe(tl, tag, 'b', 'full', 0.36, 0.3)
      const out = 0.8 + hold(kit)
      wipe(tl, [tag, role].filter(Boolean), 'full', to, out, 0.3, 'power3.in')
      wipe(tl, plate, 'full', to, out + 0.08, 0.35, 'power3.in')
      tl.to(bar, { scaleY: 0, transformOrigin: '50% 0%', duration: 0.25, ease: 'power3.in' }, out + 0.2)
    },
  })
})()
