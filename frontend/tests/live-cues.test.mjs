import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import fs from 'node:fs';

const code = ts.transpileModule(fs.readFileSync(new URL('../lib/live-cues.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exported = {};
new Function('exports', 'require', code)(exported, () => ({}));
const { cuesFromSpeech, namesProduct } = exported;

const P = { id: 'A12', name: 'ครีมกันแดด A12', description: '', price: 490, images: [] };
const top = (s, p = P) => cuesFromSpeech(s, p)[0];
const has = (s, preset, p = P) => assert.ok(cuesFromSpeech(s, p).some((c) => c.preset === preset), `${s} -> ${preset}; got ${JSON.stringify(cuesFromSpeech(s, p).map((c) => c.preset))}`);

test('price said', () => {
  for (const [s, price] of [['ตัวนี้ 290 บาท', 290], ['ราคา 1,290', 1290], ['เหลือ 199', 199], ['แค่ ๙๙ บาท', 99], ['เพียง 350 บาทเท่านั้น', 350]]) {
    const c = top(s);
    assert.equal(c.preset, 'price_pop', s);
    assert.equal(c.kind, 'livecut');
    assert.equal(c.data.price, price);
    assert.equal(c.data.name, P.name);
    assert.equal(c.needsProduct, true);
  }
});

test('discount reads from/to', () => {
  let c = top('จาก 490 เหลือ 290 บาทเท่านั้น');
  assert.equal(c.preset, 'price_drop');
  assert.deepEqual([c.data.from, c.data.to], [490, 290]);
  c = top('ลดเหลือ 290');
  assert.equal(c.preset, 'price_drop');
  assert.deepEqual([c.data.from, c.data.to], [490, 290]);
  c = top('ลด 50% วันนี้');
  assert.equal(c.data.percent, 50);
  assert.equal(c.data.to, 245);
  has('วันนี้ถูกลงเยอะ', 'price_drop');
  assert.equal(cuesFromSpeech('จาก 490 เหลือ 290', P).some((c) => c.preset === 'price_pop'), false);
});

test('shipping, gifts, stock', () => {
  has('ส่งฟรีทั่วไทย', 'stamp-free-ship', null);
  has('ฟรีค่าส่งนะคะ', 'stamp-free-ship', null);
  has('มีของแถมด้วยนะ', 'gift-unwrap', null);
  const b = top('ซื้อ 1 แถม 1 วันนี้');
  assert.equal(b.preset, 'bundle-math-bogo');
  assert.equal(b.data.buy, 1);
  assert.equal(cuesFromSpeech('ซื้อ 1 แถม 1', P).some((c) => c.preset === 'price_pop'), false);
  has('ใกล้หมดแล้วนะ', 'low_stock');
  has('ชิ้นสุดท้ายแล้วค่ะ', 'low_stock');
  const l = top('เหลือ 5 ชิ้นเท่านั้น');
  assert.equal(l.preset, 'low_stock');
  assert.equal(l.data.left, 5);
  has('หมดแล้วจ้า', 'sold-out');
});

test('labels and social proof', () => {
  has('สินค้ามาใหม่', 'stamp-new', null);
  has('ตัวนี้ขายดีที่สุด', 'stamp-bestseller', null);
  has('ลูกค้าชอบมาก', 'review-stars', null);
  assert.equal(top('รีวิว 4.8 ดาว', null).data.rating, 4.8);
  const k = top('มีวิตามินซีและไนอาซินาไมด์เป็นส่วนผสม', null);
  assert.equal(k.preset, 'kinetic-claim');
  assert.deepEqual(k.data.claims, ['วิตามินซี', 'ไนอาซินาไมด์']);
});

test('actions', () => {
  assert.equal(top('ใช้โค้ด GLOW100 ได้เลย', null).data.code, 'GLOW100');
  assert.equal(top('แจกคูปองด้วยนะ', null).preset, 'coupon-tear');
  assert.deepEqual(top('พิมพ์ CF ในคอมเมนต์').data, { code: 'A12' });
  has('กดตะกร้าสั่งเลย', 'cart-press', null);
  const p = top('อยากได้สีชมพู หรือ สีส้ม โหวตเลย', null);
  assert.equal(p.preset, 'poll');
  assert.equal(p.needsProduct, false);
  has('เลือกสีไหนดี', 'poll', null);
  assert.equal(top('ดูใกล้ๆ เลยค่ะ').preset, 'zoom');
  has('ซูมให้ดูหน่อย', 'zoom');
});

test('celebrate, flash, transition', () => {
  has('ขอบคุณทุกคนนะคะ', 'heart-burst', null);
  has('เย้ ยอดทะลุหมื่นแล้ว', 'fireworks', null);
  assert.equal(top('แฟลชเซล 5 นาที', null).data.seconds, 300);
  has('นาทีทองมาแล้ว', 'flash-countdown', null);
  has('ตัวถัดไปเลยนะ', 'iris-swap', null);
});

test('priority, cap and reasons', () => {
  const cs = cuesFromSpeech('ลดเหลือ 290 ส่งฟรี แถม ขายดีมาก ซูมดูหน่อย', P);
  assert.ok(cs.length <= 2);
  assert.ok(cs[0].priority >= cs[1].priority);
  assert.equal(cs[0].preset, 'price_drop');
  assert.match(cs[1].reason, /^ได้ยิน "/);
  assert.deepEqual(cuesFromSpeech('สวัสดีค่ะทุกคน', P), []);
  assert.equal(top('ลดน้ำหนักได้จริง', null), undefined);
});

test('needsProduct flags', () => {
  assert.equal(top('ส่งฟรี', null).needsProduct, false);
  assert.equal(top('กดตะกร้า', null).needsProduct, false);
  assert.equal(top('ราคา 290').needsProduct, true);
});

test('namesProduct', () => {
  assert.equal(namesProduct('วันนี้ครีมกันแดด A12 ตัวนี้เลย', P), true);
  assert.equal(namesProduct('พิมพ์ cf a12 ได้เลย', P), true);
  assert.equal(namesProduct('ตัว A123 ดีนะ', P), false);
  assert.equal(namesProduct('ครีมกันแดดดีมาก', P), true);
  assert.equal(namesProduct('ลิปสติกสีสวย', P), false);
  assert.equal(namesProduct('ราคา 290 บาท', { ...P, name: 'เซรั่ม 30 ml' }), false);
});
