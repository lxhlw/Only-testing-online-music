import assert from 'node:assert/strict'
import { existsSync, mkdirSync, copyFileSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'

const html=readFileSync('index.html','utf8')
const scriptTags=[...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)]
const files=['index.html','styles.css']
for(const tag of scriptTags){
  const url=tag[1].replaceAll('&amp;','&')
  const relative=url.split('?')[0]
  assert.match(relative,/^(?:src\/[a-zA-Z0-9._-]+\.js|vendor\/forge\.min\.js)$/)
  assert.ok(existsSync(relative),'Missing legacy entrypoint script '+relative)
  files.push(relative)
}
assert.ok(files.includes('src/app.js'))
assert.ok(files.includes('src/source-manager.js'))
assert.ok(files.includes('src/android-native-xhr-fallback.js'))
assert.ok(scriptTags.length>=14)
assert.ok(html.includes('id="install-btn"'))
assert.ok(html.includes('OnlyTestingNavigate'))
assert.equal(new Set(files).size,files.length)
const destination='android-companion/app/src/main/assets/web'
for(const name of files){
  const out=join(destination,name)
  mkdirSync(dirname(out),{recursive:true})
  copyFileSync(name,out)
  assert.equal(readFileSync(name,'utf8'),readFileSync(out,'utf8'),
    'Packaged UI must match the Git commit used to build the APK: '+name)
}
console.log('PASS: packaged '+files.length+' synchronized first-party UI files ('+
  files.reduce((n,f)=>n+statSync(f).size,0)+' bytes), including '+scriptTags.length+' scripts')

 // Babel is *not* in index.html. Only the Android companion loads it on-demand
 // after the user imports an ES2020 LX script. Pin to npm's exact locked
 // dependency, package it as an asset, and never fetch its CDN at runtime.
const babelSource='node_modules/@babel/standalone/babel.min.js'
const babelTarget=join(destination,'vendor/babel.min.js')
assert.ok(existsSync(babelSource),'Run npm install before bundling Babel')
const babelSize=statSync(babelSource).size
assert.ok(babelSize>500000&&babelSize<10000000,'Unexpected Babel artifact size')
mkdirSync(dirname(babelTarget),{recursive:true})
copyFileSync(babelSource,babelTarget)
assert.deepEqual(readFileSync(babelSource),readFileSync(babelTarget),
  'APK Babel must match the pinned npm version byte-for-byte')
console.log('PASS: APK-local Babel standalone '+babelSize+' bytes; Flower import will not depend on live /api/babel')

 // Chrome 30 lacks ES2015 globals used by Babel 7 despite Babel's ES5
 // syntax. Ship an audited, pinned core-js bundle and load it BEFORE Babel.
const polyfillsSource='node_modules/core-js-bundle/minified.js'
const polyfillsTarget=join(destination,'vendor/core-js.min.js')
assert.ok(existsSync(polyfillsSource),'Run npm install before bundling the legacy polyfills')
const polyfillsSize=statSync(polyfillsSource).size
assert.ok(polyfillsSize>100000&&polyfillsSize<2000000,'Unexpected core-js artifact size')
mkdirSync(dirname(polyfillsTarget),{recursive:true})
copyFileSync(polyfillsSource,polyfillsTarget)
assert.deepEqual(readFileSync(polyfillsSource),readFileSync(polyfillsTarget),
  'APK core-js must match the pinned npm version byte-for-byte')
console.log('PASS: APK-local ES5 compatibility polyfills '+polyfillsSize+' bytes')
