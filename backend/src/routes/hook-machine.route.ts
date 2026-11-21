import { Router } from 'express'

import * as hm from '@/controllers/hook-machine.controller.js'
import { createRateLimiter } from '@/middlewares/rate-limit.middleware.js'

const router = Router()

// Starting a job costs real model calls, so those routes get a tighter limit.
export const expensive = createRateLimiter(30, 15 * 60 * 1000)

router.get('/capabilities', hm.capabilities)
router.get('/voice/options', hm.voiceOptions)

router.get('/profiles', hm.listProfiles)
router.post('/profiles', hm.createProfile)
router.get('/profiles/:id', hm.getProfile)
router.patch('/profiles/:id', hm.renameProfile)
router.delete('/profiles/:id', hm.deleteProfile)
router.post('/profiles/:id/sources', hm.addSources)
router.delete('/profiles/:id/sources/:sourceId', hm.removeSource)
router.post('/profiles/:id/analyze', expensive, hm.analyzeProfile)

router.get('/profiles/:id/projects', hm.listProjects)
router.post('/profiles/:id/projects', expensive, hm.createProject)
router.get('/projects/:id', hm.getProject)
router.post('/projects/:id/hook', expensive, hm.chooseHook)
router.post('/projects/:id/grade', expensive, hm.gradeHook)
router.post('/projects/:id/voice', expensive, hm.createVoice)
router.get('/projects/:id/voice/takes/:takeId/audio', hm.takeAudio)
router.post('/projects/:id/voice/takes/:takeId/rating', hm.rateTake)

export default router
