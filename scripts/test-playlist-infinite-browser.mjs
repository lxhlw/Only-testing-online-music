import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const catalogs=Array.from({length:43},(_,i)=>({
  id:'catalog-'+i,name:'歌单 '+(i+1),
  coverImgUrl:'',source:'wy',trackCount:105,creator:'测试用户'
}))
const tracks=Array.from({length:105},(_,i)=>({
  id:'track-'+i,name:'歌曲 '+(i+1),source:'wy',singer:'歌手',
  albumName:'专辑',interval:225000
}))
const requestLog=[]
try{
  for(const width of [1280,768,424,390,360,320]){
    const page=await browser.newPage({viewport:{width,height:820}})
    const errors=[]
    page.on('pageerror',e=>errors.push(String(e)))
    await page.addInitScript(()=>{
      localStorage.setItem('only-testing-online-music.default-source-disabled','1')
    })
    await page.route('**/api/netease-playlists?*',async route=>{
      const q=new URL(route.request().url()).searchParams
      const offset=Number(q.get('offset')||0)
      const limit=Number(q.get('limit')||20)
      const detail=q.has('id')
      requestLog.push({width,detail,offset})
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(
        detail?{
          playlist:{id:q.get('id'),name:'多页歌单',creator:'测试',trackCount:105},
          songs:tracks.slice(offset,offset+limit),
          nextOffset:offset+limit,hasMore:offset+limit<105
        }:{
          result:{playlists:catalogs.slice(offset,offset+limit),playlistCount:43}
        }
      )})
    })
    try{
      await page.goto(base+'/',{waitUntil:'domcontentloaded'})
      const initialGeometry=await page.evaluate(()=>({
        viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
        bodyWidth:document.body.scrollWidth,
        activeViews:[...document.querySelectorAll('.view-panel')].filter(n=>n.classList.contains('active')).length
      }))
      assert.ok(initialGeometry.documentWidth<=width+1&&initialGeometry.bodyWidth<=width+1,
        'No horizontal overflow at '+width+'px: '+JSON.stringify(initialGeometry))
      assert.equal(initialGeometry.activeViews,1,
        'Only one main view may be active at '+width+'px: '+JSON.stringify(initialGeometry))
      if(width<741){
        await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'))
        await page.locator('.mobile-menu-button').click()
        await page.waitForFunction(()=>{
          const r=document.querySelector('.nav-rail')?.getBoundingClientRect()
          return r&&r.left>=-1&&r.right>200
        })
        const drawer=await page.evaluate(()=>{
          const rail=document.querySelector('.nav-rail')
          const b=rail.getBoundingClientRect()
          const sample=document.elementFromPoint(95,Math.min(420,innerHeight-100))
          return {parent:rail.parentElement?.tagName,bounds:{
            left:b.left,top:b.top,right:b.right,bottom:b.bottom,height:b.height},
            sampleInDrawer:Boolean(sample?.closest('.nav-rail')),
            navCount:rail.querySelectorAll('.nav-item').length}
        })
        assert.equal(drawer.parent,'BODY','Mobile navigation must be portaled to body')
        assert.ok(drawer.bounds.height>=800&&drawer.bounds.top>=-1&&drawer.sampleInDrawer,
          'Full-height drawer must not be clipped or covered: '+JSON.stringify(drawer))
        assert.equal(drawer.navCount,5,'All five destinations remain visible in drawer')
      }
      await page.locator('.nav-item[data-view="playlist"]').click()
      await page.waitForFunction(()=>document.querySelectorAll('#playlist-featured .playlist-card').length>=20)
      const initial=await page.locator('#playlist-featured .playlist-card').count()
      assert.equal(initial,20,'Initial 20 playlist cards')
      for(const total of [40,43]){
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
        await page.waitForFunction(n=>document.querySelectorAll('#playlist-featured .playlist-card').length>=n,total,
          {timeout:7000})
      }
      const unique=await page.locator('#playlist-featured .playlist-card').evaluateAll(nodes=>
        new Set(nodes.map(n=>n.querySelector('.playlist-name')?.textContent)).size)
      assert.equal(unique,43,'Every catalog card is unique')
      assert.match(await page.locator('#playlist-featured-footer').textContent(),/已全部加载/)
      const catalogPages=requestLog.filter(r=>r.width===width&&!r.detail).map(r=>r.offset)
      assert.deepEqual([...new Set(catalogPages)],[0,20,40],
        'Catalog scroll must fetch true subsequent offsets: '+catalogPages)
      if(width>=741){
        const controls=await page.locator('#playlist-featured .playlist-card').evaluateAll(cards=>{
          const firstTop=Math.round(cards[0].getBoundingClientRect().top)
          const row=cards.filter(card=>Math.abs(Math.round(card.getBoundingClientRect().top)-firstTop)<2)
          return row.map(card=>{
            const a=card.querySelector('.playlist-card-actions').getBoundingClientRect()
            const buttons=[...card.querySelectorAll('.playlist-card-actions button')]
              .map(b=>b.getBoundingClientRect().height)
            return {top:Math.round(a.top),buttons}
          })
        })
        assert.equal(new Set(controls.map(c=>c.top)).size,1,
          'Desktop playlist buttons must align to the same vertical baseline: '+JSON.stringify(controls))
        assert.ok(controls.every(c=>c.buttons.every(h=>Math.abs(h-38)<1)),
          'Both actions must share a 38px height: '+JSON.stringify(controls))
      }
      await page.evaluate(()=>window.scrollTo(0,0))
      await page.locator('#playlist-featured .playlist-card').first().evaluate(e=>e.click())
      await page.waitForFunction(()=>document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length>=50)
      const detailGeometry=await page.evaluate(()=>({
        viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
        bodyWidth:document.body.scrollWidth,
        activeViews:[...document.querySelectorAll('.view-panel')].filter(n=>n.classList.contains('active')).length
      }))
      assert.ok(detailGeometry.documentWidth<=width+1&&detailGeometry.bodyWidth<=width+1,
        'Playlist detail must not create horizontal overflow at '+width+'px: '+JSON.stringify(detailGeometry))
      assert.equal(detailGeometry.activeViews,1,
        'Playlist detail must not reveal multiple main views: '+JSON.stringify(detailGeometry))
      for(const total of [100,105]){
        await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight))
        await page.waitForFunction(n=>document.querySelectorAll('#playlist-detail-songs .playlist-song-row').length>=n,total,
          {timeout:7000})
      }
      assert.match(await page.locator('#playlist-detail-footer').textContent(),/已全部加载/)
      assert.equal(await page.locator('#playlist-load-more-btn').isVisible(),false,
        'Normal auto-loading requires no manual button')
      const detailPages=requestLog.filter(r=>r.width===width&&r.detail).map(r=>r.offset)
      assert.deepEqual([...new Set(detailPages)],[0,50,100],
        'Playlist detail should fetch 0,50,100 exactly: '+detailPages)
      assert.equal(errors.length,0,'No browser errors: '+errors.join(' | '))
      console.log('PASS playlist infinite scroll, drawer and uniform controls',width+'px')
    }finally{await page.close()}
  }
}finally{await browser.close()}
