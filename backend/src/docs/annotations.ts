import { z } from 'zod'
import { AGENT_CHAT_PATH, AGENT_THREADS_PATH } from '@/constants/agent.js'
import { credentials, registration } from '@/controllers/auth.controller.js'
import {
  addSourcesBody,
  analyzeBody,
  createProfileBody,
  createProjectBody,
  hookBody,
  ratingBody,
  renameBody,
  voiceBody,
  voiceOptionsQuery,
} from '@/controllers/hook-machine.controller.js'
import { createVideoBody } from '@/controllers/video-job.controller.js'
import type { Annotations } from '@/docs/introspect.js'
import { agentChatSchema, agentMessageSchema } from '@/schemas/agent.schema.js'
import {
  editorComposition,
  editorEditRequest,
  editorExportRevision,
} from '@/schemas/editor.schema.js'
import { filename } from '@/services/agent-tools/files.js'

const agentStream = {
  200: {
    description: 'Streams thread, plan, step, verify, done, and error events.',
    content: { 'text/event-stream': { schema: { type: 'string' } } },
  },
}

const HM = '/agent/hook-machine'
const TAG = ['Hook Machine']

export const ANNOTATIONS: Annotations = {
  'GET /agent/hyperframes/runtime.js': {
    tags: ['Editor'],
    secured: true,
    summary: 'Load the HyperFrames runtime for the editor',
  },
  'GET /agent/hyperframes/gsap.js': {
    tags: ['Editor'],
    secured: true,
    summary: 'Load the timeline animation library',
  },
  'POST /agent/editor/projects/:id/edits': {
    tags: ['Editor'],
    secured: true,
    summary: 'Propose edits to the current account’s video timeline',
    bodySchema: editorEditRequest,
  },
  'POST /agent/editor/preview': {
    tags: ['Editor'],
    secured: true,
    summary: 'Compile the editor timeline for preview',
    bodySchema: editorComposition,
  },
  'POST /agent/editor/projects/:id/export': {
    tags: ['Editor'],
    secured: true,
    summary: 'Render a saved HyperFrames timeline to MP4',
    bodySchema: editorExportRevision,
    errors: [404, 409, 503],
    responses: {
      200: {
        description: 'H.264 video with optional AAC audio',
        content: {
          'video/mp4': { schema: { type: 'string', format: 'binary' } },
        },
      },
    },
  },
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

  [`GET ${HM}/capabilities`]: {
    tags: TAG,
    secured: true,
    summary: 'Which tools are ready',
    description:
      'Reports whether Agent-Reach, yt-dlp, ffmpeg and the OpenAI key are available, and whether demo mode is on.',
  },
  [`GET ${HM}/profiles`]: {
    tags: TAG,
    secured: true,
    summary: 'List style profiles',
  },
  [`POST ${HM}/profiles`]: {
    tags: TAG,
    secured: true,
    summary: 'Create an empty style profile',
    bodySchema: createProfileBody,
  },
  [`GET ${HM}/profiles/:id`]: {
    tags: TAG,
    secured: true,
    summary: 'Get a profile with its sources, insights and rubric',
    description: 'Poll this while status is "running" to follow progress.',
  },
  [`PATCH ${HM}/profiles/:id`]: {
    tags: TAG,
    secured: true,
    summary: 'Rename a style profile',
    bodySchema: renameBody,
  },
  [`DELETE ${HM}/profiles/:id`]: {
    tags: TAG,
    secured: true,
    summary: 'Delete a style profile with its scripts and audio',
    description:
      'Removes the profile, every script written with it and their voice takes. Refused with 409 while the profile or one of its scripts is still working.',
    errors: [409],
  },
  [`POST ${HM}/profiles/:id/sources`]: {
    tags: TAG,
    secured: true,
    summary: 'Add reference video links',
    description:
      'Accepts YouTube, TikTok and Instagram links. Other links are returned in "rejected".',
    bodySchema: addSourcesBody,
    errors: [400],
  },
  [`DELETE ${HM}/profiles/:id/sources/:sourceId`]: {
    tags: TAG,
    secured: true,
    summary: 'Remove a reference video',
    description:
      'Refused with 409 while the profile is analysing. Removing a clip the style was built from sets the profile back to draft, so it is analysed again before the next script.',
    errors: [409],
  },
  [`POST ${HM}/profiles/:id/analyze`]: {
    tags: TAG,
    secured: true,
    summary: 'Analyze the reference videos and build the profile',
    description:
      'Starts a background job (202). Collects each video with Agent-Reach or yt-dlp, reads the first 10 seconds with a vision model, extracts hooks, then builds the format library and grading rubric. Only clips that are not done yet are read, unless the body sets redo to true, which reads every clip again.',
    bodySchema: analyzeBody,
    errors: [400, 409, 429, 503],
  },
  [`GET ${HM}/profiles/:id/projects`]: {
    tags: TAG,
    secured: true,
    summary: 'List scripts made with this profile',
  },
  [`POST ${HM}/profiles/:id/projects`]: {
    tags: TAG,
    secured: true,
    summary: 'Turn a product into a full script',
    description:
      'Starts a background job (202): reads the photos, researches the product with Agent-Reach, writes graded hooks, then a timed script.',
    bodySchema: createProjectBody,
    errors: [400, 429],
  },
  [`GET ${HM}/projects/:id`]: {
    tags: TAG,
    secured: true,
    summary: 'Get a script project',
    description: 'Poll this while status is "running".',
  },
  [`POST ${HM}/projects/:id/hook`]: {
    tags: TAG,
    secured: true,
    summary: 'Pick a hook and rewrite the script around it',
    bodySchema: hookBody,
    errors: [409, 429],
  },
  [`POST ${HM}/projects/:id/grade`]: {
    tags: TAG,
    secured: true,
    summary: 'Grade your own hook and get three rewrites',
    bodySchema: hookBody,
    errors: [400, 429],
  },
  [`GET ${HM}/voice/options`]: {
    tags: TAG,
    secured: true,
    summary: 'Voice models, voices, languages and delivery styles',
    description:
      'Everything the voice picker needs, with the defaults (English, gpt-4o-mini-tts, marin) and the notice that OpenAI retires the speech endpoint on 2027-01-06. Pass projectId to also get suggested delivery styles that sound close to how that script style speaks.',
    querySchema: voiceOptionsQuery,
  },
  [`POST ${HM}/projects/:id/voice`]: {
    tags: TAG,
    secured: true,
    summary: 'Read the finished script aloud in several styles',
    description:
      'Starts a background job (202). Translates the script when the language differs, makes one take per style, transcribes each take and scores it. Poll the project and read voice.takes.',
    bodySchema: voiceBody,
    errors: [400, 409, 429, 503],
  },
  [`GET ${HM}/projects/:id/voice/takes/:takeId/audio`]: {
    tags: TAG,
    secured: true,
    summary: 'Audio file of one take',
    description:
      'A wav marked as AI generated speech (X-AI-Generated-Voice header, ai-voice in the file name). Add ?download=1 to force a download.',
  },
  [`POST ${HM}/projects/:id/voice/takes/:takeId/rating`]: {
    tags: TAG,
    secured: true,
    summary: 'Save your own star rating for a take',
    bodySchema: ratingBody,
  },
  [`POST ${HM}/videos`]: {
    tags: TAG,
    secured: true,
    summary: 'Make a finished video with the voice attached, in one request',
    description:
      'Starts one background job (202): reads the photo and brief, researches the product, writes the script around the best hook, speaks it in one voice take, and renders an MP4 with captions in the shape asked for (aspect 9:16 by default, 4:5, 1:1 or 16:9; 1080x1920, 1080x1350, 1080x1080 or 1920x1080 at 30 fps, a third of that size in demo mode). width and height in the video tell the real pixel size. Poll GET videos/:id. One running video per account (409), and the server runs at most two at once (503).',
    bodySchema: createVideoBody,
    errors: [400, 404, 409, 429, 503],
  },
  [`GET ${HM}/videos`]: {
    tags: TAG,
    secured: true,
    summary: 'Your latest videos, newest first',
    description: 'At most 30. Each item has the same shape as a single video.',
  },
  [`GET ${HM}/videos/:id`]: {
    tags: TAG,
    secured: true,
    summary: 'One video job',
    description:
      'Poll while status is "running". step goes brief, research, hooks, script, voice, compose (stepIndex 1 to 6 of 6). When ready, file.url points at the MP4.',
  },
  [`GET ${HM}/videos/:id/file`]: {
    tags: TAG,
    secured: true,
    summary: 'The finished MP4',
    description:
      'Supports Range requests. Marked as AI generated voice (X-AI-Generated-Voice header, ai-voice in the file name). Add ?download=1 to force a download. 404 until the video is ready.',
    responses: { 200: { description: 'MP4 bytes.' } },
  },
  [`DELETE ${HM}/videos/:id`]: {
    tags: TAG,
    secured: true,
    summary: 'Delete a video and its files',
    errors: [409],
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
  'POST /agent/live/plan': {
    tags: ['Live'],
    secured: true,
    summary: 'Plan a live show: one scripted segment per lineup product with overlay cues',
  },
  'POST /agent/live/motion-kit': {
    tags: ['Live'],
    secured: true,
    summary: "Pick the shop's motion kit: colours, tag style and a preset for every live moment",
  },
  'GET /agent/live/products': { tags: ['Live'], secured: true, summary: "List the account's live catalog" },
  'POST /agent/live/products': { tags: ['Live'], secured: true, summary: 'Add a product with 1-3 photos (mirrored to the detection service)' },
  'POST /agent/live/products/sync': { tags: ['Live'], secured: true, summary: 'Mirror the whole catalog to the detection service again' },
  'PATCH /agent/live/products/:code': { tags: ['Live'], secured: true, summary: 'Edit a product; new photos replace the old ones' },
  'DELETE /agent/live/products/:code': { tags: ['Live'], secured: true, summary: 'Delete a product and its photos' },
  'GET /agent/live/photos/:id': { tags: ['Live'], secured: true, summary: 'A product photo for its owner' },
  'POST /agent/live/decide': {
    tags: ['Live'],
    secured: true,
    summary: 'Realtime director decision from a frame and recent speech (Decisions API)',
  },
  'GET /agent/overlay/status': {
    tags: ['Overlay'],
    secured: true,
    summary: 'Count connected overlay sources for the signed-in account',
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
  'POST /agent/overlay/motion': {
    tags: ['Overlay'],
    secured: true,
    summary:
      'Queue a freshly designed HyperFrames motion; it plays on connected overlays when rendered',
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
    description:
      'Returns video skills, Blender availability, enabled video tools and optional provider requirements.',
  },
  [`POST ${AGENT_CHAT_PATH}`]: {
    tags: ['Agent'],
    secured: true,
    summary: 'Run an agent turn',
    description:
      'Returns the generated file, skills and tools used. A standalone production also returns projectId. Send that ID with a new brief to revise the same production.',
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
