import { Router } from 'express'

import * as video from '@/controllers/video-job.controller.js'
import { expensive } from '@/routes/hook-machine.route.js'

const router = Router()

// Mounted under /agent/hook-machine, so main's origin check and login apply.
router.post('/videos', expensive, video.createVideo)
router.get('/videos', video.listVideos)
router.get('/videos/:id', video.getVideo)
router.get('/videos/:id/file', video.videoFile)
router.delete('/videos/:id', video.deleteVideo)

export default router
