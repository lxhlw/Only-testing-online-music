import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const songs=Array.from({length:50},(_,i)=>({
  id:String(i+1),source:'wy',name:'Long playlist song '+(i+1),
  singer:'Artist '+i,albumName:'Album '+i,interval:200000
}))
const playlist={id:'modern-long-list',name:'现代长歌单',creator:'Tester',trackCount:328}
try{
  for(const viewport of [{width:1280,height:820},{width:390,height:844}]){
    const page=await browser.newPage({viewport})
    const failures=[]
    page.on('pageerror',error=>failures.push(String(error)))
    await page.addInitScript(()=>{
      localStorage.setItem('only-testing-online-music.default-source-disabled','1')
    })
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
      await page.waitForFunction(()=>
        document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length===50)
      const geometry=()=>page.evaluate(()=>{
        function box(sel){
          const e=document.querySelector(sel)
          if(!e)return null
          const r=e.getBoundingClientRect()
          return {top:r.top,bottom:r.bottom,width:r.width,position:getComputedStyle(e).position}
        }
        return {
          scroll:window.scrollY,
          topbar:box('.topbar'),
          nav:box('.nav-rail'),
          stack:box('#persistent-top-stack'),
          filter:box('#playlist-filter-stack'),
          player:box('.player-bar'),
          pageWidth:document.documentElement.scrollWidth,
          width:document.documentElement.clientWidth,
          pageHeight:document.documentElement.scrollHeight
        }
      })
      const before=await geometry()
      await page.evaluate(()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:'instant'}))
      await page.waitForTimeout(320)
      const after=await geometry()
      console.log('Playlist geometry '+viewport.width+'px:',JSON.stringify({before,after}))
      if(after.pageWidth>after.width+2){
        const overflowing=await page.evaluate(()=>{
          const width=document.documentElement.clientWidth
          return Array.from(document.querySelectorAll('body *')).map(el=>{
            const rect=el.getBoundingClientRect()
            return {tag:el.tagName.toLowerCase(),id:el.id,cls:String(el.className||'').slice(0,80),left:Math.round(rect.left),right:Math.round(rect.right),width:Math.round(rect.width)}
          }).filter(el=>el.right>width+2).sort((a,b)=>b.right-a.right).slice(0,12)
        })
        console.log('Horizontal overflow candidates:',JSON.stringify(overflowing))
      }
      assert.ok(after.scroll>300,'Long playlist must be scrollable')
      assert.ok(after.pageWidth<=after.width+2,'Long playlist must not scroll sideways')
      assert.ok(after.nav.top>=0,'Navigation must remain onscreen')
      assert.ok(after.stack.top>=after.topbar.bottom-3,'Search must not hide behind header')
      assert.ok(after.filter.bottom<=after.player.top-10,
        'Playlist filters must not overlap the floating player')
      assert.equal(await page.locator('#playlist-filter-stack').isVisible(),false,
        'Category filters must not appear while browsing one playlist')
      assert.equal(await page.locator('#global-search-input').isVisible(),false,
        'Playlist detail must not expose an ineffective global search')
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}))
      await page.locator('#playlist-back-btn').click()
      await page.waitForFunction(()=>!document.querySelector('#view-playlist').classList.contains('is-detail-open'))
      assert.equal(await page.locator('#playlist-filter-stack').isVisible(),true,
        'Returning to discovery must restore filters')
      assert.equal(await page.locator('#view-playlist .category-pill.active').isVisible(),true)
      assert.equal(await page.locator('[data-catalog-source="wy"]').isVisible(),true,
        'Single available playlist platform is a label, not a fake toggle')
      assert.deepEqual(failures,[])
      console.log('PASS: modern playlist sticky navigation '+viewport.width+'px')
    }finally{await page.close()}
  }
}finally{await browser.close()}
