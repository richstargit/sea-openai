import mongoose from 'mongoose'
import { AppError } from '@/services/error.service.js'

let connecting: Promise<typeof mongoose> | undefined

export function connectMongo() {
  connecting ??= mongoose
    .connect(process.env.MONGODB_URI?.trim() || 'mongodb://127.0.0.1:27017', {
      dbName: process.env.MONGODB_DB?.trim() || 'sea_openai',
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
      socketTimeoutMS: 5000,
    })
    .catch((error) => {
      connecting = undefined
      throw new AppError('SERVICE_UNAVAILABLE', {
        key: 'so-mongodb-unavailable',
        cause: error,
      })
    })
  return connecting
}

export async function mongo<T>(operation: () => PromiseLike<T>) {
  await connectMongo()
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof mongoose.mongo.MongoError)) throw error
    throw new AppError('SERVICE_UNAVAILABLE', {
      key: 'so-mongodb-unavailable',
      cause: error,
    })
  }
}

export async function closeMongo() {
  await mongoose.disconnect()
  connecting = undefined
}
