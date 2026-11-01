import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 27: REAL search-row clicks -> app-owned resolver callbacks -> direct
// native #audio decoding of an original 24-bit/96 kHz FLAC file.
// Only metadata and provider callbacks are controlled test fixtures.
// No fake audio clocks/events, fake media responses, manual trackchange,
// production instrumentation, hidden cross-platform fallback or 128k cap.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const FILE='/api/fymusic-codec-selftest?format=flac24&mode=normal';
const makeTrack=(id,name)=>({id,source:'wy',name,
 singer:name+' Singer',albumName:name+' Album',interval:'00:12'});
const tracks=[makeTrack('101','Original A'),
 makeTrack('202','Original B'),makeTrack('303','Original C')];
const browser=await chromium.launch({headless:true,
 args:['--autoplay-policy=no-user-gesture-required']});
const out={};
try{
 const page=await browser.newPage({viewport:{width:1366,height:900},
  reducedMotion:'reduce'});
 const exceptions=[],requests=[];
 page.on('pageerror',e=>exceptions.push(String(e.message||e).slice(0,170)));
 page.on('request',r=>{
  if(r.url().includes('/api/fymusic-codec-selftest?'))
   requests.push({url:new URL(r.url()).searchParams.get('format'),
     status:null,range:r.headers()['range']||null,request:r});
 });
 page.on('response',r=>{
  const record=requests.find(x=>x.request===r.request());
  if(record)record.status=r.status();
 });
 await page.addInitScript(()=>{
  const originalFetch=window.fetch.bind(window);
  const meta=[];
  window.__phase27Meta=meta;
  window.fetch=(url,options)=>{
   const request=String(url instanceof Request?url.url:url);
   if(!request.startsWith('/api/netease-song-meta?'))
    return originalFetch(url,options);
   const id=new URL(request,location.href).searchParams.get('id');
   // Deliberately ignore AbortSignal to model a server responding too late.
   return new Promise(resolve=>meta.push({
    id,fulfill(data){resolve(new Response(JSON.stringify(data),
      {status:200,headers:{'Content-Type':'application/json'}}))}
   }));
  };
  const os={metadata:null,handlers:{},positions:[],states:[],
   setActionHandler(name,handler){this.handlers[name]=handler},
   setPositionState(value){this.positions.push(value)},
   get playbackState(){return this.states.at(-1)||'none'},
   set playbackState(value){this.states.push(value)}
  };
  Object.defineProperty(navigator,'mediaSession',{configurable:true,value:os});
  window.MediaMetadata=class{constructor(x){Object.assign(this,x)}};
  window.__phase27OS=os;
 });
 const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY7kAAAAASUVORK5CYII=';
 await page.route(/https:\/\/p[0-9]+\.music\.126\.net\//,r=>
  r.fulfill({status:200,contentType:'image/png',
   body:Buffer.from(pixel,'base64')}));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXMusicSearch?.search&&
  window.LXPlaySettings?.save&&window.LXSourceManager?.getActive&&
  window.FyMusicPlaybackDiagnostics?.report&&
  window.LXPlayerControls?.refresh),null,{timeout:20000});
 await page.evaluate(tracks=>{
  window.LXPlaySettings.save({
   qualityMode:'fixed',fixedQuality:'flac24bit',autoFallback:false});
  const active={id:'phase27-isolated',name:'Original QA',
   inited:true,runtime:{},
   sources:{wy:{name:'网易云音乐',actions:['musicUrl'],
     qualitys:['flac24bit','320k','128k']}}};
  const calls={attempts:[],fulfilled:[],fast:0,crossPlatform:0,
   resolved:[],changes:[],requestedTypes:[]};
  window.__phase27=calls;
  const manager=window.LXSourceManager;
  manager.getActive=()=>active;
  manager.requestAction=(source,action,info,callback)=>{
   if(source!=='wy'||action!=='musicUrl')
    throw Error('Unexpected or unapproved cross-platform resolver');
   const id=String(info?.musicInfo?.id||info?.musicInfo?.songmid||'');
   const attempted={id,quality:info.type,callback};
   calls.attempts.push(attempted);
  };
  window.LXMusicSearch.search=(source,keyword,page,limit,callback)=>
   callback(null,{list:tracks,searchProvider:'netease-native'});
  window.LXMusicSearch.isPlayableUrlForSource=(source,url)=>
   source==='wy'&&new URL(url).pathname==='/api/fymusic-codec-selftest';
  window.LXMusicSearch.resolveMusicUrlFast=()=>{
   calls.fast++;throw Error('No unauthorized alternative resolver');
  };
  window.addEventListener('lx:trackchange',e=>calls.changes.push({
    id:String(e.detail?.id),name:e.detail?.name,
    source:e.detail?.source}));
  window.addEventListener('fymusic:url-resolved',e=>calls.resolved.push({
    quality:e.detail.quality,source:e.detail.source,
    provider:e.detail.provider}));
  window.addEventListener('fymusic:resolver-attempt',e=>
   calls.requestedTypes.push(e.detail.quality));
 },tracks);
 await page.locator('#channel-list .channel-button').filter({hasText:'网易云'}).click();
 await page.waitForFunction(()=>document.querySelector('#quality-summary')?.textContent.includes('flac24bit'));
 const quality=await page.evaluate(()=>({
  text:document.querySelector('#quality-summary')?.textContent,
  tooltip:document.querySelector('#quality-summary')?.title}));
 assert.match(quality.text,/flac24bit/);
 assert.match(quality.tooltip,/不是实际媒体码率或格式检测结果/);
 await page.locator('#global-search-input').fill('Original QA');
 await page.locator('#global-search-btn').click();
 await page.locator('.search-song-row').first().waitFor({timeout:12000});
 assert.equal(await page.locator('.search-song-row').count(),3);
 // All three are real DOM clicks, not forged app events.
 for(let i=0;i<3;i++){
  await page.locator('.search-song-row .search-song-main').nth(i).click();
  await page.waitForFunction(n=>window.__phase27.attempts.length>=n,
   i+1,{timeout:5000});
 }
 const preliminary=await page.evaluate(()=>({
  ids:window.__phase27.attempts.map(x=>x.id),
  qualities:window.__phase27.attempts.map(x=>x.quality),
  changes:window.__phase27.changes,
  pendingMetadata:window.__phase27Meta.map(x=>x.id),
  latest:window.__LXNowPlayingTrack}));
 assert.deepEqual(preliminary.ids,['101','202','303']);
 assert.deepEqual(preliminary.qualities,['flac24bit','flac24bit','flac24bit']);
 assert.deepEqual(preliminary.changes.map(x=>x.name),
  ['Original A','Original B','Original C']);
 assert.equal(preliminary.latest.name,'Original C');
 await page.waitForFunction(()=>window.__phase27Meta.length>=3,
  null,{timeout:7000});
 // Resolve the latest selected track first, with real FLAC media.
 await page.evaluate(file=>{
  const c=window.__phase27;
  c.fulfilled.push('303');
  c.attempts[2].callback(null,{url:location.origin+file});
 },FILE);
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.5&&
  document.querySelector('#audio').currentSrc.includes('format=flac24')&&
  window.FyMusicPlaybackDiagnostics.report().media.progressConfirmed,
  null,{timeout:16000});
 await page.evaluate(()=>{
  const c=window.__phase27Meta.find(x=>x.id==='303');
  c.fulfill({id:'303',name:'Forged name',source:'kg',
   singer:'Confirmed C Singer',albumName:'Confirmed C Album',
   image:'https://p3.music.126.net/phase27c.png'});
 });
 await page.waitForFunction(()=>document.querySelector('#now-playing-album')?.textContent===
  '专辑：Confirmed C Album',null,{timeout:6000});
 const snap=()=>page.evaluate(()=>{
  const audio=document.querySelector('#audio'),
   qa=window.__phase27,os=window.__phase27OS.metadata||{};
  return {
   title:document.querySelector('#lyrics-title')?.textContent,
   baseTitle:document.querySelector('#player-title')?.textContent,
   artist:document.querySelector('#now-playing-artist')?.textContent,
   album:document.querySelector('#now-playing-album')?.textContent,
   platform:document.querySelector('#now-playing-platform')?.textContent,
   cover:document.querySelector('#lyrics-cover-image')?.getAttribute('src')||'',
   miniCover:document.querySelector('#player-cover-image')?.getAttribute('src')||'',
   os:{title:os.title,artist:os.artist,album:os.album,
     art:os.artwork?.[0]?.src||''},
   currentTrack:{id:window.__LXNowPlayingTrack?.id,
     source:window.__LXNowPlayingTrack?.source},
   media:{src:audio.currentSrc,duration:audio.duration,
     progress:audio.currentTime,paused:audio.paused,error:audio.error?.code||0,
     elements:document.querySelectorAll('audio').length},
   attempts:qa.attempts.length,resolved:qa.resolved,
   fast:qa.fast,crossPlatform:qa.crossPlatform,
   requestedTypes:qa.requestedTypes
  };
 });
 const beforeStale=await snap();
 assert.equal(beforeStale.title,'Original C');
 assert.equal(beforeStale.artist,'Confirmed C Singer');
 assert.equal(beforeStale.album,'专辑：Confirmed C Album');
 assert.equal(beforeStale.os.title,'Original C');
 assert.equal(beforeStale.os.artist,'Confirmed C Singer');
 assert.equal(beforeStale.os.album,'Confirmed C Album');
 assert.match(beforeStale.cover,/p3\.music\.126\.net\/phase27c\.png/);
 assert.equal(beforeStale.miniCover,beforeStale.cover);
 assert.equal(beforeStale.os.art,beforeStale.cover);
 assert.equal(beforeStale.currentTrack.source,'wy');
 assert.equal(beforeStale.media.error,0);
 assert.equal(beforeStale.media.elements,1);
 assert.ok(Math.abs(beforeStale.media.duration-12)<.5);
 assert.equal(beforeStale.resolved.length,1);
 assert.deepEqual(beforeStale.requestedTypes,['flac24bit','flac24bit','flac24bit']);
 // Deliver both stale resolvers (the old direct addresses would be valid if
 // token guarding failed) and both stale metadata responses after C is playing.
 await page.evaluate(()=>{
  const q=window.__phase27;
  for(const index of [1,0]){
   q.fulfilled.push(String(index===1?'202':'101'));
   q.attempts[index].callback(null,{
    url:location.origin+'/api/fymusic-codec-selftest?format='+
      (index===1?'aac-tail':'mp3-cover')+'&mode=normal'});
  }
  for(const id of ['202','101']){
   const m=window.__phase27Meta.find(x=>x.id===id);
   m.fulfill({id,name:'FORGED OLD TITLE',source:'kg',
     singer:'STALE ARTIST',albumName:'STALE ALBUM',
     image:'https://p2.music.126.net/stale.png'});
  }
 });
 await page.waitForTimeout(230);
 const afterStale=await snap();
 assert.equal(afterStale.title,beforeStale.title);
 assert.equal(afterStale.baseTitle,beforeStale.baseTitle);
 assert.equal(afterStale.artist,beforeStale.artist);
 assert.equal(afterStale.album,beforeStale.album);
 assert.equal(afterStale.platform,beforeStale.platform);
 assert.equal(afterStale.cover,beforeStale.cover);
 assert.equal(afterStale.miniCover,beforeStale.miniCover);
 assert.deepEqual(afterStale.os,beforeStale.os);
 assert.deepEqual(afterStale.currentTrack,beforeStale.currentTrack);
 assert.ok(afterStale.media.src.includes('format=flac24'));
 assert.ok(afterStale.media.progress>beforeStale.media.progress,
  'real 24-bit FLAC must keep advancing after stale callbacks');
 assert.equal(afterStale.media.error,0);
 assert.equal(afterStale.attempts,3);
 assert.equal(afterStale.resolved.length,1);
 assert.deepEqual(afterStale.resolved,[{
  quality:'flac24bit',source:'wy',provider:'lx-source'}]);
 assert.equal(afterStale.fast,0);
 assert.equal(afterStale.crossPlatform,0);
 assert.equal(requests.some(r=>r.url==='aac-tail'||r.url==='mp3-cover'),false,
  'old resolver callback must not trigger any old-media HTTP request');
 assert.deepEqual(exceptions,[]);
 out.rapid={searchRowsClicked:3,pendingResolvers:3,
  returnedReverseOrder:true,obsoleteMediaHTTPRequests:0,
  actualMediaHTTP:requests.filter(r=>r.url==='flac24').map(r=>r.status),
  requestedQuality:afterStale.resolved[0].quality,
  mediaDuration:afterStale.media.duration,
  lastMediaSeconds:+afterStale.media.progress.toFixed(3),
  title:afterStale.title,artist:afterStale.artist,
  album:afterStale.album,
  osTitle:afterStale.os.title,osArtist:afterStale.os.artist,
  osAlbum:afterStale.os.album,
  trustedCoverSynced:afterStale.cover===afterStale.miniCover&&
   afterStale.cover===afterStale.os.art,
  oneAudioElement:afterStale.media.elements===1,
  sourceCapabilityLabelNotCodecClaim:true,
  noUnapprovedCrossPlatform:true};
 await page.evaluate(()=>document.querySelector('#audio').pause());
 await page.close();

 // Separate scenario: unsupported fixed high-resolution quality clears any
 // previous request, does not silently downgrade to 128k, and never calls
 // the resolver. This tests the real search row and quality plan.
 const blocked=await browser.newPage({viewport:{width:1366,height:900},
  reducedMotion:'reduce'});
 const blockedErrors=[];
 blocked.on('pageerror',e=>blockedErrors.push(String(e.message||e)));
 await blocked.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await blocked.waitForFunction(()=>Boolean(window.LXPlaySettings?.save&&
  window.LXSourceManager?.getActive&&window.LXMusicSearch?.search),
  null,{timeout:18000});
 await blocked.evaluate(()=>{
  window.LXPlaySettings.save({qualityMode:'fixed',
   fixedQuality:'flac32bit',autoFallback:false});
  const active={id:'phase27-blocked',name:'Original QA',inited:true,runtime:{},
   sources:{wy:{name:'网易云音乐',actions:['musicUrl'],
     qualitys:['flac24bit','320k','128k']}}};
  window.LXSourceManager.getActive=()=>active;
  window.__phase27Blocked={resolverCalls:0,trackChanges:0};
  window.LXSourceManager.requestAction=()=>{
   window.__phase27Blocked.resolverCalls++;
  };
  window.LXMusicSearch.search=(source,term,page,limit,cb)=>cb(null,{
   list:[{id:'404',source:'wy',name:'Unsupported High Resolution',
    singer:'Original QA',albumName:'Controlled',interval:'00:12'}],
   searchProvider:'netease-native'});
  window.addEventListener('lx:trackchange',
   ()=>window.__phase27Blocked.trackChanges++);
 });
 await blocked.locator('#channel-list .channel-button').filter({hasText:'网易云'}).click();
 await blocked.locator('#global-search-input').fill('Unsupported High Resolution');
 await blocked.locator('#global-search-btn').click();
 await blocked.locator('.search-song-row .search-song-main').first().click();
 const rejected=await blocked.evaluate(()=>({
  calls:window.__phase27Blocked.resolverCalls,
  changes:window.__phase27Blocked.trackChanges,
  src:document.querySelector('#audio').currentSrc,
  source:window.__LXNowPlayingTrack?.source,
  name:window.__LXNowPlayingTrack?.name,
  status:document.querySelector('#status')?.textContent,
  declared:document.querySelector('#quality-summary')?.textContent,
  tooltip:document.querySelector('#quality-summary')?.title
 }));
 assert.equal(rejected.calls,0,'no unauthorized lower quality resolver');
 assert.equal(rejected.changes,1);
 assert.equal(rejected.src,'','unsupported track must not reuse previous media URL');
 assert.equal(rejected.name,'Unsupported High Resolution');
 assert.equal(rejected.source,'wy');
 assert.match(rejected.status,/未声明支持|未擅自改成128k/);
 assert.match(rejected.declared,/flac32bit/);
 assert.match(rejected.declared,/不自动降级/);
 assert.match(rejected.tooltip,/不是实际媒体码率或格式检测结果/);
 assert.deepEqual(blockedErrors,[]);
 out.unsupported={
  requested:'flac32bit',offered:['flac24bit','320k','128k'],
  autoFallback:false,resolverCalls:rejected.calls,
  staleURLRetained:false,explicitlyRejected:true,
  honestQualityLabel:true};
 await blocked.close();

 console.log('FYMUSIC_PHASE27_REAL_UI_STATE_CHAIN '+JSON.stringify(out));
 console.log('FYMUSIC_PHASE27_STATE_CONSISTENCY_PASS '+JSON.stringify({
  actualSearchRowClicks:true,applicationResolverTokens:true,
  realHiResFlacAudioSrc:true,lateMediaResolutionIgnored:true,
  lateMetadataIgnored:true,osArtworkAndIdentityAligned:true,
  fixedHighResPreserved:true,unapproved128kDowngradePrevented:true,
  noExtraAudioPlayer:true,noThirdPartySongURL:true,
  noProductionCodeChanges:true
 }));
}finally{await browser.close()}
