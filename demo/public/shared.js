export function fileData(file) {
  if (!file || file.size > 8 * 1024 * 1024) throw new Error('กรุณาเลือกไฟล์ขนาดไม่เกิน 8 MB')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}
export async function api(path, options) {
  let response
  try { response = await fetch(path, options) }
  catch { throw new Error('ติดต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจการเชื่อมต่อ') }
  if (response.status === 204) return
  const data = await response.json()
  if (!response.ok) throw Object.assign(new Error(data.error || 'คำขอไม่สำเร็จ'), { latency: data.latency_ms })
  return data
}
export function post(path, data) {
  return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
}
export function el(tag, value, className) {
  const node = document.createElement(tag)
  if (value !== undefined) node.textContent = value
  if (className) node.className = className
  return node
}
