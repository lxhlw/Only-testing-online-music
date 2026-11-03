import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const engines={chromium,webkit};
const sizes=[
 {name:'desktop',width:1440,height:900},
 {name:'mobile',width:390,height:844},
 {name:'small-mobile',width:320,height:640}
];
function rgb(str){
 const m=String(str).match(/^rgba?\(\s*(\d+)[, ]+\s*(\d+)[, ]+\s*(\d+)/);
 return m?[Number(m[1]),Number(m[2]),Number(m[3])]:null;
}
function isDark(value){
 const c=rgb(value);
 return c && c.reduce((a,b)=>a+b,0)<410;
}
const all=[];
for(const [engine,adapter] of Object.entries(engines)){
 const browser=await adapter.launch({headless:true});
 try{
  for(const viewport of sizes){
   const page=await browser.newPage({viewport,hasTouch:viewport.name!=='desktop'});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   await page.goto(base+'/?ui2=1',{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.FyMusicUI2Preview?.enabled===true,null,{timeout:20000});
   if(viewport.name!=='desktop')
     await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'),null,{timeout:10000});
   const get=sel=>page.locator(sel).first().evaluate(e=>({
    background:getComputedStyle(e).backgroundColor,
    color:getComputedStyle(e).color,
    border:getComputedStyle(e).borderRadius,
    display:getComputedStyle(e).display,
    width:e.getBoundingClientRect().width
   }));
   const pick=async(sel)=>{const x=await get(sel);assert.ok(isDark(x.background),
     engine+' '+viewport.name+' '+sel+' not dark: '+JSON.stringify(x));return x;};
   await pick(viewport.name==='desktop'?'.global-search':
     'html.modern-web.fy-ui2.mobile-shell-ready .global-search');
   const suggestion=await get('.search-inspiration');
   assert.ok((await page.locator('.search-inspiration').evaluate(
     e=>getComputedStyle(e).backgroundImage)).includes('gradient'),
     'Search hero missing gradient: '+engine+' '+viewport.name);
   await page.evaluate(()=>{
    // Visual fixtures are DOM-only, never part of user playlists or audio.
    const p=document.getElementById('playlist-featured');
    if(p&&!p.querySelector('.ui2-test-card')){
     const card=document.createElement('div');
     card.className='playlist-card ui2-test-card';
     card.innerHTML='<div class="playlist-cover"></div><div class="playlist-name">视觉测试歌单</div>';
     p.appendChild(card);
    }
    const list=document.getElementById('search-results');
    if(list&&!list.querySelector('.ui2-test-song')){
     const song=document.createElement('div');
     song.className='search-song-row ui2-test-song';
     song.innerHTML='<div class="search-song-main"><span class="song-title">测试歌曲</span><span class="song-artist">示例歌手</span></div>';
     list.appendChild(song);
    }
   });
   await pick('.ui2-test-song');
   await pick('.ui2-test-card');
   const tabs=page.locator('.nav-item[data-view]');
   if(viewport.name==='desktop'){
    await tabs.filter({hasText:'歌单'}).first().click();
   }else{
    const menu=page.locator('.mobile-menu-button');
    await menu.click();
    assert.equal(await menu.getAttribute('aria-expanded'),'true');
    await page.locator('.nav-item[data-view="playlist"]').click();
    assert.equal(await menu.getAttribute('aria-expanded'),'false');
   }
   await page.waitForFunction(()=>document.documentElement.dataset.activeView==='playlist',
     null,{timeout:10000});
   await pick('.playlist-card');
   await page.evaluate(()=>{document.getElementById('view-playlist').classList.remove('is-detail-open');});
   if(viewport.name==='desktop'){
    await page.locator('.nav-item[data-view="ranking"]').click();
   }else{
    await page.locator('.mobile-menu-button').click();
    await page.locator('.nav-item[data-view="ranking"]').click();
   }
   await page.waitForFunction(()=>document.documentElement.dataset.activeView==='ranking',
     null,{timeout:10000});
   await pick('.ranking-layout');
   if(viewport.name==='desktop'){
    await page.locator('.nav-item[data-view="mylist"]').click();
   }else{
    await page.locator('.mobile-menu-button').click();
    await page.locator('.nav-item[data-view="mylist"]').click();
   }
   await page.waitForFunction(()=>document.documentElement.dataset.activeView==='mylist',
     null,{timeout:10000});
   await pick('#view-mylist .music-library-content');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2),
    false,'Horizontal overflow in '+engine+' '+viewport.name);
   assert.equal(await page.locator('audio').count(),1,'Must keep one native audio element');
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('.playlist-card').first().evaluate(
      e=>getComputedStyle(e).transitionDuration),'0s');
   assert.deepEqual(errors,[],'Unhandled browser errors '+engine+' '+viewport.name);
   all.push({engine,viewport:viewport.name,search:true,playlist:true,ranking:true,library:true,noOverflow:true});
   await page.close();
  }
 }finally{await browser.close()}
}
console.log('FYMUSIC_UI2_PHASE2_DESKTOP_MOBILE_BROWSER_PASS',JSON.stringify(all));
