import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({viewport:{width:810,height:900},
  userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Version/4.0 Chrome/30.0.0.0 Safari/537.36'})
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(()=>{
   localStorage.setItem('only-testing-online-music.default-source-disabled','1')
   window.__nativeSessions=[]
   window.__transferBytes=0
   window.__nativeCurrent=null
   window.LXNativeBridge={
     stop:function(){window.__nativeCurrent=null},
     begin:function(id,length){
       window.__nativeCurrent={id:id,length:length,bytes:0,chunks:0}
       window.__nativeSessions.push(window.__nativeCurrent)
       return length<24*1024*1024
     },
     append:function(id,b64){
       if(!window.__nativeCurrent ||window.__nativeCurrent.id!==id)return false
       var count=atob(b64).length
       if(count>8192)return false
       window.__nativeCurrent.bytes+=count
       window.__nativeCurrent.chunks++
       window.__transferBytes+=count
       return true
     },
     finish:function(id){
       if(!window.__nativeCurrent||window.__nativeCurrent.id!==id)return false
       return window.__nativeCurrent.bytes===window.__nativeCurrent.length
     }
   }
 })
 await page.goto(base+'/',{waitUntil:'domcontentloaded'})
 assert.equal(await page.evaluate(()=>window.LXNativeAudioTransport.available),true)
 assert.equal(await page.locator('#legacy-media-panel').evaluate(e=>e.style.display),'none')
 await page.evaluate(()=>{
   window.LXSourceManager.getActive=function(){return null}
   window.LXMusicSearch.resolveMusicUrl=function(source,music,quality,callback){
     callback(null,{url:location.origin+'/api/legacy-audio?type=mp3&v=9',provider:'test'})
   }
   window.OnlyTestingMusicApp.playMusic({id:'45',songId:'45',source:'wy',
     name:'Native media bridge test',singer:'test',interval:200000})
 })
 await page.waitForFunction(()=>window.__nativeSessions.some(s=>s.bytes===s.length && s.length>45000),null,{timeout:20000})
 const result=await page.evaluate(()=>({
  sessions:window.__nativeSessions.map(s=>({id:s.id,length:s.length,bytes:s.bytes,chunks:s.chunks})),
  htmlAudioSrc:document.getElementById('audio').getAttribute('src')||'',
  last:window.__nativeCurrent?window.__nativeCurrent.id:''
 }))
 const item=result.sessions.find(s=>s.bytes===s.length)
 assert.equal(item.length,48901)
 assert.ok(item.chunks>3)
 assert.equal(result.htmlAudioSrc,'','Dedicated APK must not attach src to broken HTML5 element')
 await page.evaluate(id=>window.LXNativeAudioTransport.notify(id,'progress',820,4000),item.id)
 assert.match(await page.locator('#status').textContent(),/Android 原生播放中/)
 assert.deepEqual(errors,[])
 console.log('PASS: native APK bridge receives every byte through XHR, never HTML5 Audio; progress reaches app state',result)
}finally{await browser.close()}
