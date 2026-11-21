import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { z } from 'zod'
import type { MediaPlan } from '@/services/agent-tools/video-media.js'
import type { SaleFormat } from '@/services/video/sale-formats.js'

const projectRequire = createRequire(resolve('package.json'))
const soundBank = createRequire(
  projectRequire.resolve('hyperframes/package.json'),
)('./dist/skills/media-use/audio/assets/sfx/manifest.json') as Record<
  string,
  { duration: number; description: string }
>
export const soundCueSchema = z.strictObject({
  sound: z.enum(Object.keys(soundBank)),
  position: z.number().min(0).max(0.99),
  volume: z.number().min(0.05).max(0.65),
})
export const soundGuide = Object.entries(soundBank)
  .map(([name, cue]) => `${name} (${cue.duration}s): ${cue.description}`)
  .join('\n')
export const briefSchema = z.strictObject({
  title: z.string().trim().min(1).max(56),
  subtitle: z.string().trim().max(72),
  color: z.enum(['mint', 'coral', 'gold', 'violet']),
  motion: z.enum(['slide', 'pulse', 'wipe']),
  subject: z.enum(['none', 'box', 'cylinder', 'torus']),
  format: z.enum(['overlay', 'portrait']),
})
export const colors = {
  mint: '#8DF7C0',
  coral: '#FF846C',
  gold: '#FFD46D',
  violet: '#B7A5FF',
}

const beatSchema = z.strictObject({
  seconds: z.number().min(1).max(3),
  show: z.string().trim().min(1).max(440),
  say: z.string().trim().max(180),
})
export const storyboardSchema = briefSchema.extend({
  visualMode: z.enum(['hyperframes', 'photographic']),
  look: z.string().trim().min(1).max(700),
  typeface: z.enum(['editorial', 'modern']),
  beats: z.array(beatSchema).min(3).max(8),
})
export type PortraitShot = {
  framing: 'detail' | 'medium' | 'full'
  camera: 'push' | 'pull' | 'pan'
  focusX: number
  focusY: number
  copy: 'none' | 'title' | 'subtitle' | 'lockup'
  placement: 'top' | 'bottom'
  seconds?: number
}
export type VideoBrief = z.infer<typeof briefSchema> & {
  production?: {
    seconds: number
    music?: boolean
    soundEffects?: z.infer<typeof soundCueSchema>[] | null
    voiceover: boolean
    continuous?: boolean
    guidance: string
    shots?: number
  }
  saleFormat?: SaleFormat
  typeface?: 'editorial' | 'modern'
  visualMode?: 'hyperframes' | 'photographic'
  look?: string
  beats?: z.infer<typeof beatSchema>[]
  media?: MediaPlan
  shots?: PortraitShot[]
}
