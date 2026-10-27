import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({
    userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Chrome/30.0.0.0 Safari/537.36'
  })
  const errors=[],requests=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.addInitScript(()=>{
    localStorage.setItem('only-testing-online-music.default-source-disabled','1')
    window.__nativeCalls=[]
    window.__paused=0
    window.__resumed=0
    window.LXNativeAudio={
      isAvailable:function(){return true},
      play:function(url,token){window.__nativeCalls.push({url:url,token:token})},
      pause:function(){window.__paused++},
      resume:function(){window.__resumed++},
      seek:function(){}
    }
  })
  await page.route('**/api/proxy?*',async route=>{
    const source=new URL(route.request().url()).searchParams.get('url')||''
    requests.push(source)
    if(source.indexOf('lxmusicapi.onrender.com/url/wy/')>=0){
      // The official request is deliberately unhelpful. One *existing* safe
      // same-channel source wins without waiting for its competitors.
      await new Promise(done=>setTimeout(done,80))
      return route.fulfill({
        status:200,contentType:'application/json',
        body:JSON.stringify({code:0,url:'https://p1.music.126.net/test-song.mp3?token=abc'})
      })
    }
    return route.fulfill({status:503,contentType:'text/plain',body:'provider unavailable'})
  })
  await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.OnlyTestingMusicApp && window.LXMusicSearch)
  const t=Date.now()
  const resolved=await page.evaluate(()=>new Promise(resolve=>{
    window.LXMusicSearch.resolveMusicUrlFast('wy',{id:'123',songmid:'123'},'128k',
      (err,result)=>resolve({error:err?String(err):null,result}))
  }))
  assert.equal(resolved.error,null)
  assert.equal(resolved.result.provider,'huibq')
  assert.ok(Date.now()-t<4000,'Fast same-platform resolver race must win promptly')
  assert.ok(requests.some(x=>x.includes('lxmusicapi.onrender.com')),
    'Real Huibq implementation must participate')
  assert.ok(requests.some(x=>x.includes('music.163.com')),
    'Real official NetEase implementation must participate')

  await page.evaluate(()=>{
    const manager=window.LXSourceManager
    const flower={
      id:'flower-fast',name:'野花🌷',inited:true,runtime:{},
      url:'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
      sources:{wy:{actions:['musicUrl'],name:'网易云音乐',qualitys:['128k']}}
    }
    manager.getActive=function(){return flower}
    manager.getSources=function(){return [flower]}
    window.__lateSourceCallback=null
    manager.requestAction=function(source,action,info,cb){
      window.__lateSourceCallback=cb
    }
    window.OnlyTestingMusicApp.playMusic({
      id:'123',songmid:'123',source:'wy',name:'成都',singer:'赵雷',interval:180
    })
  })
  await page.waitForFunction(()=>window.__nativeCalls.length===1,null,{timeout:7500})
  await page.evaluate(()=>{
    window.__lateSourceCallback(null,{url:'https://p1.music.126.net/late-song.mp3'})
  })
  await page.waitForTimeout(200)
  const got=await page.evaluate(()=>({
    calls:window.__nativeCalls,
    pageClass:document.documentElement.className,
    status:document.getElementById('status').textContent,
    audioDisplay:getComputedStyle(document.getElementById('audio')).display,
    oldLinksDisplay:getComputedStyle(document.getElementById('legacy-media-panel')).display
  }))
  assert.equal(got.calls.length,1,'Late original Flower URL must not replace resolved audio')
  const expected=new URL(base).origin+'/api/proxy?url='+
    encodeURIComponent('https://p1.music.126.net/test-song.mp3?token=abc')
  assert.equal(got.calls[0].url,expected)
  assert.match(got.pageClass,/native-companion/)
  assert.equal(got.audioDisplay,'none','Old gray HTML5 audio bar must be hidden only inside APK')
  assert.equal(got.oldLinksDisplay,'none','Legacy proxy/direct experiments should be hidden')
  await page.locator('#player-toggle-btn').click()
  assert.equal(await page.evaluate(()=>window.__resumed),1,
    'Mint Play button must use native MediaPlayer bridge')
  assert.deepEqual(errors,[])
  console.log('PASS: parallel same-platform resolver, stale Flower callback ignored, APK-only clutter removed, native transport bound')
}finally{
  await browser.close()
}
