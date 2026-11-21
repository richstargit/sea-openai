import type { Suggestion } from '@/services/live-script/suggest.js'
import { logger } from '@/services/logger.service.js'
import { publishOverlay } from '@/services/video/overlay.js'

/** Same limits the overlay hub enforces on a graphic payload. */
export const PROMPTER_TTL_MS = 20_000
export const CAPTION_TTL_MS = 6_000
const MAX_TEXT = 160
const MAX_LINES = 3

/** Cuts by characters, never in the middle of a Thai or emoji code unit. */
export function truncate(text: string, max = MAX_TEXT): string {
  const chars = Array.from(text.trim())
  return chars.length <= max
    ? chars.join('')
    : `${chars.slice(0, max - 1).join('')}…`
}

export type PrompterEvent = {
  type: 'prompter'
  payload: { lines: string[]; stage: string; warning?: string }
  ttl: number
}

export type CaptionEvent = {
  type: 'caption'
  payload: { text: string }
  ttl: number
}

export function prompterEvent(suggestion: Suggestion): PrompterEvent {
  const lines = suggestion.next
    .map((l) => truncate(l))
    .filter(Boolean)
    .slice(0, MAX_LINES)
  const event: PrompterEvent = {
    type: 'prompter',
    payload: { lines, stage: suggestion.stage.slice(0, 24) },
    ttl: PROMPTER_TTL_MS,
  }
  if (suggestion.warning)
    event.payload.warning = truncate(suggestion.warning.text)
  return event
}

/** The existing word by word caption, used only when the seller turns on showOnStream. */
export function captionEvent(suggestion: Suggestion): CaptionEvent {
  return {
    type: 'caption',
    payload: { text: truncate(suggestion.next.join(' ')) },
    ttl: CAPTION_TTL_MS,
  }
}

export type Publish = (userId: string, body: unknown) => Promise<unknown>

/**
 * Sends a new suggestion to the account's OBS overlay link. A problem with
 * the overlay never breaks the page, so every failure is logged and dropped.
 * The prompter is for the seller; the on stream caption is opt in.
 */
export async function pushToObs(
  userId: string,
  suggestion: Suggestion,
  showOnStream: boolean,
  publish: Publish = publishOverlay,
): Promise<void> {
  try {
    await publish(userId, prompterEvent(suggestion))
    if (showOnStream && suggestion.next.length) {
      await publish(userId, captionEvent(suggestion))
    }
  } catch (error) {
    logger.warn('LIVE_SCRIPT_OBS_PUSH_FAILED', {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}
