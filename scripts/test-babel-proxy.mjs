import assert from 'node:assert/strict'

const baseUrl = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'

const response = await fetch(baseUrl + '/api/babel')
assert.equal(response.status, 200, 'Babel proxy should return HTTP 200')

const contentType = response.headers.get('content-type') || ''
assert.match(contentType, /javascript/i, 'Babel proxy should return JavaScript')

const body = await response.text()
assert.ok(body.length > 500000, 'Babel bundle unexpectedly small')
assert.match(body, /Babel/i, 'Babel bundle marker missing')

console.log('PASS: same-origin Babel proxy returns the pinned standalone bundle')
