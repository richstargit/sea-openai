import { el } from './shared.js'

export function percent(value) {
  if (value > 0 && value < 0.0001) return '<0.01%'
  if (value > 0.9999 && value < 1) return '>99.99%'
  return (value * 100).toLocaleString('th-TH', { maximumFractionDigits: 2 }) + '%'
}

// Look-alike variants split the vote: flag when the runner-up is close instead of trusting the winner silently.
export function lookAlike(data) {
  const [first, second] = data.probabilities ?? []
  if (!first || !second) return null
  if (second.p >= 0.15 && first.p - second.p < 0.25) return [first, second]
  return null
}

export function displayMatch(result, data) {
  result.replaceChildren(el('p', data.product_name, 'winner'))
  const pair = lookAlike(data)
  if (pair) {
    const note = el('p', undefined, 'lookalike')
    note.append(el('b', 'ใกล้เคียงกันมาก: '), pair[0].name + ' หรือ ' + pair[1].name + '?')
    note.append(el('small', ' ควรยืนยันกับแม่ค้า หรือเพิ่ม “จุดแยกรุ่น” ในคลัง'))
    result.append(note)
  }
  if (data.confidence !== null) result.append(el('p', 'ความมั่นใจ ' + percent(data.confidence)))
  result.append(el('p', data.held_up ? 'กำลังยกสินค้าให้กล้องดู' : 'ไม่ได้ยกสินค้าให้กล้องดู'))
  result.append(el('small', 'โอกาสที่กำลังยกสินค้า (held_up) ' + percent(data.held_up_probability)))
  result.append(el('p', 'ความน่าจะเป็นรายสินค้า', 'muted'))
  data.probabilities.slice(0, 6).forEach((item, index) => {
    const row = el('div', undefined, 'rank')
    row.append(el('span', (index + 1) + '. ' + item.name), el('b', percent(item.p), 'pct'))
    const track = el('div', undefined, 'track')
    const bar = el('i')
    bar.style.width = item.p * 100 + '%'
    track.append(bar)
    result.append(row, track)
  })
  if (data.probabilities.length > 6) result.append(el('small', 'และอีก ' + (data.probabilities.length - 6) + ' รายการ'))
  if (data.none_probability !== null) {
    const row = el('div', undefined, 'rank')
    row.append(el('span', 'ไม่พบสินค้าในระบบ (none)'), el('b', percent(data.none_probability), 'pct'))
    result.append(row)
  }
}
