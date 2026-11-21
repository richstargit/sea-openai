import { loadImage } from '@napi-rs/canvas'
import { getFile } from '@/services/agent-tools/files.js'
import { AppError } from '@/services/error.service.js'

export async function productImage(userId: string, files: string[]) {
  const [file] = files
  if (!file) return
  const { bytes } = await getFile(userId, file)
  if (
    files.length !== 1 ||
    bytes.length < 33 ||
    !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ||
    bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 12000000
  )
    throw new AppError('BAD_REQUEST', {
      key: 'so-video-image',
      message: 'แนบภาพ PNG หนึ่งภาพ ขนาดไม่เกิน 12 ล้านพิกเซล',
    })
  return loadImage(bytes)
}
