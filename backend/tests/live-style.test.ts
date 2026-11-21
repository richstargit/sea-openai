import { styleBody, suggestStyle } from '@/services/live/style.js'
import { select } from '@/services/video/direction.js'

jest.mock('@/services/video/direction.js', () => ({ select: jest.fn() }))

describe('suggestStyle', () => {
  it('sends the catalog to the model and returns its suggestion', async () => {
    const suggestion = { tone: 'หรูหรา นุ่มนวล', accent: '#aa8855', accent2: '#222222', font: 'Prompt', mood: 'มินิมอล', tagStyle: 'tag' }
    jest.mocked(select).mockResolvedValue(suggestion as never)
    const body = styleBody.parse({ shop: 'มะลิ', products: [{ name: 'ครีม', description: 'ซึมไว', price: 290 }] })
    await expect(suggestStyle(body, AbortSignal.timeout(5000))).resolves.toEqual(suggestion)
    expect(String(jest.mocked(select).mock.calls[0][3])).toContain('ครีม')
  })
  it('rejects more than 30 products and empty names', () => {
    expect(styleBody.safeParse({ products: Array.from({ length: 31 }, () => ({ name: 'x' })) }).success).toBe(false)
    expect(styleBody.safeParse({ products: [{ name: '' }] }).success).toBe(false)
  })
})
