import assert from 'node:assert/strict'

const baseUrl = process.env.TEST_BASE_URL
assert.ok(baseUrl, 'TEST_BASE_URL is required')

const controller = new AbortController()
const timeout = setTimeout(() => controller.abort(), 20000)

let response
try {
  response = await fetch(baseUrl + '/api/babel', {
    signal: controller.signal,
    headers: { Accept: 'application/javascript,text/javascript,*/*' }
  })
} finally {
  clearTimeout(timeout)
}

assert.equal(response.status, 200, 'Production Babel endpoint should return HTTP 200')
const contentType = response.headers.get('content-type') || ''
assert.match(contentType, /javascript/i, 'Production Babel endpoint should return JavaScript')
const body = await response.text()
assert.ok(body.length > 500000, 'Production Babel bundle unexpectedly small')
assert.match(body, /Babel/i, 'Production Babel bundle marker missing')

console.log('PASS: production /api/babel serves the pinned Babel standalone bundle')
