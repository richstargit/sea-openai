import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filmFps,
  frameDiscontinuities,
} from '../integrations/video-engine/continuity.mjs'

test('a sustained camera move and a final hold keep a regular cadence', () => {
  const frames = Array.from({ length: 90 }, (_, i) => ({
    time: i / filmFps,
    change: i < 76 ? 3 : 0,
  }))
  assert.deepEqual(frameDiscontinuities(frames), [])
})

test('an isolated frame jump and a dropped sample are reported at their timestamps', () => {
  const frames = Array.from({ length: 100 }, (_, i) => ({
    time: (i + Number(i >= 70)) / filmFps,
    change: i === 30 ? 10 : 0.3,
  }))
  assert.deepEqual(frameDiscontinuities(frames), [
    { time: 1, issue: 'abrupt visual change' },
    { time: 71 / filmFps, issue: 'uneven frame timing' },
  ])
})
