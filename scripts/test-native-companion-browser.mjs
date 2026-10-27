import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Chrome/30.0.0.0 Safari/537.36'})
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(()=>{
   localStorage.setItem('only-testing-online-music.default-source-disabled','1')
   window.__nativeCalls=[]
   window.LXNativeAudio={
     isAvailable:function(){return true},
     play:function(url,token){window.__nativeCalls.push({url:url,token:token})},
     pause:function(){},resume:function(){},seek:function(){}
   }
 })
 await page.goto(base+'/',{waitUntil:'domcontentloaded'})
 await page.evaluate(()=>{
   window.LXSourceManager.getActive=function(){return {
     id:'test-flower',url:'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
     name:'野花🌷',inited:true,runtime:{},sources:{wy:{actions:['musicUrl'],qualitys:['128k']}}
   }}
   window.LXSourceManager.requestAction=function(source,action,info,callback){
     callback(null,{url:'https://media.example.test/song.mp3?token=signed123'})
   }
   window.LXMusicSearch.resolveMusicUrl=function(){
     throw new Error('APK Flower-only cannot call removed fallback providers')
   }
   var audio=document.getElementById('audio')
   window.__htmlPlayCalls=0
   audio.play=function(){window.__htmlPlayCalls++;return Promise.resolve()}
   audio.pause=function(){}
   audio.load=function(){}
   window.OnlyTestingMusicApp.playMusic({
     id:'321',songId:'321',source:'wy',name:'Phase 1 Bridge Test',singer:'Native',
     interval:200000
   })
 })
 await page.waitForFunction(()=>window.__nativeCalls.length>0,null,{timeout:10000})
 const state=await page.evaluate(()=>({
   calls:window.__nativeCalls,
   htmlPlay:window.__htmlPlayCalls,
   status:document.getElementById('status').textContent,
   nativeReady:window.LXNativeAudio.isAvailable()
 }))
 assert.equal(state.calls.length,1)
 assert.equal(state.htmlPlay,0,'Native companion must never invoke HTMLAudioElement.play()')
 assert.equal(state.nativeReady,true)
 assert.ok(state.calls[0].url.startsWith(new URL('/api/proxy?url=',base).toString()), 'Bridge must use the current Pages origin: '+state.calls[0].url)
 assert.match(state.status,/原生播放组件/)
 await page.evaluate(()=>{
   var item=window.__nativeCalls[0]
   window.LXNativeAudioEvent(item.token,'playing',1000,200000)
   window.LXNativeAudioEvent(item.token,'progress',3100,200000)
 })
 assert.match(await page.locator('#status').textContent(),/原生 MediaPlayer/)
 assert.equal(await page.locator('#player-current-time').textContent(),'00:03')
 assert.equal(await page.locator('#player-duration').textContent(),'03:20')
 assert.deepEqual(errors,[])
 console.log('PASS: native companion uses JavaScript bridge instead of broken Via audio, same-origin proxy and native progress events')
}finally{await browser.close()}
