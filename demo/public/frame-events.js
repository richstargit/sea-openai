// Decode the UTF-8 stream incrementally: a network chunk may split a Thai character or a JSON line.
export async function* detectFrame(image, signal) {
  let response
  try {
    response = await fetch('/api/detect/frame', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'Accept': 'application/x-ndjson' }, body: JSON.stringify({ image }), signal })
  } catch {
    throw new Error('ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจการเชื่อมต่อ')
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw Object.assign(new Error(data.error || 'ตรวจจับสินค้าไม่สำเร็จ'), { latency: data.latency_ms })
  }
  if (!response.body) throw new Error('ไม่ได้รับผลการตรวจจับ')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let rest = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      rest += done ? decoder.decode() : decoder.decode(value, { stream: true })
      const lines = rest.split('\n')
      rest = done ? '' : lines.pop()
      for (const line of lines) {
        if (!line.trim()) continue
        let event
        try { event = JSON.parse(line) }
        catch { throw new Error('รูปแบบผลการตรวจจับไม่ถูกต้อง กรุณาลองใหม่') }
        yield event
      }
      if (done) break
    }
  } finally { reader.releaseLock() }
}
