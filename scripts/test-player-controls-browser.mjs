import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({headless: true})
const tracks=Array.from({length:3},(_,i)=>({
  id:String(i+1),songId:String(i+1),source:'wy',
  name:'Playback mode song '+(i+1),singer:'Artist '+(i+1),
  interval:200000,albumName:'Test'
}))
const playlist={id:'player-modes',name:'Player modes demo',creator:'QA',trackCount:3}
async function test(viewport, legacy){
 const page=await browser.newPage({viewport,userAgent:legacy?
   'Mozilla/5.0 (Linux; Android 4.4.2; Via) AppleWebKit/537.36 Mobile Safari/537.36':
   'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/154.0 Safari/537.36'})
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.addInitScript(()=>{
   localStorage.setItem('only-testing-online-music.default-source-disabled','1')
 })
 await page.route('**/api/netease-playlists?*',async route=>{
   const request=new URL(route.request().url())
   const payload=request.searchParams.has('id')?
     {playlist,songs:tracks,hasMore:false,nextOffset:3}:
     {playlists:[playlist],result:{playlists:[playlist]}}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)})
 })
 await page.route('https://player-mock.invalid/**',route=>route.fulfill({
   status:200,contentType:'audio/mpeg',body:''
 }))
 try{
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded'})
  await page.evaluate(()=>{
   window.LXSourceManager.getActive=function(){return null}
   window.LXMusicSearch.resolveMusicUrl=function(source,info,quality,cb){
     cb(null,{url:'https://player-mock.invalid/audio.mp3',provider:'netease-native'})
   }
   const audio=document.getElementById('audio')
   window.__simulatedTime=1
   window.__playCount=0
   window.__paused=true
   audio.load=function(){}
   Object.defineProperty(audio,'duration',{configurable:true,get:function(){return 200}})
   Object.defineProperty(audio,'currentTime',{
     configurable:true,get:function(){return window.__simulatedTime},
     set:function(v){window.__simulatedTime=Number(v)}
   })
   Object.defineProperty(audio,'readyState',{configurable:true,get:function(){return 4}})
   Object.defineProperty(audio,'paused',{configurable:true,get:function(){return window.__paused}})
   audio.pause=function(){window.__paused=true;audio.dispatchEvent(new Event('pause'))}
   audio.play=function(){window.__paused=false;window.__playCount++;
     audio.dispatchEvent(new Event('play'));return Promise.resolve()}
  })
  await page.locator('.nav-item[data-view="playlist"]').click()
  await page.locator('#playlist-featured .playlist-open-button').first().click()
  await page.locator('#playlist-detail-songs .playlist-song-row').first().click()
  await page.waitForFunction(()=>{
    const a=document.getElementById('audio')
    return a && a.getAttribute('src') && typeof a.onloadedmetadata==='function'
  },null,{timeout:5000})
  await page.evaluate(()=>{
    const a=document.getElementById('audio')
    if(a.onloadedmetadata)a.onloadedmetadata()
    if(a.onplaying)a.onplaying()
    a.dispatchEvent(new Event('timeupdate'))
  })
  console.log('INITIAL PLAYER STATE',await page.evaluate(()=>{
    const a=document.getElementById('audio')
    return {paused:a.paused,playCount:window.__playCount,src:a.getAttribute('src'),
      duration:a.duration,time:a.currentTime,readyState:a.readyState,
      seekDisabled:document.getElementById('player-seek').disabled,
      aria:document.getElementById('player-toggle-btn').getAttribute('aria-label'),
      status:document.getElementById('status').textContent}
  }))
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 1')
  assert.equal(await page.locator('#player-duration').textContent(),'3:20')
  assert.equal(await page.locator('#player-seek').isEnabled(),true,'Seek must enable after confirmed playback')
  console.log('TRANSPORT',await page.evaluate(()=>{
    const a=document.getElementById('audio')
    return {paused:a.paused,playCount:window.__playCount,src:a.getAttribute('src'),
      aria:document.getElementById('player-toggle-btn').getAttribute('aria-label'),
      seekDisabled:document.getElementById('player-seek').disabled}
  }))
  assert.equal(await page.locator('#player-toggle-btn').getAttribute('aria-label'),'暂停')
  assert.equal(await page.locator('#player-volume').inputValue(),'80','Default audio volume must not be muted')
  await page.locator('#player-toggle-btn').click()
  assert.equal(await page.locator('#player-toggle-btn').getAttribute('aria-label'),'播放')
  await page.locator('#player-toggle-btn').click()
  assert.equal(await page.locator('#player-toggle-btn').getAttribute('aria-label'),'暂停')
  console.log('PASS: '+viewport.width+' transport pause/play and volume defaults')

  await page.evaluate(()=>{
    const control=document.getElementById('player-seek')
    control.value='600'
    control.dispatchEvent(new Event('input',{bubbles:true}))
  })
  assert.equal(await page.locator('#player-current-time').textContent(),'2:00')
  assert.equal(await page.locator('#player-seek-preview').textContent(),'2:00')
  await page.evaluate(()=>{
    document.getElementById('player-seek').dispatchEvent(new Event('change',{bubbles:true}))
  })
  const seeked=await page.evaluate(()=>window.__simulatedTime)
  assert.ok(Math.abs(seeked-120)<0.01,'The actual HTMLAudioElement currentTime must be changed')
  assert.equal(await page.locator('#player-seek-preview').isVisible(),false)
  assert.equal(await page.locator('#player-current-time').textContent(),'2:00')
  console.log('PASS: range tap/drag commits real audio currentTime')

  await page.locator('#player-mode-btn').click()
  assert.equal(await page.locator('#player-mode-menu').isVisible(),true)
  await page.locator('#player-mode-menu button[data-mode="list-loop"]').click()
  assert.equal(await page.locator('#player-mode-menu').isVisible(),false)
  assert.equal(await page.locator('#player-mode-btn').getAttribute('data-mode'),'list-loop')
  assert.equal(await page.evaluate(()=>localStorage.getItem('only-testing-online-music.player-mode')),'list-loop')
  await page.locator('#playlist-detail-songs .playlist-song-row').nth(2).click()
  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 1','List loop must wrap 3 to 1')
  await page.locator('#prev-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 3','List loop must wrap 1 to 3')
  console.log('PASS: list-loop end and start boundaries')

  await page.locator('#player-mode-btn').click()
  await page.locator('#player-mode-menu button[data-mode="sequence"]').click()
  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 3','Sequence must stop at last song')
  await page.locator('#player-mode-btn').click()
  await page.locator('#player-mode-menu button[data-mode="single-loop"]').click()
  await page.evaluate(()=>{
    const a=document.getElementById('audio')
    window.__simulatedTime=199
    if(a.onloadedmetadata)a.onloadedmetadata()
    if(a.onplaying)a.onplaying()
    window.__playCountBeforeRepeat=window.__playCount
    if(a.onended)a.onended()
  })
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 3')
  assert.equal(await page.evaluate(()=>window.__simulatedTime),0,'Single loop must restart audio without re-resolution')
  assert.ok(await page.evaluate(()=>window.__playCount>window.__playCountBeforeRepeat),'Loop must call play()')
  console.log('PASS: single repeat loops same stream from beginning')

  await page.locator('#player-mode-btn').click()
  await page.locator('#player-mode-menu button[data-mode="shuffle"]').click()
  await page.locator('#playlist-detail-songs .playlist-song-row').first().click()
  await page.evaluate(()=>{window.__savedRandom=Math.random; Math.random=function(){return 0.8}})
  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 3')
  await page.locator('#prev-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 1')
  await page.locator('#next-track-btn').click()
  assert.equal(await page.locator('#player-title').textContent(),'Playback mode song 3')
  await page.evaluate(()=>{Math.random=window.__savedRandom})
  console.log('PASS: shuffle avoids immediate replay and Previous follows play history')

  const dimensions=await page.evaluate(()=>{
    const box=id=>{const r=document.getElementById(id).getBoundingClientRect()
      return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width}}
    return {seek:box('player-seek'),transport:box('player-toggle-btn'),
      mode:box('player-mode-btn'),next:box('next-track-btn'),bar:box('audio'),viewport:document.documentElement.clientWidth}
  })
  assert.ok(dimensions.seek.width>80,'Timeline must be draggable')
  assert.ok(dimensions.next.right<=dimensions.viewport+1,'Transport cannot overflow mobile viewport')
  assert.ok(dimensions.mode.left>=0,'Mode button cannot overflow')
  await page.locator('#player-mode-btn').click()
  assert.equal(await page.locator('#player-mode-menu').isVisible(),true)
  await page.locator('#player-title').click()
  assert.equal(await page.locator('#player-mode-menu').isVisible(),false,'Clicking outside closes mode menu')
  assert.deepEqual(errors,[])
  console.log('PASS: '+viewport.width+' custom player layout, mode menu and no runtime errors')
 }finally{await page.close()}
}
try {
 await test({width:1280,height:840},false)
 await test({width:390,height:844},true)
}finally{await browser.close()}
