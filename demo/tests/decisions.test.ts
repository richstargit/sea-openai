import test from 'node:test'
import assert from 'node:assert/strict'
import { decisionRequest, selectAnswer } from '../decisions.js'
import { noneName } from '../common.js'

const products = ['b', 'a', 'c', 'd'].map(id => ({
  id, name: 'สินค้า ' + id, description: 'กล่อง ' + id, price: 10, images: ['test.jpg'], references: [Buffer.from(id)]
}))
function predicateAnswer(values: number[]) {
  return { answers: [{ type: 'predicate', name: 'held_up', probability: 0.5 },
    ...values.map((probability, i) => ({ type: 'predicate', name: 'match_' + products[i].id, probability }))] }
}

test('reference threshold is inclusive, ties follow catalog order and top3 is bounded', () => {
  const result = selectAnswer(predicateAnswer([0.5, 0.5, 0.1, 0.4]), 'reference', products)
  assert.equal(result.product_id, 'b')
  assert.equal(result.confidence, 0.5)
  assert.equal(result.held_up, true)
  assert.deepEqual(result.top3.map(p => p.id), ['b', 'a', 'd'])
  assert.deepEqual(result.probabilities.map(p => [p.id, p.p]), [['b', 0.5], ['a', 0.5], ['d', 0.4], ['c', 0.1]])
  assert.equal(result.none_probability, null)
  assert.equal(result.held_up_probability, 0.5)
})
test('reference below threshold returns none without inventing a none probability', () => {
  const result = selectAnswer(predicateAnswer([0.499, 0, 0.2, 0.1]), 'reference', products)
  assert.equal(result.product_id, 'none')
  assert.equal(result.product_name, noneName)
  assert.equal(result.confidence, null)
  assert.equal(result.top3[0].p, 0.499)
})
test('choice honors API choice including none on a tie, and uses separate confidence', () => {
  const result = selectAnswer({ answers: [
    { name: 'held_up', type: 'predicate', probability: 0.49 },
    { name: 'product', type: 'choice', choice: 'none', confidence: 0.22, probabilities: [
      { value: 'none', probability: 0.5 }, { value: 'b', probability: 0.5 }] }
  ] }, 'choice', products.slice(0, 1))
  assert.equal(result.product_id, 'none')
  assert.equal(result.confidence, 0.22)
  assert.equal(result.held_up, false)
  assert.equal(result.held_up_probability, 0.49)
  assert.equal(result.none_probability, 0.5)
  assert.deepEqual(result.probabilities, result.top3)
  assert.deepEqual(result.top3, [{ id: 'b', name: 'สินค้า b', p: 0.5 }])
})
test('refusals, missing answers and invalid probabilities are errors', () => {
  assert.throws(() => selectAnswer({ answers: [{ type: 'refusal', name: 'held_up' }] }, 'choice', products), /ปฏิเสธ/)
  assert.throws(() => selectAnswer(predicateAnswer([0.7]), 'reference', products), /รูปแบบคะแนน/)
  assert.throws(() => selectAnswer(predicateAnswer([NaN, 0, 0, 0]), 'reference', products), /รูปแบบคะแนน/)
})

function choiceResponse(choice: string, scores: {value: string; probability: number}[]) {
  return { answers: [
    { name: 'product', type: 'choice', choice, confidence: 0.41, probabilities: scores },
    { name: 'held_up', type: 'predicate', probability: 0.02 },
  ] }
}

test('tied choice selected by API remains first even across the top-3 boundary', () => {
  const options = ['a', 'b', 'c', 'none', 'd'].map(value => ({value, probability: 0.2}))
  const result = selectAnswer(choiceResponse('d', options), 'choice', products)
  assert.equal(result.product_id, 'd')
  assert.deepEqual(result.top3.map(p => p.id), ['d', 'b', 'a'])
  assert.equal(result.held_up, false)
})

test('near-tied Reference rankings compare unrounded scores and keep held_up independent', () => {
  const response = predicateAnswer([0.5, 0.500001, 0.499999, 0])
  response.answers.reverse()
  const result = selectAnswer(response, 'reference', products)
  assert.equal(result.product_id, 'a')
  assert.equal(result.confidence, 0.500001)
  assert.deepEqual(result.top3.map(p => p.id), ['a', 'b', 'c'])
  const absent = selectAnswer(predicateAnswer([0, 0, 0, 0]), 'reference', products)
  assert.equal(absent.product_id, 'none')
  assert.equal(absent.held_up, true)
})

test('choice rejects missing, duplicate or unknown options and invalid probabilities', () => {
  const product = {value: 'b', probability: 0.72}
  const none = {value: 'none', probability: 0.28}
  const invalid = [
    choiceResponse('b', [product]), choiceResponse('missing', [product, none]),
    choiceResponse('b', [product, none, product]),
    choiceResponse('other', [{value: 'other', probability: 0.72}, none]),
    choiceResponse('b', [{...product, probability: -0.01}, none]),
    choiceResponse('b', [product, {...none, probability: 1.01}]),
    choiceResponse('b', [product, {...none, probability: Infinity}]),
  ]
  for (const response of invalid) {
    assert.throws(() => selectAnswer(response, 'choice', products.slice(0, 1)), /รูปแบบคะแนน/)
  }
})

test('mixed responses reject missing, repeated, unexpected and refused predicate answers', () => {
  const {answers} = predicateAnswer([0.7, 0.3, 0, 0])
  for (const malformed of [
    { answers: answers.slice(1) },
    { answers: [...answers, answers[0]] },
    { answers: [...answers, {name: 'match_unknown', type: 'predicate', probability: 1}] },
    { answers: answers.map(a => a.name === 'held_up' ? {...a, probability: null} : a) },
  ]) {
    assert.throws(() => selectAnswer(malformed, 'reference', products), /รูปแบบคะแนน/)
  }
  const refusal = answers.map(a => a.name === 'match_b' ? {name: a.name, type: 'refusal'} : a)
  assert.throws(() => selectAnswer({answers: refusal}, 'reference', products), /ปฏิเสธ/)
})
test('shared optional caption and product-specific references are in their documented locations', () => {
  for (const method of ['choice', 'reference'] as const) {
    for (const caption of ['', 'ฝาสีแดง']) {
      const request = decisionRequest(Buffer.from('frame'), method, products, caption)
      assert.equal(request.model, 'gpt-6-luna')
      assert.equal(request.input.length, 1)
      assert.deepEqual(request.input[0].content.map(p => p.type), caption ? ['input_image', 'input_text'] : ['input_image'])
      if (caption) assert.deepEqual(request.input[0].content[1], { type: 'input_text', text: caption })
      assert.equal(request.questions.at(-1)?.name, 'held_up')
      if (method === 'reference') {
        assert.equal(request.questions.length, products.length + 1)
        products.forEach((p, i) => {
          const instructions = request.questions[i].instructions
          assert.ok(Array.isArray(instructions))
          assert.deepEqual(instructions[1], { type: 'input_image', image_url: 'data:image/jpeg;base64,' + p.references[0].toString('base64') })
        })
      } else {
        const question = request.questions[0]
        assert.ok(question.type === 'choice')
        assert.deepEqual(question.choices.map(c => c.value), [...products.map(p => p.id), 'none'])
        assert.ok(question.choices[0].description.includes(products[0].description))
      }
    }
  }
})

test('choice options carry look-alike notes only when the shop entered them', () => {
  const withNote = [{ ...products[0], distinct: 'ฝาหลอด มีหูจับ' }, products[1]]
  const request = decisionRequest(Buffer.from('frame'), 'choice', withNote, '')
  const choice = request.questions[0] as { choices: { value: string; description: string }[] }
  assert.match(choice.choices[0].description, /จุดแยกรุ่น: ฝาหลอด มีหูจับ$/)
  assert.doesNotMatch(choice.choices[1].description, /จุดแยกรุ่น/)
})
