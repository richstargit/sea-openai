import { execFileSync } from 'node:child_process'
import { readFileSync, unlinkSync } from 'node:fs'

const inputs = JSON.parse(readFileSync('media.json', 'utf8'))
const prepared = []
const allowed = 'mov,matroska,webm,ogg,wav,mp3,aac,flac,aiff,avi,mpeg,mpegts'
for (const { id, kind } of inputs) {
  const path = `assets/${id}.input`
  const format = ['-protocol_whitelist', 'file', '-format_whitelist', allowed]
  const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', ...format, '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', path], { encoding: 'utf8' }))
  const audio = info.streams.find((stream) => stream.codec_type === 'audio')
  const video = info.streams.find((stream) => stream.codec_type === 'video')
  if (kind === 'audio' ? !audio : !video) throw new Error('Unsupported editor media')
  const webm = kind === 'video' && ['vp8', 'vp9', 'av1'].includes(video.codec_name)
  const file = `assets/${id}.${kind === 'audio' ? 'm4a' : webm ? 'webm' : 'mp4'}`
  const streams = kind === 'audio' ? ['-vn'] : ['-map', '0:v:0', '-c:v', webm || video.codec_name === 'h264' ? 'copy' : 'libx264']
  if (audio) streams.push('-map', '0:a:0', '-c:a', webm ? (audio.codec_name === 'opus' ? 'copy' : 'libopus') : (audio.codec_name === 'aac' ? 'copy' : 'aac'))
  execFileSync('ffmpeg', ['-v', 'error', '-nostdin', ...format, '-i', path, ...streams, '-map_metadata', '-1', '-map_chapters', '-1', file])
  unlinkSync(path)
  prepared.push({ id, file, audio: Boolean(audio) })
}
process.stdout.write(JSON.stringify(prepared))
