import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// The worklet file is plain JavaScript that runs in the browser's audio thread. Here it is loaded with stand ins for
// the audio worklet globals, so the code under test is the code that ships.
function loadWorklet(rate = 48000) {
  const code = fs.readFileSync(new URL('../public/studio/live-mic-worklet.js', import.meta.url), 'utf8');
  const module = { exports: {} };
  class AudioWorkletProcessor {
    constructor() {
      this.port = { posted: [], onmessage: null, postMessage: (message) => this.port.posted.push(message) };
    }
  }
  let registered = null;
  new Function('module', 'AudioWorkletProcessor', 'registerProcessor', 'sampleRate', code)(module, AudioWorkletProcessor, (name, cls) => { registered = { name, cls }; }, rate);
  return { api: module.exports, registered };
}
const { api, registered } = loadWorklet();
const { floatToPcm16, createResampler, createChunker, createVad, rms, TARGET_RATE, CHUNK_SAMPLES } = api;

/* -------------------------------------------------------------------------- PCM */

test('float samples become 16 bit integers, clamped, with the extremes at the limits', () => {
  const out = floatToPcm16(Float32Array.from([0, 1, -1, 0.5, -0.5, 2, -3, NaN]));
  assert.deepEqual(Array.from(out), [0, 32767, -32768, 16384, -16384, 32767, -32768, 0]);
  assert.ok(out instanceof Int16Array);
  assert.equal(floatToPcm16(new Float32Array(0)).length, 0);
});

test('the target format is 24 kHz and a chunk is 200 ms, 4800 samples, 9600 bytes', () => {
  assert.equal(TARGET_RATE, 24000);
  assert.equal(CHUNK_SAMPLES, 4800);
  assert.equal(CHUNK_SAMPLES * 2, 9600);
  assert.equal(registered.name, 'live-mic', 'the processor registers itself under the name the page asks for');
});

/* ------------------------------------------------------------------ resampling */

const sine = (hz, rate, count, amp = 0.5) => Float32Array.from({ length: count }, (_, n) => amp * Math.sin((2 * Math.PI * hz * n) / rate));

test('48 kHz and 44.1 kHz come down to 24 kHz at the right length, and the same rate passes through', () => {
  for (const [rate, count] of [[48000, 48000], [44100, 44100]]) {
    const out = createResampler(rate, 24000).push(sine(440, rate, count));
    assert.ok(Math.abs(out.length - 24000) <= 2, `one second at ${rate} gives about 24000 samples, got ${out.length}`);
  }
  const same = createResampler(24000, 24000).push(Float32Array.from([0.1, 0.2, 0.3]));
  assert.deepEqual(Array.from(same), Array.from(Float32Array.from([0.1, 0.2, 0.3])));
});

test('a steady level survives resampling, and a 1 kHz tone keeps most of its amplitude', () => {
  const dc = createResampler(48000, 24000).push(new Float32Array(4800).fill(0.5));
  assert.ok(Math.abs(dc[dc.length - 1] - 0.5) < 1e-6, 'a constant input stays constant');
  const tone = createResampler(48000, 24000).push(sine(1000, 48000, 9600, 0.8));
  const peak = Math.max(...Array.from(tone.slice(100), Math.abs));
  assert.ok(peak > 0.65 && peak <= 0.8001, `the tone keeps its amplitude, got ${peak}`);
});

test('pushing in small blocks gives the same samples as pushing everything at once (no clicks at the seams)', () => {
  const input = sine(300, 44100, 5000);
  const whole = createResampler(44100, 24000).push(input);
  const blocks = createResampler(44100, 24000);
  const parts = [];
  for (let at = 0; at < input.length; at += 128) parts.push(...blocks.push(input.subarray(at, Math.min(input.length, at + 128))));
  assert.ok(Math.abs(parts.length - whole.length) <= 1);
  for (let n = 0; n < Math.min(parts.length, whole.length); n++) assert.ok(Math.abs(parts[n] - whole[n]) < 1e-5, `sample ${n} differs`);
});

/* ---------------------------------------------------------------------- chunking */

test('the chunker hands back exact blocks and keeps the remainder until it is flushed', () => {
  const chunker = createChunker(4800);
  const chunks = chunker.push(new Int16Array(10000).fill(7));
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((chunk) => chunk.length === 4800 && chunk.byteLength === 9600));
  assert.equal(chunker.pending(), 400);
  assert.equal(chunker.push(new Int16Array(4400)).length, 1, 'the remainder joins the next samples');
  assert.equal(chunker.pending(), 0);
  assert.equal(chunker.flush(), null);
  chunker.push(new Int16Array(10));
  const rest = chunker.flush();
  assert.equal(rest.length, 10);
  assert.equal(chunker.pending(), 0);
});

/* -------------------------------------------------------------------------- VAD */

const run = (vad, level, ms, frame = 20) => {
  const events = [];
  for (let at = 0; at < ms; at += frame) events.push(...vad.push(level, frame).map((e) => ({ ...e, atMs: at + frame })));
  return events;
};

test('quiet frames never start speech, and a short blip under the start time is ignored', () => {
  const vad = createVad();
  assert.deepEqual(run(vad, 0.001, 2000), []);
  assert.equal(vad.state(), 'idle');
  assert.deepEqual(run(vad, 0.2, 60), [], '60 ms is shorter than the 80 ms needed');
  run(vad, 0.001, 100);
  assert.equal(vad.state(), 'idle');
});

test('speech starts once the level has stayed up for 80 ms, and not before', () => {
  const vad = createVad();
  const events = run(vad, 0.2, 200);
  assert.deepEqual(events.map((e) => e.type), ['speech-start']);
  assert.equal(events[0].atMs, 80);
  assert.equal(vad.state(), 'speech');
});

test('an utterance is committed after 700 ms of silence, never before, and quiet speech in the middle does not end it', () => {
  const vad = createVad();
  run(vad, 0.2, 200);
  const { off } = vad.thresholds();
  assert.deepEqual(run(vad, off + 0.001, 2000), [], 'a level between the thresholds still counts as speech');
  assert.deepEqual(run(vad, 0.001, 680), [], '680 ms of silence is not enough');
  const commit = run(vad, 0.001, 40);
  assert.deepEqual(commit.map((e) => [e.type, e.reason]), [['commit', 'silence']]);
  assert.equal(vad.state(), 'idle');
});

test('a short pause inside a sentence restarts the silence clock instead of ending the utterance', () => {
  const vad = createVad({ silenceMs: 700 });
  run(vad, 0.2, 200);
  assert.deepEqual(run(vad, 0.001, 600), []);
  assert.deepEqual(run(vad, 0.2, 100), []);
  assert.deepEqual(run(vad, 0.001, 600), [], 'the clock started again from zero');
  assert.equal(run(vad, 0.001, 100).filter((e) => e.type === 'commit').length, 1);
});

test('after 15 seconds of continuous speech a commit is forced and speech carries on', () => {
  const vad = createVad({ maxUtteranceMs: 15000 });
  const events = run(vad, 0.2, 31000);
  const commits = events.filter((e) => e.type === 'commit');
  assert.deepEqual(commits.map((e) => e.reason), ['max', 'max']);
  assert.ok(Math.abs(commits[0].atMs - 15080) <= 40, `the first forced commit is near 15 s, got ${commits[0].atMs}`);
  assert.equal(vad.state(), 'speech', 'it keeps listening, no new speech start is needed');
  assert.equal(events.filter((e) => e.type === 'speech-start').length, 1);
});

test('the noise floor follows a steady hum so it does not count as speech', () => {
  const vad = createVad();
  const before = vad.thresholds().on;
  run(vad, 0.01, 3000);
  assert.ok(vad.floor() > 0.008, 'the floor rose towards the hum');
  assert.ok(vad.thresholds().on > before && vad.thresholds().on > 0.025, 'so did the threshold');
  assert.deepEqual(run(vad, 0.02, 400), [], 'the same hum, a little louder, is still not speech');
  assert.equal(run(vad, 0.4, 200).filter((e) => e.type === 'speech-start').length, 1, 'real speech still gets through');
});

test('finish commits an utterance in progress and does nothing otherwise', () => {
  const vad = createVad();
  assert.deepEqual(vad.finish(), []);
  run(vad, 0.2, 300);
  assert.deepEqual(vad.finish(), [{ type: 'commit', reason: 'stop' }]);
  assert.equal(vad.state(), 'idle');
});

test('rms reads the level of a block', () => {
  assert.equal(rms(new Float32Array(10)), 0);
  assert.ok(Math.abs(rms(new Float32Array(10).fill(0.5)) - 0.5) < 1e-9);
  assert.equal(rms([], 0, 0), 0);
});

/* ------------------------------------------------------------------ the processor */

function feed(processor, level, seconds, rate = 48000, hz = 220) {
  const quantum = 128;
  const total = Math.round((rate * seconds) / quantum);
  let phase = processor.__phase || 0;
  for (let q = 0; q < total; q++) {
    const block = new Float32Array(quantum);
    for (let n = 0; n < quantum; n++) block[n] = level * Math.sin(2 * Math.PI * hz * (phase++ / rate));
    processor.process([[block]], [], {});
  }
  processor.__phase = phase;
}
const messages = (processor) => processor.port.posted;

test('silence sends nothing but level readings; speech sends a pre roll, then 200 ms chunks, and speaking turns on', () => {
  const processor = new registered.cls({ processorOptions: { silenceMs: 700 } });
  feed(processor, 0, 1);
  assert.equal(messages(processor).filter((m) => m.type === 'audio').length, 0, 'nothing is streamed while nobody speaks');
  assert.ok(messages(processor).filter((m) => m.type === 'level').length >= 15, 'the level meter keeps reporting');
  processor.port.posted.length = 0;
  feed(processor, 0.3, 1);
  const list = messages(processor);
  assert.equal(list.find((m) => m.type === 'speaking').value, true);
  const audio = list.filter((m) => m.type === 'audio');
  assert.ok(audio.length >= 4, `about a second of speech is streamed, got ${audio.length} chunks`);
  assert.ok(audio.every((m) => m.buffer.byteLength === 9600), 'every chunk is 9600 bytes');
  const bytes = audio.reduce((sum, m) => sum + m.buffer.byteLength, 0);
  // about 1 s of speech plus the 0.4 s pre roll, at 48000 bytes a second, minus what is still being collected
  assert.ok(bytes >= 48000 && bytes <= 72000, `streamed ${bytes} bytes`);
  assert.equal(list.some((m) => m.type === 'commit'), false);
});

test('after the silence a commit follows, and the audio that was waiting is sent before it', () => {
  const processor = new registered.cls({ processorOptions: { silenceMs: 700 } });
  feed(processor, 0.3, 1);
  processor.port.posted.length = 0;
  feed(processor, 0, 1.2);
  const list = messages(processor);
  const commitAt = list.findIndex((m) => m.type === 'commit');
  assert.ok(commitAt >= 0, 'a commit was sent');
  assert.equal(list[commitAt].reason, 'silence');
  const lastAudio = list.map((m) => m.type).lastIndexOf('audio');
  assert.ok(lastAudio < commitAt, 'every piece of audio was sent before the commit');
  assert.equal(list.some((m) => m.type === 'speaking' && m.value === false), true);
  // and after the commit the processor is quiet again until the next speech
  const afterCommit = list.slice(commitAt + 1).filter((m) => m.type === 'audio');
  assert.equal(afterCommit.length, 0);
});

test('continuous speech is committed every 15 seconds without stopping the stream', () => {
  const processor = new registered.cls({ processorOptions: { silenceMs: 700, maxUtteranceMs: 15000 } });
  feed(processor, 0.3, 16.5);
  const list = messages(processor);
  const commits = list.filter((m) => m.type === 'commit');
  assert.equal(commits.length, 1);
  assert.equal(commits[0].reason, 'max');
  assert.equal(list.filter((m) => m.type === 'speaking' && m.value === false).length, 0, 'speaking never turned off');
  const commitAt = list.findIndex((m) => m.type === 'commit');
  assert.ok(list.slice(commitAt + 1).some((m) => m.type === 'audio'), 'audio keeps flowing after the forced commit');
});

test('a finish message from the page commits what is being said', () => {
  const processor = new registered.cls({});
  feed(processor, 0.3, 0.6);
  processor.port.posted.length = 0;
  processor.port.onmessage({ data: { type: 'finish' } });
  const list = messages(processor);
  assert.deepEqual(list.map((m) => m.type).filter((t) => t !== 'audio'), ['commit', 'speaking']);
  assert.equal(list.find((m) => m.type === 'commit').reason, 'stop');
});

test('it also works at 44.1 kHz, which Safari may give', () => {
  const { registered: other } = loadWorklet(44100);
  const processor = new other.cls({});
  feed(processor, 0.3, 1, 44100);
  const audio = messages(processor).filter((m) => m.type === 'audio');
  assert.ok(audio.length >= 4);
  assert.ok(audio.every((m) => m.buffer.byteLength === 9600));
});
