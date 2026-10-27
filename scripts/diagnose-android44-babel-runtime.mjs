import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import vm from 'node:vm'
import {parse} from 'acorn'

const root='android-companion/app/src/main/assets/web/vendor/'
const babel=readFileSync(root+'babel.min.js','utf8')
const polyfills=readFileSync(root+'core-js.min.js','utf8')
assert.ok(babel.length>500000)
assert.ok(polyfills.length>100000)
parse(babel,{ecmaVersion:5,sourceType:'script'})
parse(polyfills,{ecmaVersion:5,sourceType:'script'})
for (const scenario of [
  {name:'modern',drop:[]},
  {name:'chrome30-no-es6-builtins',drop:['Symbol','Map','Set','WeakMap','WeakSet','Promise','Reflect']},
  {name:'chrome30-no-es6-without-promise',drop:['Symbol','Map','Set','WeakMap','WeakSet','Reflect']}
]) {
  const sandbox={console:{log(){},warn(){},error(){}}}
  vm.createContext(sandbox)
  vm.runInContext('this.window=this;this.self=this;this.globalThis=this;',sandbox)
  for (const name of scenario.drop) vm.runInContext('this.'+name+'=undefined;',sandbox)
  try {
    vm.runInContext(polyfills,sandbox,{timeout:20000,filename:'core-js.min.js'})
    for (const name of ['Symbol','Map','Set','WeakMap','Promise']) {
      assert.equal(vm.runInContext('typeof '+name,sandbox),'function',name+' was not polyfilled')
    }
    vm.runInContext(babel,sandbox,{timeout:20000,filename:'babel.min.js'})
    const result=vm.runInContext(
      "Babel.transform('const f = (n) => n + 1;', {presets:[['env',{targets:{ie:'8'}}]]}).code",
      sandbox,{timeout:20000}
    )
    assert.equal(typeof result,'string')
    parse(result,{ecmaVersion:5,sourceType:'script'})
    console.log('PASS: '+scenario.name+' Babel transpiles after ES5 core-js initialization')
  } catch(e) {
    throw new Error(scenario.name+' failed: '+(e && e.message || String(e)))
  }
}
