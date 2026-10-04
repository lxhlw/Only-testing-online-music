import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const versionJson = JSON.parse(fs.readFileSync('version.json', 'utf8'))
const versionSource = fs.readFileSync('src/app-version.js', 'utf8')
const checkerSource = fs.readFileSync('src/version-check.js', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

const context = { window: null, console, location: { protocol: 'http:', host: 'example.test' } }
context.window = context
vm.runInNewContext(versionSource, context, { filename: 'app-version.js' })
vm.runInNewContext(checkerSource, context, { filename: 'version-check.js' })

assert.equal(packageJson.version, versionJson.version)
assert.equal(context.OnlyTestingMusicVersion.version, versionJson.version)
assert.equal(context.OnlyTestingMusicVersion.releaseDate, versionJson.releaseDate)
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('0.2.1', '0.2.1'), 0)
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('0.2.0', '0.2.1'), -1)
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('0.3.0', '0.2.1'), 1)
assert.equal(context.OnlyTestingMusicVersionCheck.compareVersions('v1.2.10', '1.2.9'), 1)

console.log('PASS: application version metadata and comparison')
