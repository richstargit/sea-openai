import { model, Schema } from 'mongoose'

// A shop's live catalog: one document per product code, photos stored in agent_files.
export const LiveProduct = model(
  'LiveProduct',
  new Schema(
    {
      _id: { type: String, required: true },
      userId: { type: String, required: true, index: true },
      code: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String, required: true },
      distinct: { type: String, default: '' },
      price: { type: Number, required: true },
      imageIds: { type: [String], default: [] },
    },
    { collection: 'live_products', versionKey: false, timestamps: true },
  ).index({ userId: 1, code: 1 }, { unique: true }),
)
