import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';

// Compile live-detect.ts and run its pure helpers; react and the API modules are stubbed (the hook is not exercised).
const code = ts.transpileModule(fs.readFileSync(new URL('../lib/live-detect.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', 'require', code)(exported, () => ({}));
const { difference, contentRect, stabilize, freshStabilizer, makeTracker, trackStep, trackerBox, toFrame } = exported;

test('difference is the mean absolute grey difference, 255 without a reference', () => {
  assert.equal(difference(Uint8Array.from([10, 20]), Uint8Array.from([10, 20])), 0);
  assert.equal(difference(Uint8Array.from([0, 10]), Uint8Array.from([4, 0])), 7);
  assert.equal(difference(null, Uint8Array.from([1])), 255);
});

const probe = (pw, ph, lit) => {
  const px = new Uint8Array(pw * ph * 4);
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) if (lit(x, y)) px.fill(200, (y * pw + x) * 4, (y * pw + x) * 4 + 3);
  return px;
};

test('contentRect crops a letterboxed picture and leaves a full one alone', () => {
  const boxed = contentRect(probe(160, 90, (x, y) => x >= 40 && x < 120 && y >= 20 && y < 70), 160, 90, 1600, 900);
  assert.deepEqual(boxed, { x: 390, y: 190, w: 820, h: 520 });
  const dark = contentRect(probe(160, 90, (x, y) => x < 150 || y < 5), 160, 90, 1600, 900);
  assert.deepEqual(dark, { x: 0, y: 0, w: 1600, h: 900 });
});

test('stabilize confirms on two agreeing results or one confident one, clears after two none', () => {
  let s = stabilize(freshStabilizer(), 'CF1', 0.6, false, false);
  assert.equal(s.confirmed, null);
  assert.equal(s.needVote, true);
  s = stabilize(s, 'CF1', 0.6, false, false);
  assert.equal(s.confirmed, 'CF1');
  assert.equal(stabilize(freshStabilizer(), 'CF2', 0.92, false, false).confirmed, 'CF2');
  assert.equal(stabilize(freshStabilizer(), 'CF2', 0.75, true, false).confirmed, 'CF2', 'a hard cut lowers the bar');
  s = stabilize(s, null, null, false, false);
  assert.equal(s.confirmed, 'CF1');
  assert.equal(s.needVote, true);
  assert.equal(stabilize(s, 'none', null, false, false).confirmed, null);
  assert.equal(stabilize(s, null, null, false, true).confirmed, 'CF1', 'the tracker still holds it');
});

test('tracker follows a textured patch that moved and reports the moved box', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const w = 240, h = 135;
  const background = Uint8Array.from({ length: w * h }, () => 60 + rnd() * 20);
  // blocky texture: real pictures are smooth at the tracker's 240 px scale, white noise is not
  const blocks = Array.from({ length: 7 * 5 }, () => rnd() * 255);
  const patch = Uint8Array.from({ length: 40 * 30 }, (_, i) => blocks[Math.floor((i / 40) / 6) * 7 + Math.floor((i % 40) / 6)]);
  const scene = (ox, oy) => {
    const g = background.slice();
    for (let y = 0; y < 30; y++) for (let x = 0; x < 40; x++) g[(oy + y) * w + ox + x] = patch[y * 40 + x];
    return { g, w, h };
  };
  const t = makeTracker(scene(100, 50), { x: 100 / w, y: 50 / h, w: 40 / w, h: 30 / h });
  assert.equal(trackStep(t, scene(107, 46)), true);
  const box = trackerBox(t, w, h);
  assert.ok(Math.abs(box.x * w - 107) <= 1.5 && Math.abs(box.y * h - 46) <= 1.5, JSON.stringify(box));
  assert.equal(trackStep(t, { g: background, w, h }), false, 'patch gone: weak match');
  assert.equal(t.lost, 1);
});

test('toFrame maps a box in the cropped picture to the whole frame', () => {
  assert.deepEqual(toFrame({ x: 0.5, y: 0.5, w: 0.25, h: 0.5 }, { x: 100, y: 0, w: 800, h: 600 }, 1000, 600), { x: 0.5, y: 0.5, w: 0.2, h: 0.5 });
});
