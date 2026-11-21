import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { load } from 'cheerio'
import { unzipSync } from 'fflate'
import { z } from 'zod'
import { StoredFile } from '@/models/agent-storage.model.js'
import { mongo } from '@/models/mongo.js'
import { AppError } from '@/services/error.service.js'

export const FILE_LIMIT = 8 * 1024 * 1024
export const filename = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .refine((name) => name !== '.' && name !== '..' && !/[\\/\p{C}]/u.test(name))
export type AgentFile = { id: string; name: string; url: string }

function missingFile() {
  return new AppError('NOT_FOUND', {
    key: 'so-agent-file-missing',
    message: 'Attached file does not exist',
  })
}

export async function checkAttachments(userId: string, files: string[] = []) {
  if (!files.length) return
  const ids = [...new Set(files)]
  const count = await mongo(() =>
    StoredFile.countDocuments({ userId, _id: { $in: ids } }),
  )
  if (count !== ids.length) throw missingFile()
}
export async function saveFile(
  userId: string,
  name: string,
  bytes: Buffer,
  id: string = randomUUID(),
  video = false,
): Promise<AgentFile> {
  filename.parse(name)
  if (bytes.length > FILE_LIMIT)
    throw new AppError('PAYLOAD_TOO_LARGE', { key: 'so-agent-file-too-large' })
  await mongo(() =>
    StoredFile.updateOne(
      { _id: id, userId },
      { $setOnInsert: { userId, name, bytes, video } },
      { upsert: true },
    ),
  )
  return { id, name, url: `/agent/files/${id}` }
}
export async function getFile(userId: string, id: string) {
  const file = await mongo(() => StoredFile.findOne({ _id: id, userId }))
  if (!file) throw missingFile()
  return {
    id,
    name: file.name,
    video: file.video,
    bytes: Buffer.from(file.bytes),
  }
}

function officeText(bytes: Buffer, ext: string) {
  let total = 0
  const selected =
    ext === '.docx'
      ? /^word\/document\.xml$/
      : ext === '.pptx'
        ? /^ppt\/slides\/slide\d+\.xml$/
        : /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/
  const parts = unzipSync(bytes, {
    filter(entry) {
      if (!selected.test(entry.name)) return false
      total += entry.originalSize
      if (total > 12 * 1024 * 1024)
        throw new Error('Document is too large to extract')
      return true
    },
  })
  const xml = (path: string) =>
    load(Buffer.from(parts[path] ?? []).toString(), { xml: true })
  const shared = xml('xl/sharedStrings.xml')
  const strings = shared('si')
    .map((_, node) => shared(node).text())
    .get()
  return Object.keys(parts)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .filter((path) => !path.endsWith('/sharedStrings.xml'))
    .map((path) => {
      const $ = xml(path)
      if (ext === '.xlsx')
        return (
          basename(path) +
          '\n' +
          $('row')
            .map((_, row) =>
              $(row)
                .find('c')
                .map((_, cell) => {
                  const value = $(cell).text()
                  return $(cell).attr('t') === 's'
                    ? (strings[Number(value)] ?? '')
                    : value
                })
                .get()
                .join('\t'),
            )
            .get()
            .join('\n')
        )
      return $(ext === '.docx' ? 'w\\:p' : 'a\\:p')
        .map((_, node) => $(node).text())
        .get()
        .join('\n')
    })
    .join('\n')
}

export async function fileText(
  name: string,
  bytes: Buffer,
  signal: AbortSignal,
) {
  const ext = extname(name).toLowerCase()
  if (ext === '.pdf' || bytes.subarray(0, 5).toString() === '%PDF-') {
    return new Promise<string>((resolve, reject) => {
      const child = execFile(
        'pdftotext',
        ['-layout', '-', '-'],
        { signal, timeout: 10000, maxBuffer: 4 * 1024 * 1024 },
        (error, text) =>
          error
            ? reject(
                new Error(
                  'PDF text extraction failed or pdftotext is unavailable',
                ),
              )
            : resolve(text.trim()),
      )
      child.stdin?.on('error', () => {}).end(bytes)
    })
  }
  if (['.docx', '.xlsx', '.pptx'].includes(ext)) return officeText(bytes, ext)
  if (bytes.includes(0)) throw new Error('Unsupported binary document')
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}
