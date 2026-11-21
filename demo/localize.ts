import type { Product } from './common.js'

export type BoundingBox = { x: number; y: number; width: number; height: number }
export type LocalizationStatus = 'skipped' | 'found' | 'not_found' | 'unavailable'
export type LocalizationTarget = Pick<Product, 'id' | 'name' | 'description'> & { references?: Buffer[] }

export { locateProduct, localizationModel } from './ground-product.js'
