import { model, Schema } from 'mongoose'

export const StoredFile = model(
  'AgentFile',
  new Schema(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true },
      name: { type: String, required: true },
      video: { type: Boolean, default: false },
      bytes: { type: Buffer, default: () => Buffer.alloc(0) },
    },
    { collection: 'agent_files', versionKey: false },
  ),
)

export const Workspace = model(
  'AgentWorkspace',
  new Schema(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true },
      threadId: { type: String, required: true },
      files: {
        type: [
          new Schema(
            {
              path: { type: String, required: true },
              data: { type: String, default: '' },
            },
            { _id: false },
          ),
        ],
        default: [],
      },
    },
    { collection: 'agent_workspaces', versionKey: false },
  ),
)
