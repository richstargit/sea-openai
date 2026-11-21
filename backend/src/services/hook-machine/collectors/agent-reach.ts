import { hookMachineConfig } from '@/config/hook-machine.config.js'
import { CliError, runCli } from '@/services/hook-machine/exec.js'

export type ReachItem = {
  title: string | null
  url: string | null
  author: string | null
  published_at: string | null
  text: string | null
  raw: Record<string, unknown> | null
}

type ReachResponse = {
  ok: boolean
  items?: ReachItem[]
  error?: { code?: string; message?: string; hint?: string } | null
}

/**
 * Agent-Reach prints one JSON object per call. This is the only place the
 * backend talks to it, so channels and arguments stay easy to audit.
 */
export async function reach(
  args: string[],
  timeoutMs = 90_000,
): Promise<ReachItem[]> {
  const { stdout } = await runCli(hookMachineConfig.agentReachBin, args, {
    timeoutMs,
  }).catch((error: unknown) => {
    // Agent-Reach exits non-zero with its JSON error body on stdout.
    if (error instanceof CliError && !error.missing) {
      throw new CliError(error.message, error.stderr)
    }
    throw error
  })

  let body: ReachResponse
  try {
    body = JSON.parse(stdout) as ReachResponse
  } catch {
    throw new CliError('agent-reach returned output that is not JSON')
  }
  if (!body.ok) {
    const { code, message, hint } = body.error ?? {}
    throw new CliError(
      `agent-reach ${args.slice(0, 2).join(' ')}: ${code ?? 'ERROR'} ${message ?? ''} ${hint ?? ''}`.trim(),
    )
  }
  return body.items ?? []
}

export async function agentReachAvailable(): Promise<boolean> {
  try {
    await runCli(hookMachineConfig.agentReachBin, ['version'], {
      timeoutMs: 15_000,
    })
    return true
  } catch {
    return false
  }
}

export type VideoMeta = {
  title: string | null
  author: string | null
  publishedAt: string | null
  description: string | null
  durationSec: number | null
  views: number | null
  likes: number | null
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export async function youtubeMeta(url: string): Promise<VideoMeta> {
  const [item] = await reach(['youtube', 'read', url])
  if (!item) throw new CliError('agent-reach youtube read returned nothing')
  return {
    title: item.title,
    author: item.author,
    publishedAt: item.published_at,
    description: item.text,
    durationSec: num(item.raw?.duration),
    views: num(item.raw?.view_count),
    likes: num(item.raw?.like_count),
  }
}

export async function youtubeSubtitle(url: string): Promise<string> {
  const [item] = await reach([
    'youtube',
    'subtitle',
    url,
    '--lang',
    'th,en,en-orig',
  ])
  return item?.text?.trim() ?? ''
}

export type WebFinding = { title: string; url: string; text: string }

function toFinding(item: ReachItem): WebFinding | null {
  if (!item.url && !item.title) return null
  return {
    title: item.title ?? item.url ?? '',
    url: item.url ?? '',
    text: (item.text ?? '').slice(0, 1500),
  }
}

export async function webSearch(
  query: string,
  limit = 4,
): Promise<WebFinding[]> {
  const items = await reach(['web', 'search', query, '--limit', String(limit)])
  return items.map(toFinding).filter((f): f is WebFinding => f !== null)
}

export async function webRead(url: string): Promise<WebFinding | null> {
  const [item] = await reach(['web', 'read', url])
  return item ? toFinding(item) : null
}
