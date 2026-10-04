import assert from 'node:assert/strict'

const url = 'http://97.64.37.235/flower/v1/url/kg/01B7DD90367EE236A612A74D5F05DF4B/128k'
const headers = {
  'User-Agent': 'lx-music/desktop',
  'ver': '2.0.0',
  'source-ver': '1',
  'tag': '5b0a20223031222c0a20223744222c0a2022393033363745222c0a202232333641363132413734222c0a202235463035222c0a20223442222c0a20223132386b220a5d',
}

const response = await fetch(url, { method: 'GET', headers, redirect: 'follow' })
const body = await response.text()
console.log(JSON.stringify({ url, status: response.status, statusText: response.statusText, body: body.slice(0, 2000) }))

if (response.status !== 200) {
  throw new Error('Flower direct upstream returned HTTP ' + response.status + ': ' + body.slice(0, 500))
}

let data
try { data = JSON.parse(body) } catch { throw new Error('Flower direct upstream did not return JSON') }

assert.equal(data.source, 'kg')
assert.equal(data.action, 'musicUrl')
assert.equal(data.data?.type, '128k')
assert.ok(/^https?:\\/\\//.test(String(data.data?.url || '')))
console.log('PASS: Flower direct upstream accepts LX-compatible musicUrl request')