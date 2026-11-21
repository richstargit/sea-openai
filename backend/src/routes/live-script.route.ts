import { Router } from 'express'

import * as live from '@/controllers/live-script.controller.js'
import { createRateLimiter } from '@/middlewares/rate-limit.middleware.js'
import { expensive } from '@/routes/hook-machine.route.js'

const router = Router()

// Writing a whole run of show costs several model calls. Replies are small
// and come in bursts while the stream is on, so they get a looser limit.
const reply = createRateLimiter(240, 15 * 60 * 1000)

// Mounted under /agent/live-script, so main's origin check and login apply.
router.get('/options', live.options)
router.get('/shows', live.listShows)
router.post('/shows', expensive, live.createShow)
router.get('/shows/:id', live.getShow)
router.delete('/shows/:id', live.removeShow)
router.post('/shows/:id/reply', reply, live.replyToComment)

export default router
