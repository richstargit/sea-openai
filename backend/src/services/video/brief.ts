import { z } from 'zod'
export const briefSchema = z.strictObject({
  title: z.string().trim().min(1).max(56),
  subtitle: z.string().trim().max(72),
  color: z.enum(['mint', 'coral', 'gold', 'violet']),
  motion: z.enum(['slide', 'pulse', 'wipe']),
  subject: z.enum(['none', 'box', 'cylinder', 'torus']),
  format: z.enum(['overlay', 'portrait']),
})
export type VideoBrief = z.infer<typeof briefSchema> &
  Partial<Pick<z.infer<typeof portraitBriefSchema>, 'typeface' | 'shots'>>
export const colors = {
  mint: '#8DF7C0',
  coral: '#FF846C',
  gold: '#FFD46D',
  violet: '#B7A5FF',
}

const shotSchema = z.strictObject({
  framing: z.enum(['detail', 'medium', 'full']),
  camera: z.enum(['push', 'pull', 'pan']),
  focusX: z.number().min(0).max(1),
  focusY: z.number().min(0).max(1),
  copy: z.enum(['title', 'subtitle', 'lockup', 'none']),
  placement: z.enum(['top', 'bottom']),
})
export const portraitBriefSchema = briefSchema.extend({
  typeface: z.enum(['editorial', 'modern']),
  shots: z.array(shotSchema).length(3),
})
export type PortraitShot = z.infer<typeof shotSchema>
