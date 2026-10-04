import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/promise-lite.js', import.meta.url), 'utf8')

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const context = {
  window: null,
  setTimeout,
  clearTimeout,
  console
}
context.window = context
context.Promise = undefined

vm.runInNewContext(source, context, { filename: 'promise-lite.js' })

assert.equal(typeof context.Promise, 'function')

const chain = await context.Promise.resolve('A')
  .then(value => value + 'B')
  .then(value => value + 'C')
assert.equal(chain, 'ABC')

const all = await context.Promise.all([
  context.Promise.resolve(1),
  2,
  context.Promise.resolve(3)
])
assert.deepEqual(Array.from(all), [1, 2, 3])

let caught = false
await context.Promise.reject(new Error('expected'))
  .catch(error => {
    caught = error.message === 'expected'
  })
assert.equal(caught, true)

let finallyCalled = false
const finalValue = await context.Promise.resolve('ok').finally(() => {
  finallyCalled = true
})
assert.equal(finallyCalled, true)
assert.equal(finalValue, 'ok')

let asyncState = false
const asyncPromise = context.Promise.resolve()
  .then(() => { asyncState = true })
assert.equal(asyncState, false)
await asyncPromise
assert.equal(asyncState, true)

await wait(0)

console.log('PASS: Promise compatibility layer')
