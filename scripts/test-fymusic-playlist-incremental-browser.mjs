import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// The catalog is synthetic and fully intercepted: no real music or catalog
// API is requested. This verifies the actual playlist screen interaction.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const fixtureId='fymusic-ui-page-stress';
const playlist={id:fixtureId,source:'wy',name:'Synthetic FyMusic playlist',
  creator:'FyMusic QA',trackCount:100};
const songs=(offset)=>Array.from({length:50},(_,i)=>({
  id:'fixture-track-'+(offset+i),source:'wy',name:'Synthetic song '+(offset+i),
  singer:'Fixture performer',albumName:'Synthetic release',interval:240
}));
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,120)));
 await page.addInitScript(({key,data})=>{
   try{localStorage.setItem(key,JSON.stringify(data));}catch{}
 },{key:'only-testing-online-music.playlist-favorites',data:[playlist]});
 let releaseSecond;
 const secondGate=new Promise(r=>{releaseSecond=r});
 const offsets=[];
 await page.route('**/api/netease-playlists?**',async route=>{
   const url=new URL(route.request().url());
   if(url.searchParams.get('id')!==fixtureId)return route.continue();
   const offset=Number(url.searchParams.get('offset')||0);
   offsets.push(offset);
   if(offset>0)await secondGate;
   const body={playlist,songs:songs(offset),nextOffset:offset+50,
     hasMore:offset===0};
   await route.fulfill({status:200,contentType:'application/json',
     body:JSON.stringify(body)});
 });
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
 await page.locator('.nav-item[data-view="mylist"]').click();
 await page.locator('.my-tab[data-my-tab="playlist-favorite"]').click();
 await page.locator('#playlist-favorite-list .playlist-open-button').click();
 await page.waitForFunction(()=>document.querySelectorAll(
   '#playlist-detail-songs .playlist-song-row').length===50,
 null,{timeout:12000});
 const original=await page.evaluate(()=>{
   const first=document.querySelector('#playlist-detail-songs .playlist-song-row');
   window.__fymusicPlaylistFirstRow=first;
   first.focus();
   return {key:first.getAttribute('data-song-key'),
     focused:document.activeElement===first};
 });
 assert.equal(original.focused,true,'first row must be keyboard-focusable');
 await page.evaluate(()=>document.querySelector('#playlist-detail-footer')?.scrollIntoView());
 releaseSecond();
 await page.waitForFunction(()=>document.querySelectorAll(
   '#playlist-detail-songs .playlist-song-row').length===100,
 null,{timeout:14000});
 const appended=await page.evaluate(()=>{
   const rows=[...document.querySelectorAll('#playlist-detail-songs .playlist-song-row')];
   const first=rows[0];
   const later=rows[50];
   return {size:rows.length,oldNodePreserved:first===window.__fymusicPlaylistFirstRow,
     focusPreserved:document.activeElement===first,
     firstKey:first.getAttribute('data-song-key'),
     nextKey:later.getAttribute('data-song-key'),
     lastIndex:rows[99].getAttribute('data-track-index'),
     animations:rows.slice(50).filter(r=>r.dataset.motionSeen==='1').length};
 });
 assert.deepEqual(offsets,[0,50],
   'pagination must not silently make extra catalog requests');
 assert.equal(appended.size,100);
 assert.equal(appended.oldNodePreserved,true,
   'appending another page must not reconstruct existing row DOM');
 assert.equal(appended.focusPreserved,true,
   'keyboard focus on a previously loaded song must remain on that row');
 assert.equal(appended.firstKey,'wy:fixture-track-0');
 assert.equal(appended.nextKey,'wy:fixture-track-50');
 assert.equal(appended.lastIndex,'99');
 assert.ok(appended.animations<=12,
   'newly loaded 50 rows must not all animate at the same time');
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_PLAYLIST_INCREMENTAL_BROWSER_PASS '+JSON.stringify({
   pages:2,rows:100,networkRequests:offsets.length,
   existingNodesPreserved:true,keyboardFocusPreserved:true,
   correctTrackIndexes:true,appendedAnimations:appended.animations,
   syntheticCatalogOnly:true
 }));
}finally{await browser.close();}
