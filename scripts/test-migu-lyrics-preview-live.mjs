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
 // Live upstream catalogs sometimes fail or return unrelated pages. Listen
 // for this UI's actual request completion rather than blindly sleeping 16s
 // or sampling a stale result set. Retry the same exact recording at most
 // three times; never substitute another artist/platform/song or mock media.
 const attempts=[];
 let index=-1;
 for(const [n,keyword] of ['开始懂了','孙燕姿','开始懂了'].entries()){
  const outcome=await page.evaluate(keyword=>new Promise(resolve=>{
   let id=null,done=false;
   const codes=new Set(['timeout','http_error','network','unknown']);
   const finish=(status,details={})=>{
    if(done)return;done=true;clearTimeout(timer);
    for(const [event,handler] of handlers)window.removeEventListener(event,handler);
    resolve({status,...details});
   };
   const start=e=>{if(e.detail?.source==='mg')id=e.detail.id;};
   const pageResult=e=>{
    if(e.detail?.id!==id||e.detail?.source!=='mg'||e.detail?.page!==1)return;
    const provider=String(e.detail.provider||'');
    finish('page',{count:Math.min(160,Math.max(0,Number(e.detail.items?.length)||0)),
     provider:['lx-native','gdstudio-native','migu-native'].includes(provider)?provider:'other'});
   };
   const error=e=>{
    if(e.detail?.id!==id||e.detail?.source!=='mg')return;
    const code=String(e.detail.code||'');
    finish('search_error',{code:codes.has(code)?code:'unknown'});
   };
   const handlers=[['fymusic:search-start',start],['fymusic:search-page',pageResult],
    ['fymusic:search-error',error]];
   for(const [event,handler] of handlers)window.addEventListener(event,handler);
   const timer=setTimeout(()=>finish('deadline'),24000);
   document.getElementById('global-search-input').value=keyword;
   document.getElementById('global-search-btn').click();
  }),keyword);
  index=await page.evaluate(()=>window.__LXLastSearchResults?.findIndex(s=>
   s.source==='mg'&&String(s.name||'').trim()==='开始懂了'&&
   String(s.singer||'').includes('孙燕姿'))??-1);
  attempts.push({attempt:n+1,queryKind:keyword==='开始懂了'?'title':'artist',
   status:outcome.status,
   ...(outcome.code?{code:outcome.code}:{}),
   ...(outcome.count!==undefined?{count:outcome.count}:{}),
   ...(outcome.provider?{provider:outcome.provider}:{}),
   exactTargetPresent:index>=0});
  if(index>=0)break;
 }
 console.log('FYMUSIC_MIGU_EXACT_SEARCH_AUDIT',JSON.stringify(attempts));
 assert.ok(index>=0,'Migu exact target not returned by bounded real searches');
 const api=await page.evaluate(async index=>{
  const lrcStarted=performance.now();
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
   attempts:Number.isInteger(data.attempts)&&data.attempts>=0&&data.attempts<=2?data.attempts:null,
   elapsedMs:Math.min(120000,Math.max(0,Math.round(performance.now()-lrcStarted)))};
 },index);
 console.log('FYMUSIC_MIGU_SAFE_LRC_OUTCOME',JSON.stringify({
  allowed:api.allowed,status:api.status,correctId:api.correctId,
  lyricLines:api.lyricLines,timed:api.timed,
  failureReason:api.failureReason,attempts:api.attempts,elapsedMs:api.elapsedMs
 }));
 assert.equal(api.allowed,true,JSON.stringify(api));
 assert.equal(api.status,200,JSON.stringify(api));
 assert.equal(api.source,'mg');
 assert.equal(api.correctId,true);
 assert.ok(api.lyricLines>=10,JSON.stringify(api));
 assert.equal(api.timed,true);
 // Event-only live audit: no request bodies, provider URLs, headers,
 // lyrics, private identifiers or raw error text are collected or logged.
 await page.evaluate(()=>{
  const started=performance.now(), events=[];
  const sources=new Set(['kg','kw','mg','wy','tx']);
  const codes=new Set(['timeout','network','invalid','unknown']);
  const add=(event,details={})=>{
   if(events.length>=44)return;
   events.push({ms:Math.min(80000,Math.max(0,Math.round(performance.now()-started))),
    event,...details});
  };
  for(const type of ['fymusic:resolver-attempt','fymusic:resolver-error',
   'fymusic:url-resolved','fymusic:audio-play-rejected',
   'fymusic:alternate-search','fymusic:alternate-approved']){
   window.addEventListener(type,e=>{
    const d=e.detail||{},rawSource=String(d.source||'');
    const rawStatus=Number(d.status||0),rawCode=String(d.code||d.reason||'');
    add(type.replace('fymusic:',''),{
     source:sources.has(rawSource)?rawSource:'unknown',
     ...(Number.isInteger(rawStatus)&&rawStatus>=400&&rawStatus<=599?{status:rawStatus}:{}),
     ...(codes.has(rawCode)?{code:rawCode}:{}),
     ...(typeof d.transport==='string'?{transport:d.transport==='direct'?'direct':d.transport==='proxy'?'proxy':'other'}:{})
    });
   });
  }
  const audio=document.getElementById('audio');
  for(const type of ['loadstart','waiting','stalled','canplay','playing','pause','error','emptied']){
   audio?.addEventListener(type,()=>{
    add('audio:'+type,{
     readyState:audio.readyState,networkState:audio.networkState,
     mediaErrorCode:audio.error?.code||0,
     sourceAttached:!!audio.getAttribute('src')
    });
   });
  }
  window.__FYMUSIC_MIGU_SAFE_EVENTS=events;
 });
 await page.locator('#audio').evaluate(a=>{a.muted=true;a.volume=0});
 await page.locator('#search-results .search-song-row .search-song-main').nth(index).click();
 try{
  await page.waitForFunction(()=>{
   const a=document.getElementById('audio');
   return a&&!a.paused&&a.readyState>=2&&a.currentTime>.8;
  },null,{timeout:35000});
 }catch(error){
  const diagnostic=await page.evaluate(()=>{
   const a=document.getElementById('audio');
   const s=String(window.__LXNowPlayingTrack?.source||'');
   return {readyState:a?.readyState??null,networkState:a?.networkState??null,
    mediaErrorCode:a?.error?.code??0,paused:a?.paused??null,
    progressConfirmed:!!a&&!a.paused&&a.currentTime>.8,
    source:['kg','kw','mg','wy','tx'].includes(s)?s:'unclassified'};
  });
  const classified=await page.evaluate(()=>{
   const a=document.getElementById('audio'),t=String(window.__LXNowPlayingTrack?.source||'');
   return {events:(window.__FYMUSIC_MIGU_SAFE_EVENTS||[]).slice(0,44),
    attached:!!a?.getAttribute('src'),
    currentTimeBucket:Math.min(999,Math.max(0,Math.floor(Number(a?.currentTime||0)))),
    trackSource:['kg','kw','mg','wy','tx'].includes(t)?t:'unknown'};
  });
  console.log('FYMUSIC_MIGU_SAFE_RESOLVER_AUDIO_TRACE',JSON.stringify(classified));
  console.log('FYMUSIC_MIGU_REAL_AUDIO_PROGRESS_FAILURE',JSON.stringify(diagnostic));
  throw error;
 }
 console.log('FYMUSIC_MIGU_SAFE_RESOLVER_AUDIO_TRACE',
  JSON.stringify(await page.evaluate(()=>({
   events:(window.__FYMUSIC_MIGU_SAFE_EVENTS||[]).slice(0,44),
   playbackProgressConfirmed:true
  }))));
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
