import assert from 'node:assert/strict'
const baseUrl = process.env.TEST_BASE_URL
assert.ok(baseUrl, 'TEST_BASE_URL is required')

async function get(path) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  try {
    return await fetch(baseUrl + path, { signal: controller.signal, headers: { Accept: 'application/javascript,*/*' } })
  } finally {
    clearTimeout(timeout)
  }
}

const vendor = await get('/vendor/babel.min.js')
assert.equal(vendor.status, 200)
assert.match(vendor.headers.get('content-type') || '', /javascript/i)
const body = await vendor.text()
assert.ok(body.length > 500000)
assert.match(body, /Babel/i)

const api = await get('/api/babel')
assert.equal(api.status, 200)

console.log('PASS: production serves bundled Babel and retains API fallback')
