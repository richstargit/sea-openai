import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';
import { createRequire } from 'node:module';

// paint.ts has no imports, so it can be compiled and run here the same way the editor model test does it.
const code = ts.transpileModule(fs.readFileSync(new URL('../components/studio/script/paint.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', code)(exported);
const { paintOnWhite } = exported;

test('white is filled over the whole canvas before the photo is drawn', () => {
  const calls = [];
  const ctx = {
    set fillStyle(value) { calls.push(['fillStyle', value]); },
    fillRect: (...args) => calls.push(['fillRect', ...args]),
    drawImage: (_image, ...args) => calls.push(['drawImage', ...args]),
  };
  paintOnWhite(ctx, {}, 40, 30);
  assert.deepEqual(calls, [['fillStyle', '#fff'], ['fillRect', 0, 0, 40, 30], ['drawImage', 0, 0, 40, 30]]);
});

// The real thing: the backend already depends on a canvas library, so the pixels can be checked for real when it is installed.
const require = createRequire(import.meta.url);
let napi = null;
try { napi = require('../../backend/node_modules/@napi-rs/canvas'); } catch { /* backend dependencies are not installed here */ }

test('a fully transparent PNG exported as JPEG is white with the fix and black without it', { skip: !napi }, async () => {
  const { createCanvas, loadImage } = napi;
  const transparent = createCanvas(20, 20); // nothing drawn: every pixel is transparent, like a cut out product photo
  const centrePixel = async (paint) => {
    const target = createCanvas(20, 20);
    paint(target.getContext('2d'));
    const decoded = await loadImage(await target.encode('jpeg', 80));
    const probe = createCanvas(20, 20);
    const ctx = probe.getContext('2d');
    ctx.drawImage(decoded, 0, 0);
    const [r, g, b] = ctx.getImageData(10, 10, 1, 1).data;
    return { r, g, b };
  };
  const fixed = await centrePixel((ctx) => paintOnWhite(ctx, transparent, 20, 20));
  const before = await centrePixel((ctx) => ctx.drawImage(transparent, 0, 0, 20, 20));
  assert.ok(fixed.r > 240 && fixed.g > 240 && fixed.b > 240, `expected white, got ${JSON.stringify(fixed)}`);
  assert.ok(before.r < 40 && before.g < 40 && before.b < 40, `the old behaviour should be black, got ${JSON.stringify(before)}`);
});
