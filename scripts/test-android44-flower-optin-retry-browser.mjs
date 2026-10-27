import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
async function runScenario(needsImport) {
 const page=await browser.newPage({
  userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Chrome/30.0.0.0 Safari/537.36'
 })
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(()=>{
  localStorage.setItem('only-testing-online-music.default-source-disabled','1')
  window.__nativeTrackUrls=[]
  window.LXNativeAudio={
   isAvailable:function(){return true},
   play:function(url,token){window.__nativeTrackUrls.push(url)},
   pause:function(){},resume:function(){},seek:function(){}
  }
 })
 await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>window.OnlyTestingMusicApp&&window.LXSourceManager)
 await page.evaluate((needsImport)=>{
  var manager=window.LXSourceManager
  var original={
   id:'old',name:'Unnamed LX Source',url:'https://other.example.test/custom.js',
   sources:{},inited:true,runtime:{}
  }
  var flower={
   id:'flower',name:'野花🌷',
   url:'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
   sources:{wy:{actions:['musicUrl'],name:'网易云'}},inited:true,runtime:{}
  }
  var active=original
  manager.getActive=function(){return active}
  manager.getSources=function(){return needsImport?[original]:[original,flower]}
  manager.activate=function(id) {
   if(id==='flower'){active=flower;return flower}
   return null
  }
  manager.installVerifiedFlower=function(callback) {
   window.__flowerImportAttempts=(window.__flowerImportAttempts||0)+1
   setTimeout(function(){callback(null,flower)},5)
  }
  manager.requestAction=function(source,action,info,callback) {
   window.__flowerMusicUrlCalled=(window.__flowerMusicUrlCalled||0)+1
   callback(null,{url:'https://audio.example.test/fullsong.mp3?allowed=1'})
  }
  window.LXMusicSearch.resolveMusicUrl=function(source,info,quality,callback){
   callback(new Error('Huibq HTTP 503; TuneHub HTTP 530; GD Studio unavailable'))
  }
  window.OnlyTestingMusicApp.playMusic({
   id:'123',songmid:'123',name:'成都',singer:'赵雷',source:'wy',interval:200
  })
 },needsImport)
 await page.waitForSelector('#flower-source-retry-btn')
 assert.match(await page.locator('#status').textContent(),/Flower/)
 await page.locator('#flower-source-retry-btn').click()
 await page.waitForFunction(()=>window.__nativeTrackUrls.length===1)
 const result=await page.evaluate(()=>({
  active:window.LXSourceManager.getActive().name,
  nativeUrls:window.__nativeTrackUrls,
  musicCalls:window.__flowerMusicUrlCalled,
  imports:window.__flowerImportAttempts||0
 }))
 assert.equal(result.active,'野花🌷')
 assert.equal(result.musicCalls,1,'Must call LX source musicUrl, not the broken native resolver again')
 assert.equal(result.imports,needsImport?1:0,'Only import after an explicit click when not installed')
 const expected=new URL(base).origin+'/api/proxy?url='+
  encodeURIComponent('https://audio.example.test/fullsong.mp3?allowed=1')
 assert.equal(result.nativeUrls[0],expected,'Final Android native request stays on safe first-party proxy')
 assert.deepEqual(errors,[])
 await page.close()
 console.log('PASS: Flower retry '+(needsImport?'explicit import':'existing source')+
  ' activates requested LX source and sends same-origin native playback URL')
}
try{await runScenario(false);await runScenario(true)}finally{await browser.close()}
