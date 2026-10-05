import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Babel = require('@babel/standalone')

assert.equal(typeof Babel.transform, 'function')

const modernSource = [
  'const getSong = async (data = {}) => {',
  '  const name = data?.name ?? "未知";',
  '  const value = await Promise.resolve(name);',
  '  return value;',
  '};'
].join('\n')

const result = Babel.transform(modernSource, {
  filename: 'modern-lx-source.js',
  sourceType: 'script',
  sourceMaps: false,
  presets: [
    ['env', { targets: { ie: '8' }, bugfixes: false }]
  ]
})

assert.equal(typeof result.code, 'string')
assert.equal(/=>/.test(result.code), false)
assert.equal(/\bconst\b/.test(result.code), false)
assert.equal(/\blet\b/.test(result.code), false)
assert.equal(/\basync\b/.test(result.code), false)
assert.equal(/\bawait\b/.test(result.code), false)
assert.equal(/\?\./.test(result.code), false)
assert.equal(/\?\?/.test(result.code), false)

const execute = new Function('Promise', result.code + '\nreturn getSong({ name: "成都" });')
const value = await execute(Promise)
assert.equal(value, '成都')

console.log('PASS: Babel ES5 source transformation')
