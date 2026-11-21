// Camera zoom through obs-websocket v5, straight from the browser source.
// Configure in the Browser Source URL: ?camera=<source name>&obsPassword=<password>
// (optional: obs=ws://127.0.0.1:4455, scene=<scene name>, maxZoom=2.5)
;(() => {
  const query = new URLSearchParams(location.search)
  const camera = query.get('camera')
  const maxZoom = Number(query.get('maxZoom') ?? 2.5)
  let socket
  let ready
  let seq = 0
  const pending = new Map()

  // crypto.subtle only exists in secure contexts; an overlay served over plain http on a LAN
  // address has none, so fall back to a small SHA-256 for the obs-websocket handshake
  function sha256Bytes(bytes) {
    const k = []
    const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
    for (let n = 2, found = 0; found < 64; n++) {
      if ([...Array(n).keys()].slice(2).some((d) => n % d === 0)) continue
      k[found++] = (Math.cbrt(n) % 1) * 2 ** 32 | 0
    }
    const length = bytes.length
    const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6)
    padded.set(bytes)
    padded[length] = 0x80
    const view = new DataView(padded.buffer)
    view.setUint32(padded.length - 4, length * 8)
    view.setUint32(padded.length - 8, Math.floor(length / 2 ** 29))
    const w = new Uint32Array(64)
    const rotr = (x, r) => (x >>> r) | (x << (32 - r))
    for (let block = 0; block < padded.length; block += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4)
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
      }
      let [a, b, c, d, e, f, g, hh] = h
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
        ;[hh, g, f, e, d, c, b, a] = [g, f, e, (d + t1) | 0, c, b, a, (t1 + t2) | 0]
      }
      ;[a, b, c, d, e, f, g, hh].forEach((v, i) => (h[i] = (h[i] + v) | 0))
    }
    const out = new DataView(new ArrayBuffer(32))
    h.forEach((v, i) => out.setUint32(i * 4, v))
    return new Uint8Array(out.buffer)
  }
  const sha256 = async (text) => {
    const bytes = new TextEncoder().encode(text)
    const digest = globalThis.crypto?.subtle ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)) : sha256Bytes(bytes)
    return btoa(String.fromCharCode(...digest))
  }

  function connect() {
    if (!camera) return Promise.reject(new Error('no camera source configured'))
    if (ready) return ready
    ready = new Promise((resolve, reject) => {
      socket = new WebSocket(query.get('obs') ?? 'ws://127.0.0.1:4455')
      socket.onmessage = async ({ data }) => {
        const { op, d } = JSON.parse(data)
        if (op === 0) {
          const auth = d.authentication
          const authentication = auth ? await sha256((await sha256((query.get('obsPassword') ?? '') + auth.salt)) + auth.challenge) : undefined
          socket.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication, eventSubscriptions: 0 } }))
        } else if (op === 2) resolve()
        else if (op === 7) {
          const request = pending.get(d.requestId)
          pending.delete(d.requestId)
          if (!request) return
          if (d.requestStatus.result) request.resolve(d.responseData ?? {})
          else request.reject(new Error(d.requestStatus.comment ?? d.requestType + ' failed'))
        }
      }
      socket.onerror = () => reject(new Error('obs-websocket unreachable'))
      socket.onclose = () => {
        ready = undefined
        for (const request of pending.values()) request.reject(new Error('obs-websocket closed'))
        pending.clear()
      }
    })
    return ready
  }
  function call(requestType, requestData) {
    const requestId = String(++seq)
    socket.send(JSON.stringify({ op: 6, d: { requestType, requestId, requestData } }))
    return new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }))
  }

  let item // { scene, id, base transform, canvas }
  let tween
  async function cameraItem() {
    if (item) return item
    await connect()
    const scene = query.get('scene') ?? (await call('GetCurrentProgramScene')).currentProgramSceneName
    const { sceneItemId } = await call('GetSceneItemId', { sceneName: scene, sourceName: camera })
    const { sceneItemTransform } = await call('GetSceneItemTransform', { sceneName: scene, sceneItemId })
    const { baseWidth, baseHeight } = await call('GetVideoSettings')
    item = { scene, id: sceneItemId, base: sceneItemTransform, canvas: { w: baseWidth, h: baseHeight } }
    return item
  }

  // where the camera has to sit so `box` (frame fractions) is centred at zoom z, without exposing edges
  function framing({ base, canvas }, box, z) {
    const W = base.width
    const H = base.height
    const ox = base.alignment & 1 ? 0 : base.alignment & 2 ? W : W / 2
    const oy = base.alignment & 4 ? 0 : base.alignment & 8 ? H : H / 2
    const left = base.positionX - ox
    const top = base.positionY - oy
    const cx = (box.x + box.w / 2) * canvas.w
    const cy = (box.y + box.h / 2) * canvas.h
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
    const nextLeft = clamp(canvas.w / 2 - (cx - left) * z, left + W - W * z, left)
    const nextTop = clamp(canvas.h / 2 - (cy - top) * z, top + H - H * z, top)
    const bounded = base.boundsType && base.boundsType !== 'OBS_BOUNDS_NONE'
    return {
      transform: {
        positionX: nextLeft + ox * z,
        positionY: nextTop + oy * z,
        ...(bounded ? { boundsWidth: base.boundsWidth * z, boundsHeight: base.boundsHeight * z } : { scaleX: base.scaleX * z, scaleY: base.scaleY * z }),
      },
      // where the box ends up on screen after the zoom, in frame fractions
      box: { x: (nextLeft + (box.x * canvas.w - left) * z) / canvas.w, y: (nextTop + (box.y * canvas.h - top) * z) / canvas.h, w: (box.w * z * canvas.w) / canvas.w, h: (box.h * z * canvas.h) / canvas.h },
    }
  }

  function animate(target, from, duration) {
    tween?.kill()
    const state = { p: 0 }
    const keys = Object.keys(target)
    return new Promise((resolve) => {
      tween = gsap.to(state, {
        p: 1,
        duration,
        ease: 'power2.inOut',
        onUpdate: () => {
          const sceneItemTransform = Object.fromEntries(keys.map((k) => [k, from[k] + (target[k] - from[k]) * state.p]))
          call('SetSceneItemTransform', { sceneName: item.scene, sceneItemId: item.id, sceneItemTransform }).catch(() => {})
        },
        onComplete: resolve,
      })
    })
  }

  let resetTimer
  let current = null
  // payload: { box?: {x,y,w,h}, x?, y?, scale?, ttl?, name? } — all positions are frame fractions
  window.zoomCamera = async (payload = {}) => {
    const point = payload.x == null ? { x: 0.5, y: 0.5 } : { x: payload.x, y: payload.y }
    const box = payload.box ?? { x: Math.max(0, point.x - 0.16), y: Math.max(0, point.y - 0.2), w: 0.32, h: 0.4 }
    const z = Math.min(maxZoom, Math.max(1.1, payload.scale ?? Math.min(0.8 / box.w, 0.8 / box.h)))
    const ttl = payload.ttl ?? 3000
    clearTimeout(resetTimer)
    try {
      const target = await cameraItem()
      const plan = framing(target, box, z)
      const from = current ?? target.base
      current = { ...target.base, ...plan.transform }
      playGraphic({ preset: 'zoom-focus', data: { name: payload.name, delay: 0.55 }, box: plan.box, ttl })
      await animate(plan.transform, from, 0.6)
    } catch {
      // no OBS connection: frame the product and dim the rest instead of moving the camera
      playGraphic({ preset: 'zoom-focus', data: { name: payload.name, dim: true }, box, ttl })
    }
    if (payload.stay) return
    resetTimer = setTimeout(() => zoomOut(), ttl)
  }
  window.zoomOut = async () => {
    clearTimeout(resetTimer)
    if (!item || !current) return
    const from = current
    current = null
    const keys = Object.keys(from).filter((k) => ['positionX', 'positionY', 'scaleX', 'scaleY', 'boundsWidth', 'boundsHeight'].includes(k))
    await animate(Object.fromEntries(keys.map((k) => [k, item.base[k]])), from, 0.5).catch(() => {})
  }
})()
