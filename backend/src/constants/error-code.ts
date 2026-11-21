export const ERROR_CODES = {
  BAD_REQUEST: {
    code: 'so-e400',
    status: 400,
    message: 'Invalid request. Please check the submitted data.',
    messageTH: 'คำขอไม่ถูกต้อง กรุณาตรวจสอบข้อมูลที่ส่งมา',
  },
  UNAUTHORIZED: {
    code: 'so-e401',
    status: 401,
    message: 'Authentication is required.',
    messageTH: 'กรุณายืนยันตัวตนก่อนใช้งาน',
  },
  FORBIDDEN: {
    code: 'so-e403',
    status: 403,
    message: 'You do not have permission to perform this action.',
    messageTH: 'คุณไม่มีสิทธิ์ดำเนินการนี้',
  },
  NOT_FOUND: {
    code: 'so-e404',
    status: 404,
    message: 'The requested resource was not found.',
    messageTH: 'ไม่พบข้อมูลที่ร้องขอ',
  },
  REQUEST_TIMEOUT: {
    code: 'so-e408',
    status: 408,
    message: 'The request timed out. Please try again.',
    messageTH: 'คำขอใช้เวลานานเกินไป กรุณาลองใหม่',
  },
  CONFLICT: {
    code: 'so-e409',
    status: 409,
    message: 'The request conflicts with existing data.',
    messageTH: 'คำขอขัดแย้งกับข้อมูลที่มีอยู่',
  },
  VALIDATION_ERROR: {
    code: 'so-e422',
    status: 422,
    message: 'The submitted data could not be validated.',
    messageTH: 'ข้อมูลที่ส่งมาไม่ผ่านการตรวจสอบ',
  },
  TOO_MANY_REQUESTS: {
    code: 'so-e429',
    status: 429,
    message: 'Too many requests. Please try again later.',
    messageTH: 'คำขอถี่เกินไป กรุณาลองใหม่ภายหลัง',
  },
  INTERNAL_SERVER_ERROR: {
    code: 'so-e500',
    status: 500,
    message: 'Error processing your request. Please try again later.',
    messageTH: 'เกิดข้อผิดพลาดในการประมวลผล กรุณาลองใหม่ภายหลัง',
  },
  SERVICE_UNAVAILABLE: {
    code: 'so-e503',
    status: 503,
    message: 'The service is temporarily unavailable. Please try again later.',
    messageTH: 'ระบบไม่พร้อมให้บริการชั่วคราว กรุณาลองใหม่ภายหลัง',
  },
} as const

export type ErrorCodeName = keyof typeof ERROR_CODES

export function createErrorKey(
  moduleName: string,
  operation: string,
  nestedKey?: string,
): string {
  return ['so', moduleName, operation, nestedKey]
    .filter(Boolean)
    .map((part) => part?.trim().replace(/[^a-zA-Z0-9]+/g, '-'))
    .join('-')
}
