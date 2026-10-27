import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage({
    userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Chrome/30.0.0.0 Safari/537.36'
  })
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
  await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.OnlyTestingMusicApp&&window.LXSourceManager)
  await page.evaluate(()=>{
    var manager=window.LXSourceManager
    var original=[
      '/** @name Unnamed LX Source */',
      '(function(){',
      ' var api=globalThis.lx;',
      ' api.on(api.EVENT_NAMES.request,function(){return Promise.reject(new Error("all legacy resolvers failed"));});',
      ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
      '  wy:{name:"网易云音乐",type:"music",actions:["musicUrl"],qualitys:["128k"]}',
      ' }});',
      '})();'
    ].join('\n')
    manager.installFromCode(original,'https://example.test/old-source.js',function(err,item){
      if(err)throw err
      window.__originalId=item.id
    })
    // Keep the real source manager, real transpiler, real LX runtime and real
    // activate/requestAction. Only replace the external Flower download with
    // a deterministic signed-safe fixture.
    var flower=[
      '/** @name 野花🌷 */',
      '(function(){',
      ' var api=globalThis.lx;',
      ' api.on(api.EVENT_NAMES.request,function(event){',
      '  window.__flowerActionCalls=(window.__flowerActionCalls||0)+1;',
      '  if(event.action!=="musicUrl")return Promise.reject(new Error("wrong action"));',
      '  return Promise.resolve({url:"https://media.example.test/real-song.mp3?token=123"});',
      ' });',
      ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
      '  wy:{name:"网易云音乐",type:"music",actions:["musicUrl"],qualitys:["128k"]}',
      ' }});',
      '})();'
    ].join('\n')
    manager.installVerifiedFlower=function(callback){
      manager.installFromCode(flower,
        'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
        function(err,item){
          window.__flowerWasInitializedAtImportCallback=Boolean(item&&item.inited)
          callback(err,item)
        },{preserveActive:true,expectedActiveId:window.__originalId})
    }
    window.LXMusicSearch.resolveMusicUrl=function(source,info,quality,callback){
      callback(new Error('all fallback resolvers unavailable'))
    }
  })
  await page.waitForFunction(()=>window.LXSourceManager.getActive()&&window.LXSourceManager.getActive().inited)
  await page.evaluate(()=>window.OnlyTestingMusicApp.playMusic({
    id:'123',songmid:'123',name:'成都',singer:'赵雷',source:'wy',interval:180
  }))
  await page.waitForSelector('#flower-source-retry-btn')
  await page.locator('#flower-source-retry-btn').click()
  await page.waitForFunction(()=>window.__nativeCalls.length>0,{},{timeout:15000})
  const result=await page.evaluate(()=>({
    early:window.__flowerWasInitializedAtImportCallback,
    active:window.LXSourceManager.getActive().name,
    inited:window.LXSourceManager.getActive().inited,
    actionCalls:window.__flowerActionCalls||0,
    calls:window.__nativeCalls,
    status:document.getElementById('status').textContent
  }))
  assert.equal(result.early,false,
    'Fixture must reproduce real LX send(inited) microtask occurring after import callback')
  assert.equal(result.active,'野花🌷',
    'Retry must activate Flower, not leave Unnamed LX Source selected')
  assert.equal(result.inited,true)
  assert.equal(result.actionCalls,1)
  assert.equal(result.calls.length,1)
  assert.equal(result.calls[0].url,
    new URL(base).origin+'/api/proxy?url='+
    encodeURIComponent('https://media.example.test/real-song.mp3?token=123'))
  assert.match(result.status,/原生播放组件/)
  assert.deepEqual(errors,[])
  console.log('PASS: real source manager waits for Flower async inited, activates source, resolves musicUrl and invokes safe Android native audio bridge')
} finally {
  await browser.close()
}
