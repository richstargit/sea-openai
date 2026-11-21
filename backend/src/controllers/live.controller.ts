import type { RequestHandler } from 'express'
import { decide, decideBody, kitBody, motionKit, planBody, planLive } from '@/services/live/director.js'

const timeout = (ms: number) => AbortSignal.timeout(ms)

export const livePlan: RequestHandler = async (request, response) => {
  response.json(await planLive(planBody.parse(request.body), timeout(120_000)))
}
export const liveMotionKit: RequestHandler = async (request, response) => {
  response.json(await motionKit(kitBody.parse(request.body), timeout(60_000)))
}
export const liveDecide: RequestHandler = async (request, response) => {
  response.json(await decide(decideBody.parse(request.body), timeout(15_000)))
}
