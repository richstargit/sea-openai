import type { CookieOptions, Request, RequestHandler, Response } from 'express'
import { z } from 'zod'
import {
  type AuthUser,
  endSession,
  login,
  register,
  SESSION_MS,
  sessionUser,
  startSession,
} from '@/services/auth.service.js'
import { AppError } from '@/services/error.service.js'

export const credentials = z.strictObject({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  password: z.string().min(1).max(128),
})
export const registration = credentials.extend({
  password: z.string().min(12).max(128),
})
export const cookieName =
  process.env.NODE_ENV === 'production' ? '__Host-so_session' : 'so_session'
const cookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
}

function tokenOf(request: Request) {
  const token = request.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1)
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
    throw new AppError('UNAUTHORIZED', { key: 'so-auth-login-required' })
  return token
}

export const requireUser: RequestHandler = async (request, response, next) => {
  response.set('Cache-Control', 'no-store')
  response.locals.user = await sessionUser(tokenOf(request))
  next()
}

export function loggedInUser(response: Response): AuthUser {
  const user = response.locals.user as AuthUser | undefined
  if (!user)
    throw new AppError('UNAUTHORIZED', { key: 'so-auth-login-required' })
  return user
}

async function sendSession(
  request: Request,
  response: Response,
  user: AuthUser,
  status: number,
) {
  const token = await startSession(user)
  response
    .set('Cache-Control', 'no-store')
    .cookie(cookieName, token, { ...cookieOptions, maxAge: SESSION_MS })
  if (
    request.is('application/x-www-form-urlencoded') &&
    request.accepts(['html', 'json']) === 'html'
  ) {
    response.redirect(303, '/studio')
    return
  }
  response.status(status).json({ user })
}

export const signup: RequestHandler = async (request, response) => {
  const { email, password } = registration.parse(request.body)
  await sendSession(request, response, await register(email, password), 201)
}
export const signin: RequestHandler = async (request, response) => {
  const { email, password } = credentials.parse(request.body)
  await sendSession(request, response, await login(email, password), 200)
}
export const me: RequestHandler = (_request, response) => {
  response.json({ user: loggedInUser(response) })
}
export const logout: RequestHandler = async (request, response) => {
  await endSession(tokenOf(request))
  response.clearCookie(cookieName, cookieOptions)
  if (request.accepts(['json', 'html']) === 'html') {
    response.redirect(303, '/login')
    return
  }
  response.status(204).end()
}
