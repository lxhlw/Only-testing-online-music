import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const flowerUrl='https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'
const flowerCode=[
 '/* @name 野花🌷 */',
 '(function(){',
 ' var api=globalThis.lx;',
 ' api.on(api.EVENT_NAMES.request,function(event){',
 '  window.__flowerMusicUrlCalls=(window.__flowerMusicUrlCalls||0)+1;',
 '  if(event.action!==\'musicUrl\')return Promise.reject(new Error(\'unsupported\'));',
 '  if(window.__rejectFlower)return Promise.reject(new Error(\'Flower unavailable\'));',
 '  return Promise.resolve({url:\'https://audio.example.test/song.mp3?auth=123\'});',
 ' });',
 ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
 '  wy:{name:\'网易云音乐\',actions:[\'musicUrl\'],qualitys:[\'128k\',\'320k\']}',
 ' }});',
 '})();'
].join('\n')
const browser=await chromium.launch({headless:true})
function bootstrap(cached){
 return {cached,flowerCode,flowerUrl}
}
async function scenario(cached,reject=false){
 const page=await browser.newPage({userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Chrome/30.0.0.0 Safari/537.36'})
 const errors=[],external=[]
 page.on('pageerror',err=>errors.push(String(err)))
 page.on('request',req=>{
   if(/huibq|lxmusicapi\.onrender|music-dl\.sayqz|music-api\.gdstudio/i.test(req.url())) external.push(req.url())
 })
 await page.addInitScript(({cached,flowerCode,flowerUrl})=>{
   window.__nativeTracks=[]
   window.__rejectFlower=false
   window.LXNativeAudio={
     isAvailable:function(){return true},
     play:function(url,token){window.__nativeTracks.push({url:url,token:token})},
     pause:function(){},resume:function(){},seek:function(){}
   }
   localStorage.setItem('only-testing-online-music.default-source-disabled','1')
   if(cached){
     localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
       {id:'old-source',url:'https://example.test/old.js',code:'/* @name Huibq */'},
       {id:'flower-existing',url:flowerUrl,name:'野花🌷',code:flowerCode}
     ]))
     localStorage.setItem('only-testing-online-music.active-source-id','old-source')
   }
 },bootstrap(cached))
 await page.route('**/pdone/lx-music-source/main/flower/latest.js',route=>
   route.fulfill({status:200,contentType:'application/javascript',headers:{'access-control-allow-origin':'*'},body:flowerCode}))
 await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>{
  var m=window.LXSourceManager;
  return m && m.getActive() && m.getActive().inited
 },null,{timeout:16000})
 const state=await page.evaluate(()=>({
   active:window.LXSourceManager.getActive().name,
   sources:window.LXSourceManager.getSources().map(x=>x.name),
   refresh:document.getElementById('restore-default-sources-btn').textContent,
   legacyImport: getComputedStyle(document.getElementById('verified-install-btn')).display,
   userImport:getComputedStyle(document.getElementById('install-btn')).display,
   searchChoices:[...document.querySelectorAll('#channel-list button')].length
 }))
 assert.equal(state.active,'野花🌷')
 assert.deepEqual(state.sources,['野花🌷'])
 assert.match(state.refresh,/野花/)
 assert.equal(state.legacyImport,'none')
 assert.equal(state.userImport,'none')
 assert.ok(state.searchChoices>=2,'Search channels remain separate from playback sources')
 await page.evaluate((reject)=>{
   window.__rejectFlower=reject
   window.LXMusicSearch.resolveMusicUrl=function(){
     window.__oldFallback=(window.__oldFallback||0)+1
     throw Error('Should never invoke legacy providers in APK')
   }
   window.LXMusicSearch.resolveMusicUrlFast=function(){
     window.__fastFallback=(window.__fastFallback||0)+1
     throw Error('Should never invoke parallel providers in APK')
   }
   window.OnlyTestingMusicApp.playMusic({
     id:'123',songmid:'123',source:'wy',name:'成都',singer:'赵雷',interval:180
   })
 },reject)
 if(reject){
   await page.waitForFunction(()=>/野花音源未取得可播放地址/.test(document.getElementById('status').textContent),null,{timeout:7500})
 }else{
   await page.waitForFunction(()=>window.__nativeTracks.length===1,null,{timeout:7500})
 }
 const result=await page.evaluate(()=>({
  calls:window.__flowerMusicUrlCalls||0,
  nativeTracks:window.__nativeTracks,
  oldFallback:window.__oldFallback||0,
  fastFallback:window.__fastFallback||0
 }))
 assert.equal(result.calls,1,'Only Flower may resolve the selected song')
 assert.equal(result.oldFallback,0,'Do not use serial old providers')
 assert.equal(result.fastFallback,0,'Do not use parallel old providers')
 assert.equal(result.nativeTracks.length,reject?0:1)
 if(!reject){
   const expected=new URL(base).origin+'/api/proxy?url='+
    encodeURIComponent('https://audio.example.test/song.mp3?auth=123')
   assert.equal(result.nativeTracks[0].url,expected)
   // Reproduce the device's "resolved, then playback abnormal" condition:
   // the native player reports failure AFTER Flower returned a valid URL.
   await page.evaluate(()=>{
     var played=window.__nativeTracks[0]
     window.LXNativeAudioEvent(played.token,'error',1,-1004)
   })
   const failed=await page.locator('#status').textContent()
   assert.match(failed,/野花已返回播放地址，但音频下载或播放失败/)
   assert.match(failed,/MediaPlayer 1 \/ -1004/)
   assert.equal(await page.evaluate(()=>window.__nativeTracks.length),1,
      'Native playback error must not trigger another resolver/transport')
 }
 assert.deepEqual(errors,[])
 assert.deepEqual(external,[],'No other LX playback services should be requested')
 await page.close()
 console.log('PASS: '+(cached?'cached':'fresh')+' Flower-only native APK '+(reject?'no-provider-fallback':'automatic audio playback'))
}
try{
 await scenario(true)
 await scenario(false)
 await scenario(true,true)
}finally{await browser.close()}
