import { z } from 'zod'

import { skillName } from '@/services/skill.service.js'
import { saleFormatIds } from '@/services/video/sale-formats.js'

const message = z.string().trim().min(1).max(12_000)

export const agentMessageSchema = z.strictObject({
  message,
  projectId: z.uuid().optional(),
  outputFormat: z.enum(['portrait', 'overlay']).optional(),
  saleFormat: z.enum(saleFormatIds).optional(),
  skill: skillName.optional(),
  referenceUrl: z
    .url({ protocol: /^https$/ })
    .max(2048)
    .optional(),
  referenceFile: z.uuid().optional(),
  files: z.array(z.uuid()).max(8).optional(),
  webSearch: z.boolean().optional(),
})

export const agentChatSchema = agentMessageSchema.extend({
  history: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        content: message,
      }),
    )
    .max(20)
    .default([]),
})

export type AgentChat = z.infer<typeof agentChatSchema>
export type AgentMessage = z.infer<typeof agentMessageSchema>
