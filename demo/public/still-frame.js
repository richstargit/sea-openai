// PNG and WebP have different chunk length conventions. Check real chunk headers
// so a filename, declared MIME type or data inside a static picture cannot mark it animated.
async function animatedType(file) {
  const header = new DataView(await file.slice(0, 12).arrayBuffer())
  if (header.byteLength < 12) return null
  const png = header.getUint32(0) === 0x89504e47 && header.getUint32(4) === 0x0d0a1a0a
  const webp = header.getUint32(0) === 0x52494646 && header.getUint32(8) === 0x57454250
  if (!png && !webp) return null
  const data = new DataView(await file.arrayBuffer())
  for (let i = png ? 8 : 12; i + 8 <= data.byteLength;) {
    const length = data.getUint32(png ? i : i + 4, webp)
    const type = data.getUint32(png ? i + 4 : i)
    if (png && type === 0x6163544c) return 'image/png' // acTL
    if (png && type === 0x49444154) break // IDAT
    if (webp && type === 0x414e494d) return 'image/webp' // ANIM
    i += png ? 12 + length : 8 + length + (length % 2)
  }
  return null
}

export function snapshotJpeg(source, width, height) {
  const scale = Math.min(1, 1280 / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ไม่สามารถจับภาพเฟรมได้')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  const jpeg = canvas.toDataURL('image/jpeg', 0.92)
  if (!jpeg.startsWith('data:image/jpeg;base64,')) throw new Error('ไม่สามารถแปลงเฟรมเป็น JPEG ได้')
  return jpeg
}

export async function freezeIfAnimated(file) {
  if (file.size > 8 * 1024 * 1024) throw new Error('กรุณาเลือกรูปขนาดไม่เกิน 8 MB')
  const type = await animatedType(file)
  if (!type) return null
  if (globalThis.ImageDecoder && await ImageDecoder.isTypeSupported(type)) {
    const decoder = new ImageDecoder({ data: file.stream(), type, preferAnimation: true })
    try {
      const { image } = await decoder.decode({frameIndex: 0})
      try { return snapshotJpeg(image, image.displayWidth, image.displayHeight) }
      finally { image.close() }
    } finally { decoder.close() }
  }
  // A bitmap created from the file is a still, independent of any playing <img>.
  const bitmap = await createImageBitmap(file)
  try { return snapshotJpeg(bitmap, bitmap.width, bitmap.height) }
  finally { bitmap.close() }
}
