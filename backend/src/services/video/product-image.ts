import { loadImage } from '@napi-rs/canvas'
import { getFile } from '@/services/agent-tools/files.js'
import { AppError } from '@/services/error.service.js'

export async function productImages(
  userId: string,
  files: string[],
  limit: number,
) {
  if (files.length > limit)
    throw new AppError('BAD_REQUEST', {
      key: 'so-video-image',
      message: `แนบภาพ PNG ได้สูงสุด ${limit} รูป`,
    })
  const photos = []
  for (const file of files) photos.push(await readPhoto(userId, file))
  return photos
}

async function readPhoto(userId: string, file: string) {
  return loadImage(await productPng(userId, file))
}

export async function productPng(userId: string, file: string) {
  const { bytes } = await getFile(userId, file)
  if (
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 12000000
  )
    throw new AppError('BAD_REQUEST', {
      key: 'so-video-image',
      message: 'แนบภาพ PNG ขนาดไม่เกิน 12 ล้านพิกเซลต่อรูป',
    })
  return bytes
}
