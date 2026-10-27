import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import * as acorn from 'acorn'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const localBabel='android-companion/app/src/main/assets/web/vendor/babel.min.js'
assert.ok(statSync(localBabel).size>500000,'Actual APK Babel asset must exist after bundle')
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({
   userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Version/4.0 Chrome/30.0.0.0 Safari/537.36'
 })
 const pageErrors=[],requests={local:0,remote:0}
 page.on('pageerror',error=>pageErrors.push(String(error)))
 await page.addInitScript(()=>{
   localStorage.setItem('only-testing-online-music.default-source-disabled','1')
   // Chrome30 APK Java bridge exists before index.html is loaded.
   window.LXNativeAudio={
     isAvailable:function(){return true},play:function(){},pause:function(){},
     resume:function(){},seek:function(){}
   }
 })
 await page.route('**/vendor/babel.min.js',async route=>{
   requests.local++
   await route.fulfill({status:200,contentType:'application/javascript',
     body:readFileSync(localBabel)})
 })
 await page.route('**/api/babel',async route=>{
   requests.remote++
   await route.fulfill({status:503,contentType:'text/plain',body:'remote Babel unavailable'})
 })
 await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>window.LXSourceTranspiler && window.LXSourceManager)
 const urls=await page.evaluate(()=>window.LXSourceTranspiler.urls)
 assert.deepEqual(urls,['/vendor/babel.min.js','/api/babel'])
 const fixture=[
   '/** @name Test Flower ES2020 */',
   '/* FLOWER_FIXTURE_ES2020 */',
   'const api = globalThis.lx;',
   'const tracks = [\'wy\'];',
   'api.on(api.EVENT_NAMES.request, (event) => {',
   '  const out = { url: \'https://media.example.test/ok.mp3\' };',
   '  return Promise.resolve(out);',
   '});',
   'api.send(api.EVENT_NAMES.inited,{status:true, sources:{',
   '  wy:{name:\'wy\',type:\'music\',actions:[\'musicUrl\'],qualitys:[\'128k\']}',
   '}});'
 ].join('\n')
 const forced=await page.evaluate(source=>new Promise(resolve=>{
   window.LXSourceTranspiler.prepare(source,'flower/latest.js',
     function(err,transformed,used){resolve({error:err?err.message:null,code:transformed,used:used})},
     {force:true})
 }),fixture)
 assert.equal(forced.error,null)
 assert.equal(forced.used,true)
 assert.ok(forced.code && forced.code.length>100)
 acorn.parse(forced.code,{ecmaVersion:5,sourceType:'script'})
 // Simulate the KitKat ES5 parser rejecting the original modern syntax and
 // verify the actual source-manager->transpiler->runtime route, not a mock.
 const installed=await page.evaluate(source=>new Promise(resolve=>{
   var realFunction=window.Function
   window.Function=function(){
     var body=String(arguments[arguments.length-1]||'')
     if(body.indexOf('FLOWER_FIXTURE_ES2020')>=0 && body.indexOf('=>')>=0)
       throw new SyntaxError('Chrome 30 does not support arrow functions')
     return realFunction.apply(null,arguments)
   }
   window.LXSourceManager.installFromCode(source,
     'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
     function(err,item){
       window.Function=realFunction
       resolve({error:err?String(err.message||err):null,id:item&&item.id,
         inited:item&&item.inited,transpiled:item&&item.transpiled})
     })
 }),fixture)
 assert.equal(installed.error,null)
 assert.equal(installed.transpiled,true)
 await page.waitForFunction(()=>window.LXSourceManager.getActive() &&
   window.LXSourceManager.getActive().inited===true)
 const action=await page.evaluate(()=>new Promise(resolve=>{
   window.LXSourceManager.requestAction('wy','musicUrl',
     {type:'128k',musicInfo:{songmid:'1'}},
     function(err,result){resolve({error:err?String(err):null,url:result&&result.url})})
 }))
 assert.equal(action.error,null)
 assert.equal(action.url,'https://media.example.test/ok.mp3')
 assert.equal(requests.local,1,'Should load APK-local Babel exactly once')
 assert.equal(requests.remote,0,'No live /api/babel request is permitted when local runtime exists')
 assert.deepEqual(pageErrors,[])
 console.log('PASS: APK-only 7.29.9 Babel works with network Babel HTTP 503; transpiles ES2020 to ES5 and runs LX musicUrl')
}finally{await browser.close()}
