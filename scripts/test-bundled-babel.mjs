import assert from 'node:assert/strict'
import fs from 'node:fs'
const stat = fs.statSync('vendor/babel.min.js')
assert.ok(stat.size > 500000, 'Bundled Babel file is unexpectedly small')
const source = fs.readFileSync('vendor/babel.min.js', 'utf8')
assert.match(source, /Babel/i, 'Bundled Babel marker missing')
console.log('PASS: bundled legacy Babel is present and non-empty')
