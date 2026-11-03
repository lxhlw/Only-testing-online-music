import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// Real Migu source + original Flower audio, no mock responses.
// Only report song and LRC counts, never lyric text, signed audio URLs or headers.
const base=process.env.TEST_BASE_URL?.replace(/\/+$/,'');
const production=base==='https://only-testing-online-music.pages.dev';
assert.ok(production?process.env.FYMUSIC_ACCEPT_PRODUCTION==='1':
 /^https:\/\/[a-f0-9]{8}\.only-testing-online-music\.pages\.dev$/.test(base||''),
 'Only immutable Preview or explicitly accepted production may be tested');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1320,height:860}});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,null,{timeout:24000});
 assert.equal(await page.evaluate(()=>String(window.LXSourceManager.getActive()?.name||'').includes('野花')),true);
 await page.locator('.nav-item[data-view="search"]').click();
 await page.locator('#channel-list .channel-button[title="MG"]').click();
 let index=-1;
 for(const keyword of ['开始懂了','孙燕姿']){
  await page.locator('#global-search-input').fill(keyword);
  await page.locator('#global-search-btn').click();
  try{await page.waitForFunction(()=>window.__LXLastSearchResults?.some(s=>
   s.source==='mg'&&String(s.name||'').trim()==='开始懂了'&&
   String(s.singer||'').includes('孙燕姿')),null,{timeout:16000});}catch{}
  index=await page.evaluate(()=>window.__LXLastSearchResults?.findIndex(s=>
   s.source==='mg'&&String(s.name||'').trim()==='开始懂了'&&
   String(s.singer||'').includes('孙燕姿'))??-1);
  if(index>=0)break;
 }
 assert.ok(index>=0,'Migu target song is absent');
 const api=await page.evaluate(async index=>{
  const song=window.__LXLastSearchResults[index],id=String(song.copyrightId||song.id||''),
   url=String(song.lyricId||song.raw?.lyricUrl||song.raw?.lrcUrl||'');
  const allowed=/^[A-Za-z0-9_-]{1,80}$/.test(id)&&
    /^https:\/\/d\.musicapp\.migu\.cn\/prod\/file-service\/file-down01\//.test(url);
  if(!allowed)return {allowed:false,idPresent:!!id,lyricUrlPresent:!!url};
  const r=await fetch('/api/migu-lyrics?id='+encodeURIComponent(id)+'&url='+encodeURIComponent(url));
  const data=await r.json().catch(()=>({}));
  const lines=window.LXMusicLyrics.parseLrc(data.lyric||'');
  const knownReasons=new Set(['invalid_request','redirect_rejected','upstream_transient_status',
   'upstream_http_status','upstream_timeout','oversized_body','empty_body',
   'upstream_network','invalid_timed_lyric']);
  return {allowed:true,status:r.status,source:data.source,correctId:String(data.id)===id,
   lyricLines:lines.length,timed:lines.every(l=>Number.isFinite(l.time)),
   failureReason:knownReasons.has(data.reason)?data.reason:null,
   attempts:Number.isInteger(data.attempts)&&data.attempts>=0&&data.attempts<=2?data.attempts:null};
 },index);
 assert.equal(api.allowed,true,JSON.stringify(api));
 assert.equal(api.status,200,JSON.stringify(api));
 assert.equal(api.source,'mg');
 assert.equal(api.correctId,true);
 assert.ok(api.lyricLines>=10,JSON.stringify(api));
 assert.equal(api.timed,true);
 await page.locator('#audio').evaluate(a=>{a.muted=true;a.volume=0});
 await page.locator('#search-results .search-song-row .search-song-main').nth(index).click();
 await page.waitForFunction(()=>{
  const a=document.getElementById('audio');
  return a&&!a.paused&&a.readyState>=2&&a.currentTime>.8;
 },null,{timeout:35000});
 await page.locator('#player-cover-button').click();
 await page.locator('#lyrics-overlay').waitFor({state:'visible',timeout:7000});
 await page.waitForFunction(()=>document.querySelectorAll('#lyrics-lines .lyrics-line').length>=10,
  null,{timeout:14000});
 // Album art loads independently of audio and LRC; give the real image
 // request a bounded opportunity to finish instead of sampling it too early.
 // The subsequent assertion stays strict: no fake image or forced success.
 await page.waitForFunction(()=>{
  const img=document.getElementById('lyrics-cover-image');
  return !!img&&img.complete&&img.naturalWidth>0;
 },null,{timeout:15000});
 const on=await page.evaluate(()=>{
  const a=document.getElementById('audio'),btn=document.getElementById('detail-toggle-btn');
  return {audioPlaying:!a.paused,playIconVisible:getComputedStyle(btn.querySelector('.detail-play-icon')).display!=='none',
   pauseIconVisible:getComputedStyle(btn.querySelector('.detail-pause-icon')).display!=='none',
   coverLoaded:!!document.getElementById('lyrics-cover-image')?.naturalWidth,
   lines:document.querySelectorAll('#lyrics-lines .lyrics-line').length,
   status:document.getElementById('lyrics-status')?.textContent?.slice(0,45)};
 });
 assert.equal(on.audioPlaying,true);
 assert.equal(on.playIconVisible,false);
 assert.equal(on.pauseIconVisible,true);
 assert.equal(on.coverLoaded,true);
 assert.ok(on.lines>=10);
 await page.locator('#detail-toggle-btn').click();
 await page.waitForFunction(()=>document.getElementById('audio')?.paused===true,null,{timeout:7000});
 const paused=await page.locator('#detail-toggle-btn').evaluate(btn=>
  getComputedStyle(btn.querySelector('.detail-play-icon')).display!=='none'&&
  getComputedStyle(btn.querySelector('.detail-pause-icon')).display==='none');
 assert.equal(paused,true);
 await page.locator('#detail-toggle-btn').click();
 await page.waitForFunction(()=>document.getElementById('audio')?.paused===false,null,{timeout:8000});
 console.log('FYMUSIC_MIGU_REAL_START_LRC_ART_PAUSE_RESUME_PASS',
  JSON.stringify({song:'开始懂了',artist:'孙燕姿',source:'mg',api,ui:on,paused, resumed:true}));
}finally{await browser.close()}
