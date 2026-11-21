import { createHash } from 'node:crypto'
import type { RequestHandler } from 'express'
import { z } from 'zod'
import { loggedInUser } from '@/controllers/auth.controller.js'
import { EditorChunk, EditorProject } from '@/models/editor.model.js'
import { mongo } from '@/models/mongo.js'
import {
  chunkHash,
  editorEditRequest,
  editorSave,
} from '@/schemas/editor.schema.js'
import { AppError } from '@/services/error.service.js'
import { planEditorEdit } from '@/services/video/editor-edits.js'

export const proposeEditorEdit: RequestHandler = async (req, res) => {
  const userId = loggedInUser(res).id
  const key = { _id: `${userId}:${z.uuid().parse(req.params.id)}`, userId }
  const request = editorEditRequest.parse(req.body)
  const record = await mongo(() =>
    EditorProject.findOne(key, 'project assets revision').lean(),
  )
  if (!record) throw new AppError('NOT_FOUND', { key: 'so-editor-project' })
  const conflict = () =>
    new AppError('CONFLICT', {
      key: 'so-editor-revision',
      message: 'This project changed. Reopen it and try the edit again.',
    })
  if (record.revision !== request.revision) throw conflict()
  const controller = new AbortController()
  res.once('close', () => controller.abort())
  const result = await planEditorEdit(
    record,
    request,
    AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
  )
  if (
    !(await mongo(() =>
      EditorProject.exists({ ...key, revision: request.revision }),
    ))
  )
    throw conflict()
  res.set('Cache-Control', 'private, no-store').json(result)
}

export const editorSession: RequestHandler = (req, res, next) => {
  if (req.get('x-editor-account') !== loggedInUser(res).id)
    throw new AppError('FORBIDDEN', { key: 'so-editor-session-changed' })
  next()
}
export const writeChunk: RequestHandler = async (req, res) => {
  const userId = loggedInUser(res).id
  const hash = chunkHash.parse(req.params.hash)
  if (
    !Buffer.isBuffer(req.body) ||
    createHash('sha256').update(req.body).digest('hex') !== hash
  )
    throw new AppError('BAD_REQUEST', { key: 'so-editor-chunk' })
  await mongo(() =>
    EditorChunk.updateOne(
      { _id: `${userId}:${hash}`, userId },
      { $setOnInsert: { bytes: req.body } },
      { upsert: true },
    ),
  )
  res.sendStatus(204)
}
export const readChunk: RequestHandler = async (req, res) => {
  const userId = loggedInUser(res).id
  const found = await mongo(() =>
    EditorChunk.findOne({
      _id: `${userId}:${chunkHash.parse(req.params.hash)}`,
      userId,
    }),
  )
  if (!found) throw new AppError('NOT_FOUND', { key: 'so-editor-chunk' })
  res.type('application/octet-stream').send(Buffer.from(found.bytes))
}
export const listEditorProjects: RequestHandler = async (_req, res) => {
  const rows = await mongo(() =>
    EditorProject.find({ userId: loggedInUser(res).id }, 'project')
      .sort({ 'project.updatedAt': -1 })
      .lean(),
  )
  res.json(rows.map((row) => row.project))
}
export const readEditorProject: RequestHandler = async (req, res) => {
  const userId = loggedInUser(res).id
  const found = await mongo(() =>
    EditorProject.findOne(
      { _id: `${userId}:${z.uuid().parse(req.params.id)}`, userId },
      'project assets revision -_id',
    ).lean(),
  )
  if (!found) throw new AppError('NOT_FOUND', { key: 'so-editor-project' })
  res.json(found)
}
export const writeEditorProject: RequestHandler = async (req, res) => {
  const userId = loggedInUser(res).id
  const id = z.uuid().parse(req.params.id)
  const { project, assets, revision } = editorSave.parse(req.body)
  const required = new Set([
    ...project.assetIds,
    ...project.clips.map((c) => c.assetId),
    ...(project.music ? [project.music.assetId] : []),
  ])
  const assetIds = new Set(assets.map((a) => a.id))
  if (
    project.id !== id ||
    assetIds.size !== assets.length ||
    [...required].some((key) => !assetIds.has(key))
  )
    throw new AppError('BAD_REQUEST', { key: 'so-editor-project-assets' })
  const hashes = [...new Set(assets.flatMap((asset) => asset.chunks))].map(
    (hash) => `${userId}:${hash}`,
  )
  const count = await mongo(() =>
    EditorChunk.countDocuments({ userId, _id: { $in: hashes } }),
  )
  if (count !== hashes.length)
    throw new AppError('BAD_REQUEST', { key: 'so-editor-missing-media' })
  const key = { _id: `${userId}:${id}`, userId }
  const writeId = createHash('sha256')
    .update(JSON.stringify({ project, assets, revision }))
    .digest('hex')
  const saved = {
    project: { ...project, updatedAt: Date.now() },
    assets,
    revision: revision + 1,
    writeId,
  }
  let updated: boolean
  if (revision === 0) {
    const inserted = await mongo(() =>
      EditorProject.updateOne(key, { $setOnInsert: saved }, { upsert: true }),
    )
    updated = inserted.upsertedCount === 1
  } else {
    const result = await mongo(() =>
      EditorProject.updateOne({ ...key, revision }, { $set: saved }),
    )
    updated = result.modifiedCount === 1
  }
  if (
    !updated &&
    !(await mongo(() =>
      EditorProject.exists({ ...key, writeId, revision: revision + 1 }),
    ))
  )
    throw new AppError('CONFLICT', {
      key: 'so-editor-revision',
      message:
        'This project changed in another tab. Reload to open the latest version.',
    })
  res.json({ revision: revision + 1 })
}
