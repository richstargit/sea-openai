// Explicit catalog of selling formats. Each guide is a beat skeleton the
// director follows; facts (prices, dates, codes, claims) still come only from the brief.
export const saleFormats = {
  showcase:
    'Product showcase. Hook on the hero product in the first second, give each key benefit its own beat (2–3 benefits), end on product, name and call to action.',
  promotion:
    'Discount promotion. Open on the offer: the original price struck through, then the new price or percent off. One beat on why it is worth it, one on conditions such as the end date, close with the call to action.',
  flash_sale:
    'Flash sale. Urgent and fast, 1–2 second cuts. Lead with the deal and the time window, show a countdown only with the stated time, mention limited stock only if stated, close on "add to cart now".',
  new_launch:
    'New launch. Tease with a partial reveal, then a full name reveal, then what is new or different, then availability or launch date.',
  bundle:
    'Bundle or buy-one-get-one. Show each item on its own, then assemble the set. Compare the set price with buying separately only when both prices are given. Close on the set.',
  before_after:
    'Before and after. Problem state, then the product in use, then the result, joined with a split screen or wipe. Show only results stated in the brief; no medical or exaggerated claims.',
  how_to:
    'How to use or demo. A short hook, then one numbered step per beat, then a recap and the product.',
  comparison:
    'Comparison. The product against a generic alternative (name a competitor only when supplied), one criterion per beat as clear rows or side-by-side, ending on the product winning on the stated points.',
  review:
    'Reviews and social proof. Quote cards using only reviews, ratings or sales numbers supplied in the brief, never invented testimonials, then the product and call to action.',
  unboxing:
    'Unboxing. The closed package, the opening, contents revealed one by one, a first impression, then the product in hand.',
  ingredients:
    'Ingredients or specs. The hero product, then one ingredient or spec per beat with what it does, taken from the brief, then the product.',
  seasonal:
    'Seasonal or gift campaign, such as Mother’s Day, 11.11, 12.12 or New Year. Theme the look to the occasion, frame the product as a gift, show the offer, close with the call to action.',
  live_teaser:
    'Upcoming live-stream teaser. Announce the live date and time large, preview the deals that will be shown, close on "follow" and "turn on notifications".',
  restock:
    'Back in stock. Open on "back again", show the product and why people wanted it, mention limited quantity only if stated, close with the call to action.',
  voucher:
    'Voucher or free shipping. Show the code or offer very large, how to use it in 1–2 steps, the minimum spend and expiry only if given, close on the code again.',
  ugc: 'Creator-style UGC ad. First-person and handheld in feel, a hook in the first second ("you need this"), quick captions, a personal reason to buy, then the call to action.',
} as const
export type SaleFormat = keyof typeof saleFormats
export const saleFormatIds = Object.keys(saleFormats) as [
  SaleFormat,
  ...SaleFormat[],
]

export const saleFormatGuide = (format?: SaleFormat) =>
  format
    ? `Selling format: ${saleFormats[format]} Every price, discount, date, code, stock level and claim must come from the brief or the supplied files; leave out any that are missing.`
    : ''
