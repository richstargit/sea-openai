export type WavInfo = {
  sampleRate: number
  channels: number
  /** First channel as 16 bit samples. */
  samples: Int16Array
  durationSec: number
}

/** Reads a PCM 16 bit wav. Tolerates streamed headers with a wrong data size. */
export function parseWav(buffer: Buffer): WavInfo {
  if (
    buffer.length < 44 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WAVE'
  ) {
    throw new Error('not a wav file')
  }

  let offset = 12
  let sampleRate = 0
  let channels = 0
  let bits = 0
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4)
    const size = buffer.readUInt32LE(offset + 4)
    const body = offset + 8
    if (id === 'fmt ') {
      channels = buffer.readUInt16LE(body + 2)
      sampleRate = buffer.readUInt32LE(body + 4)
      bits = buffer.readUInt16LE(body + 14)
    } else if (id === 'data') {
      if (bits !== 16 || !channels || !sampleRate) {
        throw new Error('unsupported wav format, expected 16 bit pcm')
      }
      const end = Math.min(buffer.length, body + size)
      const frameBytes = 2 * channels
      const frames = Math.floor((end - body) / frameBytes)
      const samples = new Int16Array(frames)
      for (let i = 0; i < frames; i++) {
        samples[i] = buffer.readInt16LE(body + i * frameBytes)
      }
      return { sampleRate, channels, samples, durationSec: frames / sampleRate }
    }
    offset = body + size + (size % 2)
  }
  throw new Error('wav has no data chunk')
}

export function encodeWav(samples: Int16Array, sampleRate = 24_000): Buffer {
  const dataBytes = samples.length * 2
  const out = Buffer.alloc(44 + dataBytes)
  out.write('RIFF', 0, 'ascii')
  out.writeUInt32LE(36 + dataBytes, 4)
  out.write('WAVE', 8, 'ascii')
  out.write('fmt ', 12, 'ascii')
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36, 'ascii')
  out.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < samples.length; i++) {
    out.writeInt16LE(samples[i] ?? 0, 44 + i * 2)
  }
  return out
}

/** A soft pulsing tone, only used by demo mode so the player has something to play. */
export function synthTone(
  durationSec: number,
  freq = 220,
  sampleRate = 24_000,
): Buffer {
  const total = Math.floor(durationSec * sampleRate)
  const samples = new Int16Array(total)
  for (let i = 0; i < total; i++) {
    const t = i / sampleRate
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * 2 * t)
    samples[i] = Math.round(Math.sin(2 * Math.PI * freq * t) * 6000 * envelope)
  }
  return encodeWav(samples, sampleRate)
}
