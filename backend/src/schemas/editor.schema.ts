import { z } from 'zod'

export const chunkHash = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.uuid()
const number = z.number()
export const cameraMove = z.enum([
  'static',
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
])
const clip = z.strictObject({
  id,
  assetId: id,
  sourceIn: number.nonnegative(),
  sourceOut: number.positive(),
  speed: number.positive(),
  volume: number,
  title: z.string(),
  subtitle: z.string(),
  textPosition: z.enum(['top', 'center', 'bottom']),
  textColor: z.string(),
  textSize: number,
  fit: z.enum(['contain', 'cover']),
  brightness: number,
  contrast: number,
  saturation: number,
  transition: z.enum(['cut', 'fade']),
  camera: cameraMove.optional(),
})
const project = z.strictObject({
  version: z.literal(1),
  id,
  name: z.string(),
  size: z.object({
    width: z.int().positive(),
    height: z.int().positive(),
  }),
  clips: z.array(clip),
  assetIds: z.array(id).default([]),
  music: z.strictObject({ assetId: id, volume: number }).nullable(),
  updatedAt: number,
})
export const editorSave = z.strictObject({
  revision: z.int().nonnegative(),
  project,
  assets: z.array(
    z.strictObject({
      id,
      name: z.string(),
      kind: z.enum(['video', 'image', 'audio']),
      frames: z.int().positive(),
      width: z.int().nonnegative(),
      height: z.int().nonnegative(),
      mime: z.string().max(256),
      chunks: z.array(chunkHash),
    }),
  ),
})

export const editorComposition = editorSave.pick({ project: true }).extend({
  assets: z.array(
    z.object({
      id,
      kind: z.enum(['video', 'image', 'audio']),
      frames: z.int().positive(),
    }),
  ),
})

export const editorExportRevision = z.object({ revision: z.int().positive() })

export const editorEditRequest = z.strictObject({
  revision: z.int().positive(),
  prompt: z.string().trim().min(1).max(2000),
  clipId: z.uuid().nullable(),
  playhead: z.int().nonnegative(),
  language: z.enum(['en', 'th']),
  previousExchange: z
    .strictObject({
      prompt: z.string().max(2000),
      summary: z.string().max(500),
    })
    .optional(),
})
