import { z } from 'zod'
import { AGENT_CHAT_PATH, AGENT_THREADS_PATH } from '@/constants/agent.js'
import { credentials, registration } from '@/controllers/auth.controller.js'
import type { Annotations } from '@/docs/introspect.js'
import { agentChatSchema, agentMessageSchema } from '@/schemas/agent.schema.js'
import { filename } from '@/services/agent-tools/files.js'

const agentStream = {
  200: {
    description: 'Streams thread, plan, step, verify, done, and error events.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  },
}

export const ANNOTATIONS: Annotations = {
  'GET /agent/editor/projects': {
    tags: ['Editor'],
    secured: true,
    summary: 'List account projects',
  },
  'GET /agent/editor/projects/:id': {
    tags: ['Editor'],
    secured: true,
    summary: 'Read a timeline and its media manifest',
  },
  'PUT /agent/editor/projects/:id': {
    tags: ['Editor'],
    secured: true,
    summary: 'Save a project revision',
    errors: [409],
  },
  'GET /agent/editor/chunks/:hash': {
    tags: ['Editor'],
    secured: true,
    summary: 'Download an account media chunk',
  },
  'PUT /agent/editor/chunks/:hash': {
    tags: ['Editor'],
    secured: true,
    summary: 'Store a verified media chunk',
  },
  'GET /': {
    tags: ['Service'],
    summary: 'Service identity',
    description: 'Returns the service name and version.',
  },
  'GET /health': {
    tags: ['Service'],
    summary: 'Health check',
    description:
      'Lightweight liveness endpoint. Add dependency readiness checks separately when the service gains required dependencies.',
  },
  'POST /agent/files': {
    tags: ['Agent'],
    secured: true,
    summary: 'Upload an agent attachment',
    errors: [400, 413, 429],
    querySchema: z.object({ name: filename }),
    bodySchema: z.string().meta({ format: 'binary' }),
    contentType: 'application/octet-stream',
    description:
      'Send up to 8 MiB as application/octet-stream. Pass the filename in the name query parameter. Attach the returned file ID using the files field.',
    responses: { 201: { description: 'File ID, name and download URL.' } },
  },
  'GET /agent/files/:id': {
    tags: ['Agent'],
    secured: true,
    summary: 'Download an uploaded or exported file',
    responses: { 200: { description: 'File bytes.' } },
  },
  'POST /auth/register': {
    tags: ['Auth'],
    summary: 'Register an account and start a session',
    bodySchema: registration,
    responses: {
      201: { description: 'Account created and session cookie set.' },
    },
    errors: [409, 429],
  },
  'POST /auth/login': {
    tags: ['Auth'],
    summary: 'Sign in and start a session',
    bodySchema: credentials,
    errors: [401, 429],
  },
  'GET /auth/me': {
    tags: ['Auth'],
    summary: 'Get the signed-in account',
    secured: true,
  },
  'POST /auth/logout': {
    tags: ['Auth'],
    summary: 'Revoke the current session',
    secured: true,
    responses: { 204: { description: 'Session revoked.' } },
  },
  'POST /agent/skills': {
    tags: ['Agent'],
    secured: true,
    summary: 'Add a personal video style from SKILL.md',
  },
  'POST /agent/overlay/link': {
    tags: ['Overlay'],
    secured: true,
    summary: 'Issue a read-only OBS link and revoke its predecessor',
  },
  'POST /agent/overlay/events': {
    tags: ['Overlay'],
    secured: true,
    summary: 'Publish a graphic to this account’s connected overlays',
  },
  'GET /overlay/media/:id': {
    tags: ['Overlay'],
    summary: 'Read a generated clip with an overlay bearer token',
  },
  'GET /overlay/gsap.js': {
    tags: ['Overlay'],
    summary: 'Preloaded animation library',
  },
  'GET /agent/skills': {
    tags: ['Agent'],
    secured: true,
    summary: 'List available skills',
    description: 'Returns skill names, descriptions, and invocation flags.',
  },
  [`POST ${AGENT_CHAT_PATH}`]: {
    tags: ['Agent'],
    secured: true,
    summary: 'Run an agent turn',
    description:
      'Returns a reply and the names of any skills loaded. Send prior messages to continue the conversation.',
    bodySchema: agentChatSchema,
    errors: [400, 404, 429, 503],
    examples: {
      explicitSkill: {
        value: {
          message: '/motion-graphics Make a price reveal video for ฿299.',
        },
      },
    },
  },
  [`POST ${AGENT_THREADS_PATH}`]: {
    tags: ['Agent'],
    secured: true,
    summary: 'Start a saved agent thread',
    bodySchema: agentMessageSchema,
    responses: agentStream,
    errors: [429, 503],
  },
  [`GET ${AGENT_THREADS_PATH}/:id`]: {
    tags: ['Agent'],
    secured: true,
    summary: 'Read conversation and saved run status',
    errors: [422, 429, 503],
  },
  [`POST ${AGENT_THREADS_PATH}/:id/messages`]: {
    tags: ['Agent'],
    secured: true,
    summary: 'Run the next turn in a saved thread',
    bodySchema: agentMessageSchema,
    responses: agentStream,
    errors: [409, 429, 503],
  },
  [`POST ${AGENT_THREADS_PATH}/:id/resume`]: {
    tags: ['Agent'],
    secured: true,
    summary: 'Resume from the last checkpoint',
    responses: agentStream,
    errors: [409, 422, 429, 503],
  },
}
