import { model, Schema } from 'mongoose'

export const Account = model(
  'Account',
  new Schema(
    {
      _id: { type: String, required: true },
      email: { type: String, required: true, unique: true },
      overlayHash: { type: String, index: true, sparse: true, select: false },
      salt: { type: String, required: true },
      passwordHash: { type: String, required: true },
    },
    { collection: 'users', versionKey: false },
  ),
)

export const Session = model(
  'AuthSession',
  new Schema(
    {
      _id: { type: String, required: true },
      user: {
        id: { type: String, required: true },
        email: { type: String, required: true },
      },
      expiresAt: { type: Date, required: true, expires: 0 },
    },
    { collection: 'auth_sessions', versionKey: false },
  ),
)
