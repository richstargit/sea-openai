export const AGENT_CHAT_PATH = '/agent/chat'
export const AGENT_THREADS_PATH = '/agent/threads'

export function isPrivateAgentPath(path: string): boolean {
  const normalized = path.toLowerCase().replace(/\/$/, '')
  return (
    normalized.startsWith('/agent/editor/') ||
    normalized.startsWith('/agent/overlay/') ||
    normalized === '/agent/skills' ||
    normalized.startsWith('/auth/') ||
    normalized === '/agent/files' ||
    normalized.startsWith('/agent/files/') ||
    normalized === AGENT_CHAT_PATH ||
    normalized === AGENT_THREADS_PATH ||
    normalized.startsWith(`${AGENT_THREADS_PATH}/`)
  )
}
