import net from 'node:net'

export type Platform = 'youtube' | 'tiktok' | 'instagram'

const PLATFORM_HOSTS: Record<Platform, string[]> = {
  youtube: ['youtube.com', 'youtu.be'],
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com'],
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

export function parseSourceUrl(
  raw: string,
): { url: string; platform: Platform } | null {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname.toLowerCase()
  for (const [platform, domains] of Object.entries(PLATFORM_HOSTS)) {
    if (domains.some((domain) => hostMatches(host, domain))) {
      return { url: parsed.toString(), platform: platform as Platform }
    }
  }
  return null
}

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/

/** Product pages may live anywhere public, but never on this machine or LAN. */
export function parsePublicUrl(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw.trim())
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (!host.includes('.') && !net.isIPv6(host))
  ) {
    return null
  }
  if (net.isIPv4(host) && PRIVATE_V4.test(host)) return null
  if (net.isIPv6(host) && /^(::1?$|f[cd]|fe80)/i.test(host)) return null
  return parsed.toString()
}
