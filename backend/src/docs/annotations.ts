import {
  addSourcesBody,
  createProfileBody,
  createProjectBody,
  hookBody,
  ratingBody,
  voiceBody,
} from '@/controllers/hook-machine.controller.js'
import type { Annotations } from '@/docs/introspect.js'

const HM = '/api/hook-machine'
const TAG = ['Hook Machine']

export const ANNOTATIONS: Annotations = {
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
    summary: 'Which tools are ready',
    description:
      'Reports whether Agent-Reach, yt-dlp, ffmpeg and the OpenAI key are available, and whether demo mode is on.',
  },
  [`GET ${HM}/profiles`]: {
    tags: TAG,
    summary: 'List style profiles',
  },
  [`POST ${HM}/profiles`]: {
    tags: TAG,
    summary: 'Create an empty style profile',
    bodySchema: createProfileBody,
  },
  [`GET ${HM}/profiles/:id`]: {
    tags: TAG,
    summary: 'Get a profile with its sources, insights and rubric',
    description: 'Poll this while status is "running" to follow progress.',
  },
  [`POST ${HM}/profiles/:id/sources`]: {
    tags: TAG,
    summary: 'Add reference video links',
    description:
      'Accepts YouTube, TikTok and Instagram links. Other links are returned in "rejected".',
    bodySchema: addSourcesBody,
    errors: [400],
  },
  [`DELETE ${HM}/profiles/:id/sources/:sourceId`]: {
    tags: TAG,
    summary: 'Remove a reference video',
  },
  [`POST ${HM}/profiles/:id/analyze`]: {
    tags: TAG,
    summary: 'Analyze the reference videos and build the profile',
    description:
      'Starts a background job (202). Collects each video with Agent-Reach or yt-dlp, reads the first 10 seconds with a vision model, extracts hooks, then builds the format library and grading rubric.',
    errors: [400, 409, 429, 503],
  },
  [`GET ${HM}/profiles/:id/projects`]: {
    tags: TAG,
    summary: 'List scripts made with this profile',
  },
  [`POST ${HM}/profiles/:id/projects`]: {
    tags: TAG,
    summary: 'Turn a product into a full script',
    description:
      'Starts a background job (202): reads the photos, researches the product with Agent-Reach, writes graded hooks, then a timed script.',
    bodySchema: createProjectBody,
    errors: [400, 429],
  },
  [`GET ${HM}/projects/:id`]: {
    tags: TAG,
    summary: 'Get a script project',
    description: 'Poll this while status is "running".',
  },
  [`POST ${HM}/projects/:id/hook`]: {
    tags: TAG,
    summary: 'Pick a hook and rewrite the script around it',
    bodySchema: hookBody,
    errors: [409, 429],
  },
  [`POST ${HM}/projects/:id/grade`]: {
    tags: TAG,
    summary: 'Grade your own hook and get three rewrites',
    bodySchema: hookBody,
    errors: [400, 429],
  },
  [`GET ${HM}/voice/options`]: {
    tags: TAG,
    summary: 'Voice models, voices, languages and delivery styles',
    description:
      'Everything the voice picker needs, with the defaults (English, gpt-4o-mini-tts, marin) and the notice that OpenAI retires the speech endpoint on 2027-01-06.',
  },
  [`POST ${HM}/projects/:id/voice`]: {
    tags: TAG,
    summary: 'Read the finished script aloud in several styles',
    description:
      'Starts a background job (202). Translates the script when the language differs, makes one take per style, transcribes each take and scores it. Poll the project and read voice.takes.',
    bodySchema: voiceBody,
    errors: [400, 409, 429, 503],
  },
  [`GET ${HM}/projects/:id/voice/takes/:takeId/audio`]: {
    tags: TAG,
    summary: 'Audio file of one take',
    description:
      'A wav marked as AI generated speech (X-AI-Generated-Voice header, ai-voice in the file name). Add ?download=1 to force a download.',
  },
  [`POST ${HM}/projects/:id/voice/takes/:takeId/rating`]: {
    tags: TAG,
    summary: 'Save your own star rating for a take',
    bodySchema: ratingBody,
  },
}
