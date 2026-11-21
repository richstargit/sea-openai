import { randomUUID } from 'node:crypto'
import { strToU8, zipSync } from 'fflate'
import { fileText } from '@/services/agent-tools/files.js'
import { publicUrl } from '@/services/agent-tools/public-web.js'
import { createAgentTools } from '@/services/agent-tools/registry.js'

const owner = randomUUID()
const signal = new AbortController().signal

it('opens only the web capabilities enabled by the user', async () => {
  const limited = createAgentTools(
    {
      message: 'Read https://example.com.',
      history: [],
    },
    owner,
  )
  expect(limited.capabilities).toContain('browser_open')
  expect(limited.capabilities).not.toContain('web_search')
  const response = await limited.call(
    {
      name: 'web_fetch',
      arguments: JSON.stringify({ url: 'https://other.example/' }),
    },
    signal,
  )
  expect(response).toHaveProperty('error')
  for (const url of [
    'file:///tmp/readme',
    'http://localhost',
    'https://[::1]',
    'http://127.0.0.1',
    'https://192.168.0.1',
  ])
    expect(() => publicUrl(url)).toThrow()
  expect(
    createAgentTools(
      { message: 'Find it', history: [], webSearch: true },
      owner,
    ).capabilities,
  ).toContain('web_search')
})

it('extracts paragraphs and spreadsheet shared strings from Office attachments', async () => {
  const doc = zipSync({
    'word/document.xml': strToU8(
      '<w:document><w:p><w:r><w:t>Hello</w:t></w:r></w:p></w:document>',
    ),
  })
  expect(await fileText('notes.docx', Buffer.from(doc), signal)).toBe('Hello')
  const sheet = zipSync({
    'xl/sharedStrings.xml': strToU8('<sst><si><t>Sales</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8(
      '<sheet><row><c t="s"><v>0</v></c><c><v>42</v></c></row></sheet>',
    ),
  })
  expect(await fileText('notes.xlsx', Buffer.from(sheet), signal)).toContain(
    'Sales\t42',
  )
})
