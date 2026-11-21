import { z } from 'zod'

export const chunkHash = z.string().regex(/^[a-f0-9]{64}$/)
const id = z.uuid()
const number = z.number()
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
