import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const songs=Array.from({length:50},(_,i)=>({
  id:String(i+1),source:'wy',name:'Scroll test song '+(i+1),
  singer:'Artist '+i,albumName:'Album '+i,interval:200000
}))
const playlist={id:'scroll-test',name:'长歌单滚动测试',creator:'Tester',trackCount:328}
async function scenario(viewport,legacy) {
  const page=await browser.newPage({viewport,userAgent:legacy?
    'Mozilla/5.0 (Linux; Android 4.4.2; Via) AppleWebKit/537.36 Mobile Safari/537.36':
    'Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/154.0 Safari/537.36'})
  const errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.addInitScript((legacyMode)=>{
    localStorage.setItem('only-testing-online-music.default-source-disabled','1')
    // Emulate Android 4.4 WebView: no CSS sticky, even on current Chromium.
    if(legacyMode && window.CSS) {
      try { window.CSS.supports=function(){return false} }
      catch(e){try{Object.defineProperty(window.CSS,'supports',{value:function(){return false}})}catch(ignored){}}
    }
  },legacy)
  await page.route('**/api/netease-playlists?*',async route=>{
    const req=new URL(route.request().url())
    const payload=req.searchParams.has('id')?
      {playlist,songs,hasMore:true,nextOffset:50}:
      {playlists:[playlist],result:{playlists:[playlist]}}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(payload)})
  })
  try{
    await page.goto(base+'/',{waitUntil:'domcontentloaded'})
    await page.locator('.nav-item[data-view="playlist"]').click()
    await page.locator('#playlist-featured .playlist-open-button').first().click()
    await page.waitForFunction(()=>document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length===50)
    await page.waitForTimeout(150)
    const sample=()=>page.evaluate(()=>{
      const r=s=>{const n=document.querySelector(s);if(!n)return null;const b=n.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,height:b.height,display:getComputedStyle(n).display,position:getComputedStyle(n).position}}
      return {
        scroll:document.documentElement.scrollTop||document.body.scrollTop||window.pageYOffset,
        topbar:r('.topbar'),nav:r('.nav-rail'),stack:r('#persistent-top-stack'),
        filter:r('#playlist-filter-stack'),player:r('.player-bar'),
        song:r('#playlist-detail-songs .playlist-song-row'),
        width:document.documentElement.clientWidth,
        scrollWidth:document.documentElement.scrollWidth
      }
    })
    const before=await sample()
    await page.evaluate(()=>{window.scrollTo(0,Math.max(document.body.scrollHeight,document.documentElement.scrollHeight))})
    await page.waitForTimeout(450)
    const after=await sample()
    const tolerance=3
    assert.ok(after.scroll>300,'Expected a long playlist to scroll ('+after.scroll+')')
    assert.ok(Math.abs(after.nav.top-before.nav.top)<tolerance,'Navigation rail must remain fixed')
    assert.ok(Math.abs(after.stack.top-before.stack.top)<tolerance,'Search and playback status must remain pinned')
    assert.ok(Math.abs(after.filter.top-before.filter.top)>2 || after.filter.top>=after.stack.bottom-2,
      'Filters must not scroll away above the search/status stack')
    assert.ok(after.filter.top>=after.stack.bottom-2,'Playlist channels and categories may not hide behind search/status')
    assert.ok(after.filter.bottom<after.player.top-20,'Playlist content needs visible room above the player')
    assert.ok(after.nav.bottom<=after.player.top+2,'Navigation must not be hidden behind the player')
    assert.ok(after.scrollWidth<=after.width+2,'No horizontal overflow')
    assert.ok(await page.locator('#status').isVisible(),'Playback status must be visible')
    assert.ok(await page.locator('#view-playlist .category-pill.active').isVisible(),'Category controls must remain visible')
    assert.ok(await page.locator('#view-playlist .platform-pill.active').isVisible(),'Playlist platform must remain visible')
    await page.evaluate(()=>window.scrollTo(0,0))
    await page.waitForTimeout(150)
    const returned=await sample()
    assert.ok(Math.abs(returned.stack.top-before.stack.top)<tolerance,'Search should remain stable after scroll back')
    assert.ok(returned.filter.top>=returned.stack.bottom-2)
    if(legacy) {
      assert.equal(returned.stack.position,'fixed','Legacy search/status must use fixed fallback')
      assert.ok(['fixed','static','relative','sticky'].includes(returned.filter.position))
    }
    await page.locator('.nav-item[data-view="search"]').click()
    await page.waitForTimeout(100)
    assert.ok(await page.locator('#view-search').evaluate(n=>n.className.indexOf('active')>=0))
    assert.deepEqual(errors,[])
    console.log('PASS: persistent nav/search/status/playlist filters '+viewport.width+'px '+(legacy?'legacy Via':'modern'))
  }finally{await page.close()}
}
try{
  await scenario({width:1280,height:820},false)
  await scenario({width:390,height:844},false)
  await scenario({width:390,height:844},true)
  await scenario({width:1280,height:820},true)
}finally{await browser.close()}
