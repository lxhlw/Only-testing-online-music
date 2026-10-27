import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({
    userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Chrome/30.0.0.0 Safari/537.36'
  })
  const pageErrors=[]
  page.on('pageerror',err=>pageErrors.push(String(err)))
  await page.addInitScript(()=>{
    window.__nativeCalls=[]
    window.LXNativeAudio={
      isAvailable:function(){return true},
      play:function(url,token){window.__nativeCalls.push({url:url,token:token})},
      pause:function(){},resume:function(){},seek:function(){}
    }
  })
  await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.OnlyTestingMusicApp&&window.LXSourceManager)
  await page.evaluate(()=>{
    // Compress only long watchdog timers. A historical 18-second watchdog
    // becomes 180ms; the fixed 75-second watchdog becomes 750ms. The mock
    // Flower result intentionally arrives at 420ms, between the two. This
    // catches regressions without making CI wait a full minute.
    var originalSetTimeout=window.setTimeout
    window.setTimeout=function(fn,delay){
      var scaled=Number(delay)
      if(scaled>=15000&&scaled<=100000)scaled=Math.floor(scaled/100)
      var args=Array.prototype.slice.call(arguments)
      args[1]=scaled
      return originalSetTimeout.apply(window,args)
    }
    var flower={
      id:'flower-late',name:'野花🌷',inited:true,runtime:{__debugRequests:[]},
      url:'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
      sources:{wy:{name:'网易云音乐',actions:['musicUrl'],qualitys:['128k']}}
    }
    window.LXSourceManager.getActive=function(){return flower}
    window.LXSourceManager.requestAction=function(source,action,info,callback){
      window.__flowerRequests=(window.__flowerRequests||0)+1
      if(source!=='wy'||action!=='musicUrl')throw Error('Unexpected LX action')
      flower.runtime.__debugRequests.push({method:'GET'})
      originalSetTimeout(function(){
        callback(null,{url:'https://music.example.test/song.mp3?token=valid'})
      },420)
    }
    window.LXMusicSearch.resolveMusicUrl=function(){
      window.__oldFallback=(window.__oldFallback||0)+1
      throw Error('Flower-only must never request another resolver')
    }
    window.LXMusicSearch.resolveMusicUrlFast=function(){
      window.__fastFallback=(window.__fastFallback||0)+1
      throw Error('Flower-only must never call parallel providers')
    }
    window.OnlyTestingMusicApp.playMusic({
      id:'song-late-1',songmid:'song-late-1',name:'成都',singer:'赵雷',source:'wy',interval:180
    })
  })
  await page.waitForFunction(()=>window.__nativeCalls.length===1,null,{timeout:4500})
  const got=await page.evaluate(()=>({
    calls:window.__nativeCalls,sourceRequests:window.__flowerRequests||0,
    oldFallback:window.__oldFallback||0,fastFallback:window.__fastFallback||0,
    status:document.getElementById('status').textContent
  }))
  assert.equal(got.sourceRequests,1)
  assert.equal(got.oldFallback,0)
  assert.equal(got.fastFallback,0)
  assert.equal(got.calls.length,1)
  assert.equal(got.calls[0].url,new URL(base).origin+'/api/proxy?url='+
    encodeURIComponent('https://music.example.test/song.mp3?token=valid'))
  await page.waitForTimeout(550)
  assert.equal(await page.evaluate(()=>window.__nativeCalls.length),1,
    'Expired watchdog must not fire after a successful late Flower response')
  // If Flower *never* responds, the 75s deadline still ends the operation.
  // The same time compression makes this a sub-second regression assertion.
  await page.evaluate(()=>{
    window.__nativeCalls=[]
    window.LXSourceManager.requestAction=function(source,action,info,callback){
      window.__flowerRequests=(window.__flowerRequests||0)+1
      // Deliberately never resolve; there must be no second playback source.
    }
    window.OnlyTestingMusicApp.playMusic({
      id:'song-hung-2',songmid:'song-hung-2',name:'超时测试',singer:'测试',source:'wy',interval:180
    })
  })
  await page.waitForFunction(()=>
    /超过 75 秒/.test(document.getElementById('status').textContent||''),null,{timeout:4500})
  assert.equal(await page.evaluate(()=>window.__nativeCalls.length),0)
  assert.equal(await page.evaluate(()=>window.__oldFallback||0),0)
  assert.equal(await page.evaluate(()=>window.__fastFallback||0),0)
  assert.deepEqual(pageErrors,[])
  console.log('PASS: Flower-only late result is accepted beyond 18s, hanging Flower stops at 75s, no extra providers')
} finally {
  await browser.close()
}
