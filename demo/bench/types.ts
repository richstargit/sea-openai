import type { Product, Method } from '../common.js'
export type Sample = {
  id: string; image: string; label: string; text: string; held_up?: boolean; scene?: string
}
export type Shop = { name: string; products: Product[]; cases: Sample[] }
export type Frame = {
  shop: string; caseId: string; family: string; label: string; expectedHeld: boolean | null;
  sourceId: string; frame: string; text: string
}
export type Trial = Frame & {
  method: Method; input: 'image' | 'caption'; predicted: string | null; held: boolean | null;
  confidence: number | null; heldP: number | null; scores: {id: string; p: number}[];
  latency: number; error: string | null
}
