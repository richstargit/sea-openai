import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';

// These modules have no runtime imports, so each one is compiled and run here the same way the editor model test does it.
function load(name) {
  const source = fs.readFileSync(new URL(`../components/studio/live-script/${name}.ts`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exported = {};
  new Function('exports', code)(exported);
  return exported;
}
const { applyResult, visibleLines, EMPTY_TRANSCRIPT } = load('transcript');
const { newGate, offer, complete, flush, PARTIAL_EVERY_MS, MAX_CHARS } = load('utterance-gate');
const { applySuggestion, clean, EMPTY_SUGGESTIONS, HISTORY } = load('suggestions');
const { rmsLevel, smoothLevel } = load('level');
const { planUtterances, createMockSource, MOCK_SCRIPT } = load('mock-source');

/* ------------------------------------------------------------------ transcript */

test('a partial line is replaced by the next partial and then by the final one, keeping its place', () => {
  let t = applyResult(EMPTY_TRANSCRIPT, { text: 'สวัสดี', final: false, tsMs: 100 });
  assert.deepEqual(t.lines.map((l) => [l.text, l.final]), [['สวัสดี', false]]);
  t = applyResult(t, { text: 'สวัสดีครับ', final: false, tsMs: 400 });
  assert.equal(t.lines.length, 1);
  assert.equal(t.lines[0].text, 'สวัสดีครับ');
  const id = t.lines[0].id;
  t = applyResult(t, { text: 'สวัสดีครับทุกคน', final: true, tsMs: 900 });
  assert.equal(t.lines.length, 1);
  assert.equal(t.lines[0].final, true);
  assert.equal(t.lines[0].id, id, 'the line keeps its identity, so it does not flicker');
});

test('after a final line the next speech starts a new line, newest last', () => {
  let t = applyResult(EMPTY_TRANSCRIPT, { text: 'one', final: true, tsMs: 1 });
  t = applyResult(t, { text: 'two', final: false, tsMs: 2 });
  t = applyResult(t, { text: 'two more', final: true, tsMs: 3 });
  t = applyResult(t, { text: 'three', final: false, tsMs: 4 });
  assert.deepEqual(t.lines.map((l) => l.text), ['one', 'two more', 'three']);
  assert.deepEqual(visibleLines(t, 2).map((l) => l.text), ['two more', 'three']);
});

test('empty text is ignored, and an empty final removes a partial that came to nothing', () => {
  let t = applyResult(EMPTY_TRANSCRIPT, { text: '   ', final: false, tsMs: 1 });
  assert.deepEqual(t, EMPTY_TRANSCRIPT);
  t = applyResult(t, { text: 'um', final: false, tsMs: 2 });
  assert.equal(applyResult(t, { text: '', final: false, tsMs: 3 }).lines.length, 1, 'an empty partial changes nothing');
  assert.equal(applyResult(t, { text: '', final: true, tsMs: 3 }).lines.length, 0);
});

test('only the last few lines are kept', () => {
  let t = EMPTY_TRANSCRIPT;
  for (let n = 0; n < 10; n++) t = applyResult(t, { text: `line ${n}`, final: true, tsMs: n });
  assert.equal(t.lines.length, 6);
  assert.equal(t.lines[0].text, 'line 4');
  assert.equal(t.lines[5].text, 'line 9');
});

/* ------------------------------------------------------------- the utterance gate */

const u = (text, final, tsMs = 0) => ({ text, final, tsMs });

test('a final result is sent immediately', () => {
  const step = offer(newGate(), u('hello', true, 5), 1000);
  assert.deepEqual(step.send, u('hello', true, 5));
  assert.equal(step.gate.inFlight, true);
  assert.equal(step.flushAt, null);
});

test('the first partial goes out, the next ones wait for the 1.5 second window and only the latest is sent', () => {
  let step = offer(newGate(), u('a', false), 1000);
  assert.equal(step.send.text, 'a');
  let gate = complete(step.gate, 1100).gate; // the answer came back
  step = offer(gate, u('ab', false), 1200);
  assert.equal(step.send, null, 'too soon after the last partial');
  assert.equal(step.flushAt, 1000 + PARTIAL_EVERY_MS);
  step = offer(step.gate, u('abc', false), 1700);
  assert.equal(step.send, null);
  assert.equal(step.gate.pending.text, 'abc', 'the newer partial replaced the older one');
  step = flush(step.gate, 1000 + PARTIAL_EVERY_MS);
  assert.equal(step.send.text, 'abc');
  assert.equal(step.gate.lastPartialAt, 2500);
});

test('two requests are never in flight together: results wait and go out when the first one is done', () => {
  let step = offer(newGate(), u('one', true), 0);
  assert.ok(step.send);
  step = offer(step.gate, u('two', true), 10);
  assert.equal(step.send, null, 'a request is already out');
  assert.equal(step.gate.pending.text, 'two');
  step = complete(step.gate, 500);
  assert.equal(step.send.text, 'two', 'it goes out as soon as the first answer is back');
  assert.equal(step.gate.inFlight, true);
});

test('finals that pile up while a request is out are joined, none is lost', () => {
  let step = offer(newGate(), u('one', true, 1), 0);
  step = offer(step.gate, u('two', true, 2), 10);
  step = offer(step.gate, u('three', true, 3), 20);
  assert.equal(step.gate.pending.text, 'two three');
  assert.equal(step.gate.pending.tsMs, 3);
  assert.equal(complete(step.gate, 600).send.text, 'two three');
});

test('a stale partial is dropped when a final arrives, and a partial never overtakes a waiting final', () => {
  let step = offer(newGate(), u('busy', true), 0);
  step = offer(step.gate, u('half', false), 10);
  step = offer(step.gate, u('half done', true), 20);
  assert.deepEqual(step.gate.pending, u('half done', true));
  step = offer(step.gate, u('later words', false), 30);
  assert.equal(step.gate.pending.final, true, 'the final stays');
  assert.equal(step.gate.pending.text, 'half done');
});

test('a held partial is replaced by a final that can go out at once', () => {
  let step = offer(newGate(), u('a', false), 1000);
  step = offer(complete(step.gate, 1050).gate, u('ab', false), 1100);
  assert.equal(step.send, null);
  step = offer(step.gate, u('ab c', true), 1200);
  assert.equal(step.send.text, 'ab c');
  assert.equal(step.send.final, true);
});

test('empty text never leaves, and very long text keeps the newest words', () => {
  assert.equal(offer(newGate(), u('   ', true), 0).send, null);
  const long = 'x'.repeat(MAX_CHARS) + 'END';
  const sent = offer(newGate(), u(long, true), 0).send;
  assert.equal(sent.text.length, MAX_CHARS);
  assert.ok(sent.text.endsWith('END'));
});

/* ------------------------------------------------------------------ suggestions */

const s = (id, next, extra = {}) => ({ id, topic: null, productName: null, stage: 'features', next, cue: null, warning: null, hesitation: false, ...extra });

test('suggestions: nothing from the backend changes nothing; a first one becomes current', () => {
  assert.equal(applySuggestion(EMPTY_SUGGESTIONS, null), EMPTY_SUGGESTIONS);
  const state = applySuggestion(EMPTY_SUGGESTIONS, s('a', ['line one']));
  assert.equal(state.current.id, 'a');
  assert.deepEqual(state.history, []);
});

test('a different suggestion pushes the current one into a history of the last three', () => {
  let state = EMPTY_SUGGESTIONS;
  for (const id of ['a', 'b', 'c', 'd', 'e']) state = applySuggestion(state, s(id, [`say ${id}`]));
  assert.equal(state.current.id, 'e');
  assert.deepEqual(state.history.map((x) => x.id), ['d', 'c', 'b']);
  assert.equal(HISTORY, 3);
});

test('the same id, or the same lines again, updates in place without adding history noise', () => {
  let state = applySuggestion(EMPTY_SUGGESTIONS, s('a', ['say a']));
  state = applySuggestion(state, s('a', ['say a'], { hesitation: true }));
  assert.equal(state.current.hesitation, true);
  assert.deepEqual(state.history, []);
  state = applySuggestion(state, s('z', ['say a']));
  assert.equal(state.current.id, 'z');
  assert.deepEqual(state.history, []);
});

test('lines are trimmed and capped at three, and an empty suggestion is dropped unless it carries a warning', () => {
  assert.deepEqual(clean(s('a', [' one ', '', 'two', 'three', 'four'])).next, ['one', 'two', 'three']);
  assert.equal(clean(s('a', ['  ', ''])), null);
  assert.deepEqual(clean(s('a', [], { warning: { text: 'careful', level: 'risk' } })).next, []);
  assert.equal(applySuggestion(EMPTY_SUGGESTIONS, s('a', [])), EMPTY_SUGGESTIONS);
});

/* ---------------------------------------------------------------------- level */

test('the level is silent at the centre, loud at the extremes, and smoothing rises fast and falls slowly', () => {
  assert.equal(rmsLevel(new Uint8Array(64).fill(128)), 0);
  assert.equal(rmsLevel([]), 0);
  assert.equal(rmsLevel(new Uint8Array(64).fill(255)), 1, 'it never goes above one');
  const quiet = Array.from({ length: 64 }, (_, n) => (n % 2 ? 138 : 118));
  const level = rmsLevel(quiet);
  assert.ok(level > 0.1 && level < 0.5, `quiet speech reads low, got ${level}`);
  const up = smoothLevel(0, 1);
  const down = smoothLevel(1, 0);
  assert.ok(up > 0.5);
  assert.ok(1 - down < 0.2, 'falling is slower than rising');
});

/* ------------------------------------------------------------------ mock source */

test('the planned speech grows through partials to a final for each sentence, in time order', () => {
  const planned = planUtterances(['abcdef', 'ghijkl'], { msPerChar: 100, pauseMs: 500, partials: 2, startMs: 0 });
  assert.equal(planned.length, 6);
  const first = planned.slice(0, 3);
  assert.deepEqual(first.map((p) => p.final), [false, false, true]);
  assert.ok(first[0].text.length < first[1].text.length && first[1].text.length < first[2].text.length);
  assert.equal(first[2].text, 'abcdef');
  assert.ok('abcdef'.startsWith(first[0].text));
  const times = planned.map((p) => p.at);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.ok(planned[3].at > planned[2].at, 'the next sentence starts after a pause');
});

test('the mock source emits its results through the injected scheduler and stop cancels what is left', () => {
  const timers = [];
  const scheduler = { set: (run, ms) => { const id = { run, ms, cancelled: false }; timers.push(id); return id; }, clear: (id) => { id.cancelled = true; } };
  const heard = [];
  const source = createMockSource({ script: ['abcd', 'efgh'], scheduler, handlers: { onResult: (r) => heard.push(r), onError() {}, onClose() {} } });
  source.start();
  assert.equal(timers.length, 6);
  for (const timer of [...timers].sort((a, b) => a.ms - b.ms).slice(0, 3)) timer.run();
  assert.deepEqual(heard.map((r) => r.final), [false, false, true]);
  assert.equal(heard[2].text, 'abcd');
  assert.equal(heard[2].tsMs, timers.sort((a, b) => a.ms - b.ms)[2].ms, 'the time stamp is the planned time');
  source.stop();
  assert.equal(timers.filter((t) => t.cancelled).length, 6, 'stop clears every timer');
  assert.ok(MOCK_SCRIPT.length > 0);
});
