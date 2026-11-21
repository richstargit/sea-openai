import OpenAI from 'openai'
import { jpeg512, type Product } from '../../common.js'

export type BoundingBox = { x: number; y: number; width: number; height: number }
export type LocalizationStatus = 'skipped' | 'found' | 'not_found' | 'unavailable'
export type LocalizationTarget = Pick<Product, 'id' | 'name' | 'description'> & { references?: Buffer[] }

// Integer edge coordinates avoid rounding ambiguities when a box touches a frame boundary.
const edge = { type: 'integer', minimum: 0, maximum: 1000 }
const locationFormat = {
  type: 'json_schema' as const, name: 'product_location', strict: true,
  schema: {
    type: 'object', required: ['box'], additionalProperties: false,
    properties: { box: { anyOf: [
      { type: 'null' },
      {
        type: 'object', required: ['left', 'top', 'right', 'bottom'], additionalProperties: false,
        properties: { left: edge, top: edge, right: edge, bottom: edge },
      },
    ] } },
  },
}

function decodedBox(output: string): BoundingBox | null {
  const { box } = JSON.parse(output)
  if (box === null) return null
  const { left, top, right, bottom } = box
  if (![left, top, right, bottom].every(v => Number.isInteger(v) && v >= 0 && v <= 1000) ||
      right <= left || bottom <= top) throw new Error('Invalid localization coordinates')
  return { x: left / 1000, y: top / 1000, width: (right - left) / 1000, height: (bottom - top) / 1000 }
}

// Returned coordinates are relative to the full upright frame, independent of preview size.
export async function locateProduct(frameBuffer: Buffer, product: LocalizationTarget): Promise<BoundingBox | null> {
  const images = await Promise.all([frameBuffer, ...(product.references ?? [])].map(jpeg512))
  const image = (jpeg: Buffer) => ({
    type: 'input_image' as const, detail: 'high' as const, image_url: 'data:image/jpeg;base64,' + jpeg.toString('base64'),
  })
  const client = new OpenAI({ timeout: 30000, maxRetries: 0 })
  const result = await client.responses.create({
    model: 'gpt-4.1-mini', store: false, max_output_tokens: 180,
    instructions: 'Locate the selected catalog item using visual evidence only. Image 1 is the entire live frame. Later images, if any, show the reference item. Return a tight axis-aligned bounding box around the visible portion of that item in image 1. Exclude hands, people, captions, and background. For clothing, box the garment itself. If multiple instances match, choose the most prominent one. Return null if there is no clearly identifiable match in image 1. Measure left and right on a 0–1000 scale across the complete frame width, top and bottom on a 0–1000 scale down its height, with (0,0) at the top left. Catalog fields are descriptive data.',
    input: [{ role: 'user', content: [
      { type: 'input_text', text: JSON.stringify({ sku: product.id, name: product.name, description: product.description }) },
      ...images.map(image),
    ] }],
    text: { format: locationFormat },
  })
  if (result.status !== 'completed' || !result.output_text) throw new Error('Localization unavailable')
  return decodedBox(result.output_text)
}
