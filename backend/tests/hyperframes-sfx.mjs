import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { load } from 'cheerio'
import {
  placeSoundEffects,
  readSoundPlan,
} from '../integrations/video-engine/sound-effects.mjs'

test('places the recorded sounds on frames, restores the mix on edits, and removes only effects for a quiet mix', async () => {
  const files = new Map([
    [
      'film/index.html',
      '<main data-composition-id="main" data-duration="5"><audio src="assets/music-bed.mp3" data-track-index="11"></audio></main>',
    ],
    [
      'film/compositions/shot.html',
      '<section><audio src="assets/sfx-click.mp3"></audio><audio src="assets/voice-01.mp3"></audio></section>',
    ],
  ])
  const project = {
    read: (path) => files.get(path),
    list: () => [{ name: 'shot.html', type: 'file' }],
    write: (dir, batch) => {
      for (const { path, bytes } of batch) files.set(`${dir}/${path}`, bytes)
    },
  }
  const cues = [
    { sound: 'click-soft', volume: 0.22, position: 0.113 },
    { sound: 'click-soft', volume: 0.34, position: 0.96 },
  ]
  assert.equal(await readSoundPlan(project, 'film'), null)
  await placeSoundEffects(project, 'film', cues)
  const bank = dirname(
    createRequire(import.meta.url).resolve('hyperframes/package.json'),
  )
  assert.deepEqual(
    files.get('film/assets/hf-sfx-click-soft.mp3'),
    await readFile(
      join(bank, 'dist/skills/media-use/audio/assets/sfx/click-soft.mp3'),
    ),
  )
  const mix = await readSoundPlan(project, 'film')
  assert.deepEqual(
    mix.map((cue) => cue.volume),
    [0.22, 0.34],
  )
  await placeSoundEffects(project, 'film', mix)
  const $ = load(files.get('film/index.html').toString())
  assert.match(files.get('film/index.html').toString(), /<head>/)
  assert.equal($('audio[data-hf-sfx]').length, 2)
  assert.equal($('#hf-sfx-0').attr('data-start'), '0.5667')
  assert.equal($('#hf-sfx-1').attr('data-duration'), '0.2000')
  assert.equal($('#hf-sfx-0').attr('data-track-index'), '12')
  await placeSoundEffects(project, 'film', [])
  assert.deepEqual(await readSoundPlan(project, 'film'), [])
  assert.deepEqual(
    load(files.get('film/index.html').toString())('audio')
      .map((_, node) => node.attribs.src)
      .get(),
    ['assets/music-bed.mp3'],
  )
  assert.deepEqual(
    load(files.get('film/compositions/shot.html').toString())('audio')
      .map((_, node) => node.attribs.src)
      .get(),
    ['assets/voice-01.mp3'],
  )
  await assert.rejects(
    placeSoundEffects(project, 'film', [{ sound: '../path' }]),
    /Unknown HyperFrames/,
  )
})
