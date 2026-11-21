// The microphone side of the live script, running on the audio thread (an AudioWorklet), never on a timer, so a
// background tab does not slow it down. It does four things:
//   1. turns what the microphone hears into 24 kHz mono 16 bit little endian PCM (what the transcription expects),
//   2. cuts it into chunks of about 200 ms (4800 samples, 9600 bytes),
//   3. runs a voice activity detector, because the transcription model has no server side VAD: audio is only sent while
//      someone speaks (with a short pre roll so the first word is not clipped), and a commit message follows after the
//      silence that ends an utterance, or after 15 seconds of continuous speech so the text keeps flowing,
//   4. reports how loud it is, for the level meter.
// It is plain JavaScript on purpose: the same file is loaded by the browser (audioWorklet.addModule) and by the node
// tests, so what is tested is what runs. Messages to the page: { type: 'audio', buffer }, { type: 'commit', reason },
// { type: 'speaking', value }, { type: 'level', value }. Message from the page: { type: 'finish' }.

var TARGET_RATE = 24000;
var CHUNK_SAMPLES = 4800;

/** Float samples in the range -1 to 1 become 16 bit integers, clamped. */
function floatToPcm16(samples) {
  var out = new Int16Array(samples.length);
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    s = s > 1 ? 1 : s < -1 ? -1 : s;
    out[i] = Math.round(s < 0 ? s * 32768 : s * 32767);
  }
  return out;
}

/**
 * A streaming resampler: blocks go in one after the other and the seam between them is carried over, so the output
 * has no clicks. Linear interpolation, with a short moving average first when the rate goes down (48 or 44.1 kHz to
 * 24 kHz) so high frequencies do not fold back into the speech band.
 */
function createResampler(inputRate, outputRate) {
  if (inputRate === outputRate) return { push: function (input) { return Float32Array.from(input); } };
  var ratio = inputRate / outputRate;
  var taps = ratio > 1 ? Math.max(1, Math.round(ratio)) : 1;
  var history = new Float32Array(Math.max(0, taps - 1));
  var carry = null;
  var position = 0;

  function smooth(input) {
    if (taps === 1) return input;
    var out = new Float32Array(input.length);
    for (var i = 0; i < input.length; i++) {
      var sum = input[i];
      for (var k = 1; k < taps; k++) {
        var back = i - k;
        sum += back >= 0 ? input[back] : history[history.length + back];
      }
      out[i] = sum / taps;
    }
    var keep = taps - 1;
    var next = new Float32Array(keep);
    for (var j = 0; j < keep; j++) {
      var idx = input.length - keep + j;
      next[j] = idx >= 0 ? input[idx] : history[history.length + idx];
    }
    history = next;
    return out;
  }

  return {
    push: function (rawInput) {
      var input = smooth(rawInput);
      var offset = carry === null ? 0 : 1;
      var n = input.length + offset;
      var get = function (idx) { return offset === 1 ? (idx === 0 ? carry : input[idx - 1]) : input[idx]; };
      var out = [];
      while (position + 1 < n) {
        var i0 = Math.floor(position);
        var frac = position - i0;
        out.push(get(i0) * (1 - frac) + get(i0 + 1) * frac);
        position += ratio;
      }
      if (n > 0) {
        carry = get(n - 1);
        position -= n - 1;
      }
      return Float32Array.from(out);
    },
  };
}

/** Collects samples and hands them back in blocks of exactly `size`. `flush` returns whatever is left. */
function createChunker(size) {
  var buffer = new Int16Array(size);
  var filled = 0;
  return {
    push: function (samples) {
      var out = [];
      var i = 0;
      while (i < samples.length) {
        var take = Math.min(size - filled, samples.length - i);
        buffer.set(samples.subarray(i, i + take), filled);
        filled += take;
        i += take;
        if (filled === size) { out.push(buffer.slice()); filled = 0; }
      }
      return out;
    },
    flush: function () {
      if (filled === 0) return null;
      var rest = buffer.slice(0, filled);
      filled = 0;
      return rest;
    },
    pending: function () { return filled; },
  };
}

function rms(samples, from, to) {
  var start = from || 0;
  var end = to === undefined ? samples.length : to;
  if (end <= start) return 0;
  var sum = 0;
  for (var i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

/**
 * Voice activity with hysteresis and a noise floor. Idle becomes speech after the level stays above the "on"
 * threshold for `startMs`. In speech, a frame under the lower "off" threshold counts as silence, anything in between
 * still counts as speech. `silenceMs` of silence ends the utterance with a commit; an utterance longer than
 * `maxUtteranceMs` is committed and a new one starts at once. The noise floor follows the room while idle, so a fan
 * or a hum raises the thresholds instead of triggering speech.
 */
function createVad(options) {
  var o = {
    silenceMs: 700, maxUtteranceMs: 15000, startMs: 80,
    minFloor: 0.002, onRatio: 3, offRatio: 2, onMin: 0.012, offMin: 0.008, floorRate: 0.05,
  };
  for (var key in options || {}) if (options[key] !== undefined && options[key] !== null) o[key] = options[key];
  var state = 'idle';
  var floor = o.minFloor * 2;
  var aboveMs = 0;
  var silentMs = 0;
  var utteranceMs = 0;
  return {
    state: function () { return state; },
    floor: function () { return floor; },
    thresholds: function () { return { on: Math.max(o.onMin, floor * o.onRatio), off: Math.max(o.offMin, floor * o.offRatio) }; },
    push: function (level, frameMs) {
      var on = Math.max(o.onMin, floor * o.onRatio);
      var off = Math.max(o.offMin, floor * o.offRatio);
      var events = [];
      if (state === 'idle') {
        if (level >= on) {
          aboveMs += frameMs;
          if (aboveMs >= o.startMs) { state = 'speech'; aboveMs = 0; silentMs = 0; utteranceMs = 0; events.push({ type: 'speech-start' }); }
        } else {
          aboveMs = 0;
          floor = Math.max(o.minFloor, floor * (1 - o.floorRate) + level * o.floorRate);
        }
      } else {
        utteranceMs += frameMs;
        if (level < off) silentMs += frameMs; else silentMs = 0;
        if (silentMs >= o.silenceMs) { state = 'idle'; aboveMs = 0; silentMs = 0; utteranceMs = 0; events.push({ type: 'commit', reason: 'silence' }); }
        else if (utteranceMs >= o.maxUtteranceMs) { utteranceMs = 0; events.push({ type: 'commit', reason: 'max' }); }
      }
      return events;
    },
    /** The page is stopping: an utterance in progress is committed so it is not lost. */
    finish: function () {
      if (state !== 'speech') return [];
      state = 'idle'; aboveMs = 0; silentMs = 0; utteranceMs = 0;
      return [{ type: 'commit', reason: 'stop' }];
    },
  };
}

var PRE_ROLL_SAMPLES = Math.round(TARGET_RATE * 0.4);
var FRAME_SECONDS = 0.02;
var LEVEL_EVERY_SECONDS = 0.05;

if (typeof AudioWorkletProcessor !== 'undefined') {
  var LiveMicProcessor = class extends AudioWorkletProcessor {
    constructor(options) {
      super();
      var given = (options && options.processorOptions) || {};
      this.resampler = createResampler(sampleRate, TARGET_RATE);
      this.chunker = createChunker(CHUNK_SAMPLES);
      this.vad = createVad({ silenceMs: given.silenceMs, maxUtteranceMs: given.maxUtteranceMs });
      this.frameSize = Math.max(128, Math.round(sampleRate * FRAME_SECONDS));
      this.frame = new Float32Array(this.frameSize);
      this.frameFilled = 0;
      this.levelFrames = Math.max(1, Math.round(LEVEL_EVERY_SECONDS / FRAME_SECONDS));
      this.framesSinceLevel = 0;
      this.preRoll = [];
      this.preRollSamples = 0;
      this.streaming = false;
      var self = this;
      this.port.onmessage = function (event) {
        if (event.data && event.data.type === 'finish') self.handle(self.vad.finish());
      };
    }

    sendChunk(samples) {
      this.port.postMessage({ type: 'audio', buffer: samples.buffer }, [samples.buffer]);
    }

    handle(events) {
      for (var i = 0; i < events.length; i++) {
        var event = events[i];
        if (event.type === 'speech-start') {
          // Everything heard just before the speech was confirmed goes first, so the first word is not clipped.
          for (var p = 0; p < this.preRoll.length; p++) {
            var chunks = this.chunker.push(this.preRoll[p]);
            for (var c = 0; c < chunks.length; c++) this.sendChunk(chunks[c]);
          }
          this.preRoll = [];
          this.preRollSamples = 0;
          this.streaming = true;
          this.port.postMessage({ type: 'speaking', value: true });
        } else if (event.type === 'commit') {
          var rest = this.chunker.flush();
          if (rest) this.sendChunk(rest);
          this.port.postMessage({ type: 'commit', reason: event.reason });
          if (event.reason !== 'max') {
            this.streaming = false;
            this.port.postMessage({ type: 'speaking', value: false });
          }
        }
      }
    }

    process(inputs) {
      var channel = inputs[0] && inputs[0][0];
      if (!channel) return true;

      // The voice detector looks at the input in steps of 20 ms.
      var offset = 0;
      while (offset < channel.length) {
        var take = Math.min(this.frameSize - this.frameFilled, channel.length - offset);
        this.frame.set(channel.subarray(offset, offset + take), this.frameFilled);
        this.frameFilled += take;
        offset += take;
        if (this.frameFilled === this.frameSize) {
          var level = rms(this.frame);
          this.frameFilled = 0;
          this.handle(this.vad.push(level, FRAME_SECONDS * 1000));
          if (++this.framesSinceLevel >= this.levelFrames) {
            this.framesSinceLevel = 0;
            this.port.postMessage({ type: 'level', value: level });
          }
        }
      }

      var pcm = floatToPcm16(this.resampler.push(channel));
      if (this.streaming) {
        var out = this.chunker.push(pcm);
        for (var i = 0; i < out.length; i++) this.sendChunk(out[i]);
      } else {
        this.preRoll.push(pcm);
        this.preRollSamples += pcm.length;
        while (this.preRollSamples > PRE_ROLL_SAMPLES && this.preRoll.length > 1) this.preRollSamples -= this.preRoll.shift().length;
      }
      return true;
    }
  };
  registerProcessor('live-mic', LiveMicProcessor);
}

// For the node tests: the worklet global scope has no `module`, so this is skipped in the browser.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TARGET_RATE: TARGET_RATE, CHUNK_SAMPLES: CHUNK_SAMPLES, floatToPcm16: floatToPcm16, createResampler: createResampler, createChunker: createChunker, createVad: createVad, rms: rms, getProcessor: function () { return typeof LiveMicProcessor === 'undefined' ? null : LiveMicProcessor; } };
}
