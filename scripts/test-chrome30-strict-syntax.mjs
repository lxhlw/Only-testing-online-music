import assert from 'node:assert/strict'
import fs from 'node:fs'
import * as acorn from 'acorn'

const index = fs.readFileSync('index.html', 'utf8')
const scripts = []
const tags = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi
let m
while ((m = tags.exec(index))) {
  const src = /\bsrc="([^"]+)"/.exec(m[1])
  if (src) {
    const relative = src[1].replace(/&amp;/g, '&').split('?')[0]
    if (/^(?:src|vendor)\//.test(relative)) scripts.push({path:relative,text:fs.readFileSync(relative,'utf8')})
  } else if (m[2].trim()) {
    scripts.push({path:'index.html:inline@'+index.slice(0,m.index).split('\n').length,text:m[2]})
  }
}
assert.ok(scripts.length > 10, 'Expected full classic script set')
let failed = 0
for (const script of scripts) {
  try {
    acorn.parse(script.text, {ecmaVersion:5, sourceType:'script', allowReserved:false})
  } catch(error) {
    console.error('ANDROID_4_4_CHROME30_ES5_FAILURE '+script.path+':'+error.loc?.line+':'+error.loc?.column+' '+error.message)
    const lines=script.text.split('\n')
    const line=error.loc?.line || 1
    for(let i=Math.max(1,line-3);i<=Math.min(lines.length,line+3);i++) {
      console.error(String(i).padStart(5)+' | '+lines[i-1].slice(0,250))
    }
    failed++
  }
}
assert.equal(failed,0, failed+' production scripts are not valid in Chrome 30 ES5 strict parsing')
console.log('PASS: '+scripts.length+' classic scripts parse as ECMAScript 5 in strict scopes, no block-scoped function declarations')
