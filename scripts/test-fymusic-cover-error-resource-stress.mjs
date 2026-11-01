import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Synthetic in-browser image responses and DOM stress only. No real NetEase,
// Flower source requests, licensed media, or real-device memory measurement.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,130)));
 await page.addInitScript(()=>{
   window.__fymusicMaxPendingDOMSet=0;
   // Probe the real list animation Set without exposing a production debug API.
   const originalAdd=Set.prototype.add;
   Set.prototype.add=function(value){
     const result=originalAdd.call(this,value);
     if(value instanceof HTMLElement&&value.classList.contains('playlist-song-row'))
       window.__fymusicMaxPendingDOMSet=Math.max(
         window.__fymusicMaxPendingDOMSet,this.size);
     return result;
   };
   Object.defineProperty(navigator,'mediaSession',{configurable:true,
     value:{metadata:null,setActionHandler(){},setPositionState(){},
       playbackState:'none'}});
   window.MediaMetadata=class{constructor(data){Object.assign(this,data)}};
 });
 const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY7kAAAAASUVORK5CYII=';
 let releasePending;
 const pending=new Promise(resolve=>{releasePending=resolve});
 await page.route(/https:\/\/p[0-9]+\.music\.126\.net\//,async route=>{
   const url=route.request().url();
   if(url.includes('pending.jpg'))await pending;
   if(url.includes('missing.jpg'))return route.fulfill({status:404,body:''});
   return route.fulfill({status:200,contentType:'image/png',
      body:Buffer.from(pixel,'base64')});
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls &&
   document.querySelector('#lyrics-cover-image') &&
   document.querySelector('#playlist-detail-songs')),null,{timeout:18000});
 const push=(id,name,image)=>page.evaluate(({id,name,image})=>{
   const next={id,source:'wy',name,singer:name+' singer',
     albumName:name+' album',image};
   window.__LXNowPlayingTrack=next;
   window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:next}));
 },{id,name,image});
 const urlA='https://p1.music.126.net/ok-a.jpg';
 const urlB='https://p1.music.126.net/pending.jpg';
 const urlD='https://p2.music.126.net/ok-d.jpg';
 await push('501','Track A',urlA);
 await page.waitForFunction(()=>[...document.querySelectorAll(
   '#player-cover-image,#lyrics-cover-image')].every(
   image=>image.complete&&image.naturalWidth>0));
 await push('502','Track B',urlB);
 await page.waitForFunction(url=>[...document.querySelectorAll(
   '#player-cover-image,#lyrics-cover-image')].every(
   image=>image.getAttribute('src')===url&&!image.complete),urlB);
 // A's old request can dispatch a late error while B is still loading.
 // An in-flight B request must not be cleared by that stale event.
 await page.evaluate(()=>{
   document.querySelector('#player-cover-image').dispatchEvent(new Event('error'));
 });
 const pendingStatus=await page.evaluate(()=>({
   mini:document.querySelector('#player-cover-image').getAttribute('src'),
   full:document.querySelector('#lyrics-cover-image').getAttribute('src'),
   box:document.querySelector('.player-art').classList.contains('has-album-art'),
   os:navigator.mediaSession.metadata?.artwork?.[0]?.src
 }));
 assert.equal(pendingStatus.mini,urlB);
 assert.equal(pendingStatus.full,urlB);
 assert.equal(pendingStatus.box,true);
 assert.equal(pendingStatus.os,urlB);
 releasePending();
 await page.waitForFunction(()=>[...document.querySelectorAll(
   '#player-cover-image,#lyrics-cover-image')].every(
   image=>image.complete&&image.naturalWidth>0),null,{timeout:16000});
 // Current-track image 404 should show neutral fallback and remove broken
 // cover from OS metadata, but keep song title/artist unchanged.
 await push('503','Track C','https://p1.music.126.net/missing.jpg');
 await page.waitForFunction(()=>[...document.querySelectorAll(
   '#player-cover-image,#lyrics-cover-image')].every(
   img=>!img.hasAttribute('src')) &&
   !(navigator.mediaSession.metadata?.artwork||[]).length,
   null,{timeout:16000});
 const broken=await page.evaluate(()=>({
   hasArt:document.querySelector('.player-art').classList.contains('has-album-art'),
   title:document.querySelector('#lyrics-title').textContent,
   osTitle:navigator.mediaSession.metadata?.title,
   osArtist:navigator.mediaSession.metadata?.artist
 }));
 assert.equal(broken.hasArt,false);
 assert.equal(broken.title,'Track C');
 assert.equal(broken.osTitle,'Track C');
 assert.equal(broken.osArtist,'Track C singer');
 await push('504','Track D',urlD);
 await page.waitForFunction(()=>[...document.querySelectorAll(
   '#player-cover-image,#lyrics-cover-image')].every(
   img=>img.complete&&img.naturalWidth>0),null,{timeout:16000});
 // An old synthetic failure on already loaded D must be ignored.
 await page.evaluate(()=>{
   document.querySelector('#lyrics-cover-image').dispatchEvent(new Event('error'));
 });
 const stableD=await page.evaluate(()=>({
   mini:document.querySelector('#player-cover-image').getAttribute('src'),
   full:document.querySelector('#lyrics-cover-image').getAttribute('src'),
   os:navigator.mediaSession.metadata?.artwork?.[0]?.src,
   visible:!document.querySelector('#lyrics-cover-image').hidden
 }));
 assert.deepEqual(stableD,{mini:urlD,full:urlD,os:urlD,visible:true});
 // MutationObserver used to hold every new DOM node in newlyAdded while
 // the background tab had no RAF. Test a large replace and re-replace.
 const hidden=await page.evaluate(async()=>{
   window.__fymusicHidden=true;
   Object.defineProperty(document,'hidden',{configurable:true,
     get:()=>window.__fymusicHidden});
   const list=document.querySelector('#playlist-detail-songs');
   const make=(prefix,count)=>{
     const fragment=document.createDocumentFragment();
     for(let i=0;i<count;i++){
       const row=document.createElement('div');
       row.className='playlist-song-row';
       row.textContent=prefix+i;
       fragment.appendChild(row);
     }
     return fragment;
   };
   list.replaceChildren(make('old-',5000));
   await Promise.resolve();await Promise.resolve();
   const firstMax=window.__fymusicMaxPendingDOMSet;
   list.replaceChildren(make('new-',4000));
   await Promise.resolve();await Promise.resolve();
   const secondMax=window.__fymusicMaxPendingDOMSet;
   window.__fymusicHidden=false;
   document.dispatchEvent(new Event('visibilitychange'));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const animated=[...list.children].filter(el=>el.dataset.motionSeen==='1');
   return {firstMax,secondMax,total:list.children.length,
     animated: animated.length,firstAnimated:animated[0]?.textContent};
 });
 assert.ok(hidden.firstMax<=12&&hidden.secondMax<=12,
   'background animation buffer must retain no more than twelve DOM rows');
 assert.equal(hidden.total,4000);
 assert.equal(hidden.animated,12,
   'foreground flush should animate the first twelve NEW, still attached rows');
 assert.equal(hidden.firstAnimated,'new-0');
 // Rapid song changes must retain only the final cover in the two fixed img
 // elements, without leaving queued detached cover DOM nodes in the page.
 await page.evaluate(()=>{
   for(let i=0;i<180;i++){
     const track={id:'rapid-'+i,source:'kw',name:'Rapid '+i,
       singer:'Synthetic',albumName:'Fixture',image:''};
     window.__LXNowPlayingTrack=track;
     window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:track}));
   }
 });
 const end=await page.evaluate(()=>({
   name:document.querySelector('#lyrics-title').textContent,
   coverCount:document.querySelectorAll('#player-cover-image,#lyrics-cover-image').length,
   brokenSrcCount:[...document.querySelectorAll(
     '#player-cover-image,#lyrics-cover-image')].filter(img=>img.hasAttribute('src')).length,
   osArtwork:(navigator.mediaSession.metadata?.artwork||[]).length
 }));
 assert.deepEqual(end,{name:'Rapid 179',coverCount:2,brokenSrcCount:0,osArtwork:0});
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_COVER_ERROR_RESOURCE_STRESS_PASS '+JSON.stringify({
   pendingCoverSurvivesStaleError:true,
   current404ClearsBothCoversAndOsArtwork:true,
   laterValidCoverUnaffected:true,
   maxQueuedAnimationElements:hidden.secondMax,
   backgroundReplaceReleasesStaleNodes:true,
   foregroundNewRowsAnimated:hidden.animated,
   rapidTrackChanges:180,
   fixedCoverDomNodes:end.coverCount,
   syntheticOnly:true
 }));
}finally{await browser.close()}
