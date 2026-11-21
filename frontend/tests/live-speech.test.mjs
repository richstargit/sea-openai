import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../lib/live-speech.ts', import.meta.url), 'utf8');
const code = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', 'require', code)(exported, (m) => (m === 'react' ? {} : {}));
const { rms, vadStep, VAD_IDLE, buildHint, pickMimeType, SPEECH_CFG } = exported;

test('rms', () => { assert.equal(rms([]), 0); assert.ok(Math.abs(rms([0.5, -0.5]) - 0.5) < 1e-9); });

test('vad: speech then silence sends; blip discards; max cap', () => {
  let s = VAD_IDLE, a, t = 0;
  [s, a] = vadStep(s, 0.001, t); assert.equal(a, null);
  for (let i = 0; i < 6; i++) { t += 50; [s, a] = vadStep(s, 0.1, t); }
  assert.ok(s.speaking);
  t += 599; [s, a] = vadStep(s, 0, t); assert.equal(a, null);
  t += 2; [s, a] = vadStep(s, 0, t); assert.equal(a, 'send');
  [s] = vadStep(VAD_IDLE, 0.1, 0); [s, a] = vadStep(s, 0, 700); assert.equal(a, 'discard');
  s = VAD_IDLE; [s] = vadStep(s, 0.1, 0);
  for (t = 50; t < 5000; t += 50) [s, a] = vadStep(s, 0.1, t);
  [s, a] = vadStep(s, 0.1, 5000); assert.equal(a, 'send');
});

test('hint caps on item boundaries', () => {
  assert.equal(buildHint([{ id: 'A1', name: 'ครีม' }]), 'ครีม CF A1');
  const many = Array.from({ length: 100 }, (_, i) => ({ id: 'P' + i, name: 'product ' + i }));
  const h = buildHint(many); assert.ok(h.length <= 400 && h.endsWith('CF P' + (h.split(', ').length - 1)));
});

test('mime pick order', () => {
  assert.equal(pickMimeType((t) => t === 'audio/mp4'), 'audio/mp4');
  assert.equal(pickMimeType(() => true), 'audio/webm;codecs=opus');
  assert.equal(pickMimeType(() => false), undefined);
});
