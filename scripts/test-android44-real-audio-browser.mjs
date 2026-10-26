import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const tone=new URL('/api/audio-selftest',base)
let response=await fetch(tone)
assert.equal(response.status,200,'Same-origin MP3 must load')
assert.match(String(response.headers.get('content-type')),/audio\/mpeg/)
assert.equal(response.headers.get('accept-ranges'),'bytes')
const whole=Buffer.from(await response.arrayBuffer())
assert.ok(whole.length>1500 && whole[0]===0xff && (whole[1]&0xe0)===0xe0,'Calibrated MP3 frames must exist')
response=await fetch(tone,{headers:{Range:'bytes=0-63'}})
assert.equal(response.status,206,'Old WebView requires proper byte-range MP3 responses')
assert.equal(response.headers.get('content-range'),`bytes 0-63/${whole.length}`)
assert.equal((await response.arrayBuffer()).byteLength,64)
response=await fetch(tone,{headers:{Range:'bytes=999999-'}})
assert.equal(response.status,416)
console.log('PASS: same-origin diagnostic MP3 supports 200, 206 and 416')

const browser=await chromium.launch({headless:true})
async function scenario(legacy){
 const page=await browser.newPage({viewport:{width:legacy?800:1300,height:legacy?600:830},
   userAgent:legacy?'Mozilla/5.0 (Linux; Android 4.4.2; Via) AppleWebKit/537.36 Mobile Safari/537.36':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36'})
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(()=>{
   localStorage.setItem('only-testing-online-music.default-source-disabled','1')
   window.__sevenSecondTimers=0
   const nativeSetTimeout=window.setTimeout
   window.setTimeout=function(fn,delay){
     if(delay===7000) window.__sevenSecondTimers++
     return nativeSetTimeout.apply(window,arguments)
   }
 })
 try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded'})
  await page.evaluate(()=>{
    window.LXSourceManager.getActive=function(){return null}
    window.LXMusicSearch.resolveMusicUrl=function(source,music,quality,cb){
      cb(null,{url:'https://media.example.test/song.mp3?token=test',provider:'test-audio'})
    }
    const a=document.getElementById('audio')
    window.__playCalls=0;window.__simTime=0;window.__simPaused=true
    a.load=function(){}
    Object.defineProperty(a,'src',{configurable:true,get:function(){return this.__fakeSrc||''},
      set:function(v){this.__fakeSrc=String(v)}})
    Object.defineProperty(a,'duration',{configurable:true,get:function(){return 200}})
    Object.defineProperty(a,'readyState',{configurable:true,get:function(){return 4}})
    Object.defineProperty(a,'currentTime',{configurable:true,
      get:function(){return window.__simTime},set:function(v){window.__simTime=v}})
    Object.defineProperty(a,'paused',{configurable:true,get:function(){return window.__simPaused}})
    Object.defineProperty(a,'ended',{configurable:true,get:function(){return false}})
    a.play=function(){window.__playCalls++;window.__simPaused=false;return Promise.resolve()}
    a.pause=function(){window.__simPaused=true}
  })
  await page.evaluate(()=>{
    window.OnlyTestingMusicApp.playMusic({id:'321',songId:'321',source:'wy',
      name:'旧平板测试歌曲',singer:'测试',interval:200000})
  })
  await page.waitForFunction(()=>!!document.getElementById('audio').src,null,{timeout:4000})
  const initial=await page.evaluate(()=>{
    const a=document.getElementById('audio')
    if(a.onloadedmetadata)a.onloadedmetadata()
    return{src:a.src,playCalls:window.__playCalls,seven:window.__sevenSecondTimers,
      nativeDisplay:getComputedStyle(a).display,
      panelDisplay:getComputedStyle(document.getElementById('legacy-media-panel')).display,
      status:document.getElementById('status').textContent,
      legacy:document.documentElement.className.indexOf('legacy-native-media')>=0}
  })
  if(legacy){
    assert.equal(initial.legacy,true)
    assert.equal(initial.nativeDisplay,'block','Native controls must be visible on old Via')
    assert.notEqual(initial.panelDisplay,'none')
    assert.ok(initial.src.includes('/api/proxy?url='),'Old Via defaults to same-origin transport')
    assert.equal(initial.playCalls,0,'Async resolver metadata cannot initiate gated autoplay')
    assert.equal(initial.seven,0,'Never drop valid media on 7-second timeout before direct user tap')
    assert.match(initial.status,/原生音频/)
    await page.locator('#legacy-direct-btn').click()
    const direct=await page.locator('#audio').evaluate(a=>a.src)
    assert.match(direct,/^https:\/\/media\.example\.test/)
    await page.locator('#legacy-proxy-btn').click()
    const proxied=await page.locator('#audio').evaluate(a=>a.src)
    assert.ok(proxied.indexOf('/api/proxy?url=')>=0)
    await page.evaluate(()=>{
      const a=document.getElementById('audio')
      window.__simPaused=false;window.__simTime=0.65
      if(a.onplaying)a.onplaying()
    })
    assert.match(await page.locator('#status').textContent(),/正在播放/)
    console.log('PASS: Android 4.4 manual-native control, proxy/direct fallback, playback confirmation')
  } else {
    assert.equal(initial.legacy,false)
    assert.equal(initial.nativeDisplay,'none')
    assert.ok(!initial.src.includes('/api/proxy?url='))
    assert.ok(initial.playCalls>=1,'Modern desktop retains automatic play')
    console.log('PASS: modern desktop unchanged')
  }
  assert.deepEqual(errors,[])
 } finally{await page.close()}
}
try {
 await scenario(true)
 await scenario(false)
}finally{await browser.close()}
