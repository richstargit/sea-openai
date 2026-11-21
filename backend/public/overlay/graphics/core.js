// Graphics engine for the live overlay. A graphic is a small builder registered with
// defineGraphic(); it creates its DOM inside a root and adds tweens to one paused GSAP
// timeline, so every frame is seek-safe (window.__timelines). Presets = graphic × theme.
;(() => {
  const specs = {}
  const presets = {}
  const number = new Intl.NumberFormat('th-TH')
  const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' })
  const words = new Intl.Segmenter('th', { granularity: 'word' })
  const themes = ['paper', 'ink', 'pop']
  window.__timelines = window.__timelines || {}

  // spec: { title, place: 'spot'|'lower'|'corner'|'toast'|'full'|'crawl'|'edge', build(kit, data, tl),
  //         themes?: false | string[], theme?, defaults?, sample?, presets?: { suffix: { title, data, theme } } }
  window.defineGraphic = (id, spec) => {
    // group = the file that registered it (livecut, hand, deals, …) for catalogues
    spec.group ??= (document.currentScript?.src.split('/').pop() ?? 'other').replace(/\.js$/, '')
    specs[id] = spec
    const variants = spec.themes === false ? [spec.theme ?? 'paper'] : spec.themes ?? themes
    variants.forEach((theme, i) => {
      presets[i ? id + '-' + theme : id] = { graphic: id, theme, data: {}, title: spec.title + (i ? ' · ' + theme : '') }
    })
    for (const [suffix, extra] of Object.entries(spec.presets ?? {}))
      presets[id + '-' + suffix] = { graphic: id, theme: extra.theme ?? variants[0], data: extra.data ?? {}, title: extra.title }
  }
  window.graphicSpecs = specs
  window.graphicPresets = presets

  // shop theme: one font and 2–3 colours, set once per live (event type 'theme' or ?accent= in the URL)
  const root = document.documentElement
  window.applyShopTheme = ({ accent, accent2, font } = {}) => {
    if (accent) root.style.setProperty('--shop-accent', accent)
    if (accent2) root.style.setProperty('--shop-accent2', accent2)
    if (font) root.style.setProperty('--shop-font', `"${font}"`)
  }
  const query = new URLSearchParams(location.search)
  applyShopTheme({ accent: query.get('accent'), accent2: query.get('accent2'), font: query.get('font') })

  // face box (fractions of the frame): graphics keep to the side away from the face
  let face = null
  window.setFaceBox = (box) => {
    face = box && box.w > 0 ? box : null
    document.body.dataset.faceSide = face ? (face.x + face.w / 2 < 0.5 ? 'left' : 'right') : ''
  }
  const away = () => (face && face.x + face.w / 2 < 0.5 ? 'right' : 'left')

  let sounded = false
  function kit(rootEl, event, theme, tl) {
    const vh = innerHeight / 100
    const vw = innerWidth / 100
    const el = (tag, className, text, parent = rootEl) => {
      const node = document.createElement(tag)
      if (className) node.className = className
      if (text != null) node.textContent = text
      parent.append(node)
      return node
    }
    const frac = (b) => b && { x: b.x * innerWidth, y: b.y * innerHeight, w: b.w * innerWidth, h: b.h * innerHeight }
    return {
      root: rootEl,
      vh,
      vw,
      theme,
      el,
      // trusted, graphic-authored markup only; never pass event data here
      svg(markup, parent = rootEl) {
        parent.insertAdjacentHTML('beforeend', markup)
        return parent.lastElementChild
      },
      text: (node, value) => ((node.textContent = value ?? ''), node),
      money: (n) => '฿' + number.format(n),
      num: (n) => number.format(n),
      graphemes: (s) => [...segmenter.segment(String(s ?? ''))].map((part) => part.segment),
      words: (s) => [...words.segment(String(s ?? ''))].map((part) => part.segment),
      point: event.x == null ? null : { x: event.x * innerWidth, y: event.y * innerHeight },
      box: frac(event.box),
      face: frac(face),
      away: away(),
      image: event.image,
      hold: event.ttl ? event.ttl / 1000 : null,
      // sounds play on real playback only; GSAP skips calls while seeking
      sound(name, at = 0) {
        sounded = true
        tl.call(() => window.playSound?.(name), [], at)
      },
      tick(at) {
        sounded = true
        tl.call(() => window.playSound?.('tick'), [], at)
      },
      // seeded PRNG (mulberry32) so particle layouts are identical on every seek
      rng(seed = 1) {
        let a = seed >>> 0
        return () => {
          a = (a + 0x6d2b79f5) | 0
          let t = Math.imul(a ^ (a >>> 15), 1 | a)
          t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
      },
      // count a number up (or down) inside node; lands on the exact formatted value
      count(node, from, to, at, duration = 0.9, format = (n) => number.format(n)) {
        // a setter, not onUpdate: GSAP suppresses callbacks while seeking, setters still run
        let value = from
        const proxy = {
          get v() {
            return value
          },
          set v(next) {
            value = next
            node.textContent = format(next === to ? to : Math.round(next))
          },
        }
        tl.fromTo(proxy, { v: from }, { v: to, duration, ease: 'power2.out' }, at)
        node.textContent = format(to)
        return at + duration
      },
      // show a value from a timeline time onward (seek-safe replacement for tl.call text swaps)
      swap(node, value, at) {
        const before = node.textContent
        const proxy = {
          get p() {
            return 0
          },
          set p(on) {
            node.textContent = on ? value : before
          },
        }
        tl.fromTo(proxy, { p: 0 }, { p: 1, duration: 0.001, ease: 'none', immediateRender: false }, at)
      },
    }
  }

  const PLACE_SOUND = { lower: 'swoosh', card: 'whoosh', corner: 'pop', toast: 'blip', spot: 'pop', center: 'impact', full: 'whoosh', zoom: 'whoosh', edge: 'shimmer', compose: 'swoosh' }
  const exclusive = new Set(['spot', 'lower', 'full', 'crawl', 'edge', 'center', 'caption', 'card', 'zoom', 'compose'])
  const layers = {}
  const active = {}
  let count = 0
  function layer(place) {
    if (!layers[place]) {
      const section = document.createElement('section')
      section.id = 'fx-' + place
      section.className = 'fx-layer'
      document.querySelector('#fx').append(section)
      layers[place] = section
    }
    return layers[place]
  }

  // event: { preset, data?, x?, y?, box?, image?, ttl?, theme? }
  window.playGraphic = (event) => {
    const preset = presets[event.preset]
    if (!preset) return false
    const spec = specs[preset.graphic]
    const theme = event.theme ?? preset.theme
    const data = { ...spec.defaults, ...preset.data, ...event.data }
    const place = spec.place
    if (exclusive.has(place) && active[place]) {
      active[place].tl.kill()
      active[place].root.remove()
    }
    const container = layer(place)
    if (!exclusive.has(place)) while (container.children.length >= 3) container.firstElementChild.remove()
    const rootEl = document.createElement('div')
    rootEl.className = 'g g-' + preset.graphic
    rootEl.dataset.theme = theme
    if (data.accent) rootEl.style.setProperty('--accent', data.accent)
    container.dataset.side = face ? away() : ''
    container.append(rootEl)
    const tl = gsap.timeline({ paused: true })
    const id = 'graphic-' + ++count
    window.__timelines[id] = tl
    sounded = false
    spec.build(kit(rootEl, event, theme, tl), data, tl)
    // sound: data.sound / event.sound override ('none' mutes), else the graphic's own cue list,
    // else whatever it scheduled itself, else a default for its place on screen
    const override = data.sound ?? event.sound
    const cues = override ? (override === 'none' ? [] : [[override, 0]]) : spec.sound ?? (sounded ? [] : PLACE_SOUND[place] ? [[PLACE_SOUND[place], 0]] : [])
    for (const [name, at] of cues) tl.call(() => window.playSound?.(name), [], at)
    tl.eventCallback('onComplete', () => {
      if (data.persist) return
      rootEl.remove()
      delete window.__timelines[id]
      if (active[place]?.root === rootEl) delete active[place]
    })
    active[place] = { root: rootEl, tl, id }
    tl.restart()
    return id
  }
  // update a persistent graphic in place (poll bars, stock, countdown) without replaying its entrance
  window.updateGraphic = (place, data) => active[place]?.root.__update?.(data)
  window.clearGraphic = (place) => {
    if (!active[place]) return
    active[place].tl.kill()
    active[place].root.remove()
    delete active[place]
  }
})()
