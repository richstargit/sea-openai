import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';

function load(name) {
  const source = fs.readFileSync(new URL(`../components/studio/live-script/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {};
  new Function('exports', 'btoa', code)(exported, globalThis.btoa);
  return exported;
}
const { EMPTY_ITEMS, onCommitted, onPartial, onFinal, onFailed, drainFinals, toLines, latestOpen, awaiting } = load('items');
const { decodeServerEvent, isBenignError, isAuthError } = load('realtime-events');
const { toBase64 } = load('pcm');

/* ------------------------------------------------------------------------ items */

test('a partial text is replaced by the next one, never glued onto it, and the final text replaces both', () => {
  let items = onCommitted(EMPTY_ITEMS, 'a', 100);
  items = onPartial(items, 'a', 'สวัสดี', 150);
  items = onPartial(items, 'a', 'สวัสดีครับ', 200);
  assert.equal(items.byId.a.text, 'สวัสดีครับ');
  items = onPartial(items, 'a', 'สวัสดีครับทุกคน', 250); // the model revised and extended its earlier text
  items = onFinal(items, 'a', 'สวัสดีครับทุกคน วันนี้', 300);
  assert.equal(items.byId.a.text, 'สวัสดีครับทุกคน วันนี้');
  assert.equal(items.byId.a.state, 'final');
  items = onPartial(items, 'a', 'late partial', 400);
  assert.equal(items.byId.a.text, 'สวัสดีครับทุกคน วันนี้', 'a finished item ignores later partials');
});

test('delta words can be added to the partial text when the server only sends the new words', () => {
  let items = onCommitted(EMPTY_ITEMS, 'a', 1);
  items = onPartial(items, 'a', 'ตัวนี้', 2, 'append');
  items = onPartial(items, 'a', 'หมึกแห้งไว', 3, 'append');
  assert.equal(items.byId.a.text, 'ตัวนี้หมึกแห้งไว', 'Thai is joined exactly as received, no spaces are added');
});

test('finals leave in the order the utterances were committed, even when a later one finishes first', () => {
  let items = onCommitted(EMPTY_ITEMS, 'a', 100);
  items = onCommitted(items, 'b', 900);
  items = onFinal(items, 'b', 'second', 1000);
  let drained = drainFinals(items);
  assert.deepEqual(drained.finals, [], 'b waits because a is not done');
  items = onFinal(drained.items, 'a', 'first', 1100);
  drained = drainFinals(items);
  assert.deepEqual(drained.finals.map((f) => f.text), ['first', 'second']);
  assert.deepEqual(drainFinals(drained.items).finals, [], 'each text is released once');
});

test('a failed or empty item does not hold the others back', () => {
  let items = onCommitted(EMPTY_ITEMS, 'a', 1);
  items = onCommitted(items, 'b', 2);
  items = onCommitted(items, 'c', 3);
  items = onFailed(items, 'a');
  items = onFinal(items, 'b', '   ', 4);
  items = onFinal(items, 'c', 'only this', 5);
  assert.deepEqual(drainFinals(items).finals.map((f) => f.text), ['only this']);
});

test('an item first seen through its text keeps its place when the commit event arrives later', () => {
  let items = onPartial(EMPTY_ITEMS, 'x', 'hi', 1);
  items = onCommitted(items, 'y', 5);
  items = onCommitted(items, 'x', 6);
  assert.deepEqual(items.order, ['x', 'y']);
  assert.equal(items.byId.x.committed, true);
});

test('the transcript view shows the newest lines oldest first, partial text included, failures left out', () => {
  let items = EMPTY_ITEMS;
  for (let n = 0; n < 8; n++) {
    items = onCommitted(items, `i${n}`, n);
    items = onFinal(items, `i${n}`, `line ${n}`, n);
  }
  items = onCommitted(items, 'p', 20);
  items = onPartial(items, 'p', 'still talking', 21);
  items = onCommitted(items, 'bad', 22);
  items = onFailed(items, 'bad');
  const lines = toLines(items, 4);
  assert.deepEqual(lines.map((l) => l.text), ['line 5', 'line 6', 'line 7', 'still talking']);
  assert.deepEqual(lines.map((l) => l.final), [true, true, true, false]);
  assert.equal(latestOpen(items).id, 'p');
});

test('waiting items are counted until their text arrives, and old finished items are forgotten', () => {
  let items = onCommitted(EMPTY_ITEMS, 'a', 1);
  items = onCommitted(items, 'b', 2);
  assert.equal(awaiting(items), 2);
  items = onFinal(items, 'a', 'x', 3);
  assert.equal(awaiting(items), 1);
  let big = EMPTY_ITEMS;
  for (let n = 0; n < 200; n++) {
    big = onCommitted(big, `i${n}`, n);
    big = onFinal(big, `i${n}`, `t${n}`, n);
    big = drainFinals(big).items;
  }
  assert.ok(big.order.length <= 41, `the list stays short, got ${big.order.length}`);
  assert.equal(big.order[big.order.length - 1], 'i199');
});

/* --------------------------------------------------------------- server events */

test('server events become committed, partial, final and failed, keyed by item id', () => {
  assert.deepEqual(decodeServerEvent(JSON.stringify({ type: 'input_audio_buffer.committed', item_id: 'it1' })), { kind: 'committed', itemId: 'it1' });
  assert.deepEqual(decodeServerEvent(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'it1', delta: 'ตัวนี้' })), { kind: 'partial', itemId: 'it1', text: 'ตัวนี้', replace: false });
  assert.deepEqual(decodeServerEvent(JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'it1', transcript: 'ตัวนี้ดี' })), { kind: 'partial', itemId: 'it1', text: 'ตัวนี้ดี', replace: true });
  assert.deepEqual(decodeServerEvent(JSON.stringify({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'it1', transcript: 'ตัวนี้ดีมาก' })), { kind: 'final', itemId: 'it1', text: 'ตัวนี้ดีมาก' });
  assert.deepEqual(decodeServerEvent(JSON.stringify({ type: 'conversation.item.input_audio_transcription.failed', item_id: 'it1', error: { message: 'no speech' } })), { kind: 'failed', itemId: 'it1', message: 'no speech' });
  assert.deepEqual(decodeServerEvent(JSON.stringify({ type: 'error', error: { code: 'token_expired', message: 'secret expired' } })), { kind: 'error', message: 'secret expired', code: 'token_expired' });
});

test('unknown, damaged or incomplete events are ignored', () => {
  for (const raw of ['not json', '"text"', '[]', 'null', JSON.stringify({ type: 'session.updated' }), JSON.stringify({ type: 'input_audio_buffer.committed' }), JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'a' })]) {
    assert.deepEqual(decodeServerEvent(raw), { kind: 'ignore' }, raw);
  }
});

test('empty commits are harmless errors, and an expired secret is told apart', () => {
  assert.equal(isBenignError('input_audio_buffer_commit_empty', ''), true);
  assert.equal(isBenignError(null, 'Error committing input audio buffer: buffer too small. Expected at least 100ms'), true);
  assert.equal(isBenignError('server_error', 'something broke'), false);
  assert.equal(isAuthError('token_expired', ''), true);
  assert.equal(isAuthError(null, 'Client secret expired'), true);
  assert.equal(isAuthError('rate_limit', 'slow down'), false);
});

/* ------------------------------------------------------------------------- pcm */

test('audio chunks travel as base64 of the exact bytes, in any length', () => {
  const bytes = Uint8Array.from({ length: 9600 }, (_, n) => (n * 7) % 256);
  const encoded = toBase64(bytes.buffer);
  assert.deepEqual(Array.from(Buffer.from(encoded, 'base64')), Array.from(bytes));
  assert.equal(toBase64(new ArrayBuffer(0)), '');
  const big = new Uint8Array(100000).fill(200);
  assert.equal(Buffer.from(toBase64(big.buffer), 'base64').length, 100000, 'a chunk bigger than one slice still encodes');
  const pcm = Int16Array.from([1, -2, 32767, -32768]);
  assert.deepEqual(Array.from(Buffer.from(toBase64(pcm.buffer), 'base64')), [1, 0, 254, 255, 255, 127, 0, 128], '16 bit little endian');
});
