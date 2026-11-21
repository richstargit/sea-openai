// Stream graphics: alerts, scenes and widgets for general streamers (follow, sub, donation, raid, chat,
// goal, music, scenes, socials, sponsors, giveaway, reactions, timer, clock, milestone, webcam frame).
// Every tween sits on the paused timeline at an explicit time (seek-safe). Event data only goes through
// textContent (kit.el / kit.text / createElementNS); kit.svg only ever gets markup written here.
;(() => {
  const hold = (kit) => kit.hold ?? 2.4
  // the toast/lower stacks sit on the side away from the face; slide in from that edge
  const edge = (kit) => (kit.away === 'right' ? 1 : -1)
  const out = (kit, tl, at, vars) => tl.to(kit.root, { autoAlpha: 0, duration: 0.35, ease: 'power2.in', ...vars }, at)
  const CLIP = {
    full: 'inset(0% 0% 0% 0%)',
    l: 'inset(0% 100% 0% 0%)', // collapsed onto the left edge
    r: 'inset(0% 0% 0% 100%)',
    t: 'inset(0% 0% 100% 0%)',
    b: 'inset(100% 0% 0% 0%)',
    c: 'inset(0% 50% 0% 50%)',
  }
  const wipe = (tl, node, from, to, at, duration = 0.35, ease = 'power3.out') =>
    tl.fromTo(node, { clipPath: CLIP[from] }, { clipPath: CLIP[to], duration, ease, immediateRender: from !== 'full' }, at)
  const pad = (n) => String(n).padStart(2, '0')
  const clock = (s) => (s >= 3600 ? Math.floor(s / 3600) + ':' : '') + pad(Math.floor((s % 3600) / 60)) + ':' + pad(s % 60)
  const clamp01 = (n) => Math.min(1, Math.max(0, n || 0))
  const seedOf = (s) => {
    let h = 7
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
    return h
  }
  // drive render(value) from the timeline through a setter: setters still run while seeking, callbacks do not
  function drive(tl, render, from, to, at, duration, ease = 'none') {
    let v = from
    const proxy = { get v() { return v }, set v(next) { v = next; render(next) } }
    tl.fromTo(proxy, { v: from }, { v: to, duration, ease }, at)
    render(from)
    return proxy
  }
  const masked = (kit, parent, cls, text) => kit.el('span', null, text, kit.el('span', 'g-mask ' + cls, null, parent))
  // one span per grapheme so Thai vowels and tone marks travel with their base letter
  const letters = (kit, parent, text) => kit.graphemes(text).map((g) => kit.el('span', 'gl', g, parent))
  // avatar / cover letter: skip @ and Thai leading vowels so เบียร์ → บ
  const initial = (kit, s) => {
    const g = kit.graphemes(String(s ?? '').replace(/^[@\s]+/, ''))
    return (g.find((c) => !/^[เแโใไ]$/.test(c)) ?? '?').toUpperCase()
  }
  // words of a line, each in its own mask; whitespace stays a plain text node
  const maskWords = (kit, parent, text) =>
    kit.words(text).map((w) => (w.trim() ? masked(kit, parent, 'w', w) : (parent.append(w), null))).filter(Boolean)

  const PERSON = '<svg viewBox="0 0 20 30" aria-hidden="true"><circle cx="10" cy="6" r="5.2"/><path d="M1.5 30v-8C1.5 16.4 5.3 13 10 13s8.5 3.4 8.5 9v8z"/></svg>'
  const SHAPES = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.6s-7.6-4.6-9.7-9.3C.8 7.9 2.9 4.2 6.6 4.2c2.2 0 3.7 1.2 5.4 3.1 1.7-1.9 3.2-3.1 5.4-3.1 3.7 0 5.8 3.7 4.3 7.1-2.1 4.7-9.7 9.3-9.7 9.3z"/></svg>',
    star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.8 5.9 6.5.8-4.8 4.5 1.2 6.4L12 17.1l-5.7 3.1 1.2-6.4-4.8-4.5 6.5-.8z"/></svg>',
    thumb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 10.4h3.6v10.2H2.6z"/><path d="M8.2 20.6V10.3l4.4-6.8c1.6-.5 2.9.8 2.5 2.4l-1 4.2h5.4c1.5 0 2.6 1.4 2.2 2.8l-1.6 6.1c-.3 1.2-1.4 1.9-2.5 1.9z"/></svg>',
  }
  const PIN = '<svg class="pin" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 2.5h7l-1.2 6.2 3.7 3.6v1.9H6v-1.9l3.7-3.6z"/><path d="M12 14.2v7.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'

  // 1 ─ follow alert: kicker, name types in grapheme by grapheme, a hand-drawn underline
  const follow = { name: 'มายด์ชอบนอน', kicker: 'ผู้ติดตามใหม่', note: 'ขอบคุณที่กดติดตามนะ' }
  defineGraphic('follow-alert', {
    title: 'ผู้ติดตามใหม่ · Follow alert',
    place: 'toast',
    defaults: follow,
    sound: [['swipe', 0], ['ping', 0.2]],
    sample: { data: follow },
    presets: {
      first: { title: 'ผู้ติดตามคนแรกของวัน · First follower', data: { kicker: 'ผู้ติดตามคนแรกของวันนี้', note: 'เปิดวันได้ดีมาก ขอบคุณนะ' } },
    },
    build(kit, data, tl) {
      const card = kit.el('div', 'card')
      const kick = kit.el('div', 'kick', null, card)
      const sq = kit.el('i', 'sq', null, kick)
      const kickText = masked(kit, kick, 'kt', data.kicker)
      const nameWrap = kit.el('div', 'namewrap', null, card)
      const glyphs = letters(kit, kit.el('div', 'name', null, nameWrap), data.name)
      const line = kit.svg('<svg class="ul" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true"><path pathLength="1" d="M3 9.5C38 4.5 66 11.5 102 7.5S166 3.5 197 8"/></svg>', nameWrap).firstElementChild
      const note = data.note ? masked(kit, card, 'note', data.note) : null
      const step = Math.min(0.06, 0.55 / Math.max(1, glyphs.length))
      wipe(tl, card, edge(kit) > 0 ? 'r' : 'l', 'full', 0, 0.4)
      tl.fromTo(sq, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }, 0.12)
      tl.fromTo(kickText, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.15)
      tl.fromTo(glyphs, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.22, ease: 'power3.out', stagger: step }, 0.22)
      const typed = 0.22 + glyphs.length * step
      tl.fromTo(line, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, ease: 'power2.inOut' }, typed)
      if (note) tl.fromTo(note, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, typed + 0.1)
      const at = Math.max(typed + 0.4, 0.6) + hold(kit)
      tl.to(glyphs, { yPercent: -110, duration: 0.2, ease: 'power2.in', stagger: Math.min(0.015, 0.15 / glyphs.length) }, at)
      wipe(tl, card, 'full', edge(kit) > 0 ? 'r' : 'l', at + 0.1, 0.35, 'power3.in')
      out(kit, tl, at + 0.4, { duration: 0.05 })
    },
  })

  // 2 ─ sub alert: two sheets fan out behind, the card drops on top, the tier ribbon unrolls over its edge
  const sub = { name: 'บอสโอ๊ต', tier: 'Tier 2', months: 6 }
  defineGraphic('sub-alert', {
    title: 'สมาชิกใหม่ · Sub alert',
    place: 'toast',
    defaults: sub,
    sound: [['paper', 0.05], ['chime', 0.3]],
    sample: { data: sub },
    presets: {
      new: { title: 'สมาชิกเดือนแรก · New member', data: { name: 'ฟ้าใส', tier: 'Tier 1', months: 1 } },
      year: { title: 'สมาชิกครบปี · One year member', data: { tier: 'Tier 3', months: 12, kicker: 'อยู่ด้วยกันครบหนึ่งปี' } },
    },
    build(kit, data, tl) {
      const months = Math.max(1, Math.round(Number(data.months) || 1))
      const stack = kit.el('div', 'stack')
      const sheets = [kit.el('i', 'sheet', null, stack), kit.el('i', 'sheet', null, stack)]
      const card = kit.el('div', 'card', null, stack)
      const ribbon = kit.el('div', 'ribbon', null, card)
      const tier = kit.el('span', null, data.tier, ribbon)
      const fold = kit.el('i', 'fold', null, card)
      if (!data.tier) ribbon.remove(), fold.remove()
      const kick = masked(kit, card, 'kick', data.kicker ?? (months > 1 ? 'ต่ออายุสมาชิก' : 'สมาชิกใหม่'))
      const name = masked(kit, card, 'name', data.name)
      const meta = kit.el('div', 'meta', null, card)
      meta.append('เป็นสมาชิกมา ')
      const n = kit.el('b', null, null, meta)
      meta.append(' เดือน')
      tl.fromTo(stack, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.15 }, 0)
      tl.fromTo(sheets, { rotation: 0, x: 0 }, { rotation: (i) => (i ? -7 : -3.5), x: (i) => (i ? -0.8 : -0.4) * kit.vh, duration: 0.45, ease: 'back.out(2)' }, 0.05)
      tl.fromTo(card, { y: -6 * kit.vh, rotation: -3, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 0.45, ease: 'back.out(1.6)' }, 0.1)
      tl.fromTo(kick, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.3)
      tl.fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: 0.32, ease: 'power3.out' }, 0.36)
      if (data.tier) {
        tl.fromTo(ribbon, { scaleX: 0 }, { scaleX: 1, duration: 0.35, ease: 'power3.out' }, 0.45)
        tl.fromTo(tier, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.65)
        tl.fromTo(fold, { scaleY: 0 }, { scaleY: 1, duration: 0.15, ease: 'power2.out' }, 0.42)
      }
      tl.fromTo(meta, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, 0.5)
      kit.count(n, Math.max(0, months - 12), months, 0.55, 0.6)
      const at = 0.6 + hold(kit)
      tl.to(card, { y: -3 * kit.vh, opacity: 0, duration: 0.35, ease: 'power2.in' }, at)
      tl.to(sheets, { rotation: 0, x: 0, opacity: 0, duration: 0.3, ease: 'power2.in' }, at + 0.05)
      out(kit, tl, at + 0.35, { duration: 0.05 })
    },
  })

  // 3 ─ donation alert: a receipt feeds out of a slot, the amount counts up, then it tears off
  const tip = { name: 'เจ๊หมวย', amount: 500, message: 'ค่าขนมให้น้องแมวที่บ้านค่ะ สู้ๆ นะ' }
  defineGraphic('donation-alert', {
    title: 'โดเนท · Donation alert',
    place: 'corner',
    defaults: tip,
    sound: [['printer', 0.1], ['cash', 1.5], ['sparkle', 1.6]],
    sample: { data: tip },
    presets: {
      big: { title: 'โดเนทก้อนใหญ่ · Big donation', data: { name: 'กัปตันโอ', amount: 5000, message: 'ซื้อเก้าอี้ใหม่เลยครับ หลังจะได้ไม่พัง', kicker: 'โดเนทก้อนใหญ่' } },
    },
    build(kit, data, tl) {
      const amount = Math.max(0, Number(data.amount) || 0)
      const slot = kit.el('i', 'slot')
      const clip = kit.el('div', 'clip')
      const rc = kit.el('div', 'receipt', null, clip)
      const head = kit.el('div', 'head', null, rc)
      kit.el('span', null, data.kicker ?? 'โดเนท', head)
      kit.el('span', null, 'ขอบคุณมาก', head)
      kit.el('div', 'who', data.name, rc)
      const amt = kit.el('div', 'amt', null, rc)
      kit.el('i', 'rule', null, rc)
      const msg = data.message ? kit.el('p', 'msg', null, rc) : null
      const words = msg ? kit.words(data.message).map((w) => kit.el('span', 'w', w, msg)) : []
      tl.fromTo(slot, { scaleX: 0 }, { scaleX: 1, duration: 0.22, ease: 'power3.out' }, 0)
      // printer feed: stepped, like paper pushed out a line at a time
      tl.fromTo(rc, { yPercent: -101 }, { yPercent: 0, duration: 0.55, ease: 'steps(9)' }, 0.12)
      const counted = kit.count(amt, 0, amount, 0.6, 0.9, (v) => kit.money(v))
      if (words.length) tl.fromTo(words, { opacity: 0 }, { opacity: 1, duration: 0.2, stagger: Math.min(0.06, 0.6 / words.length) }, 0.75)
      tl.fromTo(amt, { scale: 1.08 }, { scale: 1, duration: 0.3, ease: 'back.out(3)', immediateRender: false }, counted)
      const at = 0.6 + hold(kit)
      tl.to(clip, { y: 4 * kit.vh, rotation: 5, autoAlpha: 0, duration: 0.4, ease: 'power2.in' }, at)
      tl.to(slot, { scaleX: 0, duration: 0.25, ease: 'power2.in' }, at + 0.2)
      out(kit, tl, at + 0.45, { duration: 0.05 })
    },
  })

  // 4 ─ raid alert: "ปลาทูทอด พาคนมา 48 คน", a crowd of small figures runs in and hops in a wave
  const raid = { name: 'ปลาทูทอด', viewers: 48 }
  defineGraphic('raid-alert', {
    title: 'เรดเข้ามา · Raid alert',
    place: 'center',
    defaults: raid,
    sound: [['whoosh-big', 0.15], ['applause', 0.95]],
    sample: { data: raid },
    presets: {
      host: { title: 'โฮสต์ส่งต่อ · Host', data: { kicker: 'ส่งต่อผู้ชมมาให้', name: 'เจ๊หมวย', viewers: 12 } },
    },
    build(kit, data, tl) {
      const viewers = Math.max(0, Math.round(Number(data.viewers) || 0))
      const card = kit.el('div', 'card')
      const kick = masked(kit, card, 'kick', data.kicker ?? 'เรดมาแล้ว')
      const line = kit.el('div', 'line', null, card)
      const name = masked(kit, line, 'nm', data.name)
      line.append(' ')
      const rest = masked(kit, line, 'rest', 'พาคนมา ')
      const n = kit.el('b', null, null, rest)
      rest.append(' คน')
      const crowd = kit.el('div', 'crowd', null, card)
      const rand = kit.rng(seedOf(String(data.name)) + viewers)
      const count = Math.min(28, Math.max(4, viewers))
      const figs = Array.from({ length: count }, (_, i) => {
        const fig = kit.el('i', rand() < 0.28 ? 'fig hi' : 'fig', null, crowd)
        kit.svg(PERSON, fig)
        fig.style.left = ((i + 0.5) / count) * 100 + (rand() - 0.5) * (60 / count) + '%'
        fig.style.height = 4.4 + rand() * 2.4 + 'vh'
        fig.style.zIndex = Math.round(rand() * 3)
        return fig
      })
      const run = crowd.offsetWidth + 4 * kit.vh
      tl.fromTo(card, { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.8)' }, 0)
      tl.fromTo(kick, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.1)
      tl.fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: 0.32, ease: 'power3.out' }, 0.18)
      tl.fromTo(rest, { yPercent: 110 }, { yPercent: 0, duration: 0.32, ease: 'power3.out' }, 0.26)
      kit.count(n, 0, viewers, 0.3, 0.8)
      // the front of the crowd leaves first so they all arrive together
      figs.forEach((fig, i) => {
        tl.fromTo(fig, { x: -run }, { x: 0, duration: 0.7, ease: 'power2.out' }, 0.2 + (count - 1 - i) * 0.018 + rand() * 0.06)
        const hop = { y: -1.4 * kit.vh, duration: 0.16, ease: 'power1.out', yoyo: true, repeat: 1 }
        tl.to(fig, hop, 1.05 + i * 0.03)
        tl.to(fig, hop, 1.05 + Math.max(1, hold(kit) * 0.55) + i * 0.03)
      })
      const at = 0.9 + hold(kit)
      tl.to(figs, { x: run, duration: 0.45, ease: 'power2.in', stagger: { each: 0.008, from: 'end' } }, at)
      tl.to(card, { scale: 0.96, opacity: 0, duration: 0.3, ease: 'power2.in' }, at + 0.25)
    },
  })

  // 5 ─ chat highlight: avatar initial, pinned bubble; the pin drops in and presses
  const chat = { name: 'น้องเบียร์', text: 'คืนนี้จะลงแรงค์ถึงเพชรไหมคะ ลุ้นอยู่นะ', kicker: 'ปักหมุด' }
  defineGraphic('chat-highlight', {
    title: 'ปักหมุดแชท · Chat highlight',
    place: 'lower',
    defaults: chat,
    sound: [['pop', 0.05], ['click', 0.45]],
    sample: { data: chat },
    presets: {
      question: { title: 'คำถามจากแชท · Chat question', data: { kicker: 'คำถามจากแชท', name: 'ต้นกล้า', text: 'ใช้เมาส์รุ่นอะไรครับ เห็นเล็งแม่นมาก' } },
    },
    build(kit, data, tl) {
      const wrap = kit.el('div', 'wrap')
      const av = kit.el('div', 'av', initial(kit, data.name), wrap)
      const bubble = kit.el('div', 'bubble', null, wrap)
      const head = kit.el('div', 'head', null, bubble)
      const name = masked(kit, head, 'nm', data.name)
      const tag = kit.el('span', 'tag', null, head)
      const pin = kit.svg(PIN, tag)
      tag.append(data.kicker)
      const say = kit.el('p', 'say', null, bubble)
      const words = kit.words(data.text).map((w) => kit.el('span', 'w', w, say))
      const right = kit.away === 'right'
      tl.fromTo(av, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(2.4)' }, 0)
      tl.fromTo(bubble, { scale: 0.7, opacity: 0, transformOrigin: right ? '100% 100%' : '0% 100%' }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.6)' }, 0.08)
      tl.fromTo(name, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.2)
      tl.fromTo(tag, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.25)
      tl.fromTo(pin, { y: -2.2 * kit.vh, rotation: -35, opacity: 0 }, { y: 0, rotation: 0, opacity: 1, duration: 0.4, ease: 'bounce.out' }, 0.25)
      tl.fromTo(words, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.25, ease: 'power3.out', stagger: Math.min(0.05, 0.6 / Math.max(1, words.length)) }, 0.3)
      const at = 0.9 + hold(kit)
      tl.to(bubble, { scale: 0.9, opacity: 0, duration: 0.3, ease: 'power2.in' }, at)
      tl.to(av, { scale: 0, duration: 0.25, ease: 'power2.in' }, at + 0.1)
      out(kit, tl, at + 0.35, { duration: 0.05 })
    },
  })

  // 6 ─ goal bar: label, percent, fill with quarter ticks; persist + updateGraphic('edge', {current}) to move it
  const goal = { label: 'เป้าโดเนท · เก้าอี้เกมมิ่งตัวใหม่', current: 3250, target: 5000, prefix: '฿' }
  defineGraphic('goal-bar', {
    title: 'แถบเป้าหมาย · Goal bar',
    place: 'edge',
    defaults: goal,
    sample: { data: goal },
    presets: {
      pinned: { title: 'แถบเป้าหมายค้างจอ · Pinned goal bar', data: { persist: true } },
      followers: { title: 'เป้าผู้ติดตาม · Follower goal', data: { label: 'เป้าผู้ติดตาม', current: 870, target: 1000, prefix: '', persist: true } },
    },
    build(kit, data, tl) {
      const card = kit.el('div', 'card')
      const top = kit.el('div', 'top', null, card)
      const label = kit.el('span', 'label', data.label, top)
      const pct = kit.el('span', 'pct', null, top)
      const track = kit.el('div', 'track', null, card)
      const fill = kit.el('i', 'fill', null, track)
      for (const p of [25, 50, 75]) kit.el('i', 'tick', null, track).style.left = p + '%'
      const nums = kit.el('div', 'nums', null, card)
      const cur = kit.el('b', null, null, nums)
      const tgt = kit.el('span', null, null, nums)
      const fmt = (v) => (data.prefix ?? '') + kit.num(Math.round(v))
      const target = () => Math.max(1, Number(data.target) || 1)
      const render = (v) => {
        const r = clamp01(v / target())
        fill.style.transform = `scaleX(${r})`
        cur.textContent = fmt(v)
        pct.textContent = r >= 1 ? 'ถึงเป้าแล้ว' : Math.floor(r * 100) + '%'
        card.dataset.done = r >= 1 ? '1' : '0'
      }
      tgt.textContent = ' / ' + fmt(target())
      wipe(tl, card, 'l', 'full', 0, 0.45)
      tl.fromTo(label, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power3.out' }, 0.15)
      const proxy = drive(tl, render, 0, Math.max(0, Number(data.current) || 0), 0.35, 1.1, 'power2.out')
      kit.sound('riser', 0.3)
      kit.sound(Number(data.current) >= target() ? 'success' : 'ding', 1.45)
      if (!data.persist) {
        wipe(tl, card, 'full', 'l', 1.45 + hold(kit), 0.4, 'power3.in')
        out(kit, tl, 1.85 + hold(kit), { duration: 0.05 })
      }
      kit.root.__update = (next) => {
        Object.assign(data, next)
        kit.text(label, data.label)
        tgt.textContent = ' / ' + fmt(target())
        gsap.to(proxy, { v: Math.max(0, Number(data.current) || 0), duration: 0.8, ease: 'power2.out' })
        return true
      }
    },
  })

  // 7 ─ now playing: record-label cover (or image), title marquee when long, equalizer, thin progress line
  const song = { title: 'คืนที่ดาวเต็มฟ้า (Live Session ที่เชียงใหม่)', artist: 'วงแสงเหนือ', progress: 0.35 }
  defineGraphic('now-playing', {
    title: 'เพลงที่กำลังเล่น · Now playing',
    place: 'toast',
    defaults: song,
    sound: [['swoosh', 0], ['blip', 0.3]],
    sample: { data: song },
    presets: {
      request: { title: 'เพลงที่แฟนขอ · Song request', data: { kicker: 'เพลงที่ น้องเบียร์ ขอ', title: 'ฝนตกไหม', artist: 'บ้านริมทาง', progress: 0.05 } },
    },
    build(kit, data, tl) {
      const card = kit.el('div', 'card')
      const cover = kit.el('div', 'cover', null, card)
      if (kit.image) {
        const img = kit.el('img', null, null, cover)
        img.src = kit.image
        img.alt = ''
      } else {
        cover.classList.add('blank')
        kit.el('span', null, initial(kit, data.title), cover)
      }
      const meta = kit.el('div', 'meta', null, card)
      const kick = kit.el('div', 'kick', null, meta)
      const eq = kit.el('span', 'eq', null, kick)
      const bars = [0, 1, 2, 3].map(() => kit.el('i', null, null, eq))
      kit.el('span', null, data.kicker ?? 'กำลังเล่น', kick)
      const view = kit.el('div', 'view', null, meta)
      const title = kit.el('span', 'title', data.title, view)
      kit.el('div', 'artist', data.artist, meta)
      const prog = kit.el('i', null, null, kit.el('div', 'prog', null, meta))
      const s = edge(kit)
      const at = 0.6 + hold(kit)
      tl.fromTo(card, { x: s * -6 * kit.vh, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4, ease: 'power3.out' }, 0)
      tl.fromTo(cover, { rotation: -12, scale: 0.7 }, { rotation: 0, scale: 1, duration: 0.5, ease: 'back.out(1.8)' }, 0.05)
      tl.fromTo(meta.children, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out', stagger: 0.05 }, 0.15)
      const rand = kit.rng(seedOf(String(data.title)))
      bars.forEach((bar) => {
        const d = 0.18 + rand() * 0.2
        tl.fromTo(bar, { scaleY: 0.25 + rand() * 0.2 }, { scaleY: 1, duration: d, ease: 'sine.inOut', yoyo: true, repeat: Math.max(1, Math.floor((at - 0.4) / d) - 1) }, 0.3 + rand() * 0.1)
      })
      const p = clamp01(Number(data.progress))
      tl.fromTo(prog, { scaleX: 0 }, { scaleX: p, duration: 0.5, ease: 'power2.out' }, 0.3)
      tl.to(prog, { scaleX: Math.min(1, p + (at - 0.8) / (Number(data.length) || 210)), duration: at - 0.8, ease: 'none' }, 0.8)
      const overflow = title.scrollWidth - view.clientWidth
      if (overflow > 2) {
        view.classList.add('long')
        tl.to(title, { x: -overflow - 3 * kit.vh, duration: Math.min(at - 1.6, overflow / (7 * kit.vh) + 0.4), ease: 'sine.inOut' }, 1.1)
      }
      tl.to(card, { x: s * -4 * kit.vh, opacity: 0, duration: 0.35, ease: 'power2.in' }, at)
      out(kit, tl, at + 0.35, { duration: 0.05 })
    },
  })

  // 8 ─ starting soon / brb / ending: full-frame scene, big title, countdown from the timeline, drifting marks
  const soon = { name: 'ส้มจี๊ด', title: 'กำลังจะเริ่ม', subtitle: 'คืนนี้ลุยแรงค์ Valorant กับแก๊งเพื่อน · 20:00 น.', seconds: 300, kicker: 'เริ่มใน', done: 'ไปกันเลย' }
  const MARKS = [
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v14M3 10h14"/></svg>',
    '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/></svg>',
    '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12"/></svg>',
    '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="2.2" class="solid"/></svg>',
  ]
  defineGraphic('starting-soon', {
    title: 'ฉากรอเริ่ม · Starting soon',
    place: 'full',
    defaults: soon,
    sample: { data: { ...soon, seconds: 8 } },
    presets: {
      brb: { title: 'ฉากพักแป๊บ · Be right back', data: { title: 'พักแป๊บนึง', subtitle: 'ไปเติมน้ำ เดี๋ยวกลับมาลุยต่อ', seconds: 180, kicker: 'กลับมาใน', done: 'กลับมาแล้ว' } },
      ending: { title: 'ฉากจบไลฟ์ · Ending', data: { title: 'ขอบคุณที่ดู', subtitle: 'ไลฟ์หน้า วันศุกร์ 20:00 น. · เจอกันนะทุกคน', seconds: 0 } },
    },
    build(kit, data, tl) {
      const secs = Math.max(0, Math.round(Number(data.seconds) || 0))
      const t0 = 0.75
      const end = t0 + (secs ? secs + 1 : hold(kit) + 0.6)
      const scene = kit.el('div', 'scene')
      const field = kit.el('div', 'field', null, scene)
      const rand = kit.rng(seedOf(String(data.title)) + 11)
      const marks = Array.from({ length: 42 }, (_, i) => {
        const m = kit.el('i', i % 7 ? 'mk' : 'mk hi', null, field)
        kit.svg(MARKS[i % MARKS.length], m)
        m.style.left = rand() * 100 + '%'
        m.style.top = rand() * 100 + '%'
        m.style.width = m.style.height = 1.6 + rand() * 3 + 'vh'
        return m
      })
      const top = kit.el('div', 'top', null, scene)
      const brand = data.name ? masked(kit, top, 'brand', data.name) : null
      const rule = kit.el('i', 'rule', null, top)
      const body = kit.el('div', 'body', null, scene)
      const titleWords = maskWords(kit, kit.el('h1', 'title', null, body), data.title)
      const subtitle = data.subtitle ? masked(kit, body, 'subt', data.subtitle) : null
      const foot = kit.el('div', 'foot', null, scene)
      const bar = kit.el('i', null, null, kit.el('div', 'bar', null, foot))
      const clk = kit.el('div', 'clock', null, foot)
      const lab = masked(kit, clk, 'lab', data.kicker)
      const t = masked(kit, clk, 'time', '')
      if (!secs) clk.remove()

      wipe(tl, scene, 'b', 'full', 0, 0.55, 'power3.inOut')
      kit.sound('whoosh-low', 0)
      kit.sound('shimmer', 0.35)
      tl.fromTo(marks, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)', stagger: { each: 0.008, from: 'random' } }, 0.3)
      // slow drift: each mark sways back and forth on its own period, repeats end before the exit
      marks.forEach((m) => {
        // whole number of sways that ends exactly at the exit, so the drift never stretches the timeline
        const legs = Math.max(1, Math.round((end - 0.3) / (5 + rand() * 5)))
        tl.fromTo(m, { x: 0, y: 0, rotation: rand() * 90 }, { x: (rand() - 0.5) * 8 * kit.vh, y: (rand() - 0.5) * 8 * kit.vh, rotation: '+=' + (rand() - 0.5) * 120, duration: (end - 0.3) / legs, ease: 'sine.inOut', yoyo: true, repeat: legs - 1 }, 0.3)
      })
      if (brand) tl.fromTo(brand, { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out' }, 0.4)
      tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power3.inOut' }, 0.35)
      tl.fromTo(titleWords, { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'power4.out', stagger: 0.07 }, 0.4)
      if (subtitle) tl.fromTo(subtitle, { yPercent: 110 }, { yPercent: 0, duration: 0.4, ease: 'power3.out' }, 0.6)
      tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'power3.inOut' }, 0.45)
      if (secs) {
        tl.fromTo([lab, t], { yPercent: 110 }, { yPercent: 0, duration: 0.4, ease: 'power3.out', stagger: 0.06 }, 0.55)
        drive(tl, (v) => (t.textContent = v <= 0 ? data.done : clock(Math.ceil(v))), secs, 0, t0, secs)
        tl.to(bar, { scaleX: 0, duration: secs, ease: 'none' }, t0 + 0.25)
        kit.sound('go', t0 + secs)
      }
      if (data.persist) return
      tl.to([...titleWords, subtitle, brand].filter(Boolean), { yPercent: -110, duration: 0.25, ease: 'power2.in', stagger: 0.03 }, end - 0.2)
      wipe(tl, scene, 'full', 't', end, 0.45, 'power3.inOut')
      kit.sound('whoosh', end)
      out(kit, tl, end + 0.45, { duration: 0.05 })
    },
  })

  // 9 ─ social cycle: one handle at a time rolls through a fixed pill; platform names as text, no logos
  const socials = {
    kicker: 'ติดตามได้ที่',
    items: [
      { label: 'TikTok', handle: '@somjeed.gg' },
      { label: 'Instagram', handle: '@somjeed_' },
      { label: 'YouTube', handle: 'ส้มจี๊ด Channel' },
      { label: 'Facebook', handle: 'ส้มจี๊ดเกมมิ่ง' },
    ],
  }
  defineGraphic('social-cycle', {
    title: 'วนช่องทางโซเชียล · Social cycle',
    place: 'caption',
    defaults: socials,
    sample: { data: socials },
    build(kit, data, tl) {
      const items = [].concat(data.items ?? []).filter((i) => i && (i.label || i.handle)).slice(0, 8)
      if (!items.length) return
      const pill = kit.el('div', 'pill')
      if (data.kicker) kit.el('span', 'kick', data.kicker, pill)
      const lab = kit.el('div', 'lab', null, pill)
      const han = kit.el('div', 'han', null, pill)
      const dots = items.length > 1 ? kit.el('div', 'dots', null, pill) : null
      const rows = items.map((it) => [kit.el('span', null, it.label ?? '', lab), kit.el('span', null, it.handle ?? '', han), dots && kit.el('i', null, null, kit.el('b', null, null, dots))])
      const slot = Math.max(1.3, (kit.hold ?? items.length * 1.7) / items.length)
      wipe(tl, pill, 'c', 'full', 0, 0.45, 'power3.inOut')
      rows.forEach(([l, h, d], i) => {
        const at = 0.25 + i * slot
        tl.fromTo([l, h], { yPercent: 160 }, { yPercent: 0, duration: 0.35, ease: 'power3.out', stagger: 0.05 }, at)
        kit.sound(i ? 'swipe' : 'swoosh', at)
        if (d) tl.fromTo(d, { scale: 0 }, { scale: 1, duration: 0.3, ease: 'back.out(2)' }, at)
        if (i === rows.length - 1) return
        tl.fromTo([l, h], { yPercent: 0 }, { yPercent: -160, duration: 0.25, ease: 'power2.in', stagger: 0.04, immediateRender: false }, at + slot - 0.28)
        if (d) tl.fromTo(d, { scale: 1 }, { scale: 0, duration: 0.2, immediateRender: false }, at + slot - 0.25)
      })
      const at = 0.25 + items.length * slot
      tl.to(pill, { y: 2 * kit.vh, opacity: 0, duration: 0.35, ease: 'power2.in' }, at)
    },
  })

  // 10 ─ sponsor bug: "สนับสนุนโดย" over a brand name that flips like a split-flap between sponsors
  const spons = { kicker: 'สนับสนุนโดย', sponsors: ['คีย์บอร์ดมะลิ', 'ชาไทยป้าแดง', 'Noodle Gear'] }
  defineGraphic('sponsor-bug', {
    title: 'ผู้สนับสนุน · Sponsor bug',
    place: 'corner',
    defaults: spons,
    sample: { data: spons },
    presets: {
      thanks: { title: 'ขอบคุณสปอนเซอร์ · Sponsor thanks', data: { kicker: 'ขอบคุณผู้สนับสนุนไลฟ์นี้' } },
    },
    build(kit, data, tl) {
      const list = [].concat(data.sponsors ?? []).map((s) => (typeof s === 'string' ? s : s?.name)).filter(Boolean).slice(0, 4)
      if (!list.length) return
      const card = kit.el('div', 'card')
      const bar = kit.el('i', 'bar', null, card)
      const col = kit.el('div', 'col', null, card)
      const kick = masked(kit, col, 'kick', data.kicker)
      const stage = kit.el('div', 'stage', null, col)
      const names = list.map((s) => kit.el('span', 'brand', s, stage))
      const slot = Math.max(1.5, hold(kit) / list.length)
      const flap = { transformPerspective: 600, transformOrigin: '50% 50% -1vh' }
      wipe(tl, card, 'r', 'full', 0, 0.4)
      tl.fromTo(bar, { scaleY: 0 }, { scaleY: 1, duration: 0.3, ease: 'power3.out' }, 0.1)
      tl.fromTo(kick, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.15)
      names.forEach((node, i) => {
        const at = 0.25 + i * slot
        tl.fromTo(node, { rotationX: -90, autoAlpha: 0, ...flap }, { rotationX: 0, autoAlpha: 1, duration: 0.35, ease: 'back.out(1.6)' }, at)
        kit.sound('flap', at)
        if (i < names.length - 1) tl.fromTo(node, { rotationX: 0, autoAlpha: 1 }, { rotationX: 90, autoAlpha: 0, duration: 0.25, ease: 'power2.in', immediateRender: false }, at + slot - 0.22)
      })
      const at = 0.25 + list.length * slot
      wipe(tl, card, 'full', 'r', at, 0.35, 'power3.in')
      out(kit, tl, at + 0.35, { duration: 0.05 })
    },
  })

  // 11 ─ giveaway wheel: N names spin and land deterministically on data.winner; winner card drops in
  const give = { title: 'สุ่มแจกคีย์บอร์ด', names: ['ต้นกล้า', 'มายด์', 'บอสโอ๊ต', 'น้องเบียร์', 'เจ๊หมวย', 'กัปตันโอ', 'ฟ้าใส', 'ปูเป้'], winner: 'น้องเบียร์', kicker: 'ผู้โชคดีคือ' }
  defineGraphic('giveaway-wheel', {
    title: 'วงล้อสุ่มแจก · Giveaway wheel',
    place: 'center',
    defaults: give,
    sample: { data: give },
    build(kit, data, tl) {
      let names = [].concat(data.names ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 16)
      let w = names.indexOf(String(data.winner ?? '').trim())
      if (w < 0 && data.winner) names = [...names.slice(0, 15), String(data.winner).trim()]
      if (names.length < 2) return
      const N = names.length
      const rand = kit.rng(seedOf(names.join('|')))
      if (w < 0) w = data.winner ? N - 1 : Math.floor(rand() * N)
      const seg = 360 / N
      const R = 96
      const pt = (deg, r) => {
        const a = ((deg - 90) * Math.PI) / 180
        return (r * Math.cos(a)).toFixed(2) + ' ' + (r * Math.sin(a)).toFixed(2)
      }
      const wedge = (i, r) => `M0 0L${pt(i * seg, r)}A${r} ${r} 0 ${seg > 180 ? 1 : 0} 1 ${pt((i + 1) * seg, r)}Z`
      const wedges = names.map((_, i) => `<path class="${i % 2 ? 'b' : 'a'}" d="${wedge(i, R)}"/>`).join('')
      const pegs = names.map((_, i) => `<circle class="peg" cx="${pt(i * seg, R - 4).split(' ')[0]}" cy="${pt(i * seg, R - 4).split(' ')[1]}" r="1.8"/>`).join('')
      const wrap = kit.el('div', 'wrap')
      const title = data.title ? masked(kit, wrap, 'title', data.title) : null
      const stage = kit.el('div', 'stage', null, wrap)
      const svg = kit.svg(`<svg viewBox="-104 -104 208 208" aria-hidden="true"><circle class="rim" r="102"/><g class="rot">${wedges}<path class="win" pathLength="1" d="${wedge(w, R - 1)}"/>${pegs}</g><circle class="hub" r="13"/><circle class="hubdot" r="4"/></svg>`, stage)
      const rot = svg.querySelector('.rot')
      const size = N > 10 ? 7.5 : 9
      names.forEach((name, i) => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        g.setAttribute('transform', `rotate(${(i + 0.5) * seg - 90})`)
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        const glyphs = kit.graphemes(name)
        text.textContent = glyphs.length > 10 ? glyphs.slice(0, 9).join('') + '…' : name
        text.setAttribute('x', '58')
        text.setAttribute('class', i % 2 ? 'b' : 'a')
        text.setAttribute('font-size', size)
        g.append(text)
        rot.insertBefore(g, rot.querySelector('.win'))
      })
      const pointer = kit.svg('<svg class="pointer" viewBox="0 0 30 36" aria-hidden="true"><path d="M2 2h26L15 34z"/></svg>', stage)
      const card = kit.el('div', 'winner', null, wrap)
      const kick = masked(kit, card, 'kick', data.kicker)
      const who = masked(kit, card, 'who', names[w])
      const turn = 360 * 6 - (w + 0.5) * seg + (rand() - 0.5) * seg * 0.6
      const land = 0.45 + 3.6
      tl.fromTo(stage, { scale: 0.8, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: 'back.out(1.5)' }, 0)
      if (title) tl.fromTo(title, { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out' }, 0.15)
      tl.fromTo(rot, { rotation: 0, svgOrigin: '0 0' }, { rotation: turn, duration: 3.6, ease: 'power4.out' }, 0.45)
      // a click each time a peg passes the pointer: invert power4.out (1-(1-p)^5); thin out the fast start
      let last = -1
      for (let k = 1; k * seg <= turn; k++) {
        const at = 0.45 + 3.6 * (1 - Math.pow(1 - (k * seg) / turn, 1 / 5))
        if (at - last >= 0.07) kit.sound('click', at), (last = at)
      }
      kit.sound('whoosh', 0)
      kit.sound('success', land)
      tl.fromTo(pointer, { rotation: 0 }, { rotation: -14, duration: 0.08, ease: 'power1.out', yoyo: true, repeat: 1, immediateRender: false }, land - 0.12)
      tl.fromTo(svg.querySelector('.win'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.45, ease: 'power2.inOut' }, land)
      tl.fromTo(card, { y: -3 * kit.vh, scale: 0.9, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.45, ease: 'back.out(1.8)' }, land + 0.1)
      tl.fromTo([kick, who], { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out', stagger: 0.08 }, land + 0.2)
      const at = land + 0.6 + hold(kit)
      tl.to(wrap, { scale: 0.92, opacity: 0, duration: 0.4, ease: 'power2.in' }, at)
    },
  })

  // 12 ─ reaction burst: drawn hearts / stars / thumbs float up from a corner, seeded paths
  const burst = { kind: 'heart', count: 24 }
  defineGraphic('reaction-burst', {
    title: 'หัวใจลอย · Reaction burst',
    place: 'spot',
    defaults: burst,
    sample: { data: burst },
    presets: {
      stars: { title: 'ดาวลอย · Star burst', data: { kind: 'star' } },
      likes: { title: 'ไลก์ลอย · Like burst', data: { kind: 'thumb' } },
      mix: { title: 'รีแอคชันรวม · Mixed reactions', data: { kind: 'mix', count: 32 } },
    },
    build(kit, data, tl) {
      const n = Math.min(48, Math.max(1, Math.round(Number(data.count) || 24)))
      const kinds = data.kind === 'mix' ? ['heart', 'star', 'thumb'] : [SHAPES[data.kind] ? data.kind : 'heart']
      const o = kit.point ?? { x: innerWidth * 0.9, y: innerHeight * 0.9 }
      const lean = o.x > innerWidth / 2 ? -1 : 1
      const rand = kit.rng(seedOf(String(data.kind)) + n)
      const span = Math.max(1, hold(kit) * 0.75)
      let end = 0
      for (let i = 0; i < n; i++) {
        const kind = kinds[i % kinds.length]
        const sym = kit.el('i', 'sym ' + kind)
        kit.svg(SHAPES[kind], sym)
        const size = 3 + rand() * 3.4
        Object.assign(sym.style, { left: o.x + 'px', top: o.y + 'px', width: size + 'vh', height: size + 'vh' })
        const t = 0.05 + (i / n) * span + rand() * 0.12
        const life = 1.5 + rand() * 0.9
        const rise = (26 + rand() * 30) * kit.vh
        const dx = (lean * rand() * 18 + (rand() - 0.5) * 12) * kit.vh
        const tilt = (rand() - 0.5) * 40
        tl.fromTo(sym, { scale: 0, rotation: tilt * 0.3 }, { scale: 1, duration: 0.3, ease: 'back.out(2.6)' }, t)
        tl.fromTo(sym, { y: 0 }, { y: -rise, duration: life, ease: 'power1.out', immediateRender: false }, t)
        tl.fromTo(sym, { x: 0 }, { x: dx, duration: life, ease: 'sine.inOut', immediateRender: false }, t)
        tl.to(sym, { rotation: tilt, duration: life / 2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, t + 0.1)
        tl.fromTo(sym, { xPercent: -35 }, { xPercent: 35, duration: life / 3, ease: 'sine.inOut', yoyo: true, repeat: 2 }, t)
        tl.fromTo(sym, { opacity: 1 }, { opacity: 0, duration: 0.45, ease: 'power1.in', immediateRender: false }, t + life - 0.45)
        end = Math.max(end, t + life + 0.1)
        if (i % 3 === 0 && i < 30) kit.sound('pop-hi', t)
      }
      out(kit, tl, end, { duration: 0.05 })
    },
  })

  // 13 ─ timer: stopwatch dial + mm:ss pill, value derived from timeline time; 'down' or 'up'
  const timer = { label: 'ชาเลนจ์ห้ามหัวเราะ', seconds: 60, mode: 'down' }
  defineGraphic('timer', {
    title: 'จับเวลา · Timer',
    place: 'corner',
    defaults: timer,
    sample: { data: { ...timer, seconds: 12 } },
    presets: {
      up: { title: 'จับเวลาเดินหน้า · Stopwatch', data: { label: 'จับเวลาสปีดรัน', mode: 'up', seconds: 600 } },
      break: { title: 'พักสายตา 5 นาที · 5-min break', data: { label: 'พักสายตา', seconds: 300 } },
      pinned: { title: 'จับเวลาค้างจอ · Pinned timer', data: { persist: true } },
    },
    build(kit, data, tl) {
      const secs = Math.max(1, Math.round(Number(data.seconds) || 60))
      const up = data.mode === 'up'
      const card = kit.el('div', 'card')
      const dial = kit.svg('<svg class="dial" viewBox="0 0 40 44" aria-hidden="true"><rect class="crown" x="16.5" y="0" width="7" height="4" rx="1.2"/><circle class="face" cx="20" cy="25" r="16"/><circle class="arc" cx="20" cy="25" r="16" pathLength="1" transform="rotate(-90 20 25)"/><line class="hand" x1="20" y1="25" x2="20" y2="13"/><circle class="pin" cx="20" cy="25" r="2.2"/></svg>', card)
      const arc = dial.querySelector('.arc')
      const hand = dial.querySelector('.hand')
      const col = kit.el('div', 'col', null, card)
      const lab = kit.el('span', 'lab', data.label, col)
      const t = kit.el('b', 't', null, col)
      t.textContent = clock(secs) // reserve the widest value before measuring
      t.style.minWidth = t.offsetWidth + 'px'
      const render = (v) => {
        const s = up ? Math.floor(v) : Math.ceil(v)
        t.textContent = clock(Math.max(0, s))
        arc.style.strokeDashoffset = 1 - v / secs
        hand.setAttribute('transform', `rotate(${(v * 6) % 360} 20 25)`)
        card.dataset.urgent = !up && s <= 10 ? '1' : '0'
      }
      const t0 = 0.4
      wipe(tl, card, 'r', 'full', 0, 0.4)
      tl.fromTo(dial, { rotation: -30, scale: 0.6 }, { rotation: 0, scale: 1, duration: 0.45, ease: 'back.out(2)' }, 0.05)
      tl.fromTo(col.children, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out', stagger: 0.05 }, 0.15)
      drive(tl, render, up ? 0 : secs, up ? secs : 0, t0, secs)
      const done = t0 + secs
      kit.swap(lab, up ? 'ครบเวลา' : 'หมดเวลา', done)
      kit.sound('click', 0.05)
      if (!up) for (let k = Math.min(5, secs - 1); k >= 1; k--) kit.sound('tick', done - k)
      kit.sound(up ? 'ding' : 'bell', done)
      tl.fromTo(t, { opacity: 1 }, { opacity: 0.2, duration: 0.16, yoyo: true, repeat: 3, ease: 'power1.inOut', immediateRender: false }, done)
      if (data.persist) return
      wipe(tl, card, 'full', 'r', done + 1.2, 0.35, 'power3.in')
      out(kit, tl, done + 1.55, { duration: 0.05 })
    },
  })

  // 14 ─ clock bug: live-style clock, HH:MM with ticking seconds driven by the timeline, date under it
  defineGraphic('clock-bug', {
    title: 'นาฬิกามุมจอ · Clock bug',
    place: 'corner',
    defaults: { live: 'สด' },
    sound: [['click-soft', 0.05]],
    sample: { data: { time: '20:45:08', date: 'ศ. 21 พ.ย. 2569' } },
    presets: {
      // shortcut: a pinned clock ticks for data.run seconds (1 h) then holds; re-send to keep it running longer
      pinned: { title: 'นาฬิกาค้างจอ · Pinned clock', data: { persist: true } },
    },
    build(kit, data, tl) {
      const now = new Date()
      const m = String(data.time ?? '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
      const start = m ? (+m[1] * 3600 + +m[2] * 60 + +(m[3] ?? 0)) % 86400 : now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()
      const date = data.date ?? new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short' }).format(now)
      const run = data.persist ? Number(data.run) || 3600 : hold(kit) + 0.6
      const card = kit.el('div', 'card')
      const live = data.live ? kit.el('span', 'live', null, card) : null
      if (live) kit.el('i', null, null, live), live.append(data.live)
      const col = kit.el('div', 'col', null, card)
      const time = kit.el('div', 'time', null, col)
      const hm = kit.el('b', null, null, kit.el('span', 'g-mask hmw', null, time))
      const ss = kit.el('span', 'ss', null, time)
      const dt = masked(kit, col, 'date', date)
      const render = (v) => {
        const s = (start + Math.floor(v)) % 86400
        hm.textContent = pad(Math.floor(s / 3600)) + ':' + pad(Math.floor((s % 3600) / 60))
        ss.textContent = pad(s % 60)
      }
      wipe(tl, card, 'r', 'full', 0, 0.4)
      if (live) tl.fromTo(live, { opacity: 0, x: 8 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power3.out' }, 0.1)
      tl.fromTo(hm, { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out' }, 0.12)
      tl.fromTo(ss, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0.3)
      tl.fromTo(dt, { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.2)
      drive(tl, render, 0, run, 0.3, run)
      if (data.persist) return
      wipe(tl, card, 'full', 'r', 0.3 + run, 0.35, 'power3.in')
      out(kit, tl, 0.65 + run, { duration: 0.05 })
    },
  })

  // 15 ─ viewer milestone: tick ring + drawn arc around a counting number, a thin shock ring on landing
  const mile = { count: 1000, label: 'ผู้ชมพร้อมกัน', unit: 'คน', note: 'ขอบคุณทุกคนที่อยู่ด้วยกันคืนนี้' }
  defineGraphic('viewer-milestone', {
    title: 'ยอดผู้ชมทะลุเป้า · Viewer milestone',
    place: 'center',
    defaults: mile,
    sound: [['riser', 0.25], ['levelup', 1.35]],
    sample: { data: mile },
    presets: {
      followers: { title: 'ผู้ติดตามครบหมื่น · Follower milestone', data: { label: 'ผู้ติดตาม', count: 10000, note: 'ขอบคุณที่ติดตามกันมาตลอด' } },
      likes: { title: 'หัวใจทะลุเป้า · Likes milestone', data: { label: 'หัวใจ', unit: 'ดวง', count: 50000, note: 'กดกันมือหงิกเลยคืนนี้' } },
    },
    build(kit, data, tl) {
      const target = Math.max(0, Math.round(Number(data.count) || 0))
      const ticks = Array.from({ length: 60 }, (_, i) => {
        const a = (i * 6 * Math.PI) / 180
        const r0 = i % 5 ? 76 : 72
        const f = (r) => [(100 + r * Math.sin(a)).toFixed(2), (100 - r * Math.cos(a)).toFixed(2)]
        const [x1, y1] = f(r0)
        const [x2, y2] = f(79)
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
      }).join('')
      const wrap = kit.el('div', 'wrap')
      const ring = kit.el('div', 'ring', null, wrap)
      const svg = kit.svg(`<svg viewBox="0 0 200 200" aria-hidden="true"><circle class="wave" cx="100" cy="100" r="93"/><circle class="disc" cx="100" cy="100" r="93"/><g class="ticks">${ticks}</g><circle class="track" cx="100" cy="100" r="86"/><circle class="arc" cx="100" cy="100" r="86" pathLength="1" transform="rotate(-90 100 100)"/></svg>`, ring)
      const core = kit.el('div', 'core', null, ring)
      const label = masked(kit, core, 'label', data.label)
      const n = kit.el('b', 'n', null, core)
      n.style.fontSize = Math.min(10, 44 / Math.max(4, kit.num(target).length)) + 'vh'
      const unit = data.unit ? masked(kit, core, 'unit', data.unit) : null
      const note = data.note ? masked(kit, wrap, 'note', data.note) : null
      const land = 1.35
      tl.fromTo(svg.querySelector('.disc'), { scale: 0.6, svgOrigin: '100 100' }, { scale: 1, duration: 0.45, ease: 'back.out(1.6)' }, 0)
      tl.fromTo(ring, { opacity: 0 }, { opacity: 1, duration: 0.2 }, 0)
      tl.fromTo(svg.querySelectorAll('.ticks line'), { opacity: 0 }, { opacity: 1, duration: 0.1, stagger: 0.012 }, 0.2)
      tl.fromTo(svg.querySelector('.arc'), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: land - 0.3, ease: 'power2.inOut' }, 0.3)
      tl.fromTo([label, unit].filter(Boolean), { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out', stagger: 0.08 }, 0.2)
      kit.count(n, 0, target, 0.3, land - 0.3)
      tl.fromTo(n, { scale: 1.12 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', immediateRender: false }, land)
      tl.fromTo(svg.querySelector('.wave'), { scale: 1, opacity: 1, svgOrigin: '100 100' }, { scale: 1.22, opacity: 0, duration: 0.7, ease: 'power2.out' }, land)
      if (note) tl.fromTo(note, { yPercent: 110 }, { yPercent: 0, duration: 0.35, ease: 'power3.out' }, land + 0.05)
      const at = land + 0.3 + hold(kit)
      tl.to(wrap, { scale: 0.92, opacity: 0, duration: 0.4, ease: 'power2.in' }, at)
    },
  })

  // 16 ─ webcam frame: thick surface border + accent hairline draw around kit.box, corner marks, name tag
  const cam = { name: 'ส้มจี๊ด', role: 'สตรีมเมอร์' }
  defineGraphic('webcam-frame', {
    title: 'กรอบกล้อง · Webcam frame',
    place: 'card',
    defaults: cam,
    sound: [['shutter', 0], ['swoosh', 0.55]],
    sample: { data: cam, box: { x: 0.55, y: 0.1, w: 0.4, h: 0.45 } },
    presets: {
      guest: { title: 'กรอบแขกรับเชิญ · Guest frame', data: { name: 'บอสโอ๊ต', role: 'แขกรับเชิญ' } },
      pinned: { title: 'กรอบกล้องค้างจอ · Pinned webcam frame', data: { persist: true } },
    },
    build(kit, data, tl) {
      const b = kit.box ?? { x: innerWidth * 0.62, y: innerHeight * 0.08, w: innerWidth * 0.34, h: innerHeight * 0.42 }
      const vh = kit.vh
      const frame = kit.el('div', 'frame')
      Object.assign(frame.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' })
      const f = (n) => n.toFixed(1)
      const i = 1.3 * vh
      const o = 1.1 * vh
      const L = 3.2 * vh
      const corner = (x, y, sx, sy) => `<path class="cm" d="M${f(x + sx * L)} ${f(y)}H${f(x)}V${f(y + sy * L)}"/>`
      const svg = kit.svg(
        `<svg viewBox="0 0 ${f(b.w)} ${f(b.h)}" aria-hidden="true">` +
          `<rect class="outer" x="0" y="0" width="${f(b.w)}" height="${f(b.h)}" pathLength="1"/>` +
          `<rect class="inner" x="${f(i)}" y="${f(i)}" width="${f(b.w - 2 * i)}" height="${f(b.h - 2 * i)}" pathLength="1"/>` +
          corner(-o, -o, 1, 1) + corner(b.w + o, -o, -1, 1) + corner(-o, b.h + o, 1, -1) + corner(b.w + o, b.h + o, -1, -1) +
          '</svg>',
        frame,
      )
      const tag = kit.el('div', 'tag', null, frame)
      const name = masked(kit, tag, 'nm', data.name)
      const role = data.role ? masked(kit, tag, 'role', data.role) : null
      const rects = svg.querySelectorAll('rect')
      const marks = svg.querySelectorAll('.cm')
      tl.fromTo(rects[0], { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, 0)
      tl.fromTo(rects[1], { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, 0.15)
      tl.fromTo(marks, { opacity: 0, scale: 0.4, transformOrigin: '50% 50%' }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', stagger: 0.05 }, 0.45)
      wipe(tl, tag, 'l', 'full', 0.55, 0.35)
      tl.fromTo([name, role].filter(Boolean), { yPercent: 110 }, { yPercent: 0, duration: 0.3, ease: 'power3.out', stagger: 0.06 }, 0.65)
      if (data.persist) return
      const at = 0.95 + hold(kit)
      wipe(tl, tag, 'full', 'l', at, 0.3, 'power3.in')
      tl.to(marks, { opacity: 0, scale: 0.4, duration: 0.2, ease: 'power2.in' }, at)
      tl.to(rects, { strokeDashoffset: -1, duration: 0.45, ease: 'power2.inOut' }, at + 0.1)
      out(kit, tl, at + 0.55, { duration: 0.05 })
    },
  })
})()
