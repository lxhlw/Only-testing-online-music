import assert from 'node:assert/strict'
import fs from 'node:fs'

const browserFiles = [
  'index.html',
  'settings.html',
  'src/app.js',
  'src/app-version.js',
  'src/version-check.js',
  'src/lx-runtime.js',
  'src/music-library.js',
  'src/music-lyrics.js',
  'src/music-search.js',
  'src/play-settings.js',
  'src/promise-lite.js',
  'src/sha1.js',
  'src/source-manager.js',
  'src/source-transpiler.js'
]

const forbiddenSyntax = [
  [/=>/, 'arrow functions'],
  [/(^|[;{}\n])\s*(?:const|let)\s+/, 'const/let declarations'],
  [/`/, 'template literals'],
  [/\?\./, 'optional chaining'],
  [/\?\?/, 'nullish coalescing'],
  [/\bclass\s+[A-Za-z_$]/, 'class declarations'],
  [/\basync\s+(?:function|[A-Za-z_$][A-Za-z0-9_$]*\s*=>)/, 'async functions']
]

for (const file of browserFiles) {
  const text = fs.readFileSync(file, 'utf8')
  for (const [pattern, label] of forbiddenSyntax) {
    assert.equal(pattern.test(text), false, file + ' contains unsupported ' + label)
  }
}

const index = fs.readFileSync('index.html', 'utf8')
assert.equal(/<script\s+[^>]*type=["']module["']/i.test(index), false, 'index.html must not use module scripts')
assert.ok(index.indexOf('src/promise-lite.js') < index.indexOf('src/lx-runtime.js'), 'Promise compatibility layer must load before lx-runtime.js')
assert.ok(index.indexOf('src/promise-lite.js') < index.indexOf('src/app.js'), 'Promise compatibility layer must load before app.js')
assert.match(index, /name=["']viewport["'][^>]*width=device-width/i, 'index.html must define a device-width viewport')
assert.equal(/\.endsWith\s*\(/.test(fs.readFileSync('src/app.js', 'utf8')), false, 'app.js must not depend on String.prototype.endsWith for legacy browsers')

console.log('PASS: production browser files keep an ES5-compatible syntax/runtime contract')
