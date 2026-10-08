import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const versionJson = JSON.parse(fs.readFileSync('version.json', 'utf8'))
const versionSource = fs.readFileSync('src/app-version.js', 'utf8')
const checkerSource = fs.readFileSync('src/version-check.js', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const indexHtml = fs.readFileSync('index.html', 'utf8')
const settingsHtml = fs.readFileSync('settings.html', 'utf8')

const context = { window: null, console, location: { protocol: 'http:', host: 'example.test' } }
context.window = context
vm.runInNewContext(versionSource, context, { filename: 'app-version.js' })
vm.runInNewContext(checkerSource, context, { filename: 'version-check.js' })

assert.equal(packageJson.version, versionJson.version)
assert.equal(context.OnlyTestingMusicVersion.version, versionJson.version)
assert.equal(context.OnlyTestingMusicVersion.releaseDate, versionJson.releaseDate)
assert.equal(packageJson.packageManager, 'npm@10.9.9')
const versionPattern = new RegExp('v' + packageJson.version.replace(/\./g, '\\.') + '<')
assert.match(indexHtml, /id="app-version">v[^<]+</)
assert.match(settingsHtml, /id="app-version">v[^<]+</)
assert.match(indexHtml, versionPattern)
assert.match(settingsHtml, versionPattern)

const cacheBustVersions = []
// Allow extra HTML-escaped cache revision parameters while still enforcing
// the package semantic version on every versioned asset reference.
const cacheBustPattern = /(?:src|href)="[^"]+\?v=(\d+\.\d+\.\d+)(?:&amp;[^"]*)?"/g
let cacheMatch
while ((cacheMatch = cacheBustPattern.exec(indexHtml))) cacheBustVersions.push(cacheMatch[1])
while ((cacheMatch = cacheBustPattern.exec(settingsHtml))) cacheBustVersions.push(cacheMatch[1])
assert.ok(cacheBustVersions.length >= 2, 'Expected versioned asset URLs for cache busting')
assert.ok(cacheBustVersions.every(value => value === packageJson.version), 'Asset cache-bust version drift: ' + JSON.stringify(cacheBustVersions))
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('0.2.1', '0.2.1'), 0)
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('0.2.0', '0.2.1'), -1)
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('0.3.0', '0.2.1'), 1)
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('v1.2.10', '1.2.9'), 1)

console.log('PASS: application version metadata and comparison')
