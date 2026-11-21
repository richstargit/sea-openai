import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'
import mongoose from 'mongoose'
import { Account, Session } from '@/models/auth.model.js'
import { mongo } from '@/models/mongo.js'
import { AppError } from '@/services/error.service.js'

export const SESSION_MS = 7 * 24 * 60 * 60 * 1000
export type AuthUser = { id: string; email: string }
function hashPassword(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(salt, 'hex'),
      64,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    )
  })
}

function sessionId(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export async function register(
  email: string,
  password: string,
): Promise<AuthUser> {
  await mongo(() => Account.init())
  const salt = randomBytes(16).toString('hex')
  const account = {
    _id: randomUUID(),
    email,
    salt,
    passwordHash: (await hashPassword(password, salt)).toString('hex'),
  }
  await mongo(async () => {
    try {
      await Account.create(account)
    } catch (error) {
      if (
        error instanceof mongoose.mongo.MongoServerError &&
        error.code === 11000
      )
        throw new AppError('CONFLICT', { key: 'so-auth-email-in-use' })
      throw error
    }
  })
  return { id: account._id, email }
}

export async function login(
  email: string,
  password: string,
): Promise<AuthUser> {
  const account = await mongo(() => Account.findOne({ email }).lean())
  const actual = await hashPassword(password, account?.salt ?? '00'.repeat(16))
  const expected = account
    ? Buffer.from(account.passwordHash, 'hex')
    : Buffer.alloc(actual.length)
  if (!timingSafeEqual(actual, expected) || !account)
    throw new AppError('UNAUTHORIZED', { key: 'so-auth-invalid-credentials' })
  return { id: account._id, email: account.email }
}

export async function startSession(user: AuthUser) {
  const token = randomBytes(32).toString('base64url')
  await mongo(() =>
    Session.create({
      _id: sessionId(token),
      user,
      expiresAt: new Date(Date.now() + SESSION_MS),
    }),
  )
  return token
}

export async function sessionUser(token: string): Promise<AuthUser> {
  const session = await mongo(() =>
    Session.findOne({
      _id: sessionId(token),
      expiresAt: { $gt: new Date() },
    }).lean(),
  )
  if (!session?.user?.id || !session.user.email)
    throw new AppError('UNAUTHORIZED', { key: 'so-auth-session-invalid' })
  return { id: session.user.id, email: session.user.email }
}

export async function endSession(token: string) {
  await mongo(() => Session.deleteOne({ _id: sessionId(token) }))
}
