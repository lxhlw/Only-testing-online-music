import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage()
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(()=>{
   window.__xhrNative={begins:[],chunks:[],finishes:[],failures:[]}
   window.LXNativeAudio={
     isAvailable:function(){return true},
     beginXhr:function(gen,bytes){
       window.__xhrNative.begins.push({gen:gen,bytes:bytes})
       return gen===777 && bytes<=30*1024*1024
     },
     appendXhr:function(gen,b64){
       var bytes=atob(b64)
       if(gen!==777 || bytes.length>4096)return false
       window.__xhrNative.chunks.push(bytes)
       return true
     },
     finishXhr:function(gen){window.__xhrNative.finishes.push(gen);return gen===777},
     failXhr:function(gen,reason){window.__xhrNative.failures.push({gen:gen,reason:reason})},
     play:function(){},pause:function(){},resume:function(){},seek:function(){}
   }
 })
 await page.goto(base+'/',{waitUntil:'domcontentloaded'})
 await page.evaluate(()=>window.LXNativeXhrFallback.fetchBytes(777,location.origin+'/api/legacy-audio?type=mp3&v=9'))
 await page.waitForFunction(()=>window.__xhrNative.finishes.length>0 || window.__xhrNative.failures.length>0,null,{timeout:15000})
 const result=await page.evaluate(()=>({
   begin:window.__xhrNative.begins,
   sizes:window.__xhrNative.chunks.map(s=>s.length),
   header:window.__xhrNative.chunks[0].slice(0,4).split('').map(c=>c.charCodeAt(0)),
   finishes:window.__xhrNative.finishes,
   failures:window.__xhrNative.failures
 }))
 assert.deepEqual(result.failures,[])
 assert.equal(result.begin[0].bytes,48901)
 assert.equal(result.sizes.reduce((a,b)=>a+b,0),48901)
 assert.ok(result.sizes.length>10)
 assert.deepEqual(result.finishes,[777])
 assert.ok(result.sizes.every(n=>n>0&&n<=4096))
 assert.deepEqual(errors,[])
 await page.evaluate(()=>window.LXNativeXhrFallback.fetchBytes(777,'https://untrusted.example/audio.mp3'))
 await page.waitForFunction(()=>window.__xhrNative.failures.length>0)
 assert.equal(await page.evaluate(()=>window.__xhrNative.begins.length),1)
 // A truncated 206 response must not be handed to Java as if complete.
 await page.route('**/api/legacy-audio?type=wav&v=999',async route=>{
   await route.fulfill({status:206,contentType:'audio/wav',body:Buffer.alloc(1024),
      headers:{'Content-Range':'bytes 0-1023/176444','Content-Length':'1024'}})
 })
 await page.evaluate(()=>window.LXNativeXhrFallback.fetchBytes(777,location.origin+'/api/legacy-audio?type=wav&v=999'))
 await page.waitForFunction(()=>window.__xhrNative.failures.length>1)
 assert.equal(await page.evaluate(()=>window.__xhrNative.begins.length),1)
 console.log('PASS: browser-XHR TLS fallback transfers exact 48901 MP3 bytes via bounded Base64 to native API19, blocks foreign URLs and partial HTTP 206')
}finally{await browser.close()}
