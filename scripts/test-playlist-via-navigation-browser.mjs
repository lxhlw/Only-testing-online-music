import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({viewport:{width:375,height:667},
 userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; Via) AppleWebKit/537.36 Mobile Safari/537.36'})
const errors=[]
page.on('pageerror', e=>errors.push(String(e)))
const results={playlists:[{id:'playlist-123',name:'成都测试歌单',creator:'测试者',trackCount:2,description:'两个测试条目'}]}
await page.route('**/api/netease-playlists?*',async route=>{
 const u=new URL(route.request().url())
 const data=u.searchParams.has('id')?{
   playlist:results.playlists[0],
   songs:[
     {id:'song-1',source:'wy',name:'成都',singer:'赵雷',interval:310000},
     {id:'song-2',source:'wy',name:'稻香',singer:'周杰伦',interval:225000}
   ],nextOffset:2,hasMore:false
 }:results
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)})
})
// No remote source fetch is necessary to test playlist detail stability.
await page.goto(base+'/',{waitUntil:'domcontentloaded'})
await page.locator('.nav-item[data-view="playlist"]').click()
await page.waitForFunction(() => document.querySelectorAll('#playlist-featured .playlist-card').length>0)
const button=page.locator('#playlist-featured .playlist-open-button').first()
await button.dispatchEvent('touchend')
await button.click()
await page.evaluate(() => {
  // Simulate an old WebView firing another delayed click after touchend.
  const b=document.querySelector('#playlist-featured .playlist-open-button')
  if(b && typeof b.onclick==='function') b.onclick({stopPropagation:function(){}})
})
await page.waitForFunction(() => {
 const panel=document.querySelector('#playlist-detail-panel')
 return panel&&!panel.className.includes('hidden')&&document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length===2
})
await page.waitForTimeout(2200)
const state=await page.evaluate(()=>({
 visible: !document.querySelector('#playlist-detail-panel').className.includes('hidden'),
 view:document.querySelector('#view-playlist').className,
 title:document.querySelector('#playlist-detail-name').textContent,
 songs:document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length
}))
assert.equal(state.visible,true,'Playlist details may not disappear after opening')
assert.match(state.view,/active/)
assert.equal(state.title,'成都测试歌单')
assert.equal(state.songs,2)
assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row button').first().textContent(),'播放')
await button.evaluate(el => {
  // An already-open card must not clear loaded results on ghost clicks.
  if(el.onclick) el.onclick({stopPropagation:function(){}})
})
assert.equal(await page.locator('#playlist-detail-songs .playlist-song-row').count(),2)
await page.locator('#playlist-detail-songs .playlist-song-row button').first().click()
assert.equal(await page.locator('#playlist-detail-panel').evaluate(x=>x.className.includes('hidden')),false,
 'Attempting to play a playlist track must not navigate away')
await page.locator('#playlist-back-btn').click()
assert.equal(await page.locator('#playlist-detail-panel').evaluate(x=>x.className.includes('hidden')),true)
assert.deepEqual(errors,[])
console.log('PASS: Via-style touch/click opens playlist, keeps song list visible and supports song action/back')
await browser.close()
