import { randomUUID } from 'node:crypto'
import { editorComposition } from '@/schemas/editor.schema.js'
import { composeEditor } from '@/services/video/editor-composition.js'
import { applyEditorEdits } from '@/services/video/editor-edits.js'

const assetId = randomUUID()
const clip = {
  id: randomUUID(),
  assetId,
  sourceIn: 0,
  sourceOut: 60,
  speed: 1,
  volume: 1,
  title: 'First',
  subtitle: '',
  textPosition: 'top',
  textColor: '#ffffff',
  textSize: 5,
  fit: 'contain',
  brightness: 1,
  contrast: 1,
  saturation: 1,
  transition: 'cut',
}
const scene = editorComposition.parse({
  project: {
    version: 1,
    id: randomUUID(),
    name: 'Film',
    clips: [
      clip,
      {
        ...clip,
        id: randomUUID(),
        title: 'Second',
        sourceIn: 60,
        sourceOut: 120,
      },
    ],
    updatedAt: 1000,
    size: { width: 720, height: 1280 },
    music: null,
    assetIds: [assetId],
  },
  assets: [{ id: assetId, kind: 'video', frames: 120 }],
})

it('rejects a proposed batch atomically if it edits a shot outside the selection or outside the source', () => {
  const rename = {
    type: 'text' as const,
    shots: [1],
    field: 'title' as const,
    value: 'New',
  }
  expect(() =>
    applyEditorEdits(scene, clip.id, [
      rename,
      { type: 'camera', shots: [2], value: 'push-in' },
    ]),
  ).toThrow()
  expect(() =>
    applyEditorEdits(scene, null, [
      rename,
      { type: 'adjust', shots: [2], field: 'durationSeconds', value: 10 },
    ]),
  ).toThrow()
  expect(scene.project.clips[0]?.title).toBe('First')
})
it('plays contiguous source frames through the shot boundary with independent caption timing', () => {
  const original = composeEditor(scene, () => 'movie.webm')
  expect(original.match(/<video /g)).toHaveLength(1)
  expect(original).toContain('data-start="0" data-duration="4"')
  expect(original.match(/class="clip caption/g)).toHaveLength(2)
  const edited = applyEditorEdits(scene, clip.id, [
    { type: 'camera', shots: [1], value: 'push-in' },
  ])
  expect(edited).not.toBeNull()
  const output = composeEditor(
    { ...scene, project: edited ?? scene.project },
    () => 'movie.webm',
  )
  expect(output.match(/<video /g)).toHaveLength(2)
  expect(output).toContain(`tl.fromTo("#visual-${clip.id}"`)
})
