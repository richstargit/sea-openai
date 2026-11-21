import { serviceConfig } from '@/config/service.config.js'

export const ACTIVITY_LOG_SERVICE = serviceConfig().name

export const ACTIVITY_LOG_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const ACTIVITY_LOG_SKIPPED_PATHS = new Set<string>()

export const ACTIVITY_LOG_MAX_BODY_CHARS = 8000

export const ACTIVITY_LOG_MAX_PATH_CHARS = 512

export const ACTIVITY_LOG_MAX_USER_AGENT_CHARS = 512

export const ACTIVITY_LOG_MAX_ERROR_KEY_CHARS = 64
