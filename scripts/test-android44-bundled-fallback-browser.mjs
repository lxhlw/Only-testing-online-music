import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const webSource=readFileSync('src/android-native-xhr-fallback.js','utf8')
const apkSource=readFileSync('android-companion/app/src/main/assets/android-native-xhr-fallback.js','utf8')
assert.equal(apkSource,webSource,'Packaged native fallback must exactly match audited website ES5 source')
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage()
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.route('**/src/android-native-xhr-fallback.js*',route=>route.abort('failed'))
 await page.addInitScript(()=>{
   window.__apkTransfer={start:[],bytes:0,done:[],failures:[]}
   window.LXNativeAudio={
     isAvailable:function(){return true},
     beginXhr:function(g,n){window.__apkTransfer.start.push([g,n]);return g===333&&n<=30*1024*1024},
     appendXhr:function(g,chunk){if(g!==333)return false;window.__apkTransfer.bytes+=atob(chunk).length;return true},
     finishXhr:function(g){window.__apkTransfer.done.push(g);return g===333},
     failXhr:function(g,msg){window.__apkTransfer.failures.push([g,msg])},
     play:function(){},pause:function(){},resume:function(){},seek:function(){}
   }
 })
 await page.goto(base+'/',{waitUntil:'domcontentloaded'})
 assert.equal(await page.evaluate(()=>typeof window.LXNativeXhrFallback),'undefined',
   'Simulate exactly the physical error: website fallback not defined')
 // Equates to Java getAssets() + evaluateJavascript injection.
 await page.addScriptTag({content:apkSource})
 assert.equal(await page.evaluate(()=>typeof window.LXNativeXhrFallback.fetchBytes),'function')
 await page.evaluate(()=>window.LXNativeXhrFallback.fetchBytes(333,location.origin+'/api/legacy-audio?type=mp3&v=9'))
 await page.waitForFunction(()=>window.__apkTransfer.done.length>0||window.__apkTransfer.failures.length>0,null,{timeout:15000})
 const result=await page.evaluate(()=>window.__apkTransfer)
 assert.equal(result.bytes,48901)
 assert.deepEqual(result.start,[[333,48901]])
 assert.deepEqual(result.done,[333])
 assert.deepEqual(result.failures,[])
 assert.deepEqual(errors,[])
 console.log('PASS: simulated missing website fallback recovered from bundled APK asset, exact 48901 bytes native transfer')
}finally{await browser.close()}
