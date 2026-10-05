import assert from 'node:assert/strict'
import fs from 'node:fs'

const proxy = fs.readFileSync('functions/api/proxy.js', 'utf8')

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(')
  assert.ok(start >= 0, 'Missing function: ' + name)
  const braceStart = source.indexOf('{', start)
  assert.ok(braceStart >= 0, 'Missing function body: ' + name)
  let depth = 0
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error('Unterminated function: ' + name)
}

assert.match(proxy, /function decodeMiguH5V24\(bytes, signedResponse\)/)
assert.match(proxy, /var signatureHeader = upstream\.headers\.get\('signature'\) \|\| ''/)
assert.match(proxy, /String\(signatureHeader\)\.trim\(\) === '1'/)

const decodeBody = extractFunction(proxy, 'decodeMiguH5V24')
const decoderFactory = new Function(
  'TextEncoder',
  'TextDecoder',
  "var MIGU_H5_V24_KEY = new TextEncoder().encode('Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP');" + decodeBody + ";return decodeMiguH5V24;"
)
const decodeMiguH5V24 = decoderFactory(TextEncoder, TextDecoder)
const key = new TextEncoder().encode('Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP')

function encodeEncryptedJson(value, seed, magic) {
  const plain = new TextEncoder().encode(JSON.stringify(value))
  const out = new Uint8Array(plain.length + 4)
  if (magic) { out[0] = 0xab; out[1] = 0xcd; out[2] = 0x01 }
  out[3] = seed
  for (let i = 0; i < plain.length; i += 1) {
    out[i + 4] = (plain[i] - seed + key[i % key.length]) & 0xff
  }
  return out
}

const payload = { data: { url: 'https://media.example.test/migu/chengdu.mp3' } }
assert.equal(decodeMiguH5V24(encodeEncryptedJson(payload, 37, true), false), JSON.stringify(payload))
assert.equal(decodeMiguH5V24(encodeEncryptedJson(payload, 91, false), true), JSON.stringify(payload))
assert.equal(decodeMiguH5V24(new TextEncoder().encode(JSON.stringify(payload)), false), JSON.stringify(payload))

console.log('PASS: Migu H5 v2.4 signature-header decryption regression')