import type { RequestHandler } from 'express'
import { z } from 'zod'
import { loggedInUser } from '@/controllers/auth.controller.js'
import { createProduct, deleteProduct, listProducts, productBody, productPatch, productPhoto, syncProducts, updateProduct } from '@/services/live/catalog.js'
import { decide, decideBody, kitBody, motionKit, planBody, planLive } from '@/services/live/director.js'
import { locateBody, locateProduct } from '@/services/live/locate.js'

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
export const liveLocate: RequestHandler = async (request, response) => {
  response.json(await locateProduct(loggedInUser(response).id, locateBody.parse(request.body), timeout(20_000)))
}

const codeParam = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/)
export const liveProducts: RequestHandler = async (_request, response) => {
  response.json(await listProducts(loggedInUser(response).id))
}
export const liveCreateProduct: RequestHandler = async (request, response) => {
  response.status(201).json(await createProduct(loggedInUser(response).id, productBody.parse(request.body)))
}
export const liveUpdateProduct: RequestHandler = async (request, response) => {
  response.json(await updateProduct(loggedInUser(response).id, codeParam.parse(request.params.code), productPatch.parse(request.body)))
}
export const liveDeleteProduct: RequestHandler = async (request, response) => {
  await deleteProduct(loggedInUser(response).id, codeParam.parse(request.params.code))
  response.sendStatus(204)
}
export const liveSyncProducts: RequestHandler = async (_request, response) => {
  response.json(await syncProducts(loggedInUser(response).id))
}
export const livePhoto: RequestHandler = async (request, response) => {
  const { bytes, type } = await productPhoto(loggedInUser(response).id, z.uuid().parse(request.params.id))
  response.set('Cache-Control', 'private, max-age=3600').type(type).send(bytes)
}
