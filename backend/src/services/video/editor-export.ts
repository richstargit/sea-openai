import { execFile } from 'node:child_process'
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { RequestHandler } from 'express'
import sharp from 'sharp'
import { z } from 'zod'
import { loggedInUser } from '@/controllers/auth.controller.js'
import { EditorChunk, EditorProject } from '@/models/editor.model.js'
import {
  editorComposition,
  editorExportRevision,
} from '@/schemas/editor.schema.js'
import { AppError } from '@/services/error.service.js'
import { composeEditor } from '@/services/video/editor-composition.js'
import { withVideoCapacity } from '@/services/video/render.js'
import { runVideoSandbox } from '@/services/video/sandbox.js'

const exec = promisify(execFile)
export const editorPreview: RequestHandler = (req, res) => {
  const data = editorComposition.parse(req.body)
  res.json({ html: composeEditor(data, (id) => `media:${id}`, true) })
}
export const editorExport: RequestHandler = async (req, res) => {
  const userId = loggedInUser(res).id
  const id = z.uuid().parse(req.params.id)
  const { revision } = editorExportRevision.parse(req.body)
  const record = await EditorProject.findOne({
    _id: `${userId}:${id}`,
    userId,
  }).lean()
  if (!record) throw new AppError('NOT_FOUND', { key: 'so-editor-project' })
  if (record.revision !== revision)
    throw new AppError('CONFLICT', { key: 'so-editor-revision' })
  const cancel = new AbortController()
  res.once('close', () => cancel.abort())
  const signal = AbortSignal.any([cancel.signal, AbortSignal.timeout(540000)])
  await withVideoCapacity(async () => {
    const dir = await mkdtemp(join(tmpdir(), 'sea-editor-'))
    try {
      const assets = join(dir, 'assets')
      await mkdir(assets)
      await copyFile(
        resolve('node_modules/gsap/dist/gsap.min.js'),
        join(assets, 'gsap.min.js'),
      )
      const needed = new Set(record.project.clips.map((clip) => clip.assetId))
      if (record.project.music) needed.add(record.project.music.assetId)
      const paths = new Map<string, string>()
      const silentAssets = new Set<string>()
      const inputs = []
      for (const asset of record.assets.filter((item) => needed.has(item.id))) {
        const path = join(assets, asset.id)
        const temp = `${path}.input`
        for (const hash of asset.chunks) {
          signal.throwIfAborted()
          const chunk = await EditorChunk.findOne(
            { _id: `${userId}:${hash}`, userId },
            'bytes',
          )
          if (!chunk?.bytes)
            throw new AppError('NOT_FOUND', { key: 'so-editor-missing-media' })
          await appendFile(temp, Buffer.from(chunk.bytes))
        }
        if (asset.kind === 'image') {
          await sharp(temp, { limitInputPixels: 80000000 })
            .png()
            .toFile(`${path}.png`)
          paths.set(asset.id, `assets/${asset.id}.png`)
          await rm(temp)
        } else inputs.push({ id: asset.id, kind: asset.kind })
      }
      if (inputs.length) {
        await writeFile(join(dir, 'media.json'), JSON.stringify(inputs))
        await copyFile(
          resolve('integrations/video-sandbox/prepare-editor-media.mjs'),
          join(dir, 'prepare.mjs'),
        )
        const { stdout } = await runVideoSandbox(
          dir,
          ['node', 'prepare.mjs'],
          signal,
        )
        const prepared = z
          .array(
            z.object({ id: z.uuid(), file: z.string(), audio: z.boolean() }),
          )
          .parse(JSON.parse(stdout))
        for (const { id, file, audio } of prepared) {
          paths.set(id, file)
          if (!audio) silentAssets.add(id)
        }
      }
      const composition = composeEditor(
        record,
        (id) => paths.get(id) ?? '',
        false,
        silentAssets,
      )
      await writeFile(join(dir, 'index.html'), composition)
      await runVideoSandbox(dir, ['hyperframes', 'lint', '.'], signal)
      const output = join(dir, 'export.mp4')
      const { HOME, PATH, LANG, TMPDIR } = process.env
      await exec(
        process.execPath,
        [
          resolve('node_modules/hyperframes/bin/hyperframes.mjs'),
          'render',
          dir,
          '--output',
          output,
          '--format',
          'mp4',
          '--fps',
          '30',
          '--workers',
          '2',
        ],
        {
          cwd: dir,
          env: { HOME, PATH, LANG, TMPDIR, HYPERFRAMES_NO_TELEMETRY: '1' },
          signal,
          timeout: 520000,
          maxBuffer: 4 * 1024 * 1024,
        },
      )
      res.type('video/mp4').set('Cache-Control', 'private, no-store')
      await new Promise<void>((ok, fail) =>
        res.sendFile(output, (error) => (error ? fail(error) : ok())),
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
}
