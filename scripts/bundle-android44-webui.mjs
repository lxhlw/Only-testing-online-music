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
