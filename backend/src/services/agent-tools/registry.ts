import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import type {
  FunctionTool,
  ResponseFunctionToolCall,
} from 'openai/resources/responses/responses'
import { z } from 'zod'
import type { AgentChat } from '@/schemas/agent.schema.js'
import { browserArgs, openBrowser } from '@/services/agent-tools/browser.js'
import {
  type AgentFile,
  fileText,
  getFile,
  saveFile,
} from '@/services/agent-tools/files.js'
import { fetchPage, publicUrl } from '@/services/agent-tools/public-web.js'
import { ToolWorkspace, workPath } from '@/services/agent-tools/workspace.js'
import { createOpenAIResponse } from '@/services/openai.service.js'

function tool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  run: (args: z.infer<T>, signal: AbortSignal) => Promise<unknown> | unknown,
) {
  const parameters = z.toJSONSchema(schema, { io: 'input' })
  delete parameters.$schema
  const definition: FunctionTool = {
    type: 'function',
    name,
    description,
    parameters,
    strict: false,
  }
  return {
    definition,
    invoke: (args: unknown, signal: AbortSignal) =>
      run(schema.parse(args), signal),
  }
}

const pageSize = 6000
const urlArgs = z.strictObject({ url: z.url() })
const pathArgs = z.strictObject({ path: workPath })
const fileArgs = z.strictObject({ fileId: z.uuid() })

async function search(query: string, signal: AbortSignal) {
  const response = await createOpenAIResponse(
    {
      instructions:
        'Search the web for the query. Return concise findings with source links.',
      input: query,
      tools: [{ type: 'web_search' }],
      tool_choice: 'required',
      max_output_tokens: 2048,
    },
    signal,
  )
  const sources = response.output.flatMap((item) =>
    item.type === 'message'
      ? item.content.flatMap((part) =>
          part.type === 'output_text'
            ? part.annotations.flatMap((annotation) =>
                annotation.type === 'url_citation'
                  ? [{ title: annotation.title, url: annotation.url }]
                  : [],
              )
            : [],
        )
      : [],
  )
  return { text: response.output_text, sources }
}

export function createAgentTools(
  request: AgentChat,
  userId: string,
  threadId?: string,
) {
  const workspace = new ToolWorkspace(userId, threadId)
  const attachments = new Set(request.files)
  const exports: AgentFile[] = []
  const results = new Map<string, string>()
  const urls = new Set<string>()
  for (const message of [
    ...request.history.filter((m) => m.role === 'user').map((m) => m.content),
    request.message,
  ]) {
    for (const match of message.matchAll(/https?:\/\/[^\s<>"'\x60]+/giu)) {
      try {
        urls.add(publicUrl(match[0].replace(/[.,!?)\]]+$/u, '')).href)
      } catch {}
    }
  }
  function allowedUrl(value: string) {
    const url = publicUrl(value).href
    if (!request.webSearch && !urls.has(url))
      throw new Error('Use a URL supplied by the user or enable webSearch')
    return url
  }
  async function attachment(id: string) {
    if (!attachments.has(id))
      throw new Error('Attach this file to the message first')
    return getFile(userId, id)
  }
  function page(text: string, resultId: string, offset: number) {
    return {
      text: text.slice(offset, offset + pageSize),
      resultId,
      totalChars: text.length,
      nextOffset: offset + pageSize < text.length ? offset + pageSize : null,
    }
  }
  const web = [
    ...(request.webSearch
      ? [
          tool(
            'web_search',
            'Search the public web for current facts with citations.',
            z.strictObject({ query: z.string().min(1).max(500) }),
            ({ query }, signal) => search(query, signal),
          ),
        ]
      : []),
    ...(urls.size || request.webSearch
      ? [
          tool(
            'web_fetch',
            'Read text, HTML or a PDF from a public URL.',
            urlArgs,
            ({ url }, signal) => fetchPage(allowedUrl(url), signal),
          ),
          tool(
            'browser_open',
            'Render a public URL in local headless Chrome. Pass steps in order. Return visible text and links. Supply question only for visual inspection of the screenshot.',
            browserArgs,
            ({ url, steps, question }, signal) =>
              openBrowser({ url: allowedUrl(url), steps, question }, signal),
          ),
        ]
      : []),
  ]
  const files = attachments.size
    ? [
        tool(
          'file_read',
          'Read text from an attached file ID (PDF, Word, Excel, PowerPoint, CSV or UTF-8 text).',
          fileArgs,
          async ({ fileId }, signal) => {
            const file = await attachment(fileId)
            return {
              name: file.name,
              text: await fileText(file.name, file.bytes, signal),
            }
          },
        ),
      ]
    : []
  const sandbox = [
    tool(
      'sandbox_list',
      'List workspace files and sizes.',
      z.strictObject({}),
      () => workspace.list(),
    ),
    tool(
      'sandbox_read',
      'Read a workspace text file.',
      pathArgs,
      async ({ path }) => ({
        path,
        text: (await workspace.read(path)).toString('utf8'),
      }),
    ),
    tool(
      'sandbox_write',
      'Create or replace a UTF-8 workspace file.',
      z.strictObject({ path: workPath, text: z.string().max(100000) }),
      ({ path, text }) => workspace.write(path, Buffer.from(text)),
    ),
    tool(
      'sandbox_exec',
      'Run a shell command with Python 3 in the isolated local Docker workspace.',
      z.strictObject({ command: z.string().min(1).max(10000) }),
      ({ command }, signal) => workspace.exec(command, signal),
    ),
    tool(
      'sandbox_import',
      'Copy an attached file into the workspace.',
      z.strictObject({ fileId: z.uuid(), path: workPath }),
      async ({ fileId, path }) =>
        workspace.write(path, (await attachment(fileId)).bytes),
    ),
    tool(
      'sandbox_export',
      'Publish a workspace file and return its download URL.',
      pathArgs,
      async ({ path }) => {
        const file = await saveFile(
          userId,
          basename(path),
          await workspace.read(path),
        )
        exports.push(file)
        attachments.add(file.id)
        return file
      },
    ),
  ]
  const groups = { web, files, sandbox }
  const tools = [...web, ...files, ...sandbox]
  async function invoke(name: string, args: unknown, signal: AbortSignal) {
    const item = tools.find((item) => item.definition.name === name)
    if (!item) throw new Error('Tool unavailable in this turn')
    const value = await item.invoke(args, signal)
    if (
      value &&
      typeof value === 'object' &&
      'text' in value &&
      typeof value.text === 'string' &&
      value.text.length > pageSize
    ) {
      const id = randomUUID()
      results.set(id, value.text.slice(0, 1_000_000))
      return {
        ...value,
        ...page(results.get(id) ?? '', id, 0),
        truncated: value.text.length > 1_000_000,
      }
    }
    return value
  }
  const meta = [
    tool(
      'open_toolkit',
      'List tool names and argument schemas in a toolkit. Open sandbox for file operations or code execution.',
      z.strictObject({ toolkit: z.enum(['web', 'files', 'sandbox']) }),
      ({ toolkit }) => groups[toolkit].map((item) => item.definition),
    ),
    tool(
      'use_tool',
      'Call a tool by name with an arguments object matching its schema.',
      z.strictObject({
        name: z.string(),
        args: z.record(z.string(), z.unknown()),
      }),
      ({ name, args }, signal) => invoke(name, args, signal),
    ),
    tool(
      'read_result',
      'Read the next part of a long tool result using its resultId and nextOffset.',
      z.strictObject({
        resultId: z.uuid(),
        offset: z.number().int().nonnegative(),
      }),
      ({ resultId, offset }) => {
        const text = results.get(resultId)
        if (text === undefined)
          throw new Error('Result unavailable in this run')
        return page(text, resultId, offset)
      },
    ),
  ]
  return {
    definitions: [...web, ...files, ...meta].map((item) => item.definition),
    capabilities: tools.map((item) => item.definition.name),
    exports,
    async call(
      call: Pick<ResponseFunctionToolCall, 'name' | 'arguments'>,
      signal: AbortSignal,
    ) {
      try {
        signal.throwIfAborted()
        const args: unknown = JSON.parse(call.arguments)
        const handler = meta.find((item) => item.definition.name === call.name)
        const deadline = AbortSignal.any([signal, AbortSignal.timeout(30000)])
        return await (handler
          ? handler.invoke(args, deadline)
          : invoke(call.name, args, deadline))
      } catch (error) {
        signal.throwIfAborted()
        return {
          error:
            error instanceof z.ZodError
              ? 'Invalid tool arguments: ' +
                z.prettifyError(error).slice(0, 600)
              : error instanceof Error
                ? error.message.slice(0, 600)
                : 'Tool failed',
        }
      }
    },
  }
}
