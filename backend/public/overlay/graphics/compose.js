// compose: a graphic described entirely by data, so a director (Decisions API, Codex,
// a person) can build new motion without shipping code. Layers are positioned in % of the
// frame and animated with named recipes; every recipe is seek-safe.
;(() => {
  const COLORS = { text: 'var(--text)', sub: 'var(--sub)', hi: 'var(--hi)', 'on-hi': 'var(--on-hi)', accent: 'var(--accent)', accent2: 'var(--accent2)', surface: 'var(--surface)', paper: 'var(--paper)', ink: 'var(--ink)', white: '#fff', black: '#000', none: 'transparent' }
  const color = (value, fallback) => COLORS[value] ?? (/^#[0-9a-f]{3,8}$/i.test(value ?? '') ? value : fallback)
  const num = (value, fallback, lo = -1e4, hi = 1e4) => (Number.isFinite(Number(value)) ? Math.min(hi, Math.max(lo, Number(value))) : fallback)

  // entrance recipes: [from, to, ease]
  const IN = {
    fade: [{ opacity: 0 }, { opacity: 1 }, 'power2.out'],
    'fade-up': [{ opacity: 0, y: '3vh' }, { opacity: 1, y: 0 }, 'power3.out'],
    'fade-down': [{ opacity: 0, y: '-3vh' }, { opacity: 1, y: 0 }, 'power3.out'],
    'slide-left': [{ opacity: 0, x: '12vh' }, { opacity: 1, x: 0 }, 'expo.out'],
    'slide-right': [{ opacity: 0, x: '-12vh' }, { opacity: 1, x: 0 }, 'expo.out'],
    pop: [{ opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1 }, 'back.out(2)'],
    drop: [{ opacity: 0, y: '-14vh' }, { opacity: 1, y: 0 }, 'bounce.out'],
    'scale-in': [{ opacity: 0, scale: 1.25 }, { opacity: 1, scale: 1 }, 'power3.out'],
    'blur-in': [{ opacity: 0, filter: 'blur(1.2vh)' }, { opacity: 1, filter: 'blur(0vh)' }, 'power2.out'],
    'rotate-in': [{ opacity: 0, rotation: -18, scale: 0.8 }, { opacity: 1, rotation: 0, scale: 1 }, 'back.out(1.6)'],
    'flip-x': [{ opacity: 0, rotationX: -90, transformPerspective: 900 }, { opacity: 1, rotationX: 0 }, 'power3.out'],
    'flip-y': [{ opacity: 0, rotationY: 90, transformPerspective: 900 }, { opacity: 1, rotationY: 0 }, 'power3.out'],
    stretch: [{ opacity: 0, scaleX: 0.2, scaleY: 1.4 }, { opacity: 1, scaleX: 1, scaleY: 1 }, 'elastic.out(1,0.6)'],
    'wipe-right': [{ clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }, 'power3.inOut'],
    'wipe-left': [{ clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }, 'power3.inOut'],
    'wipe-up': [{ clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }, 'power3.inOut'],
    iris: [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }, 'power3.out'],
    none: [{}, {}, 'none'],
  }
  const OUT = {
    fade: { opacity: 0, ease: 'power2.in' },
    'fade-down': { opacity: 0, y: '3vh', ease: 'power2.in' },
    'fade-up': { opacity: 0, y: '-3vh', ease: 'power2.in' },
    'slide-left': { opacity: 0, x: '-12vh', ease: 'power3.in' },
    'slide-right': { opacity: 0, x: '12vh', ease: 'power3.in' },
    'pop-out': { opacity: 0, scale: 0.4, ease: 'back.in(2)' },
    'scale-out': { opacity: 0, scale: 1.2, ease: 'power2.in' },
    'wipe-out': { clipPath: 'inset(0% 0% 0% 100%)', ease: 'power3.inOut' },
    'blur-out': { opacity: 0, filter: 'blur(1.2vh)', ease: 'power2.in' },
    none: null,
  }
  // motion while the layer holds; bounded repeats keep it seek-safe and finite
  const HOLD = {
    float: { y: '-1vh', ease: 'sine.inOut' },
    pulse: { scale: 1.06, ease: 'sine.inOut' },
    sway: { rotation: 3, ease: 'sine.inOut' },
    spin: { rotation: 360, ease: 'none' },
    breathe: { opacity: 0.6, ease: 'sine.inOut' },
  }

  defineGraphic('compose', {
    title: 'ประกอบเอง · Compose (data-driven)',
    place: 'compose',
    sample: {
      data: {
        layers: [
          { kind: 'panel', x: 6, y: 66, w: 40, h: 22, bg: 'surface', radius: 2, in: 'wipe-right', at: 0, out: 'fade' },
          { kind: 'text', text: 'ไลฟ์พิเศษคืนนี้', x: 9, y: 69, size: 2.6, color: 'sub', in: 'mask-up', at: 0.25 },
          { kind: 'text', text: 'ลดทั้งร้าน 50%', x: 9, y: 73, size: 7, weight: 700, color: 'text', in: 'typewriter', at: 0.4 },
          { kind: 'line', x: 9, y: 84, w: 30, color: 'hi', thickness: 0.5, in: 'draw', at: 0.9 },
          { kind: 'ring', x: 42, y: 70, w: 8, color: 'hi', in: 'pop', at: 0.6, hold: 'spin' },
        ],
      },
    },
    build(kit, data, tl) {
      const layers = [].concat(data.layers ?? []).slice(0, 16)
      const holdFor = kit.hold ?? num(data.hold, 2.4, 0.2, 60)
      let end = 0
      for (const layer of layers) {
        // the wrapper owns placement (CSS translate); GSAP animates only the inner node
        const wrap = kit.el('div', 'g-compose-layer')
        const align = { left: '0%', center: '-50%', right: '-100%' }[layer.align] ?? '0%'
        Object.assign(wrap.style, { left: num(layer.x, 10, -50, 150) + '%', top: num(layer.y, 10, -50, 150) + '%', translate: `${align} 0` })
        const kind = ['text', 'panel', 'image', 'number', 'line', 'dot', 'ring'].includes(layer.kind) ? layer.kind : 'text'
        const node = kit.el('div', 'g-compose-' + kind, null, wrap)
        const size = num(layer.size, 4, 0.5, 40)
        const style = {
          color: color(layer.color, 'var(--text)'),
          background: color(layer.bg, kind === 'panel' ? 'var(--surface)' : 'transparent'),
          fontSize: size + 'vh',
          fontWeight: String(num(layer.weight, 600, 100, 900)),
          borderRadius: num(layer.radius, kind === 'dot' || kind === 'ring' ? 50 : 0, 0, 50) + (kind === 'dot' || kind === 'ring' ? '%' : 'vh'),
          textAlign: ['left', 'center', 'right'].includes(layer.align) ? layer.align : 'left',
        }
        // size lives on the wrapper (w/h in % of the frame; dots and rings in vh), the node fills it
        const round = kind === 'dot' || kind === 'ring'
        if (layer.w != null) wrap.style.width = num(layer.w, 10, 0, 200) + (round ? 'vh' : '%')
        if (layer.h != null) wrap.style.height = num(layer.h, 10, 0, 200) + '%'
        if (layer.w != null) style.width = '100%'
        if (layer.h != null && kind === 'panel') style.height = '100%'
        if (round) style.width = wrap.style.width || '6vh'
        Object.assign(node.style, style)
        if (kind === 'line') Object.assign(node.style, { height: num(layer.thickness, 0.4, 0.1, 5) + 'vh', background: style.color })
        if (kind === 'dot') Object.assign(node.style, { height: style.width, background: style.color })
        if (kind === 'ring') Object.assign(node.style, { height: style.width, border: `${num(layer.thickness, 0.5, 0.1, 5)}vh solid ${style.color}`, borderTopColor: 'transparent' })
        if (kind === 'image' && (layer.src || kit.image)) {
          const img = kit.el('img', null, null, node)
          img.alt = ''
          img.src = String(layer.src ?? kit.image)
        }
        const at = num(layer.at, 0, 0, 30)
        const duration = num(layer.dur, 0.45, 0.05, 5)
        let target = node
        let recipe = layer.in ?? 'fade-up'
        if (kind === 'text' || kind === 'number') {
          if (recipe === 'typewriter') {
            const parts = kit.graphemes(layer.text)
            const spans = parts.map((part) => kit.el('span', 'g-compose-char', part, node))
            tl.fromTo(spans, { opacity: 0 }, { opacity: 1, duration: 0.01, stagger: Math.min(0.06, 1 / Math.max(1, spans.length)) }, at)
            recipe = 'none'
          } else if (recipe === 'mask-up') {
            node.classList.add('g-mask')
            target = kit.el('span', null, layer.text, node)
            tl.fromTo(target, { yPercent: 110 }, { yPercent: 0, duration, ease: 'power4.out' }, at)
            recipe = 'none'
          } else if (kind === 'number') {
            node.textContent = ''
            const prefix = String(layer.prefix ?? '')
            const suffix = String(layer.suffix ?? '')
            kit.count(node, num(layer.from, 0), num(layer.value, 0, -1e12, 1e12), at, duration * 2, (n) => prefix + kit.num(n) + suffix)
          } else node.textContent = layer.text ?? ''
        }
        if (kind === 'line' && (recipe === 'draw' || !IN[recipe])) {
          tl.fromTo(node, { scaleX: 0, transformOrigin: layer.align === 'right' ? '100% 50%' : '0% 50%' }, { scaleX: 1, duration, ease: 'power3.inOut' }, at)
          recipe = 'none'
        }
        const [from, to, ease] = IN[recipe] ?? IN['fade-up']
        if (recipe !== 'none') tl.fromTo(target, from, { ...to, duration, ease }, at)
        const shown = at + duration
        const outAt = layer.outAt != null ? num(layer.outAt, shown + holdFor, 0, 120) : Math.max(shown, holdFor + 0.5)
        const hold = HOLD[layer.hold]
        if (hold && outAt - shown > 0.4) {
          const cycle = layer.hold === 'spin' ? 1.6 : 0.8
          const repeat = Math.max(0, Math.floor((outAt - shown) / cycle) - 1)
          tl.to(target, { ...hold, duration: cycle, repeat, yoyo: layer.hold !== 'spin' }, shown)
        }
        const exit = OUT[layer.out ?? 'fade'] ?? OUT.fade
        if (exit) tl.to(wrap, { ...exit, duration: 0.35 }, outAt)
        else tl.to(wrap, { opacity: 0, duration: 0.01 }, outAt + 0.35)
        end = Math.max(end, outAt + 0.35)
      }
      tl.set({}, {}, end)
    },
  })
})()
