import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({
    userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Version/4.0 Chrome/30.0.0.0 Safari/537.36'
  })
  const errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.addInitScript(()=>{
    window.__nativePlayCalls=[]
    window.LXNativeAudio={
      isAvailable:function(){return true},
      play:function(url,token){window.__nativePlayCalls.push({url:url,token:token})},
      pause:function(){},resume:function(){},seek:function(){}
    }
  })
  await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.OnlyTestingMusicApp&&window.LXMusicSearch)
  await page.evaluate(()=>{
    window.LXSourceManager.getActive=function(){return null}
    window.LXMusicSearch.resolveMusicUrl=function(source,info,quality,callback){
      callback(null,{url:'https://audio.example.test/m/123.mp3?expires=123&token=abc',
        provider:'gd-studio'})
    }
    window.OnlyTestingMusicApp.playMusic({
      id:'123',name:'Synthetic 128k mp3',source:'wy',singer:'Test Artist',
      interval:180
    })
  })
  await page.waitForFunction(()=>window.__nativePlayCalls.length===1,null,{timeout:8000})
  const expected=new URL(base).origin+'/api/proxy?url='+
    encodeURIComponent('https://audio.example.test/m/123.mp3?expires=123&token=abc')
  let state=await page.evaluate(()=>window.__nativePlayCalls)
  assert.equal(state[0].url,expected,'Native player must never receive third-party media address')
  assert.equal(state[0].token>0,true)
  // Reproduce the v0.8 device failure: clicking the visible 'direct route'
  // previously caused the bridge to reject the non-first-party media URL.
  await page.evaluate(()=>window.OnlyTestingMusicApp.retryLegacyStream(true))
  await page.waitForFunction(()=>window.__nativePlayCalls.length===2)
  state=await page.evaluate(()=>window.__nativePlayCalls)
  assert.equal(state[1].url,expected,'Direct retry must still use same-origin proxy in native mode')
  assert.notEqual(state[1].url,'https://audio.example.test/m/123.mp3?expires=123&token=abc')
  assert.match(await page.locator('#status').textContent(),/本站安全代理线路/)
  assert.deepEqual(errors,[])
  console.log('PASS: real app.js search-result playback and direct-route retry both pass only same-origin HTTPS proxy URLs to native player')
}finally{await browser.close()}
