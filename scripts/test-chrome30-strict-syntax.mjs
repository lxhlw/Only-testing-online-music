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

// Acorn accepts function declarations inside if/try/loop blocks as an
// Annex-B sloppy-mode extension even when parsing our strict-mode IIFEs.
// Chrome 30 rejects these declarations in strict code. Walk the syntax tree
// so a green modern-browser test cannot hide this fatal parse error.
function invalidBlockFunctions(ast) {
  const found = []
  function visit(node, ancestors) {
    if (!node || typeof node.type !== 'string') return
    if (node.type === 'FunctionDeclaration') {
      const parent = ancestors[ancestors.length - 1]
      const grandparent = ancestors[ancestors.length - 2]
      if (parent?.type === 'BlockStatement' &&
          grandparent?.type !== 'FunctionDeclaration' &&
          grandparent?.type !== 'FunctionExpression') {
        found.push({line:node.loc.start.line,name:node.id?.name || 'anonymous'})
      } else if (parent?.type === 'SwitchCase') {
        found.push({line:node.loc.start.line,name:node.id?.name || 'anonymous'})
      }
    }
    const next=ancestors.concat(node)
    for(const [key,value] of Object.entries(node)) {
      if(key==='loc'||key==='start'||key==='end'||key==='range')continue
      if(Array.isArray(value)){
        for(const item of value)if(item&&typeof item.type==='string')visit(item,next)
      } else if(value && typeof value.type==='string')visit(value,next)
    }
  }
  visit(ast,[])
  return found
}
function parseStrictSyntax(src) {
  return acorn.parse(src,{ecmaVersion:5,sourceType:'script',allowReserved:false,locations:true})
}
assert.ok(invalidBlockFunctions(parseStrictSyntax("(function(){'use strict';if(true){function broken() {}}})();")).some(x=>x.name==='broken'),
  'Regression must detect the exact Chrome 30 strict block-scoped function bug')
assert.equal(invalidBlockFunctions(parseStrictSyntax("(function(){'use strict';function valid(){return true;}})();")).length,0)

let failed = 0
for (const script of scripts) {
  try {
    const ast = parseStrictSyntax(script.text)
    const nested = invalidBlockFunctions(ast)
    for(const error of nested) {
      console.error('ANDROID_4_4_STRICT_BLOCK_FUNCTION '+
        script.path+':'+error.line+' function '+error.name)
      failed++
    }
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
