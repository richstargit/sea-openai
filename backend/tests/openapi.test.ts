import { serviceSpec } from '@/docs/service-spec.js'

describe('service OpenAPI', () => {
  it('documents every mounted route', () => {
    const spec = serviceSpec()

    expect(spec.undocumented).toEqual([])
    expect(spec.document.openapi).toBe('3.1.0')
    expect(spec.document.paths).toHaveProperty('/')
    expect(spec.document.paths).toHaveProperty('/health')
  })
})
