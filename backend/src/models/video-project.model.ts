import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { GridFSBucket, ObjectId } from 'mongodb'
import { model, Schema } from 'mongoose'
import { connectMongo } from '@/models/mongo.js'
import { AppError } from '@/services/error.service.js'

const Project = model(
  'VideoProduction',
  new Schema(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true, index: true },
      title: String,
      revision: { type: Number, required: true },
      archive: { type: Schema.Types.ObjectId, required: true },
      runId: String,
      toolsUsed: [String],
    },
    { timestamps: true, collection: 'video_productions', versionKey: false },
  ),
)

async function storage() {
  const db = (await connectMongo()).connection.db
  if (!db) throw new Error('Video storage unavailable')
  return new GridFSBucket(db, { bucketName: 'video_sources' })
}

export async function readVideoProject(
  userId: string,
  id: string,
  required = true,
) {
  const project = await Project.findOne({ _id: id, userId }).lean()
  if (!project) {
    if (required)
      throw new AppError('NOT_FOUND', { key: 'so-video-project-missing' })
    return null
  }
  const bucket = await storage()
  const chunks: Buffer[] = []
  for await (const part of bucket.openDownloadStream(
    new ObjectId(project.archive.toString()),
  ))
    chunks.push(part)
  return {
    revision: project.revision,
    archive: Buffer.concat(chunks),
    runId: project.runId,
    toolsUsed: project.toolsUsed,
  }
}

export async function storeVideoProject(
  userId: string,
  id: string,
  revision: number,
  title: string,
  archive: Buffer,
  toolsUsed: string[],
  runId?: string,
) {
  const bucket = await storage()
  const upload = bucket.openUploadStream('project.tar.gz', {
    metadata: { userId, projectId: id, revision: revision + 1 },
  })
  await pipeline(Readable.from([archive]), upload)
  try {
    const item = {
      userId,
      title,
      archive: upload.id,
      revision: revision + 1,
      runId,
      toolsUsed,
    }
    if (revision === 0) await Project.create({ _id: id, ...item })
    else {
      const previous = await Project.findOneAndUpdate(
        { _id: id, userId, revision },
        { $set: item },
        { returnDocument: 'before' },
      ).lean()
      if (!previous)
        throw new AppError('CONFLICT', { key: 'so-video-project-changed' })
      await bucket
        .delete(new ObjectId(previous.archive.toString()))
        .catch(() => undefined)
    }
  } catch (error) {
    await bucket.delete(upload.id)
    throw error
  }
}
