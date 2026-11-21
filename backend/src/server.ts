import './env.js'

import type { Server } from 'node:http'

import { serverPort } from '@/config/server.config.js'
import { serviceConfig } from '@/config/service.config.js'
import { logger } from '@/services/logger.service.js'

const SHUTDOWN_TIMEOUT_MS = 10_000

async function startServer(): Promise<void> {
  let server: Server | null = null
  let shuttingDown = false

  try {
    const port = serverPort()
    const service = serviceConfig()
    const { default: app } = await import('@/app.js')

    server = app.listen(port, () => {
      logger.info('SERVER_STARTED', {
        service: service.name,
        version: service.version,
        port,
      })
    })

    const shutdown = (signal: NodeJS.Signals) => {
      if (shuttingDown) return
      shuttingDown = true

      logger.info('SERVER_SHUTDOWN_STARTED', { signal })

      const forceExit = setTimeout(() => {
        logger.error(
          'SERVER_SHUTDOWN_TIMEOUT',
          new Error('Graceful shutdown timed out'),
          { timeoutMs: SHUTDOWN_TIMEOUT_MS },
        )
        process.exit(1)
      }, SHUTDOWN_TIMEOUT_MS)
      forceExit.unref()

      server?.close((error) => {
        clearTimeout(forceExit)

        if (error) {
          logger.error('SERVER_SHUTDOWN_FAILED', error)
          process.exit(1)
        }

        logger.info('SERVER_STOPPED', { signal })
        process.exit(0)
      })
    }

    process.once('SIGINT', () => shutdown('SIGINT'))
    process.once('SIGTERM', () => shutdown('SIGTERM'))
  } catch (error) {
    logger.error('SERVER_START_FAILED', error)
    server?.close()
    process.exitCode = 1
  }
}

void startServer()
