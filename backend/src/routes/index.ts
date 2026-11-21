import { resolve } from 'node:path'
import express, { Router, raw } from 'express'
import { checkBrowserOrigin } from '@/config/cors.config.js'
import { serviceConfig } from '@/config/service.config.js'
import { AGENT_CHAT_PATH, AGENT_THREADS_PATH } from '@/constants/agent.js'
import {
  chat,
  postThreadMessage,
  resumeThread,
  showThread,
  startThread,
} from '@/controllers/agent.controller.js'
import {
  downloadAgentFile,
  uploadAgentFile,
} from '@/controllers/agent-file.controller.js'
import {
  logout,
  me,
  requireUser,
  signin,
  signup,
} from '@/controllers/auth.controller.js'
import {
  editorSession,
  listEditorProjects,
  proposeEditorEdit,
  readChunk,
  readEditorProject,
  writeChunk,
  writeEditorProject,
} from '@/controllers/editor.controller.js'
import {
  addSkill,
  overlayLink,
  overlayMedia,
  overlayMotion,
  overlayPublish,
  overlayStatus,
  skills,
} from '@/controllers/video.controller.js'
import {
  apiRateLimiter,
  createRateLimiter,
} from '@/middlewares/rate-limit.middleware.js'
import healthRoutes from '@/routes/health.route.js'
import hookMachineRoutes from '@/routes/hook-machine.route.js'
import liveScriptRoutes from '@/routes/live-script.route.js'
import videoJobRoutes from '@/routes/video-job.route.js'
import { FILE_LIMIT } from '@/services/agent-tools/files.js'
import { editorExport, editorPreview } from '@/services/video/editor-export.js'

const router = Router()

router.get('/', (_request, response) => {
  const service = serviceConfig()
  response.json({
    success: true,
    service: service.name,
    version: service.version,
  })
})

router.use('/health', healthRoutes)
router.use('/auth', checkBrowserOrigin)
const authLimiter = createRateLimiter(20)
router.post('/auth/register', authLimiter, signup)
router.post('/auth/login', authLimiter, signin)
router.get('/auth/me', requireUser, me)
router.post('/auth/logout', requireUser, logout)
router.use('/agent', checkBrowserOrigin, requireUser)
router.get('/agent/hyperframes/runtime.js', (_req, res) =>
  res.sendFile(
    resolve('node_modules/hyperframes/dist/hyperframe.runtime.iife.js'),
  ),
)
router.get('/agent/hyperframes/gsap.js', (_req, res) =>
  res.sendFile(resolve('node_modules/gsap/dist/gsap.min.js')),
)
router.use('/agent/hook-machine', hookMachineRoutes)
router.use('/agent/hook-machine', videoJobRoutes)
router.use('/agent/live-script', liveScriptRoutes)
router.use('/agent/editor', editorSession)
router.post('/agent/editor/projects/:id/edits', proposeEditorEdit)
router.post('/agent/editor/preview', editorPreview)
router.post('/agent/editor/projects/:id/export', editorExport)
router.get('/agent/editor/projects', listEditorProjects)
router.get('/agent/editor/projects/:id', readEditorProject)
router.put('/agent/editor/projects/:id', writeEditorProject)
router.get('/agent/editor/chunks/:hash', readChunk)
router.put(
  '/agent/editor/chunks/:hash',
  raw({ type: 'application/octet-stream', limit: '4mb' }),
  writeChunk,
)
router.post(
  '/agent/files',
  apiRateLimiter,
  raw({ type: 'application/octet-stream', limit: FILE_LIMIT }),
  uploadAgentFile,
)
router.get('/agent/files/:id', apiRateLimiter, downloadAgentFile)
router.get('/agent/skills', skills)
router.post('/agent/skills', apiRateLimiter, addSkill)
router.get('/agent/overlay/status', overlayStatus)
router.post('/agent/overlay/link', apiRateLimiter, overlayLink)
router.post('/agent/overlay/events', apiRateLimiter, overlayPublish)
router.post('/agent/overlay/motion', apiRateLimiter, overlayMotion)
router.get('/overlay/media/:id', overlayMedia)
router.use('/overlay', (_request, response, next) => {
  response.set(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:* ws://localhost:*; img-src 'self' data:; media-src 'self' blob:; object-src 'none'; frame-ancestors 'none'",
  )
  next()
})
router.get('/overlay/gsap.js', (_request, response) =>
  response.sendFile(resolve('node_modules/gsap/dist/gsap.min.js')),
)
router.use(
  '/overlay/sfx',
  express.static(
    resolve('node_modules/hyperframes/dist/skills/media-use/audio/assets/sfx'),
  ),
)
router.use('/overlay', express.static(resolve('public/overlay')))
router.post(AGENT_CHAT_PATH, apiRateLimiter, chat)
router.post(AGENT_THREADS_PATH, apiRateLimiter, startThread)
router.get(`${AGENT_THREADS_PATH}/:id`, apiRateLimiter, showThread)
router.post(
  `${AGENT_THREADS_PATH}/:id/messages`,
  apiRateLimiter,
  postThreadMessage,
)
router.post(`${AGENT_THREADS_PATH}/:id/resume`, apiRateLimiter, resumeThread)

export default router
