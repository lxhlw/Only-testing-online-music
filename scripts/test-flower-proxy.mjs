import assert from 'node:assert/strict'
import fs from 'node:fs'

const proxy = fs.readFileSync('functions/api/proxy.js', 'utf8')

assert.match(proxy, /http:\/\/ts\.tempmusic\.tk/)
assert.match(proxy, /http:\/\/tm\.tempmusic\.tk/)
assert.match(proxy, /path\.replace\(\/\^\\\/flower\\\/v1\\\/\//)

console.log('PASS: Flower resolver keeps LX Music hostname fallbacks')
