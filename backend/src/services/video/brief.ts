import { z } from 'zod'
export const briefSchema = z.strictObject({
  title: z.string().trim().min(1).max(56),
  subtitle: z.string().trim().max(72),
  color: z.enum(['mint', 'coral', 'gold', 'violet']),
  motion: z.enum(['slide', 'pulse', 'wipe']),
  subject: z.enum(['none', 'box', 'cylinder', 'torus']),
  format: z.enum(['overlay', 'portrait']),
})
export type VideoBrief = z.infer<typeof briefSchema>
export const colors = {
  mint: '#8DF7C0',
  coral: '#FF846C',
  gold: '#FFD46D',
  violet: '#B7A5FF',
}
