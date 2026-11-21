import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { load } from 'cheerio'
import { filmFps } from './continuity.mjs'

const require = createRequire(import.meta.url)
const bankDir = join(
  dirname(require.resolve('hyperframes/package.json')),
  'dist/skills/media-use/audio/assets/sfx',
)
const bank = require(join(bankDir, 'manifest.json'))

function removeEffects($) {
  const effects = $('audio').filter((_, audio) => {
    const node = $(audio)
    const src = node.attr('src') || node.find('source').attr('src') || ''
    return (
      node.is('[data-hf-sfx]') || /(?:^|\/)(?:hf-)?sfx-[\w-]+\.mp3$/i.test(src)
    )
  })
  effects.remove()
  return effects.length
}

export async function readSoundPlan(project, directory) {
  const $ = load((await project.read(`${directory}/index.html`)).toString())
  const root = $('[data-composition-id]').first()
  if (!root.is('[data-hf-sound-plan]')) return null
  const seconds = Number(root.attr('data-duration'))
  return root
    .find('audio[data-hf-sfx]')
    .toArray()
    .map((node) => ({
      sound: $(node).attr('data-hf-sfx'),
      position: Number($(node).attr('data-start')) / seconds,
      volume: Number($(node).attr('data-volume')),
    }))
}

export async function placeSoundEffects(project, directory, cues) {
  const $ = load((await project.read(`${directory}/index.html`)).toString())
  const composition = $('[data-composition-id]').first()
  const seconds = Number(composition.attr('data-duration'))
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error('Missing film duration for the sound edit')
  const priorPlan = composition.is('[data-hf-sound-plan]')
  composition.attr('data-hf-sound-plan', '')
  const removed = removeEffects($)
  const assets = new Map()
  const lastTrack = Math.max(
    0,
    ...$('[data-track-index]')
      .map((_, node) => Number($(node).attr('data-track-index')) || 0)
      .get(),
  )
  for (const [index, cue] of cues.entries()) {
    if (!Object.hasOwn(bank, cue.sound))
      throw new Error('Unknown HyperFrames sound effect')
    const sound = bank[cue.sound]
    const name = `hf-sfx-${sound.file}`
    if (!assets.has(name))
      assets.set(name, await readFile(join(bankDir, sound.file)))
    const start = Math.min(
      Math.round(seconds * cue.position * filmFps) / filmFps,
      Math.max(0, seconds - 1 / filmFps),
    )
    const duration = Math.min(sound.duration, seconds - start)
    composition.append(
      $('<audio></audio>').attr({
        id: `hf-sfx-${index}`,
        class: 'clip',
        src: `assets/${name}`,
        'data-hf-sfx': cue.sound,
        'data-start': start.toFixed(4),
        'data-duration': duration.toFixed(4),
        'data-track-index': String(lastTrack + index + 1),
        'data-volume': String(cue.volume),
      }),
    )
  }
  if (assets.size) {
    assets.set(
      'hf-sfx-credits.txt',
      await readFile(join(bankDir, 'CREDITS.md')),
    )
    await project.write(
      `${directory}/assets`,
      [...assets].map(([path, bytes]) => ({ path, bytes })),
    )
  }
  if (removed || cues.length || !priorPlan)
    await project.write(directory, [
      { path: 'index.html', bytes: Buffer.from($.html()) },
    ])

  const scenesDir = `${directory}/compositions`
  for (const scene of await project.list(scenesDir)) {
    if (scene.type !== 'file' || !/^[\w.-]+\.html$/.test(scene.name)) continue
    const html = (await project.read(`${scenesDir}/${scene.name}`)).toString()
    if (!html.includes('<audio')) continue
    const sceneDom = load(
      html,
      {},
      /<!doctype\s+html|<html\b|<head\b/i.test(html),
    )
    if (removeEffects(sceneDom))
      await project.write(scenesDir, [
        { path: scene.name, bytes: Buffer.from(sceneDom.html()) },
      ])
  }
}
