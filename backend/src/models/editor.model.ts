import { model, Schema } from 'mongoose'
import type { z } from 'zod'
import type { editorSave } from '@/schemas/editor.schema.js'

type EditorDocument = z.infer<typeof editorSave> & {
  _id: string
  userId: string
  writeId: string
}
const projectSchema = new Schema<EditorDocument>(
  {
    _id: String,
    userId: { type: String, required: true },
    revision: Number,
    writeId: String,
    project: Schema.Types.Mixed,
    assets: [Schema.Types.Mixed],
  },
  { collection: 'editor_projects', versionKey: false },
)
projectSchema.index({ userId: 1, 'project.updatedAt': -1 })
export const EditorProject = model('EditorProject', projectSchema)
export const EditorChunk = model(
  'EditorChunk',
  new Schema(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true },
      bytes: { type: Buffer, required: true },
    },
    { collection: 'editor_media_chunks', versionKey: false },
  ),
)
