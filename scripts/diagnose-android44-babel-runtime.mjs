import {readFileSync} from 'node:fs'
import vm from 'node:vm'

const babel = readFileSync('android-companion/app/src/main/assets/web/vendor/babel.min.js','utf8')
const scenarios = [
  {name:'modern',drop:[]},
  {name:'chrome30-no-es6-builtins',drop:['Symbol','Map','Set','WeakMap','WeakSet','Promise','Reflect']},
  {name:'chrome30-no-symbol-map',drop:['Symbol','Map','Set','WeakMap','WeakSet','Reflect']},
  {name:'chrome30-no-promise',drop:['Promise']}
]
for (const s of scenarios) {
  const sandbox={console:{log(){},warn(){},error(){}}}
  vm.createContext(sandbox)
  vm.runInContext("this.window=this;this.self=this;this.globalThis=this;",sandbox)
  for (const name of s.drop) vm.runInContext('this.'+name+'=undefined;',sandbox)
  try {
    vm.runInContext(babel,sandbox,{timeout:20000,filename:'babel.min.js'})
    const result=vm.runInContext("typeof Babel !== 'undefined' && Babel.transform('const x = (n) => n + 1;', {presets:[['env',{targets:{ie:'8'}}]]}).code",sandbox,{timeout:20000})
    console.log('BABEL_LEGACY_VM_'+s.name+': '+(typeof result==='string' && result.includes('function')?'PASS':'UNEXPECTED_RESULT'))
  } catch(error) {
    console.log('BABEL_LEGACY_VM_'+s.name+': FAIL '+(error?.stack||error).slice(0,550))
  }
}
