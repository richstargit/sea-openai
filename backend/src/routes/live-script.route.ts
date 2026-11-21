import { Router } from 'express'

import * as live from '@/controllers/live-script.controller.js'
import { createRateLimiter } from '@/middlewares/rate-limit.middleware.js'
import { expensive } from '@/routes/hook-machine.route.js'

const router = Router()

// Writing a whole run of show costs several model calls. Replies are small
// and come in bursts while the stream is on, so they get a looser limit.
const reply = createRateLimiter(240, 15 * 60 * 1000)
// Starting a session or minting a new secret is cheap but not free.
const listen = createRateLimiter(120, 15 * 60 * 1000)
// A seller's browser may send a result every second or two for hours.
const utterance = createRateLimiter(4000, 15 * 60 * 1000)

// Mounted under /agent/live-script, so main's origin check and login apply.
router.get('/options', live.options)
router.get('/shows', live.listShows)
router.post('/shows', expensive, live.createShow)
router.get('/shows/:id', live.getShow)
router.delete('/shows/:id', live.removeShow)
router.post('/shows/:id/reply', reply, live.replyToComment)
router.post('/shows/:id/session', listen, live.startSessionHandler)
router.post('/sessions/:sessionId/secret', listen, live.refreshSecretHandler)
router.post('/sessions/:sessionId/utterance', utterance, live.utteranceHandler)
router.delete('/sessions/:sessionId', live.endSessionHandler)

export default router
