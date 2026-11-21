import { fetchPublic as fetch, stagePublic } from "./runtime.mjs"
import { sandbox } from "./runtime.mjs"
import { dirOf, who } from "./video-studio.service.mjs"
const THREE_URL = './assets/three.js';
const GLTF_URL = THREE_URL;
const ROOM_URL = THREE_URL;
const POLY_HAVEN = 'https://api.polyhaven.com';
const AGENT = 'AstraflowVideo/1.0 (video editor)';
let catalog = null;
export function bestModel(assets, words) {
    const asked = words.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2);
    if (asked.length === 0)
        return null;
    const has = (text, word) => new RegExp(`(^|[^a-z])${word}s?([^a-z]|$)`).test(text);
    const scored = Object.entries(assets)
        .map(([id, asset]) => {
        const name = `${asset.name ?? ''} ${id.replace(/_/g, ' ')}`.toLowerCase();
        const all = `${name} ${(asset.tags ?? []).join(' ')}`.toLowerCase();
        return { id, named: asked.filter((word) => has(name, word)).length, used: asset.download_count ?? 0 };
    })
        .filter((entry) => entry.named === asked.length)
        .sort((a, b) => b.named - a.named || b.used - a.used);
    return scored[0]?.id ?? null;
}
export async function fetchModel(ownerId, projectId, words, fits) {
    if (!catalog || Date.now() - catalog.at > 6 * 3_600_000) {
        const assets = (await fetch(`${POLY_HAVEN}/assets?t=models`, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20_000) })
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null));
        if (assets)
            catalog = { at: Date.now(), assets };
    }
    const id = catalog ? bestModel(catalog.assets, words) : null;
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id))
        return null;
    if (fits && !(await fits(`https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256`, catalog?.assets[id]?.name ?? id).catch(() => false)))
        return null;
    const files = (await fetch(`${POLY_HAVEN}/files/${id}`, { headers: { 'User-Agent': AGENT }, signal: AbortSignal.timeout(20_000) })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null));
    const gltf = files?.gltf?.['1k']?.gltf;
    if (!gltf?.url)
        return null;
    const folder = `3d-${id}`;
    const parts = [{ path: gltf.url.split('/').pop() ?? `${id}.gltf`, url: gltf.url }, ...Object.entries(gltf.include ?? {}).map(([path, file]) => ({ path, url: file.url }))];
    if (parts.some((part) => !/^https:\/\/dl\.polyhaven\.org\/[^\s'"`$\\]+$/.test(part.url) || !/^[A-Za-z0-9_./-]+$/.test(part.path) || part.path.includes('..')))
        return null;
    const dir = `${dirOf(projectId)}/assets/${folder}`;
    try {
        await Promise.all(parts.map(part=>stagePublic(part.url,dir,part.path)));
        return `assets/${folder}/${parts[0].path}`;
    } catch {return null}

}
export const hex = (colour, fallback) => {
    const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(colour ?? '')?.[1];
    if (!digits)
        return fallback;
    return Number.parseInt(digits.length === 3 ? digits.replace(/./g, '$&$&') : digits, 16);
};
export const scriptJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
export function threeClip(key, shot, frame, palette, model) {
    const id = `clip-3d-${key}`;
    const setup = scriptJson({
        id,
        kind: model ? 'model' : shot.kind === 'cards' ? 'cards' : shot.kind === 'screen' ? 'screen' : (shot.pictures ?? []).length > 1 ? 'ring' : 'standee',
        layout: shot.layout === 'stack' ? 'stack' : 'flow',
        cards: (shot.cards ?? []).slice(0, 6).map((card) => ({ title: card.title.slice(0, 40), line: (card.line ?? '').slice(0, 90), picture: card.picture && /^[A-Za-z0-9._-]{1,120}$/.test(card.picture) ? `assets/${card.picture}` : null })),
        width: frame.width,
        height: frame.height,
        deep: hex(palette[0], 0x14110f),
        accent: hex(palette[1], 0xe8833a),
        light: hex(palette[2], 0xfbf7f2),
        pictures: (shot.pictures ?? []).filter((name) => /^[A-Za-z0-9._-]{1,120}$/.test(name)).slice(0, 6).map((name) => `assets/${name}`),
        model: model ?? null,
        motion: shot.motion ?? null,
    });
    return {
        clip: (start, seconds) => `<div id="${id}" class="clip lupo-fill" data-shape="3d" data-bg="transparent" data-start="${start}" data-duration="${seconds}" data-track-index="0"><canvas id="${id}-canvas" style="width:100%;height:100%;display:block"></canvas></div>`,
        script: `<script type="module" data-lupo-3d="${id}">
import * as THREE from "${THREE_URL}";
import { GLTFLoader } from "${GLTF_URL}";
import { RoomEnvironment } from "${ROOM_URL}";
const S = ${setup};
const box = document.getElementById(S.id);
// Drawn without antialiasing at two thirds of the frame and stretched to it: the render's WebGL runs in software,
// where a full-size antialiased frame takes seconds.
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById(S.id + "-canvas"), antialias: false });
renderer.setSize(Math.round(S.width * 0.67), Math.round(S.height * 0.67), false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
// A studio for the materials to reflect, and a key and rim light in the video's accent.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(3, 5, 4); scene.add(key);
const rim = new THREE.DirectionalLight(S.accent, 2.2); rim.position.set(-4, 2, -3); scene.add(rim);
const css = (n) => "#" + n.toString(16).padStart(6, "0");
function mix(a, b, t) { const c = new THREE.Color(a).lerp(new THREE.Color(b), t); return "#" + c.getHexString(); }
// The backdrop: for cards a bright pastel sweep of the accent's neighbouring hues; else a soft radial gradient of the
// look's colours, lighter behind the subject.
if (S.kind === "cards") {
  const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * S.height / S.width);
  const g = c.getContext("2d");
  const hue = (shift, l) => { const k = new THREE.Color(S.accent); const h = {}; k.getHSL(h); k.setHSL((h.h + shift + 1) % 1, Math.min(0.85, h.s + 0.1), l); return "#" + k.getHexString(); };
  const lin = g.createLinearGradient(0, c.height, c.width, 0);
  lin.addColorStop(0, hue(0, 0.62)); lin.addColorStop(0.5, hue(-0.06, 0.7)); lin.addColorStop(1, hue(-0.14, 0.82));
  g.fillStyle = lin; g.fillRect(0, 0, c.width, c.height);
  const glow = g.createRadialGradient(c.width * 0.7, c.height * 0.3, 0, c.width * 0.7, c.height * 0.3, c.width);
  glow.addColorStop(0, "rgba(255,255,255,0.55)"); glow.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = glow; g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
} else {
  const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * S.height / S.width);
  const g = c.getContext("2d");
  const r = g.createRadialGradient(256, c.height * 0.46, 10, 256, c.height * 0.5, c.height * 0.75);
  r.addColorStop(0, mix(S.deep, S.accent, 0.35)); r.addColorStop(0.45, mix(S.deep, S.light, 0.08)); r.addColorStop(1, css(S.deep));
  g.fillStyle = r; g.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t;
}
const camera = new THREE.PerspectiveCamera(30, S.width / S.height, 0.1, 100);
// What the camera sees at its distance, so the subject fills the frame whatever its shape (tall, wide, square).
const D = 6.5;
const viewH = 2 * D * Math.tan(THREE.MathUtils.degToRad(15));
const fit = Math.min(viewH * S.width / S.height, viewH) * 0.9;
// A soft contact shadow under the subject instead of a floor.
const shadow = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const g = c.getContext("2d"); const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, "rgba(0,0,0,0.55)"); r.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(fit * 1.1, fit * 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; scene.add(m); return m;
})();
const motes = new THREE.Group();
for (let i = 0; i < 14; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.018 + (i % 4) * 0.006, 8, 8), new THREE.MeshBasicMaterial({ color: i % 3 ? S.light : S.accent, transparent: true, opacity: 0.35 }));
  m.position.set(Math.sin(i * 2.4) * fit * 0.9, (i * 0.53) % 3 - 1.5, -1 - (i % 3));
  motes.add(m);
}
scene.add(motes);
const subject = new THREE.Group(); scene.add(subject);
const clamp = (x) => Math.min(1, Math.max(0, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeIn = (x) => Math.pow(clamp(x), 3);
const easeInOut = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const back = (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
let floor = -fit * 0.5;
// A halo ring of the accent behind the subject, and small shapes of the look orbiting it: the motion-design layer.
const halo = new THREE.Mesh(new THREE.TorusGeometry(fit * 0.48, fit * 0.011, 16, 120), new THREE.MeshStandardMaterial({ color: S.accent, emissive: S.accent, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3 }));
halo.position.z = -0.7; scene.add(halo);
const orbiters = [];
const shapes = [new THREE.IcosahedronGeometry(1, 0), new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.TorusGeometry(1, 0.35, 12, 32), new THREE.SphereGeometry(1, 24, 24), new THREE.OctahedronGeometry(1, 0), new THREE.TorusGeometry(1, 0.35, 12, 32)];
shapes.forEach((geometry, i) => {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: i % 2 ? S.light : S.accent, metalness: 0.55, roughness: 0.25 }));
  m.scale.setScalar(fit * (0.035 + (i % 3) * 0.012));
  scene.add(m); orbiters.push(m);
});
// A burst of sparks where the subject lands.
const sparks = new THREE.Group();
for (let i = 0; i < 26; i++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(fit * 0.012, 8, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? S.accent : S.light, transparent: true }));
  m.userData.a = (i / 26) * Math.PI * 2; sparks.add(m);
}
scene.add(sparks);
const cards = [];
// The pieces that come together: a model's own parts, or a cut-out broken into tiles.
const parts = [];
async function textureOf(src) { const t = await new THREE.TextureLoader().loadAsync(src); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
// A cut-out with depth: the picture stacked in thin layers, darker behind, so it reads as a solid piece when it turns.
function solid(t, w, h, layers) {
  const g = new THREE.Group();
  for (let l = 0; l < layers; l++) {
    const shade = l === 0 ? 1 : 0.45 - l * 0.02;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.04, roughness: 0.5, side: THREE.DoubleSide, color: new THREE.Color(shade, shade, shade) }));
    m.position.z = -l * 0.012 * fit; g.add(m);
  }
  return g;
}
// A cut-out as tiles of itself (each a piece of the picture), to fly together into it and apart again.
function tiles(t, w, h) {
  const g = new THREE.Group();
  const cols = 7, rows = Math.max(5, Math.round(cols * h / w));
  const material = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.04, roughness: 0.5, side: THREE.DoubleSide });
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const geometry = new THREE.PlaneGeometry(w / cols, h / rows);
    const uv = geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (c + uv.getX(k)) / cols, (r + uv.getY(k)) / rows);
    const m = new THREE.Mesh(geometry, material);
    const n = parts.length;
    m.position.set(-w / 2 + (c + 0.5) * w / cols, -h / 2 + (r + 0.5) * h / rows, 0);
    m.userData = { base: m.position.clone(), off: new THREE.Vector3(Math.sin(n * 12.9898) * fit * 1.4, Math.cos(n * 7.233) * fit * 1.2, Math.sin(n * 3.1) * fit * 1.6 + fit * 0.8), q: m.quaternion.clone(), axis: new THREE.Vector3(Math.sin(n * 1.3), Math.cos(n * 2.1), 0.5).normalize(), order: Math.abs(c - (cols - 1) / 2) + Math.abs(r - (rows - 1) / 2) };
    parts.push(m); g.add(m);
  }
  parts.sort((a, b) => a.userData.order - b.userData.order);
  return g;
}
// One glassy card drawn on a canvas: a pastel head holding the 3D icon, the title, a line and an arrow button.
const deck = [];
const glows = [];
let pointer = null, ripple = null;
function wrap(g, text, max) {
  const words = [...new Intl.Segmenter("th", { granularity: "word" }).segment(text)].map((p) => p.segment);
  const lines = [""];
  for (const w of words) { const next = lines[lines.length - 1] + w; if (g.measureText(next).width > max && lines[lines.length - 1].trim()) lines.push(w.trimStart()); else lines[lines.length - 1] = next; }
  return lines;
}
function rounded(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
async function cardTexture(card, i) {
  const W = 640, H = 820, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.save(); rounded(g, 8, 8, W - 16, H - 16, 56); g.clip();
  g.fillStyle = "rgba(255,255,255,0.96)"; g.fillRect(0, 0, W, H);
  const k = new THREE.Color(S.accent); const h = {}; k.getHSL(h); k.setHSL((h.h + i * 0.09) % 1, 0.75, 0.84);
  g.fillStyle = "#" + k.getHexString(); g.fillRect(0, 0, W, H * 0.5);
  if (card.picture) {
    const img = await new Promise((done) => { const im = new Image(); im.onload = () => done(im); im.onerror = () => done(null); im.src = card.picture; });
    if (img) { const s = Math.min((W * 0.62) / img.width, (H * 0.42) / img.height); g.shadowColor = "rgba(0,0,0,0.18)"; g.shadowBlur = 30; g.shadowOffsetY = 14; g.drawImage(img, (W - img.width * s) / 2, H * 0.25 - (img.height * s) / 2, img.width * s, img.height * s); g.shadowColor = "transparent"; }
  }
  g.fillStyle = "#16161a"; g.font = "800 58px Kanit, sans-serif";
  const titled = wrap(g, card.title, W - 96).slice(0, 2);
  titled.forEach((line, n) => g.fillText(line, 48, H * 0.61 + n * 64));
  g.fillStyle = "#5f5f69"; g.font = "500 32px Kanit, sans-serif";
  wrap(g, card.line, W - 96).slice(0, 2).forEach((line, n) => g.fillText(line, 48, H * 0.61 + titled.length * 64 + 22 + n * 42));
  g.fillStyle = "#16161a"; rounded(g, 48, H - 120, 150, 64, 32); g.fill();
  g.fillStyle = "#ffffff"; g.font = "800 34px Kanit, sans-serif"; g.fillText("→", 104, H - 77);
  g.restore();
  g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 4; rounded(g, 10, 10, W - 20, H - 20, 54); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function softShadow() {
  const c = document.createElement("canvas"); c.width = 128; c.height = 160; const g = c.getContext("2d");
  g.filter = "blur(12px)"; g.fillStyle = "rgba(40,20,60,0.35)"; rounded(g, 24, 28, 80, 112, 18); g.fill();
  return new THREE.CanvasTexture(c);
}
async function build() {
  if (S.kind === "cards") {
    await Promise.all([document.fonts.load("800 58px Kanit"), document.fonts.load("500 32px Kanit")]).catch(() => null);
    const cw = fit * (S.layout === "stack" ? 0.52 : 0.74), ch = cw * 1.28;
    const shade = softShadow();
    for (let i = 0; i < S.cards.length; i++) {
      const g = new THREE.Group();
      const behind = new THREE.Mesh(new THREE.PlaneGeometry(cw * 1.25, ch * 1.25), new THREE.MeshBasicMaterial({ map: shade, transparent: true, depthWrite: false, toneMapped: false }));
      behind.position.set(cw * 0.04, -ch * 0.05, -0.02); g.add(behind);
      g.add(new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), new THREE.MeshBasicMaterial({ map: await cardTexture(S.cards[i], i), transparent: true, alphaTest: 0.02, toneMapped: false })));
      g.userData = { cw, ch };
      deck.push(g); scene.add(g);
    }
    halo.visible = false; shadow.visible = false; motes.visible = false; sparks.visible = false;
    orbiters.forEach((m) => { m.visible = false; });
    // Soft glows drifting far behind, for depth.
    const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, "rgba(255,255,255,0.7)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c); })();
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.35 + (i % 3) * 0.12 }));
      m.scale.setScalar(fit * (0.6 + (i % 3) * 0.35)); m.userData = { a: i * 1.7 }; glows.push(m); scene.add(m);
    }
    // A pointer that taps each card's button in turn, with a ripple.
    const pc = document.createElement("canvas"); pc.width = pc.height = 128; const pg = pc.getContext("2d");
    pg.beginPath(); pg.moveTo(30, 14); pg.lineTo(30, 100); pg.lineTo(52, 80); pg.lineTo(68, 116); pg.lineTo(82, 110); pg.lineTo(66, 74); pg.lineTo(96, 74); pg.closePath();
    pg.fillStyle = "#ffffff"; pg.strokeStyle = "#16161a"; pg.lineWidth = 7; pg.lineJoin = "round"; pg.shadowColor = "rgba(0,0,0,0.3)"; pg.shadowBlur = 10; pg.fill(); pg.shadowColor = "transparent"; pg.stroke();
    pointer = new THREE.Mesh(new THREE.PlaneGeometry(cw * 0.16, cw * 0.16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pc), transparent: true, depthTest: false, toneMapped: false }));
    pointer.renderOrder = 10; scene.add(pointer);
    ripple = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, toneMapped: false }));
    ripple.renderOrder = 9; scene.add(ripple);
    return;
  }
  if (S.kind === "model") {
    const model = (await new GLTFLoader().loadAsync(S.model)).scene;
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(fit / Math.max(size.x, size.y, size.z, 0.001));
    const bounds = new THREE.Box3().setFromObject(model);
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    floor = -(bounds.max.y - bounds.min.y) / 2;
    subject.add(model);
    // Each part of the model knows where it sits and where it flies apart to: outward from the middle, its own way.
    subject.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!o.isMesh) return;
      const n = parts.length;
      const centre = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      const away = centre.lengthSq() > 1e-6 ? centre.clone().normalize() : new THREE.Vector3(Math.sin(n * 2.1), 0.6, Math.cos(n * 2.1)).normalize();
      const far = centre.clone().addScaledVector(away, fit * (0.6 + (n % 3) * 0.2));
      const from = o.parent.worldToLocal(centre.clone()), to = o.parent.worldToLocal(far);
      o.userData = { base: o.position.clone(), off: to.sub(from), q: o.quaternion.clone(), axis: new THREE.Vector3(Math.sin(n * 1.3), 1, Math.cos(n * 0.7)).normalize(), order: centre.length() };
      parts.push(o);
    });
    parts.sort((a, b) => a.userData.order - b.userData.order);
  } else if (S.kind === "screen" && S.pictures.length > 0) {
    // The screen on a phone: the body, and the screenshot in bands (its layers), which fly out in depth and settle.
    const t = await textureOf(S.pictures[0]);
    const ratio = t.image.width / t.image.height;
    const h = Math.min(fit * 1.15, (fit * 0.75) / ratio), w = h * ratio;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w * 1.07, h * 1.04, fit * 0.05), new THREE.MeshStandardMaterial({ color: new THREE.Color(S.deep).lerp(new THREE.Color(0x000000), 0.4), metalness: 0.6, roughness: 0.3 }));
    body.position.z = -fit * 0.03; subject.add(body);
    const rows = 6;
    const material = new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide });
    for (let r = 0; r < rows; r++) {
      const geometry = new THREE.PlaneGeometry(w, h / rows);
      const uv = geometry.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), (r + uv.getY(k)) / rows);
      const m = new THREE.Mesh(geometry, material);
      m.position.set(0, -h / 2 + (r + 0.5) * h / rows, 0);
      const n = rows - 1 - r;
      m.userData = { base: m.position.clone(), off: new THREE.Vector3(Math.sin(n * 2.3) * fit * 0.18, 0, fit * (0.3 + 0.16 * n)), q: m.quaternion.clone(), axis: new THREE.Vector3(1, Math.sin(n), 0).normalize(), order: n };
      parts.push(m); subject.add(m);
    }
    parts.sort((a, b) => a.userData.order - b.userData.order);
    floor = -h / 2;
  } else if (S.pictures.length > 0) {
    const textures = await Promise.all(S.pictures.map(textureOf));
    textures.forEach((t, i) => {
      const ratio = t.image.width / t.image.height;
      const most = S.kind === "ring" ? fit * 0.6 : fit;
      const w = Math.min(most, most * ratio), h = w / ratio;
      const card = S.kind === "ring" ? solid(t, w, h, 3) : tiles(t, w, h);
      const a = (i / S.pictures.length) * Math.PI * 2;
      card.userData = { a, from: new THREE.Vector3(Math.sin(i * 2.7) * fit * 2.2, Math.cos(i * 1.9) * fit * 1.6, -fit * 2) };
      cards.push(card); subject.add(card);
      floor = Math.min(floor, -h / 2);
    });
  }
  shadow.position.y = floor - 0.02;
  sparks.position.y = floor;
}
window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
let built = false;
window.__hf.buildReady[S.id] = build().then(() => { built = true; renderAt(window.__hfThreeTime || 0); }, () => { built = true; });
/*
 * Three movements, all from the clip's own time: it flies in (from below, spinning, landing with an overshoot and a
 * burst of sparks), shows itself (the camera orbits, the light sweeps, the halo and the shapes circle it), and leaves
 * by rushing at the camera, which carries the cut into the next scene.
 */
function renderAt(time) {
  const start = Number(box ? box.getAttribute("data-start") : 0);
  const length = Number(box ? box.getAttribute("data-duration") : 4) || 4;
  // Only while the clip is on screen: every 3D shot of the video hears every seek.
  if (time < start - 0.05 || time > start + length + 0.05) return;
  const local = Math.max(0, time - start);
  if (S.kind === "cards") { renderCards(local, length); return; }
  const enter = local / 1.1;
  const out = (local - (length - 0.55)) / 0.55;
  const p = local / length;
  // Pieces that assemble: each flies in from its place apart, one after another from the middle out, turning as it
  // comes, and flies apart again on the way out.
  const motion = S.motion && (S.motion !== "assemble" || parts.length > 1) ? S.motion : parts.length > 1 ? "assemble" : "drop";
  const assembles = motion === "assemble";
  parts.forEach((o, i) => {
    const t = back((local - 0.1 - i * (0.9 / parts.length)) / 0.85);
    const apart = assembles ? Math.max(1 - t, easeIn(out)) : 0;
    o.position.copy(o.userData.base).addScaledVector(o.userData.off, apart);
    o.quaternion.copy(o.userData.q).multiply(new THREE.Quaternion().setFromAxisAngle(o.userData.axis, apart * 2.4));
  });
  // A model keeps turning round; a cut-out only sways (turned edge-on it would vanish).
  const turn = S.kind === "model" ? local * 0.5 : S.kind === "screen" ? -0.35 + 0.3 * Math.sin(local * 0.7) : 0.25 * Math.sin(local * 0.9) * ease(enter);
  if (S.kind === "ring") {
    // handled below: the cards fly into their ring
  } else if (motion === "assemble") {
    subject.position.set(0, 0, 0);
    subject.rotation.set(S.kind === "screen" ? 0.12 : 0.25 * (1 - ease(enter)), (S.kind === "model" ? -0.9 : S.kind === "screen" ? 0 : -0.35 * (1 - ease(enter))) + turn, 0);
    subject.scale.setScalar(1);
  } else if (motion === "spin") {
    subject.position.set(0, 0, 0);
    subject.rotation.set(0.2 * (1 - ease(enter)), Math.PI * 6 * (1 - ease(enter)) + turn, 0);
    subject.scale.setScalar(0.05 + 0.95 * back(enter));
  } else if (motion === "float") {
    const calm = ease(local / 1.8);
    subject.position.set(0, -fit * 0.18 * (1 - calm), 0);
    subject.rotation.set(0, -0.5 * (1 - calm) + turn * 0.5, 0);
    subject.scale.setScalar(0.85 + 0.15 * calm);
  } else {
    subject.position.set(0, -fit * 1.4 * (1 - back(enter)), 0);
    subject.rotation.set(0.35 * (1 - ease(enter)), (S.kind === "model" ? Math.PI * 3 : Math.PI / 2) * (1 - ease(enter)) + turn, 0);
    subject.scale.setScalar(0.35 + 0.65 * back(enter));
  }
  if (S.kind !== "ring") {
    // nothing more: the ring's own motion follows
  } else {
    // The cards fly in one after another from all round into their ring, which then keeps turning.
    cards.forEach((card, i) => {
      const t = back((local - i * 0.14) / 0.85);
      const at = new THREE.Vector3(Math.sin(card.userData.a) * fit * 0.7, 0, Math.cos(card.userData.a) * fit * 0.7);
      card.position.lerpVectors(card.userData.from, at, t);
      card.rotation.set(0, card.userData.a + (1 - t) * Math.PI, 0);
      card.scale.setScalar(Math.max(0.001, t));
    });
    subject.rotation.y = local * 0.45;
    subject.position.y = 0;
  }
  subject.position.y += 0.06 * fit * Math.sin(local * 1.3) * ease(enter);
  // Leaving: pieces fly apart; a calm one rises away; the rest spin and rush at the camera.
  if (out > 0 && !assembles) {
    const o = easeIn(out);
    if (motion === "float") { subject.position.y += o * fit * 0.6; subject.scale.multiplyScalar(1 - 0.3 * o); }
    else { subject.position.z += o * 5.5; subject.rotation.y += o * Math.PI * 1.2; }
  }
  shadow.material.opacity = (0.3 + 0.5 * ease(enter)) * (1 - clamp(out * 2));
  // The halo opens a moment after the landing and keeps turning; the shapes come in one by one and circle.
  const opened = back((local - 0.45) / 0.8);
  // A screen's words must be read: no ring crosses it.
  halo.visible = S.kind !== "screen";
  halo.scale.setScalar(Math.max(0.001, opened));
  halo.rotation.set(1.15 + 0.12 * Math.sin(local * 0.6), 0.25 * Math.sin(local * 0.4), local * 0.5);
  halo.material.opacity = 1;
  orbiters.forEach((m, i) => {
    const t = back((local - 0.6 - i * 0.08) / 0.7);
    const a = (i / orbiters.length) * Math.PI * 2 + local * (i % 2 ? 0.7 : -0.55);
    const r = fit * ((S.kind === "screen" ? 0.75 : 0.55) + 0.06 * (i % 3));
    m.position.set(Math.sin(a) * r, floor * 0.2 + Math.sin(local * 1.1 + i) * fit * 0.22, Math.cos(a) * r * 0.6);
    m.rotation.set(local * (0.8 + i * 0.1), local * 1.1, 0);
    m.visible = t > 0.001;
    m.scale.setScalar(fit * (0.035 + (i % 3) * 0.012) * Math.max(0.001, t) * (1 - easeIn(out)));
  });
  // Sparks where it lands or bursts out; none for a calm one or one that assembles.
  const burst = motion === "drop" || motion === "spin" ? clamp((local - (motion === "spin" ? 0.55 : 0.8)) / 0.75) : 0;
  sparks.children.forEach((m, i) => {
    const r = ease(burst) * fit * (0.9 + (i % 3) * 0.15);
    m.position.set(Math.cos(m.userData.a) * r, ease(burst) * fit * 0.12 * (i % 2), Math.sin(m.userData.a) * r * 0.5);
    m.material.opacity = burst > 0 && burst < 1 ? 1 - burst : 0;
  });
  // The rim light sweeps across, so the highlights travel over the subject.
  rim.position.set(Math.sin(local * 0.9) * 5, 2.5, Math.cos(local * 0.9) * -4);
  // The camera comes in from afar with a slight roll, then orbits and sinks a little; on the way out it pushes in.
  const distance = D + 3.2 * (1 - ease(local / 1.3)) - 0.6 * easeInOut(p) - 1.2 * easeIn(out);
  const around = -0.45 + 0.9 * easeInOut(p);
  camera.position.set(Math.sin(around) * distance, 1.1 - 0.6 * easeInOut(p), Math.cos(around) * distance);
  camera.up.set(Math.sin(0.12 * (1 - ease(local / 1.3))), 1, 0);
  camera.lookAt(0, 0, 0);
  motes.children.forEach((m, i) => { m.position.y = ((i * 0.53 + local * 0.1) % 3) - 1.5; });
  if (built) renderer.render(scene, camera);
}
/*
 * Cards: a cover-flow moves to each card in turn (it holds, then glides on), the one in front facing the camera and
 * the rest turned away on either side; or a stack falls in card by card, tilted, sways and spreads. They fly in from
 * the side at the start and sweep away at the end.
 */
function renderCards(local, length) {
  const n = deck.length;
  if (!n) { if (built) renderer.render(scene, camera); return; }
  const out = easeIn((local - (length - 0.5)) / 0.5);
  const { cw, ch } = deck[0].userData;
  if (S.layout === "stack") {
    const spread = 1 + 0.35 * easeInOut((local - 1.2) / Math.max(1, length - 2));
    deck.forEach((g, i) => {
      const t = back((local - i * 0.16) / 0.8);
      const k = i - (n - 1) / 2;
      // A cascade: each card lower, a little to the side and in front, so every head and title shows.
      g.position.set(k * cw * 0.16 * spread, -k * ch * 0.6 * spread + (1 - t) * ch * 2.2 + out * ch * 2.5 * (1 + i * 0.2), k * cw * 0.1);
      g.rotation.set(-0.22 + (1 - t) * 0.6, -0.5 + 0.18 * Math.sin(local * 0.6) - out * 0.4, 0.12 * (1 - t));
      g.scale.setScalar(Math.max(0.001, t));
    });
  } else {
    const hold = Math.max(0.6, length - 1.4);
    const q = clamp((local - 0.9) / hold) * (n - 1);
    const k = Math.floor(q), frac = q - k;
    const f = Math.min(n - 1, k + easeInOut((frac - 0.5) / 0.5));
    deck.forEach((g, i) => {
      const e = back((local - i * 0.09) / 0.75);
      const d = i - f, near = clamp(d, -1, 1);
      g.position.set(near * cw * 0.8 + (d - near) * cw * 0.32 + (1 - e) * cw * 3 - out * cw * 3.2, Math.sin(local * 1.4 + i) * ch * 0.012, -Math.min(Math.abs(d), 3) * cw * 0.6 - (1 - e) * cw);
      g.rotation.set(0, -near * 0.95 + (1 - e) * 1.1 - out * 0.7, 0);
      g.scale.setScalar(Math.max(0.001, e) * (Math.abs(d) < 0.5 ? 1 + 0.06 * (1 - Math.abs(d) * 2) : 1));
      g.visible = Math.abs(d) < 3.2;
    });
  }
  camera.position.set(Math.sin(local * 0.45) * 0.18, ch * 0.06, D - 0.35 * easeInOut(local / length));
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  glows.forEach((m, i) => { m.position.set(Math.sin(m.userData.a + local * 0.15) * fit * 0.9, Math.cos(m.userData.a * 1.3 + local * 0.12) * fit * 1.1, -3 - i * 0.4); m.lookAt(camera.position); });
  // The pointer: in the cover-flow it taps the card in front during each hold; in the stack, the top card once.
  if (pointer) {
    const hold = Math.max(0.6, length - 1.4);
    const per = S.layout === "stack" ? hold : hold / Math.max(1, n - 1);
    const at = local - 0.9 - (S.layout === "stack" ? 0.6 : 0);
    const idx = S.layout === "stack" ? 0 : Math.min(n - 1, Math.max(0, Math.floor(at / per)));
    const phase = S.layout === "stack" ? clamp(at / 1.2) : clamp((at - idx * per) / Math.min(per * 0.5, 1.2));
    const card = deck[idx];
    const target = card.localToWorld(new THREE.Vector3(-cw / 2 + cw * 0.19, -ch / 2 + ch * 0.107, 0.05));
    const from = target.clone().add(new THREE.Vector3(cw * 0.5, -ch * 0.35, 0));
    const move = easeInOut(phase / 0.6), tap = clamp((phase - 0.6) / 0.25);
    pointer.position.lerpVectors(from, target, move);
    pointer.position.x += cw * 0.06; pointer.position.y -= cw * 0.06;
    pointer.scale.setScalar(1 - 0.18 * Math.sin(Math.PI * tap));
    pointer.visible = at > 0 && out < 0.05;
    pointer.quaternion.copy(camera.quaternion);
    ripple.position.copy(target);
    ripple.quaternion.copy(camera.quaternion);
    ripple.scale.setScalar(Math.max(0.001, cw * 0.05 + tap * cw * 0.16));
    ripple.material.opacity = tap > 0 && tap < 1 ? 0.8 * (1 - tap) : 0;
  }
  if (built) renderer.render(scene, camera);
}
window.addEventListener("hf-seek", (event) => renderAt(event.detail.time));
renderAt(window.__hfThreeTime || 0);
</script>`,
    };
}
const ENTRANCES = ['fade', 'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'zoom', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'iris', 'blur', 'spin', 'dip', 'flip'];
export function threeWords(value, seconds) {
    if (!Array.isArray(value))
        return [];
    const two = (n) => Math.round(n * 100) / 100;
    const num = (v, lo, hi, fallback) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
    return value
        .filter((word) => typeof word === 'object' && word !== null && typeof word.text === 'string' && Boolean(word.text.trim()))
        .slice(0, 8)
        .map((word) => {
        const at = two(num(word.at, 0, Math.max(0, seconds - 0.3), 0));
        const keys = Array.isArray(word.keys)
            ? word.keys
                .filter((key) => typeof key === 'object' && key !== null)
                .slice(0, 8)
                .map((key) => ({
                t: two(num(key.t, 0, seconds, 0)),
                x: num(key.x, -150, 150, 0),
                y: num(key.y, -150, 150, 0),
                scale: num(key.scale, 0, 5, 1),
                rotate: num(key.rotate, -720, 720, 0),
                opacity: num(key.opacity, 0, 1, 1),
                ...(typeof key.ease === 'string' && /^[\w.(), -]{1,60}$/.test(key.ease) ? { ease: key.ease } : {}),
            }))
            : [];
        return {
            text: String(word.text).trim().slice(0, 80),
            at,
            for: two(num(word.for, 0.3, seconds - at, seconds - at)),
            x: num(word.x, -40, 40, 0),
            y: num(word.y, -46, 24, 0),
            size: Math.round(num(word.size, 28, 220, 80)),
            weight: word.weight === 500 || word.weight === 900 ? word.weight : 800,
            color: typeof word.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(word.color) ? word.color : '#ffffff',
            in: typeof word.in === 'string' && ENTRANCES.includes(word.in) ? word.in : 'fade',
            ...(keys.length > 1 ? { keys } : {}),
        };
    });
}
export function wordClips(key, words, start) {
    const safe = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return words.map((word, n) => `<div id="w-${key}-${n + 1}" class="clip lupo-text" data-words="" data-start="${Math.round((start + word.at) * 100) / 100}" data-duration="${word.for}" data-track-index="${2 + n}" data-font-size="${word.size}" data-weight="${word.weight}" data-color="${word.color}"${word.x ? ` data-x="${word.x}"` : ''}${word.y ? ` data-y="${word.y}"` : ''} data-shadow="24" data-trans-in="${word.in}" data-fade-in="0.4"${word.keys ? ` data-keyframes='${JSON.stringify(word.keys)}'` : ''}>${safe(word.text)}</div>`);
}
export const threeFile = (code) => `// A 3D shot of the video: builds the scene and returns the pose for each time t (seconds from the shot's start).\nexport default async function design(ctx) {\n${code}\n}\n`;
export function freeThreeClip(key, frame, palette, assets, source) {
    const id = `clip-3d-${key}`;
    const path = (name) => (name && /^[A-Za-z0-9._/-]{1,160}$/.test(name) && !name.includes('..') ? (name.startsWith('assets/') ? name : `assets/${name}`) : null);
    const setup = scriptJson({
        id,
        width: frame.width,
        height: frame.height,
        deep: hex(palette[0], 0x14110f),
        accent: hex(palette[1], 0xe8833a),
        light: hex(palette[2], 0xfbf7f2),
        assets: {
            model: path(assets.model),
            pictures: assets.pictures.map(path).filter(Boolean).slice(0, 8),
            icons: assets.icons.slice(0, 8).map((icon) => ({ title: icon.title.slice(0, 40), line: (icon.line ?? '').slice(0, 90), picture: path(icon.picture) })),
        },
    });
    const check = 'code' in source;
    const load = check
        ? `const design = (await import(URL.createObjectURL(new Blob([${scriptJson(threeFile(source.code))}], { type: "text/javascript" })))).default;`
        : `import design from "./${source.file}";`;
    return {
        clip: (start, seconds) => `<div id="${id}" class="clip lupo-fill" data-shape="3d" data-bg="transparent" data-start="${start}" data-duration="${seconds}" data-track-index="0"><canvas id="${id}-canvas" style="width:100%;height:100%;display:block"></canvas></div>`,
        script: `<script type="module" data-lupo-3d="${id}">
import * as THREE from "${THREE_URL}";
import { GLTFLoader } from "${GLTF_URL}";
import { RoomEnvironment } from "${ROOM_URL}";
${load}
const S = ${setup};
const box = document.getElementById(S.id);
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById(S.id + "-canvas"), antialias: false });
renderer.setSize(Math.round(S.width * 0.67), Math.round(S.height * 0.67), false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const camera = new THREE.PerspectiveCamera(30, S.width / S.height, 0.1, 200);
const D = 6.5; camera.position.set(0, 0, D); camera.lookAt(0, 0, 0);
const viewH = 2 * D * Math.tan(THREE.MathUtils.degToRad(15));
const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const css = (n) => "#" + n.toString(16).padStart(6, "0");
const rounded = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const words = (text) => [...new Intl.Segmenter("th", { granularity: "word" }).segment(String(text ?? ""))].map((p) => p.segment);
function wrap(g, text, max) { const lines = [""]; for (const w of words(text)) { const next = lines[lines.length - 1] + w; if (max && g.measureText(next).width > max && lines[lines.length - 1].trim()) lines.push(w.trimStart()); else lines[lines.length - 1] = next; } return lines; }
// The files' pictures are loaded before the design runs, so a card is drawn at once.
const images = new Map();
const preload = () => Promise.all([...S.assets.pictures, ...S.assets.icons.map((icon) => icon.picture)].filter(Boolean).map((src) => new Promise((done) => { const im = new Image(); im.onload = () => { images.set(src, im); done(); }; im.onerror = () => done(); im.src = src; })));
const errors = [];
${check ? 'const logged = console.error; console.error = (...parts) => { errors.push(parts.map(String).join(" ")); logged(...parts); }; addEventListener("error", (event) => errors.push(String(event.message))); addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));' : ''}
const ctx = {
  THREE, scene, camera, renderer, width: S.width, height: S.height, D,
  seconds: Number(box ? box.getAttribute("data-duration") : 4) || 4,
  fit: Math.min(viewH * S.width / S.height, viewH),
  palette: { deep: S.deep, accent: S.accent, light: S.light },
  css: { deep: css(S.deep), accent: css(S.accent), light: css(S.light) },
  assets: S.assets,
  clamp,
  mix: (a, b, t) => a + (b - a) * t,
  rnd: (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); },
  ease: {
    out: (x) => 1 - Math.pow(1 - clamp(x), 3),
    in: (x) => Math.pow(clamp(x), 3),
    inOut: (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    back: (x) => { x = clamp(x); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    elastic: (x) => { x = clamp(x); return x === 0 || x === 1 ? x : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1; },
  },
  gradient(colors, angle = 135) {
    const c = document.createElement("canvas"); c.width = 512; c.height = Math.round(512 * S.height / S.width);
    const g = c.getContext("2d"); const a = (angle * Math.PI) / 180, r = Math.hypot(c.width, c.height) / 2;
    const lin = g.createLinearGradient(c.width / 2 - Math.cos(a) * r, c.height / 2 - Math.sin(a) * r, c.width / 2 + Math.cos(a) * r, c.height / 2 + Math.sin(a) * r);
    (colors.length ? colors : [css(S.deep), css(S.accent)]).forEach((col, i, all) => lin.addColorStop(all.length === 1 ? 0 : i / (all.length - 1), col));
    g.fillStyle = lin; g.fillRect(0, 0, c.width, c.height); return tex(c);
  },
  glow() {
    const c = document.createElement("canvas"); c.width = c.height = 256; const g = c.getContext("2d");
    const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 256, 256); return new THREE.CanvasTexture(c);
  },
  label(text, o = {}) {
    const size = o.size ?? 96, weight = o.weight ?? 800, padX = (o.padX ?? (o.bg ? 0.6 : 0.1)) * size, padY = (o.padY ?? (o.bg ? 0.35 : 0.15)) * size;
    const probe = document.createElement("canvas").getContext("2d"); probe.font = weight + " " + size + "px Kanit, sans-serif";
    const lines = wrap(probe, text, o.maxWidth ? o.maxWidth * size : 0);
    const w = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width)) + padX * 2), h = Math.ceil(lines.length * size * 1.25 + padY * 2);
    const c = document.createElement("canvas"); c.width = Math.max(4, w); c.height = Math.max(4, h); const g = c.getContext("2d");
    if (o.bg) { g.fillStyle = o.bg; rounded(g, 0, 0, c.width, c.height, Math.min(c.height / 2, (o.radius ?? 0.5) * c.height)); g.fill(); }
    g.font = probe.font; g.fillStyle = o.color ?? "#ffffff"; g.textBaseline = "middle";
    lines.forEach((l, i) => g.fillText(l, padX, padY + size * 1.25 * (i + 0.5)));
    const texture = tex(c);
    if (String(text ?? "").trim()) texture.userData.aspect = c.width / c.height;
    return { texture, aspect: c.width / c.height };
  },
  card(o = {}) {
    const W = 640, H = 820, c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    g.save(); rounded(g, 8, 8, W - 16, H - 16, 56); g.clip();
    g.fillStyle = o.dark ? "rgba(24,24,30,0.96)" : "rgba(255,255,255,0.96)"; g.fillRect(0, 0, W, H);
    g.fillStyle = o.tint ?? "#" + new THREE.Color(S.accent).lerp(new THREE.Color(0xffffff), 0.7).getHexString(); g.fillRect(0, 0, W, H * 0.5);
    const im = o.picture ? images.get(o.picture) : null;
    if (im) { const s = Math.min((W * 0.62) / im.width, (H * 0.42) / im.height); g.shadowColor = "rgba(0,0,0,0.18)"; g.shadowBlur = 30; g.shadowOffsetY = 14; g.drawImage(im, (W - im.width * s) / 2, H * 0.25 - (im.height * s) / 2, im.width * s, im.height * s); g.shadowColor = "transparent"; }
    g.fillStyle = o.dark ? "#ffffff" : "#16161a"; g.font = "800 58px Kanit, sans-serif";
    const titled = wrap(g, o.title ?? "", W - 96).slice(0, 2); titled.forEach((l, n) => g.fillText(l, 48, H * 0.61 + n * 64));
    g.fillStyle = o.dark ? "#b9b9c6" : "#5f5f69"; g.font = "500 32px Kanit, sans-serif";
    wrap(g, o.line ?? "", W - 96).slice(0, 2).forEach((l, n) => g.fillText(l, 48, H * 0.61 + titled.length * 64 + 22 + n * 42));
    g.restore();
    const texture = tex(c); texture.userData.aspect = W / H;
    return { texture, aspect: W / H };
  },
  // The kit: pieces made to look right (light, sizes, framing, timing), so a shot is put together, not engineered.
  view() { return { w: viewH * S.width / S.height, h: viewH }; },
  at(object, x = 0, y = 0, z = 0) { const v = ctx.view(); object.position.set(x * v.w / 2, y * v.h / 2, z); object.userData.base = object.position.clone(); return object; },
  // Not fit(): ctx.fit is the world size of the frame, which a shot multiplies; a method of that name made it NaN.
  sizeTo(object, height = 0.4, width = 0.9) {
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3()), v = ctx.view();
    object.scale.multiplyScalar(Math.min((height * v.h) / Math.max(size.y, 1e-6), (width * v.w) / Math.max(size.x, 1e-6)));
    object.userData.scale = object.scale.clone();
    return object;
  },
  stage(o = {}) {
    const look = o.look || "vivid", v = ctx.view();
    scene.background = look === "dark" ? ctx.gradient(["#0b0b10", css(S.deep)], 160) : look === "light" ? ctx.gradient(["#ffffff", "#eceef3"], 160) : ctx.gradient([css(S.accent), css(S.deep)], 135);
    const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(2, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(S.accent, 1.8); rim.position.set(-3, 2, -2); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, S.deep, 0.7));
    if (o.ground !== false) {
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: ctx.glow(), color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
      shade.rotation.x = -Math.PI / 2; shade.scale.set(v.w * 0.7, v.w * 0.25, 1); shade.position.set(0, -v.h * 0.3, 0); scene.add(shade);
    }
    return { key, rim };
  },
  panel(texture, aspect, height = 0.5) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(aspect, 1), new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false }));
    return ctx.sizeTo(plane, height, 0.95);
  },
  // A low-poly city to fly through (a map, a trip, a delivery, a place): blocks of light buildings with lit windows,
  // trees and roads, laid out the same on every frame; userData.streets are the roads' positions a route can follow.
  city(o = {}) {
    const n = o.blocks ?? 5, cell = o.cell ?? 1, road = cell * 0.28, half = (n * cell) / 2, group = new THREE.Group();
    const win = document.createElement("canvas"); win.width = 64; win.height = 128; const g = win.getContext("2d");
    g.fillStyle = o.wall ?? "#f3f2ee"; g.fillRect(0, 0, 64, 128);
    for (let y = 8; y < 128; y += 20) for (let x = 8; x < 64; x += 16) { g.fillStyle = ctx.rnd(x * 7 + y) > 0.55 ? "#ffd27a" : "#9fb3c8"; g.fillRect(x, y, 8, 11); }
    const windows = tex(win); windows.wrapS = windows.wrapT = THREE.RepeatWrapping;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(n * cell * 1.6, n * cell * 1.6), new THREE.MeshStandardMaterial({ color: o.ground ?? 0xdfe3e6, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; group.add(ground);
    const asphalt = new THREE.MeshStandardMaterial({ color: o.road ?? 0x8a9099, roughness: 0.9 }), streets = [];
    for (let i = 0; i <= n; i++) {
      const p = -half + i * cell, along = new THREE.Mesh(new THREE.PlaneGeometry(n * cell + road, road), asphalt);
      along.rotation.x = -Math.PI / 2; along.position.set(0, 0.002, p); group.add(along);
      const across = along.clone(); across.rotation.z = Math.PI / 2; across.position.set(p, 0.002, 0); group.add(across);
      streets.push(p);
    }
    const leaf = new THREE.MeshStandardMaterial({ color: o.trees ?? 0x7cc47a, roughness: 0.8 });
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const cx = -half + (i + 0.5) * cell, cz = -half + (j + 0.5) * cell, k = i * 31 + j * 17, lot = cell - road;
      for (let l = 0, lots = 1 + Math.floor(ctx.rnd(k) * 3); l < lots; l++) {
        const w = lot * (0.3 + ctx.rnd(k + l) * 0.25), d = lot * (0.3 + ctx.rnd(k + l + 5) * 0.25), h = cell * (0.25 + ctx.rnd(k + l + 9) * (o.tall ?? 1.2));
        const face = windows.clone(); face.repeat.set(Math.max(1, Math.round(w * 6)), Math.max(1, Math.round(h * 5))); face.needsUpdate = true;
        const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: face, roughness: 0.7 }));
        building.position.set(cx + (ctx.rnd(k + l + 2) - 0.5) * (lot - w), h / 2, cz + (ctx.rnd(k + l + 3) - 0.5) * (lot - d)); group.add(building);
      }
      if (ctx.rnd(k + 40) > 0.4) { const tree = new THREE.Mesh(new THREE.SphereGeometry(cell * 0.07, 10, 8), leaf); tree.position.set(cx + lot * 0.42, cell * 0.09, cz - lot * 0.42); group.add(tree); }
    }
    group.userData.streets = streets;
    return group;
  },
  // A route that draws itself (directions, a delivery, a journey, a light trail from one thing to the next): a glowing
  // tube along the points; draw(p) shows it up to p (0 to 1), and curve.getPointAt(p) is where a camera or a pin follows.
  route(points, o = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(p[0], p[1] ?? 0, p[2] ?? 0))));
    const geometry = new THREE.TubeGeometry(curve, 240, o.width ?? 0.03, 10, false);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: o.color ?? S.accent, toneMapped: false }));
    const total = geometry.index ? geometry.index.count : geometry.attributes.position.count;
    const draw = (p) => geometry.setDrawRange(0, Math.floor(total * clamp(p)));
    draw(o.drawn ?? 1);
    return { mesh, curve, draw };
  },
  // A map pin in the accent (a place, a stop, a destination), its point at its origin, standing up.
  pin(o = {}) {
    const group = new THREE.Group(), paint = new THREE.MeshStandardMaterial({ color: o.color ?? S.accent, roughness: 0.35, metalness: 0.1 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), paint); head.position.y = 1.35; group.add(head);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 32), paint); tip.rotation.x = Math.PI; tip.position.y = 0.6; group.add(tip);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffffff })); dot.position.set(0, 1.35, 0.42); group.add(dot);
    group.scale.setScalar(o.size ?? 0.2);
    return group;
  },
  // A soft glow of light (neon, a lit screen, a spark): an additive halo to set behind or on anything bright.
  bloom(o = {}) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glow(), color: o.color ?? S.accent, transparent: true, opacity: o.opacity ?? 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    sprite.scale.setScalar(o.size ?? 1);
    return sprite;
  },
  // A current iPhone: corners about 15% of its width, a screen with matching corners inside thin even bezels, a Dynamic Island.
  phone(o = {}) {
    const w = 0.49, h = 1, r = 0.074, bezel = 0.018, sw = w - bezel * 2, sh = h - bezel * 2;
    const W = 540, H = Math.round((W * sh) / sw), c = document.createElement("canvas"); c.width = W; c.height = H; const g = c.getContext("2d");
    g.fillStyle = o.dark ? "#14141a" : "#f6f4f1"; g.fillRect(0, 0, W, H);
    g.fillStyle = css(S.deep); g.fillRect(0, 0, W, 190);
    g.fillStyle = "#ffffff"; g.font = "800 46px Kanit, sans-serif";
    wrap(g, o.title || "", W - 80).slice(0, 2).forEach((line, n) => g.fillText(line, 40, 90 + n * 54));
    let y = 230;
    for (const row of (o.rows || []).slice(0, 5)) {
      g.save(); g.shadowColor = "rgba(0,0,0,0.1)"; g.shadowBlur = 18; g.shadowOffsetY = 6; g.fillStyle = o.dark ? "#22222b" : "#ffffff"; rounded(g, 28, y, W - 56, 150, 28); g.fill(); g.restore();
      g.fillStyle = o.dark ? "#ffffff" : "#16161a"; g.font = "800 38px Kanit, sans-serif"; g.fillText(wrap(g, row.title || "", W - 240)[0] || "", 56, y + 62);
      g.fillStyle = o.dark ? "#b9b9c6" : "#6a6a74"; g.font = "500 28px Kanit, sans-serif"; g.fillText(wrap(g, row.line || "", W - 240)[0] || "", 56, y + 108);
      if (row.price) { g.fillStyle = css(S.accent); g.font = "800 40px Kanit, sans-serif"; g.fillText(row.price, W - 56 - g.measureText(row.price).width, y + 86); }
      y += 172;
    }
    if (o.button) { g.fillStyle = css(S.accent); rounded(g, 40, H - 170, W - 80, 110, 55); g.fill(); g.fillStyle = "#ffffff"; g.font = "800 40px Kanit, sans-serif"; g.fillText(o.button, (W - g.measureText(o.button).width) / 2, H - 100); }
    const rect = (rw, rh, rr) => { const s = new THREE.Shape(), x = rw / 2, y = rh / 2; s.moveTo(-x + rr, -y); s.lineTo(x - rr, -y); s.absarc(x - rr, -y + rr, rr, -Math.PI / 2, 0); s.lineTo(x, y - rr); s.absarc(x - rr, y - rr, rr, 0, Math.PI / 2); s.lineTo(-x + rr, y); s.absarc(-x + rr, y - rr, rr, Math.PI / 2, Math.PI); s.lineTo(-x, -y + rr); s.absarc(-x + rr, -y + rr, rr, Math.PI, Math.PI * 1.5); return s; };
    const group = new THREE.Group();
    // A flat rounded face, its picture mapped corner to corner.
    const face = (rw, rh, rr, material, z) => { const geo = new THREE.ShapeGeometry(rect(rw, rh, rr), 24), p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / rw + 0.5, p.getY(i) / rh + 0.5); const m = new THREE.Mesh(geo, material); m.position.z = z; group.add(m); return m; };
    const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(rect(w, h, r), { depth: 0.036, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 6, curveSegments: 24 }), new THREE.MeshPhysicalMaterial({ color: o.color ?? 0x9a9aa0, roughness: 0.28, metalness: 0.9, clearcoat: 1 }));
    frame.position.z = -0.044; group.add(frame);
    face(w - 0.006, h - 0.006, r - 0.003, new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.08, clearcoat: 1 }), 0.001);
    face(sw, sh, r - bezel, new THREE.MeshBasicMaterial({ map: tex(c), toneMapped: false }), 0.002);
    face(w * 0.3, 0.034, 0.017, new THREE.MeshBasicMaterial({ color: 0x000000 }), 0.003).position.y = sh / 2 - 0.032;
    return ctx.sizeTo(group, o.height ?? 0.62, 0.8);
  },
  enter(object, t, start = 0, kind = "rise", duration = 0.7) {
    const base = object.userData.base || (object.userData.base = object.position.clone());
    const size = object.userData.scale || (object.userData.scale = object.scale.clone());
    const p = ctx.clamp((t - start) / duration), e = kind === "pop" ? ctx.ease.back(p) : ctx.ease.out(p), v = ctx.view();
    object.visible = t >= start;
    object.position.copy(base);
    object.scale.copy(size).multiplyScalar(kind === "pop" ? Math.max(0.001, e) : 1);
    if (kind === "rise") object.position.y = base.y - (1 - e) * v.h * 0.25;
    if (kind === "drop") object.position.y = base.y + (1 - e) * v.h * 0.4;
    if (kind === "slide-left") object.position.x = base.x + (1 - e) * v.w * 0.8;
    if (kind === "slide-right") object.position.x = base.x - (1 - e) * v.w * 0.8;
    return p;
  },
  drift(t, strength = 1) {
    camera.position.set(Math.sin(t * 0.5) * 0.3 * strength, (0.15 + Math.sin(t * 0.35) * 0.1) * strength, D - Math.min(t, ctx.seconds) * 0.12 * strength);
    camera.lookAt(0, 0, 0);
  },
  // The moves: called in the pose with t, each one finished motion, so a small model's shot moves like a big one's.
  hero(object, t, o = {}) {
    ctx.enter(object, t, o.start ?? 0.1, o.kind ?? "rise", 0.8);
    object.position.y += Math.sin(t * 1.4) * ctx.view().h * 0.008;
    object.rotation.y = (o.turn ?? 0.35) * Math.sin(t * 0.7);
    return object;
  },
  coverflow(cards, t, o = {}) {
    const v = ctx.view(), start = o.start ?? 0.2, every = o.every ?? Math.max(0.6, (ctx.seconds - start - 0.8) / Math.max(1, cards.length));
    // Where the row stands: each card slides in on its turn and pushes the earlier ones back and aside.
    const front = cards.reduce((sum, _, i) => sum + ctx.ease.out((t - start - i * every) / 0.45), -1);
    cards.forEach((card, i) => {
      const d = i - front, base = card.userData.base || (card.userData.base = card.position.clone());
      card.visible = d > -2.2;
      card.position.set(base.x + (d > 0 ? d * v.w * 1.2 : d * v.w * 0.3), base.y, base.z + Math.max(-2, Math.min(0, d)) * 0.6);
      card.rotation.y = d > 0 ? -d * 0.5 : Math.min(1, -d) * 0.55;
    });
  },
  orbit(objects, t, o = {}) {
    const v = ctx.view(), radius = (o.radius ?? 0.38) * v.w, speed = o.speed ?? 0.6;
    objects.forEach((object, i) => {
      const a = t * speed + (i / objects.length) * Math.PI * 2;
      object.position.set(Math.cos(a) * radius, ((o.y ?? 0) * v.h) / 2 + Math.sin(a * 2) * v.h * 0.02, Math.sin(a) * radius * 0.6);
    });
  },
  exit(objects, t, duration = 0.4) {
    const p = ctx.ease.in((t - ctx.seconds + duration) / duration);
    for (const object of objects) { object.position.y += p * ctx.view().h * 0.7; object.rotation.x -= p * 0.5; }
    return p;
  },
  // A picture of the files is there already: its texture comes at once, so a call without await still draws.
  loadTexture(src) {
    const done = (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
    if (images.has(src)) { const t = new THREE.Texture(images.get(src)); t.needsUpdate = true; return done(t); }
    return new THREE.TextureLoader().loadAsync(src).then(done);
  },
  async loadModel(src) {
    const model = (await new GLTFLoader().loadAsync(src)).scene;
    const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
    model.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 0.001));
    model.position.sub(new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3()));
    const group = new THREE.Group(); group.add(model); return group;
  },
};
let pose = null;
window.__hf = window.__hf || {};
window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady[S.id] = (async () => {
  await Promise.all([document.fonts.load("800 64px Kanit"), document.fonts.load("500 32px Kanit"), preload()]).catch(() => null);
  try {
    pose = await design(ctx);
    scene.traverse((mesh) => { if (mesh.material && mesh.material.map && mesh.material.map.userData.aspect && mesh.geometry && mesh.geometry.type === "PlaneGeometry") worded.push(mesh); });
  } catch (error) { console.error("3D shot", S.id, error); }
  renderAt(window.__hfThreeTime || 0);
})();
// A card or a label with words on a plane of other proportions (as built, or as scaled in the pose) comes out stretched,
// its words squashed: it is fitted inside that plane at its own. A label without words (a pill, a backdrop) may stretch.
const worded = [];
function trueAspect() {
  for (const mesh of worded) {
    const p = mesh.geometry.parameters, s = mesh.scale, aspect = mesh.material.map.userData.aspect;
    const seen = (p.width * Math.abs(s.x)) / (p.height * Math.abs(s.y));
    if (!Number.isFinite(seen) || !seen || Math.abs(seen / aspect - 1) < 0.04) continue;
    if (seen > aspect) s.x *= aspect / seen;
    else s.y *= seen / aspect;
  }
}
function renderAt(time) {
  const start = Number(box ? box.getAttribute("data-start") : 0);
  const length = Number(box ? box.getAttribute("data-duration") : 4) || 4;
  // Only while the clip is on screen: every 3D shot of the video hears every seek.
  if (time < start - 0.05 || time > start + length + 0.05) return;
  if (pose) {
    try { pose(Math.max(0, time - start)); trueAspect(); renderer.render(scene, camera);${check ? ' if (time - start >= length * 0.4) seen(time - start); covered(time - start); showNotes();' : ''} } catch (error) { console.error("3D shot", S.id, error); }
  }
  if (errors.length) showErrors();
}${check
            ? `
// By the middle of the shot its subject shows: a 3D frame of nearly one colour (the subject missing, out of view, or as
// dark as the ground behind it, which the words over it hid from a look at the whole frame) is sent back to be fixed.
const sample = Object.assign(document.createElement("canvas"), { width: 48, height: Math.round(48 * S.height / S.width) });
function seen(t) {
  const g = sample.getContext("2d", { willReadFrequently: true });
  g.clearRect(0, 0, sample.width, sample.height); g.drawImage(renderer.domElement, 0, 0, sample.width, sample.height);
  const d = g.getImageData(0, 0, sample.width, sample.height).data, n = d.length / 4;
  let sum = 0, squares = 0;
  for (let i = 0; i < d.length; i += 4) { const y = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; sum += y; squares += y * y; }
  if (Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2)) < 8) errors.push("At " + t.toFixed(1) + " s the 3D shows almost nothing: the frame is nearly one colour (its subject is missing, out of view, or as dark as the background). Light the subject and colour it apart from the background, and keep it in view.");
}
// A word layer on a detailed part of the 3D (the subject: a screen, a card, the object) is hard to read and hides it; a
// look at the frames let it through, the 3D under each word measured does not. Detail is the edges under the word: a
// gradient or a soft glow has almost none, so a headline over the ground passes (its spread of colour, measured first,
// sent good shots back). What is found is written on a red strip over the frame for the designer to fix, never on the
// whole frame: a shot it could not fix was thrown away, and the video lost its 3D.
const under = Object.assign(document.createElement("canvas"), { width: 216, height: Math.round(216 * S.height / S.width) });
// Measured on a phone shot: headlines over the app's header read 6.9 and 7.9, words on plain ground 0 to 2.4.
const WORD_ON_SUBJECT = 5;
let notes = [];
function covered(t) {
  notes = [];
  const frame = renderer.domElement.getBoundingClientRect();
  if (!frame.width) return;
  const g = under.getContext("2d", { willReadFrequently: true });
  g.clearRect(0, 0, under.width, under.height); g.drawImage(renderer.domElement, 0, 0, under.width, under.height);
  for (const word of document.querySelectorAll(".lupo-text")) {
    const from = Number(word.getAttribute("data-start")) - start3d(), to = from + Number(word.getAttribute("data-duration"));
    if (!(t >= from + 0.3 && t <= to)) continue;
    const range = document.createRange(); range.selectNodeContents(word);
    const r = range.getBoundingClientRect(), sx = under.width / frame.width, sy = under.height / frame.height;
    const x = Math.max(0, Math.floor((r.left - frame.left) * sx)), y = Math.max(0, Math.floor((r.top - frame.top) * sy));
    const w = Math.min(under.width - x, Math.ceil(r.width * sx)), h = Math.min(under.height - y, Math.ceil(r.height * sy));
    if (w < 2 || h < 2) continue;
    const d = g.getImageData(x, y, w, h).data;
    const l = (i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let edges = 0;
    for (let row = 0; row < h - 1; row++) for (let col = 0; col < w - 1; col++) { const i = (row * w + col) * 4; edges += Math.abs(l(i) - l(i + 4)) + Math.abs(l(i) - l(i + w * 4)); }
    const busy = edges / ((w - 1) * (h - 1));
    if (busy > WORD_ON_SUBJECT) notes.push("the words \\"" + word.textContent.trim().slice(0, 30) + "\\" sit over the 3D subject (detail " + busy.toFixed(1) + "): move them to empty ground or frame the subject smaller");
  }
}
function showNotes() {
  const c = box.querySelector(".three-notes") || box.appendChild(Object.assign(document.createElement("canvas"), { className: "three-notes", width: 540, height: Math.round(540 * S.height / S.width * 0.16) }));
  c.style.cssText = "position:absolute;left:0;top:0;width:100%;height:16%;z-index:9;display:" + (notes.length ? "block" : "none");
  const g = c.getContext("2d"); g.fillStyle = "#e00000"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#ffffff"; g.font = "18px sans-serif";
  wrap(g, "FIX: " + notes.join("  |  "), c.width - 30).slice(0, Math.floor(c.height / 24)).forEach((line, n) => g.fillText(line, 15, 26 + n * 24));
}
function start3d() { return Number(box ? box.getAttribute("data-start") : 0); }`
            : ''}
function showErrors() {
  const c = box.querySelector(".three-errors") || box.appendChild(Object.assign(document.createElement("canvas"), { className: "three-errors", width: 540, height: Math.round(540 * S.height / S.width) }));
  c.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  const g = c.getContext("2d"); g.fillStyle = "#ff0000"; g.fillRect(0, 0, c.width, c.height); g.fillStyle = "#ffffff"; g.font = "22px sans-serif";
  wrap(g, "ERROR: " + [...new Set(errors)].slice(0, 4).join("  |  "), c.width - 40).slice(0, 40).forEach((line, n) => g.fillText(line, 20, 50 + n * 30));
}
window.addEventListener("hf-seek", (event) => renderAt(event.detail.time));
renderAt(window.__hfThreeTime || 0);
</script>`,
    };
}
