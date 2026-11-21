import type { Router } from 'express'
import type { ZodType } from 'zod'
import { z } from 'zod'

export type Operation = {
  tags?: string[]
  summary: string
  description?: string
  secured?: boolean
  /** Zod schema of the request body. Turned into JSON Schema, never restated. */
  contentType?: string
  bodySchema?: ZodType
  /** Zod schema of the query string. */
  querySchema?: ZodType
  examples?: Record<string, unknown>
  /** Failures worth knowing about beyond the ones every secured or validated route has. */
  errors?: number[]
  responses?: Record<string, unknown>
}

export type Annotations = Record<string, Operation>

type Layer = {
  route?: { path: string; methods: Record<string, boolean> }
  handle?: { stack?: Layer[] }
}

export type Mount = {
  /**
   * Where the router is mounted. Express 5 keeps the mount path inside a
   * compiled matcher and never exposes it, so this one string is declared —
   * the route paths under it, which are the part that changes, are read from
   * the router itself.
   */
  prefix: string
  router: Router
}

/**
 * The route list comes from the router Express actually mounted, and the
 * request shapes come from the Zod schemas the controllers actually validate
 * with. Neither can drift from the code, because neither is written twice.
 *
 * What a human still has to supply is why an endpoint exists and what a good
 * call looks like, which is the `Annotations` map.
 */
function walk(stack: Layer[], declared: Set<unknown>): string[] {
  const found: string[] = []

  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) {
        if (method === '_all') continue
        found.push(`${method.toUpperCase()} ${layer.route.path}`)
      }
    } else if (layer.handle?.stack && !declared.has(layer.handle)) {
      found.push(...walk(layer.handle.stack, declared))
    }
  }

  return found
}

export function routesOf(mounts: Mount[]): string[] {
  const declared = new Set<unknown>(mounts.map(({ router }) => router))

  const found = mounts.flatMap(({ prefix, router }) => {
    const stack = (router as unknown as { stack: Layer[] }).stack

    return walk(stack, declared).map((route) => {
      const [method, path = '/'] = route.split(' ')
      const joined = `${prefix}${path === '/' ? '' : path}` || '/'

      return `${method} ${joined}`
    })
  })

  return [...new Set(found)].sort()
}

/** Express writes `:id`; OpenAPI writes `{id}`. */
function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

function pathParams(path: string) {
  return [...path.matchAll(/:([A-Za-z0-9_]+)/g)].map((match) => ({
    name: match[1],
    in: 'path' as const,
    required: true,
    schema: { type: 'string' },
  }))
}

function jsonSchema(schema: ZodType): Record<string, unknown> {
  const generated = z.toJSONSchema(schema, { io: 'input' }) as Record<
    string,
    unknown
  >

  delete generated.$schema

  return generated
}

function queryParams(schema: ZodType) {
  const generated = jsonSchema(schema)
  const properties = (generated.properties ?? {}) as Record<string, unknown>
  const required = (generated.required ?? []) as string[]

  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query' as const,
    required: required.includes(name),
    schema: property,
  }))
}

const DEFAULT_RESPONSES = {
  200: { description: 'Success' },
}

const ERROR_DESCRIPTIONS: Record<number, string> = {
  400: 'The request is malformed or names something unknown',
  401: 'Missing or rejected credential',
  402: 'The spending budget for the period is used up',
  403: 'Authenticated, but not allowed',
  404: 'No such record',
  409: 'Conflicts with something that already exists',
  422: 'The body failed validation',
  429: 'Rate limit reached',
  503: 'A dependency is unavailable',
}

export const ERROR_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: false },
    message: { type: 'string', example: 'Authentication is required.' },
    message_TH: { type: 'string', example: 'กรุณายืนยันตัวตนก่อนใช้งาน' },
    code: { type: 'string', example: 'so-e401' },
    key: {
      type: 'string',
      description:
        'Stable machine-readable reason. Clients branch on this, never on the message.',
      example: 'so-gateway-access-token',
    },
    requestId: { type: 'string', format: 'uuid' },
    details: {},
  },
}

/**
 * A credential can always be missing and a validated body can always be
 * wrong, so those two failures are added from the annotation's own flags
 * rather than typed out on every route.
 */
function failureCodes(
  annotation: Operation | undefined,
  addressesOneRecord: boolean,
): number[] {
  const codes = new Set(annotation?.errors ?? [])

  if (annotation?.secured) codes.add(401)
  if (annotation?.bodySchema || annotation?.querySchema) codes.add(422)
  if (addressesOneRecord) codes.add(404)

  return [...codes].sort((left, right) => left - right)
}

function errorResponses(codes: number[], declared: Record<string, unknown>) {
  return Object.fromEntries(
    codes
      .filter((code) => !(String(code) in declared))
      .map((code) => [
        String(code),
        {
          description: ERROR_DESCRIPTIONS[code] ?? 'Error',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      ]),
  )
}

export function buildDocument(input: {
  mounts: Mount[]
  title: string
  description: string
  version: string
  annotations: Annotations
  schemas?: Record<string, unknown>
  securitySchemes?: Record<string, unknown>
  /** Which scheme `secured` means for this service. */
  securityScheme?: string
}) {
  const scheme = input.securityScheme ?? 'bearerAuth'
  const paths: Record<string, Record<string, unknown>> = {}
  const undocumented: string[] = []

  for (const route of routesOf(input.mounts)) {
    const [method = '', path = '/'] = route.split(' ')
    const annotation = input.annotations[route]

    if (!annotation) undocumented.push(route)

    const documented = openApiPath(path)
    const declared = (annotation?.responses ?? DEFAULT_RESPONSES) as Record<
      string,
      unknown
    >
    const inPath = pathParams(path)
    const parameters = [
      ...inPath,
      ...(annotation?.querySchema ? queryParams(annotation.querySchema) : []),
    ]

    paths[documented] ??= {}
    paths[documented][method.toLowerCase()] = {
      tags: annotation?.tags,
      summary: annotation?.summary ?? route,
      description: annotation?.description,
      ...(annotation ? {} : { 'x-undocumented': true }),
      ...(parameters.length > 0 ? { parameters } : {}),
      ...(annotation?.secured ? { security: [{ [scheme]: [] }] } : {}),
      ...(annotation?.bodySchema
        ? {
            requestBody: {
              required: true,
              content: {
                [annotation.contentType ?? 'application/json']: {
                  schema: jsonSchema(annotation.bodySchema),
                  ...(annotation.examples
                    ? { examples: annotation.examples }
                    : {}),
                },
              },
            },
          }
        : {}),
      responses: {
        ...declared,
        ...errorResponses(
          failureCodes(annotation, inPath.length > 0),
          declared,
        ),
      },
    }
  }

  return {
    document: {
      openapi: '3.1.0',
      info: {
        title: input.title,
        version: input.version,
        description: input.description,
      },
      paths,
      components: {
        schemas: { Error: ERROR_SCHEMA, ...input.schemas },
        ...(input.securitySchemes
          ? { securitySchemes: input.securitySchemes }
          : {}),
      },
    },
    undocumented,
  }
}
