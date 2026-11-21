import { lookup } from 'node:dns'
import { isIP, type LookupFunction } from 'node:net'
import { load } from 'cheerio'
import ipaddr from 'ipaddr.js'
import { Agent, fetch } from 'undici'
import { FILE_LIMIT, fileText } from '@/services/agent-tools/files.js'

function isPublic(ip: string) {
  const address = ipaddr.process(ip)
  return (
    address.range() === 'unicast' &&
    (address.kind() === 'ipv4' || /^[23]/i.test(address.toString()))
  )
}

export const publicLookup: LookupFunction = (host, options, done) => {
  lookup(host, { all: true }, (error, addresses) => {
    if (error) return done(error, '', 0)
    const allowed = addresses.filter(
      (entry) => !options.family || options.family === entry.family,
    )
    const first = allowed[0]
    if (!first || addresses.some((entry) => !isPublic(entry.address)))
      return done(new Error('Public addresses only'), '', 0)
    if (options.all) done(null, allowed)
    else done(null, first.address, first.family)
  })
}
const dispatcher = new Agent({ connect: { lookup: publicLookup } })
export function publicUrl(value: string) {
  const url = new URL(value)
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port)) ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    (isIP(host) && !isPublic(host))
  )
    throw new Error('A public HTTP or HTTPS URL is required')
  return url
}

export async function publicResource(value: string, signal: AbortSignal) {
  const url = publicUrl(value)
  const response = await fetch(url, {
    dispatcher,
    redirect: 'manual',
    signal,
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; SeaOpenAI/1.0)' },
  })
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body ?? []) {
    size += chunk.length
    if (size > FILE_LIMIT) throw new Error('Web resource exceeds 8 MiB')
    chunks.push(chunk)
  }
  return {
    status: response.status,
    headers: response.headers,
    body: Buffer.concat(chunks),
  }
}

export async function followPublicResource(value: string, signal: AbortSignal) {
  let url = publicUrl(value)
  for (let attempt = 0; attempt <= 5; attempt += 1) {
    const resource = await publicResource(url.href, signal)
    const location = resource.headers.get('location')
    if (resource.status < 300 || resource.status >= 400 || !location)
      return { ...resource, url }
    url = publicUrl(new URL(location, url).href)
  }
  throw new Error('Too many redirects')
}

export async function fetchPage(value: string, signal: AbortSignal) {
  const { status, headers, body, url } = await followPublicResource(
    value,
    signal,
  )
  if (status < 200 || status >= 300)
    throw new Error(`Page returned HTTP ${status}`)
  const type = headers.get('content-type') ?? ''
  if (type.includes('html')) {
    const $ = load(body.toString())
    $('script,style,noscript,nav').remove()
    $('p,br,section,li,h1,h2,h3,tr').append('\n')
    return {
      url: url.href,
      title: $('title').text().trim(),
      text: ($('main').first().text() || $('body').text())
        .replace(/[^\S\n]+/g, ' ')
        .trim(),
    }
  }
  return {
    url: url.href,
    text: await fileText(
      type.includes('pdf') ? 'page.pdf' : url.pathname,
      body,
      signal,
    ),
  }
}
