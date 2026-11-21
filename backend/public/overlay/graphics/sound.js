// Synthesized sound effects for overlay graphics (WebAudio, no files). OBS plays them when the
// Browser Source has "Control audio via OBS" ticked. ?volume=0..1 or ?sound=off in the URL.
;(() => {
  const query = new URLSearchParams(location.search)
  const muted = query.get('sound') === 'off'
  const volume = Math.min(1, Math.max(0, Number(query.get('volume') ?? 0.7)))
  let ctx
  let master
  let noiseBuffer
  function audio() {
    if (!ctx) {
      ctx = new AudioContext()
      master = ctx.createGain()
      master.gain.value = volume
      master.connect(ctx.destination)
      // one second of seeded white noise, reused by every noise-based sound
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      let seed = 1
      for (let i = 0; i < data.length; i++) {
        seed = (seed * 16807) % 2147483647
        data[i] = (seed / 2147483647) * 2 - 1
      }
    }
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  }
  // envelope: quick attack, exponential decay
  function env(gain, at, peak, dur, attack = 0.005) {
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(peak, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
  }
  function tone(freq, dur, { type = 'sine', gain = 0.25, at = 0, to, attack } = {}) {
    const c = audio()
    const t = c.currentTime + at
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur)
    env(g, t, gain, dur, attack)
    osc.connect(g).connect(master)
    osc.start(t)
    osc.stop(t + dur + 0.05)
  }
  function noise(dur, { gain = 0.2, at = 0, filter = 'bandpass', from = 1200, to, q = 1, attack } = {}) {
    const c = audio()
    const t = c.currentTime + at
    const src = c.createBufferSource()
    src.buffer = noiseBuffer
    const f = c.createBiquadFilter()
    f.type = filter
    f.Q.value = q
    f.frequency.setValueAtTime(from, t)
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = c.createGain()
    env(g, t, gain, dur, attack)
    src.connect(f).connect(g).connect(master)
    src.start(t, (t * 7919) % 0.5)
    src.stop(t + dur + 0.05)
  }
  const bell = (f, at = 0, gain = 0.18, dur = 0.9) => {
    tone(f, dur, { gain, at })
    tone(f * 2.76, dur * 0.5, { gain: gain * 0.35, at })
    tone(f * 5.4, dur * 0.25, { gain: gain * 0.15, at })
  }

  const sounds = {
    tick: () => tone(1320, 0.08, { gain: 0.2 }),
    click: () => noise(0.03, { filter: 'highpass', from: 3000, gain: 0.3 }),
    type: () => { noise(0.025, { filter: 'highpass', from: 2500, gain: 0.25 }); tone(180, 0.03, { gain: 0.08 }) },
    pop: () => { tone(420, 0.12, { to: 900, gain: 0.3 }); noise(0.04, { from: 2000, gain: 0.08 }) },
    blip: () => { tone(880, 0.07, { type: 'triangle', gain: 0.2 }); tone(1320, 0.09, { type: 'triangle', gain: 0.18, at: 0.07 }) },
    ding: () => bell(1568),
    chime: () => [1047, 1319, 1568, 2093].forEach((f, i) => bell(f, i * 0.07, 0.12, 0.7)),
    success: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.16, at: i * 0.08 })),
    coin: () => { tone(988, 0.07, { type: 'square', gain: 0.1 }); tone(1319, 0.35, { type: 'square', gain: 0.1, at: 0.07 }) },
    cash: () => { noise(0.05, { filter: 'highpass', from: 2500, gain: 0.25 }); bell(2637, 0.06, 0.14, 0.6); noise(0.18, { from: 5000, gain: 0.05, at: 0.08 }) },
    whoosh: () => noise(0.4, { from: 300, to: 2600, q: 0.8, gain: 0.35, attack: 0.12 }),
    swoosh: () => noise(0.25, { from: 2400, to: 500, q: 0.9, gain: 0.3, attack: 0.04 }),
    swipe: () => noise(0.14, { filter: 'highpass', from: 1500, to: 6000, gain: 0.22 }),
    slash: () => noise(0.16, { filter: 'highpass', from: 6000, to: 1800, gain: 0.3, attack: 0.01 }),
    thud: () => { tone(150, 0.25, { to: 55, gain: 0.5 }); noise(0.08, { filter: 'lowpass', from: 600, gain: 0.25 }) },
    stamp: () => { tone(120, 0.2, { to: 50, gain: 0.55 }); noise(0.12, { filter: 'lowpass', from: 1200, gain: 0.35 }); noise(0.05, { filter: 'highpass', from: 3000, gain: 0.12, at: 0.02 }) },
    impact: () => { tone(90, 0.5, { to: 35, gain: 0.6 }); noise(0.6, { filter: 'lowpass', from: 3000, to: 200, gain: 0.35 }) },
    riser: () => { tone(180, 0.7, { type: 'sawtooth', to: 1400, gain: 0.08, attack: 0.5 }); noise(0.7, { from: 400, to: 5000, gain: 0.12, attack: 0.6 }) },
    sparkle: () => [2637, 3136, 3951, 3520, 4186].forEach((f, i) => tone(f, 0.18, { type: 'triangle', gain: 0.06, at: i * 0.05 })),
    shimmer: () => [1568, 2093, 2637].forEach((f, i) => tone(f, 1.1, { gain: 0.04, at: i * 0.1, attack: 0.3 })),
    firework: () => { noise(0.5, { from: 200, to: 2000, gain: 0.12, attack: 0.3 }); noise(0.5, { filter: 'lowpass', from: 2500, to: 300, gain: 0.45, at: 0.45 }); for (let i = 0; i < 8; i++) noise(0.03, { filter: 'highpass', from: 4000, gain: 0.12, at: 0.6 + i * 0.07 }) },
    heart: () => { tone(660, 0.1, { type: 'triangle', gain: 0.18 }); tone(990, 0.16, { type: 'triangle', gain: 0.16, at: 0.09 }) },
    combo: () => [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.12, { type: 'square', gain: 0.07, at: i * 0.06 })),
    beep: () => tone(880, 0.12, { type: 'square', gain: 0.08 }),
    go: () => tone(1760, 0.45, { type: 'square', gain: 0.08 }),
    buzz: () => tone(110, 0.3, { type: 'sawtooth', gain: 0.12 }),
    printer: () => { for (let i = 0; i < 6; i++) tone(240, 0.05, { type: 'square', gain: 0.05, at: i * 0.08 }) },
    flap: () => { for (let i = 0; i < 7; i++) noise(0.02, { filter: 'highpass', from: 3500, gain: 0.2, at: i * 0.045 }) },
    shutter: () => { noise(0.04, { filter: 'highpass', from: 2000, gain: 0.35 }); noise(0.05, { filter: 'highpass', from: 1500, gain: 0.3, at: 0.08 }) },
    paper: () => noise(0.3, { from: 3000, to: 1200, q: 0.5, gain: 0.15 }),
    water: () => { for (let i = 0; i < 5; i++) tone(500 + i * 170, 0.09, { to: 1400 + i * 200, gain: 0.08, at: i * 0.06 }) },
    bell: () => bell(1047, 0, 0.22, 1.4),
    applause: () => { for (let i = 0; i < 24; i++) noise(0.05, { filter: 'bandpass', from: 1800 + (i % 5) * 300, gain: 0.12, at: i * 0.045 }) },
    levelup: () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.18, { type: 'square', gain: 0.06, at: i * 0.07 })),
  }
  // Recorded effects from the HyperFrames package (Pixabay licence), cut and pitched the way
  // Astraflow cuts them: [file, offset, length, playbackRate, gain]. Synth versions above are the
  // fallback until (or unless) the file loads.
  const RECORDED = {
    whoosh: ['whoosh.mp3', 0, 0.8, 1, 0.9],
    'whoosh-low': ['whoosh.mp3', 0, 0.9, 0.85, 0.9],
    'whoosh-high': ['whoosh.mp3', 0, 0.6, 1.2, 0.8],
    'whoosh-big': ['whoosh-cinematic.mp3', 1.3, 2.6, 1, 0.9],
    swoosh: ['whoosh-short.mp3', 0, 0.6, 1, 0.8],
    pop: ['pop.mp3', 0, 0.35, 1, 0.9],
    'pop-hi': ['pop.mp3', 0, 0.25, 1.25, 0.8],
    ding: ['chime.mp3', 0, 1.4, 1, 0.8],
    chime: ['chime.mp3', 0, 2.5, 1, 0.8],
    riser: ['riser.mp3', 0.8, 1.8, 1, 0.8],
    impact: ['impact-bass-1.mp3', 0, 1.0, 1, 1],
    boom: ['impact-bass-2.mp3', 0, 1.4, 1, 1],
    stamp: ['impact-bass-1.mp3', 0, 0.45, 1.4, 0.9],
    thud: ['impact-bass-2.mp3', 0, 0.5, 1.3, 0.8],
    glitch: ['glitch-1.mp3', 0, 0.7, 1, 0.7],
    'glitch-long': ['glitch-2.mp3', 0, 1.3, 1, 0.6],
    sparkle: ['sparkle.mp3', 0, 1.4, 1, 0.7],
    click: ['click.mp3', 0, 0.37, 1, 0.8],
    'click-soft': ['click-soft.mp3', 0, 0.37, 1, 0.6],
    type: ['key-press.mp3', 0, 0.2, 1, 0.8],
    typing: ['typing.mp3', 0, 1.8, 1, 0.7],
    notify: ['notification.mp3', 0, 1.2, 1, 0.7],
    ping: ['ping.mp3', 0, 1.0, 1, 0.7],
    error: ['error.mp3', 0, 1.0, 1, 0.7],
  }
  // names with only a recording borrow the closest synth until it loads
  Object.assign(sounds, { 'whoosh-low': sounds.whoosh, 'whoosh-high': sounds.swoosh, 'whoosh-big': sounds.whoosh, 'pop-hi': sounds.pop, boom: sounds.impact, glitch: sounds.buzz, 'glitch-long': sounds.buzz, 'click-soft': sounds.click, typing: sounds.type, notify: sounds.blip, ping: sounds.ding, error: sounds.buzz })
  const buffers = {}
  function preload() {
    if (muted || !window.fetch) return
    const c = audio()
    for (const file of new Set(Object.values(RECORDED).map(([f]) => f)))
      fetch('sfx/' + file)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject()))
        .then((bytes) => c.decodeAudioData(bytes))
        .then((buffer) => (buffers[file] = buffer))
        .catch(() => {})
  }
  function playRecorded([file, offset, length, rate, gain]) {
    const c = audio()
    const t = c.currentTime
    const src = c.createBufferSource()
    src.buffer = buffers[file]
    src.playbackRate.value = rate
    const g = c.createGain()
    g.gain.setValueAtTime(gain, t)
    // short fade at the cut so trimmed sounds never click
    g.gain.setValueAtTime(gain, t + Math.max(0, length / rate - 0.12))
    g.gain.exponentialRampToValueAtTime(0.0001, t + length / rate)
    src.connect(g).connect(master)
    src.start(t, offset, length)
  }
  window.soundNames = [...new Set([...Object.keys(sounds), ...Object.keys(RECORDED)])]
  window.playSound = (name) => {
    if (muted) return false
    try {
      const recorded = RECORDED[name]
      if (recorded && buffers[recorded[0]]) playRecorded(recorded)
      else if (sounds[name]) sounds[name]()
      else return false
      return true
    } catch {
      return false
    }
  }
  preload()
})()
