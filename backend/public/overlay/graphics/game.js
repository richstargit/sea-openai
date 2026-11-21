// Gaming / esports graphics: kill feed, streaks, countdowns, versus, MVP, brackets, veto, HP/XP bars.
// Angular cut panels, condensed numerals, hairline frames. Every motion sits on the paused `tl`
// at an explicit time; visible text changes go through setters (driver / kit.count / kit.swap).
;(() => {
  const IN = 0.4
  const OUT = 0.35
  const hold = (kit) => kit.hold ?? 2.4
  const str = (v) => (v == null ? '' : String(v))
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
  // seek-safe value driver: GSAP writes `v`, the setter redraws (onUpdate is suppressed while seeking)
  const driver = (v, draw) => ({ get v() { return v }, set v(n) { v = n; draw(n) } })
  // count a stat like "24", "1.85" or "78%" up from zero, keeping its decimals and suffix
  const countStat = (kit, tl, node, value, at, duration = 0.7) => {
    const m = /^(\D*?)(\d+(?:\.\d+)?)(.*)$/.exec(str(value).replace(/,/g, ''))
    if (!m) return kit.text(node, str(value))
    const [, pre, digits, post] = m
    const dec = (digits.split('.')[1] ?? '').length
    const to = Number(digits)
    const draw = (n) => kit.text(node, pre + (dec ? n.toFixed(dec) : kit.num(Math.round(n))) + post)
    tl.fromTo(driver(0, draw), { v: 0 }, { v: to, duration, ease: 'power2.out' }, at)
  }
  const shake = (tl, node, kit, at, amp = 0.8) =>
    tl.to(node, { keyframes: { x: [amp * kit.vh, -amp * kit.vh, amp * 0.6 * kit.vh, -amp * 0.3 * kit.vh, 0] }, duration: 0.24, ease: 'none' }, at)
  const draw = (tl, paths, at, duration = 0.3, stagger = 0) =>
    tl.fromTo(paths, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration, stagger, ease: 'power2.inOut' }, at)
  // every game graphic: ink first (broadcast default), then paper and pop
  const def = (id, spec) =>
    defineGraphic(id, {
      themes: ['ink', 'paper', 'pop'],
      ...spec,
      build(kit, d, tl) {
        kit.root.classList.add('gm')
        spec.build(kit, d, tl)
      },
    })

  // 1 · kill feed: "killer ⟶ victim" rows stack in from the right
  def('kill-feed', {
    title: 'คิลฟีด · Kill feed',
    place: 'corner',
    sample: { data: { items: [{ killer: 'Tle.ซุ่มยิง', victim: 'NongMiw_TH' }, { killer: 'BoomBam', victim: 'ต้นตีนไฟ' }, { killer: 'Tle.ซุ่มยิง', victim: 'เจ๊หมวยสายลุย' }] } },
    presets: {
      ace: { title: 'คิลฟีดเก็บยกทีม · Ace feed', data: { items: [{ killer: 'ไอ้หนุ่มสายฟ้า', victim: 'KaoPad99' }, { killer: 'ไอ้หนุ่มสายฟ้า', victim: 'มะม่วงหาวมะนาวโห่' }, { killer: 'ไอ้หนุ่มสายฟ้า', victim: 'Jaew.Hon' }, { killer: 'ไอ้หนุ่มสายฟ้า', victim: 'PunPun_GG' }, { killer: 'ไอ้หนุ่มสายฟ้า', victim: 'น้องเนยสด' }] } },
    },
    build(kit, d, tl) {
      const items = [].concat(d.items ?? (d.killer ? [d] : [])).slice(0, 5)
      const feed = kit.el('div', 'kf-feed')
      const step = 0.22
      const rows = items.map((item, i) => {
        const row = kit.el('div', 'kf-row gm-shadow', null, feed)
        const plate = kit.el('div', 'kf-plate gm-cut', null, row)
        const flash = kit.el('i', 'kf-flash', null, plate)
        kit.el('span', 'kf-killer', str(item.killer), plate)
        const arrow = kit.svg('<svg class="kf-arrow" viewBox="0 0 40 16" aria-hidden="true"><path pathLength="1" d="M2 8H36"/><path pathLength="1" d="M28 2L37 8L28 14"/></svg>', plate)
        kit.el('span', 'kf-victim', str(item.victim), plate)
        const at = i * step
        tl.fromTo(row, { autoAlpha: 0, x: 6 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.28, ease: 'power3.out' }, at)
        tl.fromTo(flash, { opacity: 0.85 }, { opacity: 0, duration: 0.4, ease: 'power2.out' }, at + 0.06)
        draw(tl, arrow.querySelectorAll('path'), at + 0.12, 0.18, 0.08)
        kit.sound('slash', at)
        return row
      })
      const end = Math.max(0, items.length - 1) * step + IN + hold(kit)
      rows.forEach((row, i) => tl.to(row, { autoAlpha: 0, x: 4 * kit.vh, duration: OUT, ease: 'power2.in' }, end + i * 0.06))
    },
  })

  // 2 · streak banner: DOUBLE / TRIPLE / ULTRA KILL with a slammed count
  const STREAK = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'ULTRA KILL' }
  def('streak-banner', {
    title: 'แบนเนอร์สตรีค · Kill streak banner',
    place: 'center',
    sound: [['whoosh-big', 0], ['impact', 0.3]],
    sample: { data: { count: 3, player: 'Tle.ซุ่มยิง' } },
    presets: {
      double: { title: 'ดับเบิลคิล · Double kill', data: { count: 2, player: 'BoomBam' } },
      ultra: { title: 'อัลตร้าคิล · Ultra kill', data: { count: 4, player: 'ไอ้หนุ่มสายฟ้า' } },
      rampage: { title: 'แรมเพจ · Rampage', data: { count: 5, player: 'ไอ้หนุ่มสายฟ้า' }, theme: 'pop' },
    },
    build(kit, d, tl) {
      const n = Math.max(2, Math.floor(Number(d.count) || 2))
      const stage = kit.el('div', 'sb-stage')
      const lineL = kit.el('i', 'sb-line sb-line-l', null, stage)
      const wrap = kit.el('div', 'sb-wrap gm-shadow', null, stage)
      const band = kit.el('div', 'sb-band', null, wrap)
      const chip = kit.el('div', 'sb-count gm-num', 'x' + (n - 1), band)
      const copy = kit.el('div', 'sb-copy', null, band)
      const word = kit.el('span', 'sb-word gm-num', str(d.label) || STREAK[n] || 'RAMPAGE', kit.el('span', 'g-mask sb-mask', null, copy))
      const player = kit.el('span', 'sb-player', str(d.player), kit.el('span', 'g-mask', null, copy))
      const lineR = kit.el('i', 'sb-line sb-line-r', null, stage)
      tl.fromTo(band, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.3, ease: 'expo.out' }, 0)
        .fromTo(word, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.12)
        .fromTo(player, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.2)
        .fromTo(chip, { autoAlpha: 0, scale: 2.4 }, { autoAlpha: 1, scale: 1, duration: 0.2, ease: 'power4.in' }, 0.1)
      kit.swap(chip, 'x' + n, 0.3)
      tl.fromTo(chip, { scale: 1.5 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 0.3)
      shake(tl, wrap, kit, 0.3)
      tl.fromTo([lineL, lineR], { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power3.out' }, 0.3)
      const out = 0.5 + hold(kit)
      tl.to([lineL, lineR], { scaleX: 0, duration: 0.25, ease: 'power2.in' }, out)
        .to(band, { scaleX: 0, transformOrigin: '100% 50%', duration: OUT, ease: 'power3.in' }, out + 0.05)
        .to(chip, { autoAlpha: 0, duration: 0.2 }, out + 0.05)
    },
  })

  // 3 · lobby countdown: full-width band, MM:SS and one segment per tick, then GO
  const clock = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
  def('lobby-countdown', {
    title: 'นับถอยหลังเข้าเกม · Lobby countdown',
    place: 'full',
    defaults: { label: 'เริ่มเกมใน', go: 'GO' },
    sample: { data: { seconds: 30, title: 'รอบคัดเลือก · เกมที่ 3' } },
    presets: {
      quick: { title: 'นับถอยหลัง 10 วิ · 10-second countdown', data: { seconds: 10, title: 'แมตช์ถัดไป · NKG vs GRD' } },
      break: { title: 'พักเบรก 5 นาที · Break timer', data: { seconds: 300, label: 'กลับมาใน', title: 'พักครึ่งแมตช์', go: 'LIVE' } },
    },
    build(kit, d, tl) {
      const secs = clamp(Math.round(Number(d.seconds) || 30), 1, 5999)
      const band = kit.el('div', 'lc-band gm-shadow')
      const wipe = kit.el('div', 'lc-wipe', null, band)
      const panel = kit.el('div', 'lc-panel gm-cut', null, wipe)
      const head = kit.el('div', 'lc-head', null, panel)
      kit.el('span', 'lc-title', str(d.title), head)
      kit.el('span', 'lc-label', str(d.label), head)
      const time = kit.el('div', 'lc-time gm-num', clock(secs), panel)
      const segs = kit.el('div', 'lc-segs', null, panel)
      const N = Math.min(secs, 30)
      const cells = Array.from({ length: N }, () => kit.el('i', null, null, segs))
      const finale = (shown) => {
        time.textContent = shown <= 0 ? str(d.go) : clock(shown)
        time.classList.toggle('is-low', shown <= 5)
      }
      const redraw = (v) => {
        finale(Math.ceil(v - 1e-6))
        const lit = Math.ceil((v / secs) * N - 1e-6)
        cells.forEach((cell, i) => cell.classList.toggle('is-off', i >= lit))
      }
      tl.fromTo(wipe, { clipPath: 'inset(0% 50% 0% 50%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: IN, ease: 'expo.out' }, 0)
        .fromTo(panel.children, { autoAlpha: 0, y: 1.5 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power3.out' }, 0.15)
        .fromTo(driver(secs, redraw), { v: secs }, { v: 0, duration: secs, ease: 'none' }, IN)
      for (let k = Math.min(5, secs - 1); k >= 1; k--) {
        tl.fromTo(time, { scale: 1.12 }, { scale: 1, duration: 0.3, ease: 'power3.out', immediateRender: false }, IN + secs - k)
        kit.sound('beep', IN + secs - k)
      }
      const end = IN + secs
      tl.fromTo(time, { scale: 1.6 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)', immediateRender: false }, end)
      kit.sound('go', end)
      tl.to(wipe, { clipPath: 'inset(0% 50% 0% 50%)', duration: OUT, ease: 'power3.in' }, end + 0.9)
        .to(band, { autoAlpha: 0, duration: 0.05 }, end + 0.9 + OUT - 0.05)
    },
  })

  // 4 · versus splash: two halves meet on a diagonal, divider slides along it, VS slams
  const team = (v) => (v && typeof v === 'object' ? v : { name: v })
  def('versus-splash', {
    title: 'สแปลชเวอร์ซัส · Versus splash',
    place: 'full',
    sound: [['whoosh-big', 0], ['impact', 0.55]],
    sample: { data: { event: 'รอบรองชนะเลิศ · BO3', left: { name: 'นาคา Gaming', tag: 'NKG', sub: 'อันดับ 1 กลุ่ม A' }, right: { name: 'Garuda Esports', tag: 'GRD', sub: 'อันดับ 2 กลุ่ม B' } } },
    presets: {
      final: { title: 'แกรนด์ไฟนอล · Grand final', data: { event: 'แกรนด์ไฟนอล · BO5', left: { name: 'Tiger Night', tag: 'TGN', sub: 'แชมป์ซีซันที่แล้ว' }, right: { name: 'Siam Rocket', tag: 'SRK', sub: 'ไร้พ่ายในรอบเพลย์ออฟ' } } },
    },
    build(kit, d, tl) {
      const L = team(d.left)
      const R = team(d.right)
      const half = (side, info) => {
        const node = kit.el('div', 'vs-half vs-' + side)
        const block = kit.el('div', 'vs-team', null, node)
        if (info.tag) kit.el('span', 'vs-tag gm-num', str(info.tag), block)
        kit.el('span', 'vs-name', str(info.name), block)
        if (info.sub) kit.el('span', 'vs-sub', str(info.sub), block)
        return { node, block }
      }
      const left = half('left', L)
      const right = half('right', R)
      const axis = kit.el('div', 'vs-axis')
      axis.style.rotate = (Math.atan2(0.16 * innerWidth, innerHeight) * 180) / Math.PI + 'deg'
      const divider = kit.el('i', 'vs-divider', null, axis)
      const vs = kit.el('div', 'vs-mark gm-num gm-cut', 'VS')
      const event = d.event ? kit.el('div', 'vs-event gm-cut', str(d.event)) : null
      tl.fromTo(left.node, { xPercent: -100 }, { xPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
        .fromTo(right.node, { xPercent: 100 }, { xPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
        .fromTo(divider, { yPercent: -110 }, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, 0.18)
        .fromTo(left.block.children, { autoAlpha: 0, x: -4 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.06, ease: 'power3.out' }, 0.3)
        .fromTo(right.block.children, { autoAlpha: 0, x: 4 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.35, stagger: 0.06, ease: 'power3.out' }, 0.3)
        .fromTo(vs, { autoAlpha: 0, scale: 2.6 }, { autoAlpha: 1, scale: 1, duration: 0.18, ease: 'power4.in' }, 0.38)
      shake(tl, vs, kit, 0.56, 0.6)
      if (event) tl.fromTo(event, { autoAlpha: 0, y: -2 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.out' }, 0.6)
      const out = 0.7 + hold(kit)
      tl.to(vs, { autoAlpha: 0, scale: 0.6, duration: 0.2, ease: 'power2.in' }, out)
      if (event) tl.to(event, { autoAlpha: 0, duration: 0.2 }, out)
      tl.to(divider, { yPercent: 110, duration: OUT, ease: 'power3.in' }, out)
        .to(left.node, { xPercent: -100, duration: 0.4, ease: 'power3.in' }, out + 0.05)
        .to(right.node, { xPercent: 100, duration: 0.4, ease: 'power3.in' }, out + 0.05)
    },
  })

  // 5 · MVP card: slides in away from the face, K/D/A rows count up
  def('mvp-card', {
    title: 'การ์ด MVP · MVP card',
    place: 'card',
    defaults: { label: 'MVP', title: 'ผู้เล่นยอดเยี่ยมประจำแมตช์' },
    sample: { data: { player: 'Tle.ซุ่มยิง', team: 'นาคา Gaming', stats: [{ label: 'KILLS', value: 24 }, { label: 'DEATHS', value: 7 }, { label: 'ASSISTS', value: 11 }, { label: 'K/D', value: '3.43' }] } },
    presets: {
      support: { title: 'MVP สายซัพพอร์ต · Support MVP', data: { title: 'ซัพพอร์ตยอดเยี่ยม', player: 'น้องเนยสด', team: 'Tiger Night', stats: [{ label: 'ASSISTS', value: 31 }, { label: 'HEAL', value: '12,480' }, { label: 'VISION', value: '78%' }] } },
    },
    build(kit, d, tl) {
      const side = kit.away
      const card = kit.el('div', 'mv-card gm-shadow')
      card.dataset.side = side
      const face = kit.el('div', 'mv-face gm-cut', null, card)
      const head = kit.el('div', 'mv-head', null, face)
      kit.el('span', 'mv-tag gm-num', str(d.label), head)
      kit.el('span', 'mv-title', str(d.title), head)
      if (kit.image) {
        const photo = kit.el('img', 'mv-photo', null, face)
        photo.src = kit.image
        photo.alt = ''
      }
      const id = kit.el('div', 'mv-id', null, face)
      const handle = kit.el('span', 'mv-handle', str(d.player), kit.el('span', 'g-mask', null, id))
      const teamName = kit.el('span', 'mv-team', str(d.team), id)
      const stats = [].concat(d.stats ?? []).slice(0, 5)
      const list = kit.el('div', 'mv-stats', null, face)
      const rows = stats.map((s) => {
        const row = kit.el('div', 'mv-row', null, list)
        kit.el('span', 'mv-label gm-num', str(s.label), row)
        return { row, value: kit.el('span', 'mv-value gm-num', str(s.value), row) }
      })
      const dx = (side === 'right' ? 1 : -1) * 40 * kit.vw
      tl.fromTo(card, { x: dx, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: IN, ease: 'expo.out' }, 0)
        .fromTo(head.children, { autoAlpha: 0, y: kit.vh }, { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.05, ease: 'power3.out' }, 0.15)
        .fromTo(handle, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.22)
        .fromTo(teamName, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25 }, 0.3)
      rows.forEach(({ row, value }, i) => {
        const at = 0.4 + i * 0.12
        tl.fromTo(row, { autoAlpha: 0, x: (side === 'right' ? 2 : -2) * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.25, ease: 'power3.out' }, at)
        countStat(kit, tl, value, value.textContent, at + 0.05)
      })
      const done = 0.45 + rows.length * 0.12 + 0.7
      kit.sound('whoosh', 0)
      kit.sound('ding', done - 0.1)
      tl.to(card, { x: dx, autoAlpha: 0, duration: 0.4, ease: 'power3.in' }, Math.max(IN + hold(kit), done + 0.6))
    },
  })

  // 6 · level up: hexagon ring fills, the level number rolls over and the core lights
  const hex = (r) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = ((i * 60 - 90) * Math.PI) / 180
      return `${(50 + r * Math.cos(a)).toFixed(2)},${(50 + r * Math.sin(a)).toFixed(2)}`
    }).join(' ')
  def('level-up', {
    title: 'เลเวลอัป · Level up',
    place: 'center',
    sound: [['riser', 0.1], ['levelup', 1.05]],
    defaults: { label: 'LEVEL UP' },
    sample: { data: { level: 24, player: 'BoomBam' } },
    presets: {
      rank: { title: 'แรงก์อัป · Rank up', data: { label: 'RANK UP', level: 5, player: 'Tle.ซุ่มยิง', note: 'ขึ้นแรงก์ไดมอนด์' } },
    },
    build(kit, d, tl) {
      const lvl = Math.max(1, Math.floor(Number(d.level) || 1))
      const wrap = kit.el('div', 'lu-wrap')
      const badge = kit.el('div', 'lu-badge', null, wrap)
      const svg = kit.svg(
        `<svg viewBox="0 0 100 100" aria-hidden="true"><polygon class="lu-track" points="${hex(44)}"/><polygon class="lu-core" points="${hex(36)}"/>` +
          `<polygon class="lu-ring" pathLength="1" points="${hex(44)}"/></svg>`,
        badge,
      )
      const rays = Array.from({ length: 6 }, (_, i) => {
        const ray = kit.el('i', 'lu-ray', null, badge)
        ray.style.rotate = i * 60 + 'deg'
        return ray
      })
      const old = kit.el('span', 'lu-num lu-old gm-num', String(lvl - 1), badge)
      const now = kit.el('span', 'lu-num lu-new gm-num', String(lvl), badge)
      const copy = kit.el('div', 'lu-copy', null, wrap)
      const label = kit.el('span', 'lu-label gm-num', str(d.label), kit.el('span', 'g-mask', null, copy))
      const who = kit.el('span', 'lu-player', str(d.player), copy)
      const note = kit.el('span', 'lu-note', str(d.note) || 'เลเวล ' + lvl, copy)
      const core = svg.querySelector('.lu-core')
      tl.fromTo(wrap, { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(1.8)' }, 0)
        .fromTo(svg.querySelector('.lu-ring'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.8, ease: 'power2.in' }, 0.25)
        .fromTo(core, { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.3, ease: 'back.out(2)' }, 1.05)
        .fromTo(old, { yPercent: 0, autoAlpha: 1 }, { yPercent: -60, autoAlpha: 0, duration: 0.2, ease: 'power2.in' }, 1.0)
        .fromTo(now, { autoAlpha: 0, scale: 1.8 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, 1.05)
        .fromTo(rays, { autoAlpha: 1, scaleY: 0.2, y: 0 }, { autoAlpha: 0, scaleY: 1, y: -4 * kit.vh, duration: 0.5, ease: 'power3.out' }, 1.05)
        .fromTo(label, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 1.1)
        .fromTo([who, note], { autoAlpha: 0, x: -2 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.3, stagger: 0.06, ease: 'power3.out' }, 1.2)
      tl.to(wrap, { autoAlpha: 0, scale: 0.9, duration: OUT, ease: 'power2.in' }, Math.max(IN + hold(kit), 2.4))
    },
  })

  // 7 · achievement toast with a drawn trophy
  def('achievement', {
    title: 'ปลดล็อกความสำเร็จ · Achievement unlocked',
    place: 'toast',
    sound: [['swoosh', 0], ['success', 0.45]],
    defaults: { label: 'ปลดล็อกความสำเร็จ' },
    sample: { data: { title: 'นักแม่นปืน', detail: 'เฮดช็อต 100 ครั้งในไลฟ์เดียว' } },
    presets: {
      'first-blood': { title: 'เฟิร์สบลัด · First blood', data: { label: 'FIRST BLOOD', title: 'เลือดแรกของแมตช์', detail: 'Tle.ซุ่มยิง เปิดคิลใน 0:42' } },
      clutch: { title: 'แคลตช์ 1v3 · Clutch', data: { title: 'แคลตช์ 1 ต่อ 3', detail: 'รอดคนเดียวแล้วพลิกเก็บรอบ' }, theme: 'pop' },
    },
    build(kit, d, tl) {
      const toast = kit.el('div', 'ac-toast gm-shadow')
      const plate = kit.el('div', 'ac-plate gm-cut', null, toast)
      const icon = kit.el('div', 'ac-icon gm-cut', null, plate)
      const trophy = kit.svg(
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path pathLength="1" d="M7 3.5h10V9a5 5 0 0 1-10 0z"/><path pathLength="1" d="M7 5.5H4v1.2A3.3 3.3 0 0 0 7.3 10"/>' +
          '<path pathLength="1" d="M17 5.5h3v1.2A3.3 3.3 0 0 1 16.7 10"/><path pathLength="1" d="M12 14v4"/><path pathLength="1" d="M8 20.5h8"/></svg>',
        icon,
      )
      const body = kit.el('div', 'ac-body', null, plate)
      kit.el('span', 'ac-label', str(d.label), body)
      kit.el('span', 'ac-title', str(d.title), body)
      if (d.detail) kit.el('span', 'ac-detail', str(d.detail), body)
      const rule = kit.el('i', 'ac-rule', null, plate)
      const dx = (kit.away === 'right' ? 1 : -1) * 5 * kit.vh
      tl.fromTo(toast, { autoAlpha: 0, x: dx }, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power3.out' }, 0)
        .fromTo(icon, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(2.2)' }, 0.1)
      draw(tl, trophy.querySelectorAll('path'), 0.25, 0.3, 0.07)
      tl.fromTo(body.children, { autoAlpha: 0, y: 1.2 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.06, ease: 'power3.out' }, 0.18)
        .fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power2.inOut' }, 0.3)
        .fromTo(icon, { scale: 1.15 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, 0.6)
        .to(toast, { autoAlpha: 0, x: dx, duration: OUT, ease: 'power2.in' }, IN + hold(kit))
    },
  })

  // 8 · loot reveal: crate shakes, lid pops, rarity bar sweeps under the item name
  // fixed rarity palette: each colour carries its own legible chip text, independent of theme
  const RARITY = {
    common: { color: '#8e959c', on: '#15171a', th: 'ธรรมดา', en: 'COMMON' },
    rare: { color: '#2f7ad1', on: '#ffffff', th: 'หายาก', en: 'RARE' },
    epic: { color: '#9447c9', on: '#ffffff', th: 'มหากาพย์', en: 'EPIC' },
    legendary: { color: '#e3a21a', on: '#1a1305', th: 'ตำนาน', en: 'LEGENDARY' },
  }
  def('loot-reveal', {
    title: 'เปิดกล่องสุ่ม · Loot reveal',
    place: 'center',
    sample: { data: { item: 'ดาบเพลิงพญานาค', rarity: 'legendary' } },
    presets: {
      rare: { title: 'ของหายาก · Rare drop', data: { item: 'สกินปืน ลายกนก', rarity: 'rare' } },
      epic: { title: 'ของมหากาพย์ · Epic drop', data: { item: 'ปีกครุฑทองคำ', rarity: 'epic' } },
      common: { title: 'ของธรรมดา · Common drop', data: { item: 'ยาฟื้นพลัง x3', rarity: 'common' } },
    },
    build(kit, d, tl) {
      const key = Object.hasOwn(RARITY, d.rarity) ? d.rarity : 'common'
      const r = RARITY[key]
      kit.root.style.setProperty('--rar', r.color)
      kit.root.style.setProperty('--on-rar', r.on)
      const stage = kit.el('div', 'lr-stage')
      const box = kit.el('div', 'lr-box', null, stage)
      const rays = kit.svg(
        '<svg class="lr-rays" viewBox="-50 -50 100 100" aria-hidden="true">' +
          Array.from({ length: 16 }, (_, i) => {
            const a = (i / 16) * Math.PI * 2
            return `<line x1="${(Math.cos(a) * 20).toFixed(1)}" y1="${(Math.sin(a) * 20).toFixed(1)}" x2="${(Math.cos(a) * (i % 2 ? 38 : 48)).toFixed(1)}" y2="${(Math.sin(a) * (i % 2 ? 38 : 48)).toFixed(1)}"/>`
          }).join('') +
          '</svg>',
        box,
      )
      const crate = kit.svg(
        '<svg class="lr-crate" viewBox="0 0 120 110" aria-hidden="true"><g class="lr-body"><path d="M14 44h92v58H14z"/><path class="lr-band" d="M14 60h92M52 44v58M68 44v58"/><path class="lr-lock" d="M54 54h12v12H54z"/></g>' +
          '<g class="lr-lid"><path d="M8 26l6-8h92l6 8v18H8z"/><path class="lr-band" d="M52 18v26M68 18v26"/></g></svg>',
        box,
      )
      const lid = crate.querySelector('.lr-lid')
      const panel = kit.el('div', 'lr-panel gm-shadow', null, stage)
      const face = kit.el('div', 'lr-face gm-cut', null, panel)
      const bar = kit.el('i', 'lr-bar', null, face)
      const chips = kit.el('div', 'lr-chips', null, face)
      kit.el('span', 'lr-rarity gm-num', r.en, chips)
      kit.el('span', 'lr-th', r.th, chips)
      const item = kit.el('span', 'lr-item', str(d.item), kit.el('span', 'g-mask', null, face))
      const pop = 0.9
      tl.fromTo(box, { autoAlpha: 0, y: -8 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.in' }, 0)
        .to(crate, { keyframes: { rotation: [0, -3, 3, -4, 4, -6, 6, -7, 0] }, duration: 0.55, ease: 'none', transformOrigin: '50% 100%' }, 0.32)
        .fromTo(lid, { y: 0, rotation: 0, opacity: 1 }, { y: -34, x: 10, rotation: 22, opacity: 0, duration: 0.45, ease: 'power3.out', svgOrigin: '106 26' }, pop)
        .fromTo(rays, { scale: 0.3, opacity: 0, rotation: 0 }, { scale: 1, opacity: 1, rotation: 25, duration: 0.6, ease: 'power3.out' }, pop)
        .to(rays, { rotation: 60, duration: 2, ease: 'none' }, pop + 0.6)
        .fromTo(crate, { scale: 1 }, { scale: 0.86, duration: 0.3, ease: 'power2.out', immediateRender: false }, pop)
        .fromTo(panel, { autoAlpha: 0, y: 3 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.out' }, pop + 0.05)
        .fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, pop + 0.1)
        .fromTo(chips.children, { autoAlpha: 0, x: -1.5 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.25, stagger: 0.06, ease: 'power3.out' }, pop + 0.25)
        .fromTo(item, { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out' }, pop + 0.3)
      kit.sound('thud', 0.3)
      kit.sound(key === 'legendary' || key === 'epic' ? 'success' : 'coin', pop)
      if (key === 'legendary') kit.sound('shimmer', pop + 0.3)
      const out = Math.max(IN + hold(kit), pop + 1.4)
      tl.to(stage, { autoAlpha: 0, scale: 0.92, duration: OUT, ease: 'power2.in' }, out)
    },
  })

  // 9 · bracket: matches stagger in, connectors draw, the champion's path lights up
  const ROUND_NAME = { 1: 'รอบชิงชนะเลิศ', 2: 'รอบรองชนะเลิศ', 4: 'รอบก่อนรองฯ' }
  def('bracket', {
    title: 'สายการแข่งขัน · Tournament bracket',
    place: 'center',
    sample: {
      data: {
        title: 'Siam Clash Cup 2026',
        rounds: [
          [{ a: 'นาคา Gaming', b: 'Siam Rocket', winner: 'นาคา Gaming' }, { a: 'Garuda Esports', b: 'ช้างศึก GG', winner: 'Garuda Esports' }, { a: 'Tiger Night', b: 'Mekong Wolves', winner: 'Tiger Night' }, { a: 'หมูกระทะ FC', b: 'Lanna Owls', winner: 'Lanna Owls' }],
          [{ a: 'นาคา Gaming', b: 'Garuda Esports', winner: 'นาคา Gaming' }, { a: 'Tiger Night', b: 'Lanna Owls', winner: 'Tiger Night' }],
          [{ a: 'นาคา Gaming', b: 'Tiger Night', winner: 'นาคา Gaming' }],
        ],
      },
    },
    presets: {
      semis: { title: 'สายรอบ 4 ทีม · Final four', data: { title: 'รอบชิงแชมป์ภาคอีสาน', rounds: [[{ a: 'ขอนแก่น Kings', b: 'โคราช Raptors', winner: 'โคราช Raptors' }, { a: 'อุดร Unicorns', b: 'อุบล Thunder', winner: 'อุบล Thunder' }], [{ a: 'โคราช Raptors', b: 'อุบล Thunder', winner: 'อุบล Thunder' }]] } },
    },
    build(kit, d, tl) {
      const rounds = [].concat(d.rounds ?? []).filter(Array.isArray).slice(0, 4).map((r) => r.slice(0, 8).map((m) => m ?? {}))
      if (!rounds.length) return
      const champ = str(rounds.at(-1)[0]?.winner)
      // layout in vh; SVG uses the same units so lines meet boxes exactly
      const COL = 26
      const GAP = 6
      const SLOT = 3.8
      const BOX = SLOT * 2
      const PITCH = BOX + 2.4
      const H = Math.max(rounds[0].length, 1) * PITCH
      const ys = []
      rounds.forEach((round, r) =>
        (ys[r] = round.map((_, j) => (r && ys[r - 1][2 * j + 1] != null ? (ys[r - 1][2 * j] + ys[r - 1][2 * j + 1]) / 2 : ((j + 0.5) * H) / round.length))),
      )
      const champX = rounds.length * (COL + GAP)
      const W = champX + COL - 4
      const scale = Math.min(1, 66 / H)
      const outer = kit.el('div', 'bk-outer')
      outer.style.scale = scale
      const board = kit.el('div', 'bk-board gm-cut', null, outer)
      if (d.title) kit.el('div', 'bk-title gm-num', str(d.title), board)
      const labels = kit.el('div', 'bk-labels', null, board)
      const field = kit.el('div', 'bk-field', null, board)
      field.style.width = W + 'vh'
      field.style.height = H + 'vh'
      const svg = kit.svg(`<svg class="bk-lines" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"></svg>`, field)
      const names = [].concat(d.labels ?? [])
      const cols = rounds.map((round, r) => {
        const label = kit.el('span', 'bk-label', str(names[r]) || ROUND_NAME[round.length] || 'รอบแรก', labels)
        label.style.left = r * (COL + GAP) + 'vh'
        const boxes = round.map((m, j) => {
          const box = kit.el('div', 'bk-match', null, field)
          Object.assign(box.style, { left: r * (COL + GAP) + 'vh', top: ys[r][j] - SLOT + 'vh', width: COL + 'vh' })
          const slots = [m.a, m.b].map((name) => {
            const slot = kit.el('div', 'bk-slot', null, box)
            kit.el('span', null, str(name), slot)
            if (m.winner != null) slot.classList.add(str(name) === str(m.winner) ? 'is-win' : 'is-out')
            return slot
          })
          return { box, slots, m }
        })
        return { label, boxes }
      })
      const champLabel = kit.el('span', 'bk-label', 'แชมป์', labels)
      champLabel.style.left = champX + 'vh'
      const champBox = kit.el('div', 'bk-champ gm-cut', null, field)
      Object.assign(champBox.style, { left: champX + 'vh', top: ys.at(-1)[0] - SLOT + 'vh', width: COL - 4 + 'vh' })
      kit.el('span', null, champ, champBox)
      // connectors: from the winner's slot to its slot in the next round (or the champion box)
      const lines = rounds.map((round, r) =>
        round.map((m, j) => {
          const winIdx = str(m.winner) === str(m.b) ? 1 : 0
          const y0 = m.winner != null ? ys[r][j] - SLOT / 2 + winIdx * SLOT : ys[r][j]
          const last = r === rounds.length - 1
          const y1 = last ? ys[r][0] : ys[r + 1]?.[j >> 1] != null ? ys[r + 1][j >> 1] - SLOT / 2 + (j % 2) * SLOT : null
          if (y1 == null) return null
          const x0 = r * (COL + GAP) + COL
          const x1 = last ? champX : (r + 1) * (COL + GAP)
          const xm = x0 + GAP / 2
          const path = `M${x0} ${y0.toFixed(2)}H${xm}V${y1.toFixed(2)}H${x1}`
          const base = kit.svg(`<path class="bk-line" pathLength="1" d="${path}"/>`, svg)
          const hl = champ && str(m.winner) === champ ? kit.svg(`<path class="bk-hl" pathLength="1" d="${path}"/>`, svg) : null
          return { base, hl }
        }),
      )
      const R = rounds.length
      tl.fromTo(board, { autoAlpha: 0, y: 3 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power3.out' }, 0)
      cols.forEach(({ label, boxes }, r) => {
        const at = 0.15 + r * 0.16
        tl.fromTo(label, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, at)
          .fromTo(boxes.map((b) => b.box), { autoAlpha: 0, x: -2 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.25, stagger: 0.04, ease: 'power3.out' }, at)
        const base = lines[r].filter(Boolean).map((l) => l.base)
        if (base.length) draw(tl, base, at + 0.2, 0.3)
      })
      tl.fromTo(champLabel, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2 }, 0.15 + R * 0.16)
      let at = 0.45 + R * 0.16
      cols.forEach(({ boxes }, r) => {
        boxes.forEach(({ slots, m }, j) => {
          if (!champ || str(m.winner) !== champ) return
          const slot = slots[str(m.b) === champ ? 1 : 0]
          tl.fromTo(slot, { '--k': 0 }, { '--k': 1, duration: 0.15, ease: 'none' }, at)
          if (lines[r][j]?.hl) draw(tl, lines[r][j].hl, at + 0.1, 0.25)
        })
        at += 0.3
      })
      tl.fromTo(champBox, { autoAlpha: 0, scale: 1.4 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2.5)' }, at)
      kit.sound('whoosh', 0)
      kit.sound('ding', at)
      tl.to(board, { autoAlpha: 0, y: 2 * kit.vh, duration: OUT, ease: 'power2.in' }, Math.max(IN + hold(kit), at + 1.2))
    },
  })

  // 10 · map veto: cards get struck (ban) or lifted and framed (pick), one step at a time
  def('map-veto', {
    title: 'แบน/เลือกแมพ · Map veto',
    place: 'center',
    defaults: { title: 'แบน / เลือกแมพ' },
    sample: {
      data: {
        format: 'BO3',
        steps: [
          { map: 'Ascent', action: 'ban', team: 'NKG' },
          { map: 'Bind', action: 'ban', team: 'GRD' },
          { map: 'Lotus', action: 'pick', team: 'NKG' },
          { map: 'Haven', action: 'pick', team: 'GRD' },
          { map: 'Split', action: 'ban', team: 'NKG' },
          { map: 'Sunset', action: 'pick', team: 'ตัวตัดสิน' },
        ],
      },
    },
    presets: {
      bo1: { title: 'แบนแมพ BO1 · BO1 veto', data: { format: 'BO1', steps: [{ map: 'Icebox', action: 'ban', team: 'TGN' }, { map: 'Breeze', action: 'ban', team: 'SRK' }, { map: 'Pearl', action: 'ban', team: 'TGN' }, { map: 'Abyss', action: 'pick', team: 'SRK' }] } },
    },
    build(kit, d, tl) {
      const steps = [].concat(d.steps ?? []).slice(0, 7)
      const wrap = kit.el('div', 'mp-wrap')
      const head = kit.el('div', 'mp-head', null, wrap)
      kit.el('span', 'mp-title', str(d.title), head)
      if (d.format) kit.el('span', 'mp-format gm-num', str(d.format), head)
      const row = kit.el('div', 'mp-row', null, wrap)
      const cards = steps.map((s, i) => {
        const ban = s.action !== 'pick'
        const card = kit.el('div', 'mp-card gm-shadow', null, row)
        const face = kit.el('div', 'mp-face gm-cut', null, card)
        kit.el('span', 'mp-index gm-num', String(i + 1).padStart(2, '0'), face)
        kit.el('span', 'mp-map gm-num', str(s.map), face)
        const chip = kit.el('div', 'mp-chip ' + (ban ? 'is-ban' : 'is-pick'), null, face)
        kit.el('span', 'mp-act', ban ? 'แบน' : 'เลือก', chip)
        kit.el('span', 'mp-team', str(s.team), chip)
        const strike = ban ? kit.svg('<svg class="mp-strike" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M8 8L92 92"/><path pathLength="1" d="M92 8L8 92"/></svg>', face) : null
        return { card, face, chip, strike, ban }
      })
      tl.fromTo(head, { autoAlpha: 0, y: kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, ease: 'power3.out' }, 0)
        .fromTo(cards.map((c) => c.card), { autoAlpha: 0, y: 4 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.3, stagger: 0.05, ease: 'power3.out' }, 0.05)
      const first = 0.35 + cards.length * 0.05
      cards.forEach(({ card, face, chip, strike, ban }, i) => {
        const at = first + i * 0.4
        tl.fromTo(chip, { autoAlpha: 0, y: kit.vh }, { autoAlpha: 1, y: 0, duration: 0.2, ease: 'power3.out' }, at)
        if (ban) {
          draw(tl, strike.querySelectorAll('path'), at, 0.16, 0.08)
          tl.fromTo(face, { '--dim': 1 }, { '--dim': 0.4, duration: 0.25, ease: 'power2.out' }, at + 0.1)
          shake(tl, card, kit, at + 0.1, 0.4)
          kit.sound('slash', at)
        } else {
          tl.fromTo(face, { '--k': 0 }, { '--k': 1, duration: 0.2, ease: 'none' }, at)
            .fromTo(card, { y: 0 }, { y: -2 * kit.vh, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, at)
          kit.sound('ding', at)
        }
      })
      const out = Math.max(IN + hold(kit), first + cards.length * 0.4 + 0.9)
      tl.to(wrap, { autoAlpha: 0, y: 2 * kit.vh, duration: OUT, ease: 'power2.in' }, out)
    },
  })

  // 11 · round win: a hi wipe crosses the band and leaves "ROUND 7 · team won · score"
  def('round-win', {
    title: 'ชนะรอบ · Round win',
    place: 'full',
    sound: [['swipe', 0], ['impact', 0.25]],
    defaults: { label: 'ชนะ' },
    sample: { data: { round: 7, team: 'นาคา Gaming', score: '5 - 2' } },
    presets: {
      'match-point': { title: 'แมตช์พอยต์ · Match point', data: { round: 23, team: 'Tiger Night', score: '12 - 10', note: 'แมตช์พอยต์' }, theme: 'pop' },
    },
    build(kit, d, tl) {
      const band = kit.el('div', 'rw-band gm-shadow')
      const wipe = kit.el('div', 'rw-wipe', null, band)
      const plate = kit.el('div', 'rw-plate gm-cut', null, wipe)
      const round = kit.el('div', 'rw-round', null, plate)
      kit.el('span', 'rw-round-label gm-num', 'ROUND', round)
      kit.el('span', 'rw-round-num gm-num', str(d.round), round)
      const who = kit.el('div', 'rw-who', null, plate)
      kit.el('span', 'rw-team', str(d.team), who)
      kit.el('span', 'rw-label', str(d.label), who)
      const nums = Array.isArray(d.score) ? d.score : str(d.score).match(/\d+/g) ?? []
      const score = kit.el('div', 'rw-score gm-num', null, plate)
      if (nums.length >= 2) {
        const [a, b] = nums.map(Number)
        kit.el('span', a >= b ? 'is-lead' : null, String(a), score)
        kit.el('i', null, null, score)
        kit.el('span', b >= a ? 'is-lead' : null, String(b), score)
      } else kit.text(score, str(d.score))
      const sweep = kit.el('i', 'rw-sweep', null, plate)
      const note = d.note ? kit.el('div', 'rw-note gm-cut', str(d.note), band) : null
      tl.fromTo(band, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0)
        .fromTo(sweep, { scaleX: 0, transformOrigin: '0% 50%' }, { scaleX: 1, duration: 0.22, ease: 'power3.in' }, 0)
        .fromTo([round, who, score], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, 0.22)
        .fromTo(wipe, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.22, ease: 'power3.in' }, 0)
        .to(sweep, { scaleX: 0, transformOrigin: '100% 50%', duration: 0.28, ease: 'power3.out' }, 0.22)
        .fromTo(who.children, { x: 2 * kit.vh }, { x: 0, duration: 0.35, stagger: 0.05, ease: 'power3.out' }, 0.25)
        .fromTo(score, { scale: 1.3 }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' }, 0.3)
      if (note) tl.fromTo(note, { autoAlpha: 0, y: -1.5 * kit.vh }, { autoAlpha: 1, y: 0, duration: 0.25, ease: 'power3.out' }, 0.45)
      const out = 0.5 + hold(kit)
      if (note) tl.to(note, { autoAlpha: 0, duration: 0.15 }, out)
      tl.fromTo(sweep, { scaleX: 0, transformOrigin: '100% 50%' }, { scaleX: 1, duration: 0.2, ease: 'power3.in', immediateRender: false }, out)
        .to([round, who, score], { autoAlpha: 0, duration: 0.01 }, out + 0.2)
        .to(wipe, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.22, ease: 'power3.out' }, out + 0.2)
        .to(band, { autoAlpha: 0, duration: 0.01 }, out + 0.42)
    },
  })

  // 12 · nameplate under a player cam: handle, team, rank chip (data.persist keeps it up)
  def('nameplate', {
    title: 'ป้ายชื่อผู้เล่น · Player nameplate',
    place: 'lower',
    sound: [['swoosh', 0]],
    sample: { data: { handle: 'Tle.ซุ่มยิง', team: 'นาคา Gaming · Duelist', rank: 'Immortal 3' } },
    presets: {
      cam: { title: 'ป้ายชื่อค้างจอ · Persistent cam plate', data: { handle: 'น้องเนยสด', team: 'Tiger Night · Support', rank: 'อันดับ 12 เซิร์ฟเวอร์', persist: true } },
      caster: { title: 'ป้ายชื่อแคสเตอร์ · Caster plate', data: { handle: 'พี่หมีพากย์มันส์', team: 'แคสเตอร์หลัก', rank: 'CASTER' }, theme: 'pop' },
    },
    build(kit, d, tl) {
      const plate = kit.el('div', 'np-plate gm-shadow')
      const slab = kit.el('i', 'np-slab', null, plate)
      const wipe = kit.el('div', 'np-wipe', null, plate)
      const body = kit.el('div', 'np-body gm-cut', null, wipe)
      const handle = kit.el('span', 'np-handle', str(d.handle), kit.el('span', 'g-mask', null, body))
      const meta = kit.el('div', 'np-meta', null, body)
      const teamName = kit.el('span', 'np-team', str(d.team), meta)
      const rank = kit.el('span', 'np-rank gm-num', str(d.rank), meta)
      rank.hidden = !d.rank
      tl.fromTo(slab, { scaleY: 0 }, { scaleY: 1, duration: 0.2, ease: 'power3.out' }, 0)
        .fromTo(wipe, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.35, ease: 'expo.out' }, 0.1)
        .fromTo(handle, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.2)
        .fromTo(teamName, { autoAlpha: 0, x: -kit.vh }, { autoAlpha: 1, x: 0, duration: 0.25, ease: 'power3.out' }, 0.3)
        .fromTo(rank, { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, duration: 0.25, ease: 'back.out(2.5)' }, 0.4)
      kit.root.__update = (next = {}) => {
        if (next.handle != null) kit.text(handle, str(next.handle))
        if (next.team != null) kit.text(teamName, str(next.team))
        if (next.rank != null) (kit.text(rank, str(next.rank)), (rank.hidden = !next.rank))
        return true
      }
      if (d.persist) return
      const out = 0.5 + hold(kit)
      tl.to(wipe, { clipPath: 'inset(0% 100% 0% 0%)', duration: OUT, ease: 'power3.in' }, out)
        .to(slab, { scaleY: 0, duration: 0.2, ease: 'power2.in' }, out + 0.2)
        .to(plate, { autoAlpha: 0, duration: 0.01 }, out + 0.4)
    },
  })

  // 13 · speedrun splits: rows with ahead/behind delta chips, final time punches in
  def('speedrun-splits', {
    title: 'สปลิตสปีดรัน · Speedrun splits',
    place: 'corner',
    sample: {
      data: {
        title: 'Hollow Knight · Any%',
        splits: [
          { name: 'ปลดล็อกแดช', time: '6:42.1', delta: '-3.4' },
          { name: 'ราชาแมนทิส', time: '14:05.8', delta: '-1.2' },
          { name: 'เมืองแห่งน้ำตา', time: '21:37.0', delta: '+2.6' },
          { name: 'บอสวิญญาณ', time: '29:58.4', delta: '-0.8' },
        ],
      },
    },
    presets: {
      pb: { title: 'ทำลายสถิติ · Personal best', data: { title: 'Celeste · Any%', total: '27:14.9', note: 'PB!', splits: [{ name: 'ห้องที่ 1', time: '2:03.2', delta: '-1.0' }, { name: 'ภูเขาเก่า', time: '9:41.7', delta: '-4.3' }, { name: 'ยอดเขา', time: '27:14.9', delta: '-12.6' }] } },
    },
    build(kit, d, tl) {
      const splits = [].concat(d.splits ?? []).slice(0, 8)
      const box = kit.el('div', 'sr-box gm-shadow')
      const face = kit.el('div', 'sr-face gm-cut', null, box)
      if (d.title) kit.el('div', 'sr-title', str(d.title), face)
      const rows = splits.map((s) => {
        const row = kit.el('div', 'sr-row', null, face)
        kit.el('span', 'sr-name', str(s.name), row)
        kit.el('span', 'sr-time gm-num', str(s.time), row)
        const delta = str(s.delta).trim()
        const chip = kit.el('span', 'sr-delta gm-num ' + (/^[-−]/.test(delta) ? 'is-ahead' : 'is-behind'), delta, row)
        chip.hidden = !delta
        return { row, chip }
      })
      const foot = kit.el('div', 'sr-foot', null, face)
      if (d.note) kit.el('span', 'sr-note gm-num', str(d.note), foot)
      const total = kit.el('span', 'sr-total gm-num', str(d.total ?? splits.at(-1)?.time ?? ''), foot)
      tl.fromTo(box, { autoAlpha: 0, x: 4 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power3.out' }, 0)
      rows.forEach(({ row, chip }, i) => {
        const at = 0.2 + i * 0.14
        tl.fromTo(row, { autoAlpha: 0, x: 2 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.22, ease: 'power3.out' }, at)
          .fromTo(chip, { scale: 0.5 }, { scale: 1, duration: 0.22, ease: 'back.out(2.5)' }, at + 0.1)
        kit.sound('blip', at)
      })
      const end = 0.25 + rows.length * 0.14
      tl.fromTo(foot.children, { autoAlpha: 0, scale: 1.3 }, { autoAlpha: 1, scale: 1, duration: 0.3, stagger: 0.05, ease: 'back.out(2)' }, end)
      tl.to(box, { autoAlpha: 0, x: 4 * kit.vh, duration: OUT, ease: 'power2.in' }, Math.max(IN + hold(kit), end + 1))
    },
  })

  // 14 · death counter: number rolls to the new count, the plate shakes (data.persist keeps it up)
  const SKULL = '<svg class="dc-skull" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5c-5 0-8.5 3.4-8.5 8 0 2.6 1.2 4.5 3 5.6V19h11v-2.9c1.8-1.1 3-3 3-5.6 0-4.6-3.5-8-8.5-8z"/><path class="dc-hole" d="M7 10.5h3.6v3.2H7zM13.4 10.5H17v3.2h-3.6zM11.2 15h1.6v1.6h-1.6z"/><path class="dc-teeth" d="M9.5 19v2.5M12 19v2.5M14.5 19v2.5"/></svg>'
  def('death-counter', {
    title: 'นับจำนวนตาย · Death counter',
    place: 'corner',
    sound: [['pop', 0], ['thud', 0.45]],
    defaults: { label: 'ตาย', unit: 'ครั้ง' },
    sample: { data: { count: 12 } },
    presets: {
      live: { title: 'ตัวนับตายค้างจอ · Persistent death counter', data: { count: 47, label: 'ตายไปแล้ว', persist: true } },
      boss: { title: 'ตายกับบอส · Boss attempts', data: { count: 8, label: 'ตายกับบอสนี้', unit: 'รอบ' }, theme: 'pop' },
    },
    build(kit, d, tl) {
      const n = Math.max(0, Math.floor(Number(d.count) || 0))
      const plate = kit.el('div', 'dc-plate gm-shadow')
      const face = kit.el('div', 'dc-face gm-cut', null, plate)
      const flash = kit.el('i', 'dc-flash', null, face)
      kit.svg(SKULL, face)
      kit.el('span', 'dc-label', str(d.label), face)
      const win = kit.el('span', 'dc-win', null, face)
      const old = kit.el('span', 'dc-num gm-num', String(Math.max(0, n - 1)), win)
      const now = kit.el('span', 'dc-num dc-now gm-num', String(n), win)
      kit.el('span', 'dc-unit', str(d.unit), face)
      tl.fromTo(plate, { autoAlpha: 0, x: 4 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power3.out' }, 0)
      if (n > 0) {
        tl.fromTo(old, { yPercent: 0 }, { yPercent: -100, duration: 0.2, ease: 'power3.in' }, 0.4)
          .fromTo(now, { yPercent: 100 }, { yPercent: 0, duration: 0.25, ease: 'back.out(2)' }, 0.45)
          .fromTo(flash, { opacity: 0.8 }, { opacity: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, 0.45)
        gsap.set(flash, { opacity: 0 })
        shake(tl, face, kit, 0.45, 0.9)
      } else gsap.set(old, { yPercent: -100 })
      let current = n
      kit.root.__update = (next = {}) => {
        const to = Math.max(0, Math.floor(Number(next.count ?? current + 1) || 0))
        kit.text(old, String(current))
        kit.text(now, String(to))
        current = to
        gsap.fromTo(old, { yPercent: 0 }, { yPercent: -100, duration: 0.2, ease: 'power3.in' })
        gsap.fromTo(now, { yPercent: 100 }, { yPercent: 0, duration: 0.25, delay: 0.05, ease: 'back.out(2)' })
        gsap.fromTo(flash, { opacity: 0.8 }, { opacity: 0, duration: 0.5, delay: 0.05 })
        gsap.to(face, { keyframes: { x: [8, -8, 5, -2, 0] }, duration: 0.24, delay: 0.05 })
        window.playSound?.('thud')
        return true
      }
      if (d.persist) return
      tl.to(plate, { autoAlpha: 0, x: 4 * kit.vh, duration: OUT, ease: 'power2.in' }, Math.max(IN + hold(kit), 1.3))
    },
  })

  // 15 · boss HP: bar takes the hit to data.value, a trailing chunk catches up (data.persist keeps it up)
  def('boss-hp', {
    title: 'หลอดเลือดบอส · Boss health bar',
    place: 'full',
    sound: [['whoosh', 0], ['impact', 0.55]],
    sample: { data: { name: 'พญานาคราชแห่งโขง', value: 62 } },
    presets: {
      low: { title: 'บอสใกล้ตาย · Boss low HP', data: { name: 'ยักษ์วัดแจ้ง', from: 30, value: 8, phase: 'เฟสสุดท้าย' } },
      live: { title: 'หลอดเลือดบอสค้างจอ · Persistent boss bar', data: { name: 'ราชินีแมงมุมดำ', value: 100, from: 100, persist: true } },
    },
    build(kit, d, tl) {
      const value = clamp(Number(d.value ?? 100) || 0, 0, 100)
      const from = clamp(Number(d.from ?? 100) || 0, value, 100)
      const wrap = kit.el('div', 'bh-wrap')
      const head = kit.el('div', 'bh-head', null, wrap)
      kit.el('span', 'bh-name', str(d.name), head)
      if (d.phase) kit.el('span', 'bh-phase gm-num', str(d.phase), head)
      const pct = kit.el('span', 'bh-pct gm-num', null, head)
      const frame = kit.el('div', 'bh-frame gm-shadow', null, wrap)
      const bar = kit.el('div', 'bh-bar', null, frame)
      const chunk = kit.el('i', 'bh-chunk', null, bar)
      const fill = kit.el('i', 'bh-fill', null, bar)
      kit.el('i', 'bh-ticks', null, bar)
      const showPct = (n) => kit.text(pct, Math.ceil(n - 1e-6) + '%')
      tl.fromTo(frame, { autoAlpha: 0, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, duration: IN, ease: 'expo.out' }, 0)
        .fromTo(head.children, { autoAlpha: 0, y: kit.vh }, { autoAlpha: 1, y: 0, duration: 0.25, stagger: 0.05, ease: 'power3.out' }, 0.2)
        .fromTo(fill, { scaleX: from / 100 }, { scaleX: value / 100, duration: 0.18, ease: 'power3.out' }, 0.55)
        .fromTo(chunk, { scaleX: from / 100 }, { scaleX: value / 100, duration: 0.55, ease: 'power2.inOut' }, 1.0)
        .fromTo(driver(from, showPct), { v: from }, { v: value, duration: 0.18, ease: 'power3.out' }, 0.55)
      if (value < from) shake(tl, wrap, kit, 0.55, 0.7)
      let current = value
      kit.root.__update = (next = {}) => {
        const to = clamp(Number(next.value ?? current) || 0, 0, 100)
        gsap.to(fill, { scaleX: to / 100, duration: 0.18, ease: 'power3.out' })
        gsap.to(chunk, { scaleX: to / 100, duration: 0.55, delay: 0.45, ease: 'power2.inOut' })
        gsap.to(driver(current, showPct), { v: to, duration: 0.18 })
        if (to < current) gsap.to(wrap, { keyframes: { x: [7, -7, 4, -2, 0] }, duration: 0.24 })
        current = to
        return true
      }
      if (d.persist) return
      tl.to(wrap, { autoAlpha: 0, y: -2 * kit.vh, duration: OUT, ease: 'power2.in' }, Math.max(IN + hold(kit), 2.1))
    },
  })

  // 16 · XP bar: thin bar fills, "+250 XP" floats off the leading edge
  def('xp-bar', {
    title: 'หลอด XP · XP bar',
    place: 'lower',
    sound: [['swoosh', 0], ['sparkle', 0.45]],
    sample: { data: { gain: 250, value: 78, level: 12 } },
    presets: {
      quest: { title: 'XP จากภารกิจ · Quest XP', data: { gain: 1200, from: 20, value: 94, level: 37, label: 'ภารกิจสำเร็จ' } },
    },
    build(kit, d, tl) {
      const value = clamp(Number(d.value) || 0, 0, 100)
      const from = clamp(Number(d.from ?? value - 18) || 0, 0, value)
      const row = kit.el('div', 'xp-row gm-shadow')
      const face = kit.el('div', 'xp-face gm-cut', null, row)
      const lv = kit.el('div', 'xp-lv', null, face)
      kit.el('span', 'xp-lv-label gm-num', 'LV', lv)
      kit.el('span', 'xp-lv-num gm-num', str(d.level), lv)
      const main = kit.el('div', 'xp-main', null, face)
      const top = kit.el('div', 'xp-top', null, main)
      kit.el('span', 'xp-label', str(d.label) || 'ค่าประสบการณ์', top)
      const pct = kit.el('span', 'xp-pct gm-num', null, top)
      const track = kit.el('div', 'xp-track', null, main)
      const fill = kit.el('i', 'xp-fill', null, track)
      const floater = kit.el('span', 'xp-float gm-num', '+' + kit.num(Number(d.gain) || 0) + ' XP', track)
      floater.style.left = value + '%'
      tl.fromTo(row, { autoAlpha: 0, x: -4 * kit.vh }, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'power3.out' }, 0)
        .fromTo(fill, { scaleX: from / 100 }, { scaleX: value / 100, duration: 0.8, ease: 'power2.out' }, 0.4)
        .fromTo(driver(from, (n) => kit.text(pct, Math.round(n) + '%')), { v: from }, { v: value, duration: 0.8, ease: 'power2.out' }, 0.4)
        .fromTo(floater, { autoAlpha: 0, y: 0, scale: 0.6 }, { autoAlpha: 1, y: -2.4 * kit.vh, scale: 1, duration: 0.35, ease: 'back.out(2)' }, 0.45)
        .to(floater, { y: -4 * kit.vh, duration: 1.2, ease: 'none' }, 0.8)
        .to(floater, { autoAlpha: 0, duration: 0.3 }, 1.7)
        .to(row, { autoAlpha: 0, x: -3 * kit.vh, duration: OUT, ease: 'power2.in' }, Math.max(IN + hold(kit), 2.1))
    },
  })
})()
