export type ServiceConfig = {
  name: string
  description: string
  version: string
}

export function serviceConfig(): ServiceConfig {
  return {
    name: process.env.SERVICE_NAME?.trim() || 'sea-openai-backend',
    description:
      process.env.SERVICE_DESCRIPTION?.trim() || 'Main API for sea-openai',
    version: process.env.SERVICE_VERSION?.trim() || '0.1.0',
  }
}
