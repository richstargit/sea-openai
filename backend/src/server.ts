import './env.js'

import type { Server } from 'node:http'

import { serverPort } from '@/config/server.config.js'
import { serviceConfig } from '@/config/service.config.js'
import { closeMongo } from '@/models/mongo.js'
import { recoverInterruptedJobs } from '@/services/hook-machine/recover.js'
import { logger } from '@/services/logger.service.js'
import { attachOverlay } from '@/services/video/overlay.js'

const SHUTDOWN_TIMEOUT_MS = 10_000

async function startServer(): Promise<void> {
  let server: Server | null = null
  let shuttingDown = false

  try {
    const port = serverPort()
    const service = serviceConfig()
    const { default: app } = await import('@/app.js')
    await recoverInterruptedJobs()

    server = app.listen(port, () => {
      logger.info('SERVER_STARTED', {
        service: service.name,
        version: service.version,
        port,
      })
    })

    const closeOverlay = attachOverlay(server)
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

      closeOverlay()
      server?.close(async (error) => {
        let exitCode = 0
        try {
          if (error) throw error
          await closeMongo()
          logger.info('SERVER_STOPPED', { signal })
        } catch (failure) {
          logger.error('SERVER_SHUTDOWN_FAILED', failure)
          exitCode = 1
        } finally {
          clearTimeout(forceExit)
        }
        process.exit(exitCode)
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
