import { api, el, fileData, post } from './shared.js'
const list = document.querySelector('#products')
const listStatus = document.querySelector('#list-status')
const form = document.querySelector('#add')
const status = document.querySelector('#save-status')
const baht = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
async function refresh() {
  try {
    const products = await api('/api/catalog')
    list.replaceChildren()
    listStatus.textContent = ''
    document.querySelector('#count').textContent = products.length + ' รายการ'
    if (!products.length) list.append(el('p', 'คลังยังว่าง เพิ่มสินค้าตัวแรกพร้อมรูปอ้างอิง', 'empty'))
    for (const product of products) {
      const row = el('article', undefined, 'product')
      const image = el('img')
      image.src = '/images/' + encodeURIComponent(product.images[0])
      image.alt = product.name
      const info = el('div', undefined, 'product-info')
      const heading = el('div', undefined, 'product-top')
      const remove = el('button', 'ลบ', 'delete')
      remove.type = 'button'
      remove.setAttribute('aria-label', 'ลบ ' + product.name)
      remove.onclick = async () => {
        if (!confirm('ลบ ' + product.name + ' และรูปอ้างอิงออกจากคลัง?')) return
        remove.disabled = true
        try { await api('/api/catalog/' + encodeURIComponent(product.id), { method: 'DELETE' }); await refresh() }
        catch (error) { listStatus.textContent = error.message; remove.disabled = false }
      }
      heading.append(el('strong', product.name), remove)
      info.append(heading, el('small', product.id + ' · ' + baht.format(product.price)), el('p', product.description), ...(product.distinct ? [el('p', 'จุดแยกรุ่น: ' + product.distinct, 'distinct')] : []), el('small', product.images.length + ' รูปอ้างอิง'))
      row.append(image, info)
      list.append(row)
    }
  } catch (error) { listStatus.textContent = error.message }
}
form.onsubmit = async event => {
  event.preventDefault()
  const button = form.querySelector('button')
  button.disabled = true
  try {
    const fields = new FormData(form)
    const images = fields.getAll('images')
    if (images.length < 1 || images.length > 3) throw new Error('เลือกรูปอ้างอิง 1–3 รูป')
    status.className = ''
    status.textContent = 'กำลังบันทึก…'
    await post('/api/catalog', { id: fields.get('id').trim(), name: fields.get('name').trim(),
      price: Number(fields.get('price')), description: fields.get('description').trim(), distinct: fields.get('distinct').trim(),
      images: await Promise.all(images.map(fileData)) })
    form.reset()
    status.textContent = 'เพิ่มสินค้าแล้ว'
    await refresh()
  } catch (error) { status.className = 'error'; status.textContent = error.message }
  finally { button.disabled = false }
}
refresh()
