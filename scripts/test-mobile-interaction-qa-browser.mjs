import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const favorite={id:'123',name:'我的收藏歌单',creator:'朋友',source:'wy',trackCount:65,coverImgUrl:''}
const song=(i)=>({id:String(i+1),name:'收藏歌曲 '+(i+1),singer:'测试歌手',source:'wy',interval:180000})
try{
 for(const width of [320,390,424]){
  const page=await browser.newPage({viewport:{width,height:820}})
  const errors=[]
  page.on('pageerror',e=>errors.push(String(e)))
  await page.addInitScript(data=>{
    localStorage.setItem('only-testing-online-music.playlist-favorites',JSON.stringify([data]))
    localStorage.setItem('only-testing-online-music.default-source-disabled','1')
  },favorite)
  await page.route('**/api/netease-playlists?*',async route=>{
    const q=new URL(route.request().url()).searchParams
    const offset=Number(q.get('offset')||0)
    const content=q.has('id')?{
      playlist:favorite,songs:Array.from({length:Math.min(50,65-offset)},(_,i)=>song(offset+i)),
      nextOffset:Math.min(65,offset+50),hasMore:offset+50<65
    }:{result:{playlists:[favorite],playlistCount:1}}
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(content)})
  })
  await page.route('**/api/qq-catalog?*',async route=>{
    const q=new URL(route.request().url()).searchParams
    const value=q.get('s')||''
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      result:{playlists:[{id:'87654',source:'tx',name:value+'精选歌单',trackCount:20}],playlistCount:1},source:'tx'
    })})
  })
  const navigate=async view=>{
    await page.locator('.mobile-menu-button').click()
    await page.waitForFunction(()=>document.querySelector('.nav-rail')?.getBoundingClientRect().left>=-1)
    const navRows=await page.locator('.nav-item').evaluateAll(nodes=>nodes.map(n=>{
      const t=n.querySelector('span:last-child'),rect=t.getBoundingClientRect()
      return {label:t.textContent.trim(),width:rect.width,height:rect.height,
        nowrap:getComputedStyle(t).whiteSpace,
        parentWidth:n.getBoundingClientRect().width,
        navWidth:n.parentElement.getBoundingClientRect().width,
        railWidth:n.closest('.nav-rail').getBoundingClientRect().width,
        display:getComputedStyle(n).display,
        columns:getComputedStyle(n).gridTemplateColumns}
    }))
    assert.ok(navRows.every(r=>r.width>=55&&r.height<=30&&r.nowrap==='nowrap'),
      'All drawer labels must occupy one full row: '+JSON.stringify(navRows))
    await page.locator('.nav-item[data-view="'+view+'"]').click()
  }
  try{
   await page.goto(base+'/',{waitUntil:'domcontentloaded'})
   await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'))
   await page.waitForFunction(()=>document.querySelectorAll('#channel-list .channel-button').length>1)
   await page.locator('.mobile-channel-toggle').click()
   const picker=await page.evaluate(()=>{
     const box=document.getElementById('channel-list')
     const rect=box.getBoundingClientRect()
     const last=box.querySelector('.channel-button:last-child')
     const r=last.getBoundingClientRect()
     const center=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)
     return {parent:box.parentElement?.tagName,top:rect.top,bottom:rect.bottom,
       width:rect.width,z:getComputedStyle(box).zIndex,
       childCount:box.querySelectorAll('.channel-button').length,
       lastVisible:center===last||last.contains(center)}
   })
   assert.equal(picker.parent,'BODY','Picker must escape the song-list stacking context')
   assert.ok(picker.top>=0&&picker.bottom<=820&&picker.childCount>=2&&picker.lastVisible,
     'Every platform option must be displayed and reachable: '+JSON.stringify(picker))
   await page.locator('#channel-list .channel-button').last().click()
   assert.equal(await page.locator('#channel-list').evaluate(n=>n.parentElement?.tagName),'DIV')
   await navigate('mylist')
   await page.locator('.my-tab[data-my-tab="playlist-favorite"]').click()
   assert.equal(await page.locator('#playlist-favorite-list .playlist-card').count(),1)
   // Enter from the saved library, after scrolling on the former page.
   await page.locator('#playlist-favorite-list .playlist-cover').first().click()
   await page.waitForFunction(()=>document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length>=50)
   assert.equal(await page.locator('#view-playlist.is-detail-open').isVisible(),true)
   assert.equal(await page.locator('#playlist-featured').isVisible(),false,
     'Old featured gallery must not appear above a detail')
   assert.equal(await page.locator('#playlist-featured-footer').isVisible(),false,
     'Old catalog loading footer must be absent inside a detail')
   const detail=await page.evaluate(()=>({
     scroll:window.scrollY,top:document.querySelector('#playlist-detail-panel').getBoundingClientRect().top,
     header:document.querySelector('.topbar').getBoundingClientRect().height,
     toolbar:document.querySelector('#playlist-detail-panel .playlist-detail-toolbar').getBoundingClientRect().top
   }))
   assert.ok(detail.scroll<=30&&detail.top<160,
     'Playlist detail must open at the top, not after a long gallery: '+JSON.stringify(detail))
   await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
   await page.waitForFunction(()=>document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length===65)
   await page.locator('#playlist-back-btn').click()
   assert.equal(await page.locator('#view-mylist').isVisible(),true,
     'Back from favorite should return to My Music')
   assert.equal(await page.locator('.my-tab[data-my-tab="playlist-favorite"]').getAttribute('class').then(x=>x.includes('active')),true)
   assert.equal(await page.locator('#playlist-favorite-list .playlist-card').count(),1)
   await navigate('search')
   await page.locator('.view-tab[data-search-kind="playlist"]').click()
   await page.locator('#search-playlist-view [data-catalog-source="tx"]').click()
   await page.locator('#global-search-input').fill('民谣')
   await page.locator('#global-search-btn').click()
   await page.waitForFunction(()=>document.querySelector('#playlist-results')?.textContent?.includes('民谣精选歌单'))
   assert.ok(errors.length===0,'No browser errors: '+errors.join('|'))
   console.log('PASS mobile full option picker, full-width drawer, favorite detail navigation and QQ search',width+'px')
  }finally{await page.close()}
 }
}finally{await browser.close()}
