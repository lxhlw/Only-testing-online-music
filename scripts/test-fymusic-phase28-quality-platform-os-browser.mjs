import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 28: exercise REAL search UI / production resolver ownership while
// switching platform and requested quality, using actual native audio files.
// Only catalog callbacks, metadata responses and OS MediaSession API are
// controlled; never fake audio events or media transport.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const F='/api/fymusic-codec-selftest?format=';
const browser=await chromium.launch({headless:true,
 args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900},
  reducedMotion:'reduce'});
 const exceptions=[],media=[];
 page.on('pageerror',e=>exceptions.push(String(e?.message||e).slice(0,180)));
 page.on('request',r=>{
  if(!r.url().includes('/api/fymusic-codec-selftest?'))return;
  media.push({req:r,format:new URL(r.url()).searchParams.get('format'),
   status:null,range:r.headers()['range']||null});
 });
 page.on('response',r=>{
  const item=media.find(x=>x.req===r.request());
  if(item)item.status=r.status();
 });
 await page.addInitScript(()=>{
  const fetchOriginal=window.fetch.bind(window);
  window.__phase28Metadata=[];
  window.fetch=(url,options)=>{
   const path=String(url instanceof Request?url.url:url);
   if(!path.startsWith('/api/netease-song-meta?'))
    return fetchOriginal(url,options);
   const id=new URL(path,location.href).searchParams.get('id');
   // Adversarial stale response ignores AbortSignal intentionally.
   return new Promise(resolve=>window.__phase28Metadata.push({id,
    finish(details){resolve(new Response(JSON.stringify(details),
      {status:200,headers:{'Content-Type':'application/json'}}))}
   }));
  };
  const os={metadata:null,handlers:{},states:[],positions:[],
   setActionHandler(name,fn){this.handlers[name]=fn},
   setPositionState(p){this.positions.push(p)},
   set playbackState(s){this.states.push(s)},
   get playbackState(){return this.states.at(-1)||'none'}
  };
  Object.defineProperty(navigator,'mediaSession',{configurable:true,value:os});
  window.MediaMetadata=class{constructor(info){Object.assign(this,info)}};
  window.__phase28OS=os;
 });
 const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY7kAAAAASUVORK5CYII=';
 await page.route(/https:\/\/p[0-9]+\.music\.126\.net\//,
  r=>r.fulfill({status:200,contentType:'image/png',
    body:Buffer.from(pixel,'base64')}));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlaySettings?.save&&
  window.LXSourceManager?.getActive&&window.LXMusicSearch?.search&&
  window.LXPlayerControls?.refresh&&window.__phase28OS.handlers.play&&
  document.querySelector('#audio')),null,{timeout:20000});
 await page.evaluate(()=>{
  const active={id:'phase28-isolated-source',name:'Phase 28 QA',
   inited:true,runtime:{},
   sources:{
    wy:{name:'网易云音乐',actions:['musicUrl'],
      qualitys:['flac24bit','320k','128k']},
    kw:{name:'酷我音乐',actions:['musicUrl'],
      qualitys:['320k','128k']}
   }};
  window.__phase28={calls:[],resolved:[],tracks:[],searches:[],
   crossPlatform:0};
  window.LXSourceManager.getActive=()=>active;
  window.LXSourceManager.requestAction=(source,action,info,callback)=>{
   if(action!=='musicUrl'||!['wy','kw'].includes(source))
    throw Error('Unauthorized test resolver');
   const id=String(info?.musicInfo?.id||'');
   window.__phase28.calls.push({source,id,quality:info.type,callback});
  };
  window.LXMusicSearch.search=(source,keyword,page,limit,callback)=>{
   window.__phase28.searches.push(source);
   const a={id:'901',source:'wy',name:'Phase A HiRes',
    singer:'Original A',albumName:'Original A Album',interval:'00:12'};
   const b={id:'902',source:'kw',name:'Phase B MP3',
    singer:'Original B',albumName:'Original B Album',interval:'00:12'};
   callback(null,{list:source==='wy'?[a]:[b],
    searchProvider:source==='wy'?'netease-native':'kuwo-native'});
  };
  window.LXMusicSearch.isPlayableUrlForSource=(source,url)=>
   ['wy','kw'].includes(source)&&
    new URL(url).pathname==='/api/fymusic-codec-selftest';
  window.addEventListener('lx:trackchange',e=>
   window.__phase28.tracks.push({name:e.detail?.name,
     source:e.detail?.source,id:String(e.detail?.id)}));
  window.addEventListener('fymusic:url-resolved',e=>
   window.__phase28.resolved.push({
    source:e.detail.source,requestedQuality:e.detail.quality,
    provider:e.detail.provider}));
  window.LXPlaySettings.save({qualityMode:'fixed',
   fixedQuality:'flac24bit',autoFallback:false});
 });
 const select=source=>page.locator(
  '#channel-list .channel-button[title="'+source.toUpperCase()+'"]');
 await select('wy').click();
 await page.waitForFunction(()=>document.querySelector('#quality-summary')?.
  textContent.includes('flac24bit'));
 await page.locator('#global-search-input').fill('Phase A HiRes');
 await page.locator('#global-search-btn').click();
 await page.locator('.search-song-row .search-song-main').first().click();
 await page.waitForFunction(()=>window.__phase28.calls.length===1&&
  window.__phase28Metadata.length===1,null,{timeout:8000});
 const aCall=await page.evaluate(()=>window.__phase28.calls.map(x=>({
  source:x.source,id:x.id,quality:x.quality})));
 assert.deepEqual(aCall,[{source:'wy',id:'901',quality:'flac24bit'}]);
 await page.evaluate(path=>window.__phase28.calls[0].callback(null,
  {url:location.origin+path}),F+'flac24&mode=normal');
 await page.waitForFunction(()=>{
  const a=document.querySelector('#audio');
  return a.currentSrc.includes('format=flac24')&&a.currentTime>.65&&
   !a.paused&&a.readyState>=2;
 },null,{timeout:16000});
 const first=await page.evaluate(()=>({
  progress:document.querySelector('#audio').currentTime,
  src:document.querySelector('#audio').currentSrc,
  title:window.__LXNowPlayingTrack?.name,
  osTitle:window.__phase28OS.metadata?.title,
  source:window.__LXNowPlayingTrack?.source}));
 assert.equal(first.title,'Phase A HiRes');
 assert.equal(first.osTitle,'Phase A HiRes');
 assert.equal(first.source,'wy');

 // Search tab selection must not silently replace an already playing song.
 // Quality preferences change while A is playing, but apply to the NEXT
 // user-selected song, not by rewriting currently loaded media.
 await page.evaluate(()=>window.LXPlaySettings.save({
  qualityMode:'fixed',fixedQuality:'320k',autoFallback:false}));
 await select('kw').click();
 await page.waitForFunction(()=>document.querySelector('#quality-summary')?.
  textContent.includes('320k'));
 const tab=await page.evaluate(()=>({
  source:window.__LXNowPlayingTrack?.source,
  title:window.__LXNowPlayingTrack?.name,
  src:document.querySelector('#audio').currentSrc,
  time:document.querySelector('#audio').currentTime,
  summary:document.querySelector('#quality-summary')?.textContent,
  tip:document.querySelector('#quality-summary')?.title,
  active:document.querySelector('#channel-list .channel-button.active')?.title
 }));
 assert.equal(tab.active,'KW');
 assert.equal(tab.source,'wy',
  'changing the search platform must not misattribute playing A to KW');
 assert.ok(tab.src.includes('format=flac24'));
 assert.ok(tab.time>=first.progress);
 assert.match(tab.summary,/320k/);
 assert.match(tab.tip,/不是实际媒体码率或格式检测结果/);
 assert.equal(media.filter(x=>x.format==='flac24').length,1);
 await page.locator('#global-search-input').fill('Phase B MP3');
 await page.locator('#global-search-btn').click();
 await page.locator('.search-song-row .search-song-main').first().click();
 await page.waitForFunction(()=>window.__phase28.calls.length===2,
   null,{timeout:8000});
 const bCall=await page.evaluate(()=>window.__phase28.calls.map(x=>({
  source:x.source,id:x.id,quality:x.quality})));
 assert.deepEqual(bCall,[{source:'wy',id:'901',quality:'flac24bit'},
  {source:'kw',id:'902',quality:'320k'}]);
 await page.evaluate(path=>window.__phase28.calls[1].callback(null,
  {url:location.origin+path}),F+'mp3-cover&mode=normal');
 await page.waitForFunction(()=>{
  const a=document.querySelector('#audio');
  return a.currentSrc.includes('format=mp3-cover')&&a.currentTime>.6&&
   !a.paused&&a.readyState>=2;
 },null,{timeout:16000});
 // Old A metadata races after KW/B selection, and A resolver can even
 // deliver a duplicate callback after B is playing. Neither may win.
 await page.evaluate(path=>{
  window.__phase28Metadata.find(x=>x.id==='901').finish({
   id:'901',name:'FORGED OLD',source:'kg',
   singer:'STALE SINGER',albumName:'STALE ALBUM',
   image:'https://p2.music.126.net/stale28.png'});
  window.__phase28.calls[0].callback(null,{url:location.origin+path});
 },F+'aac-tail&mode=normal');
 const bBefore=await page.evaluate(()=>document.querySelector('#audio').currentTime);
 await page.waitForTimeout(240);
 const afterRace=await page.evaluate(()=>{
  const a=document.querySelector('#audio'),os=window.__phase28OS;
  return {title:document.querySelector('#lyrics-title')?.textContent,
   playerTitle:document.querySelector('#player-title')?.textContent,
   artist:document.querySelector('#now-playing-artist')?.textContent,
   platform:document.querySelector('#now-playing-platform')?.textContent,
   track:{source:window.__LXNowPlayingTrack?.source,
    id:window.__LXNowPlayingTrack?.id},
   os:{title:os.metadata?.title,artist:os.metadata?.artist,
    album:os.metadata?.album,art:os.metadata?.artwork?.[0]?.src||''},
   media:{src:a.currentSrc,time:a.currentTime,
    duration:a.duration,paused:a.paused,error:a.error?.code||0},
   requested:window.__phase28.resolved,
   audioCount:document.querySelectorAll('audio').length};
 });
 assert.equal(afterRace.title,'Phase B MP3');
 assert.equal(afterRace.playerTitle,'Phase B MP3');
 assert.equal(afterRace.track.source,'kw');
 assert.equal(afterRace.os.title,'Phase B MP3');
 assert.equal(afterRace.os.artist,'Original B');
 assert.equal(afterRace.os.art,'');
 assert.match(afterRace.platform,/酷我音乐/);
 assert.ok(afterRace.media.src.includes('format=mp3-cover'));
 assert.ok(afterRace.media.time>bBefore);
 assert.ok(Math.abs(afterRace.media.duration-12)<.5);
 assert.equal(afterRace.media.error,0);
 assert.equal(afterRace.audioCount,1);
 assert.deepEqual(afterRace.requested.map(x=>[x.source,x.requestedQuality]),
  [['wy','flac24bit'],['kw','320k']]);
 assert.equal(media.filter(x=>x.format==='aac-tail').length,0);
 assert.ok(media.some(x=>x.format==='flac24'&&x.status===206));
 assert.ok(media.some(x=>x.format==='mp3-cover'&&x.status===206));
 assert.deepEqual(exceptions,[]);

 // Real OS action handlers (mocked platform API) must delegate to existing
 // UI transport, NOT change selected track/source or spawn a new decoder.
 await page.evaluate(()=>window.__phase28OS.handlers.pause());
 await page.waitForFunction(()=>document.querySelector('#audio').paused,
  null,{timeout:4000});
 const paused=await page.evaluate(()=>({
  time:document.querySelector('#audio').currentTime,
  state:window.__phase28OS.playbackState,
  source:window.__LXNowPlayingTrack?.source,
  name:window.__LXNowPlayingTrack?.name}));
 await page.evaluate(()=>window.__phase28OS.handlers.play());
 await page.waitForFunction(()=>!document.querySelector('#audio').paused,
  null,{timeout:5000});
 await page.waitForFunction(t=>document.querySelector('#audio').currentTime>t+.14,
  paused.time,{timeout:4000});
 const restarted=await page.evaluate(()=>({
  source:window.__LXNowPlayingTrack?.source,
  name:window.__LXNowPlayingTrack?.name,
  state:window.__phase28OS.playbackState,
  time:document.querySelector('#audio').currentTime}));
 assert.equal(paused.source,'kw');
 assert.equal(restarted.source,'kw');
 assert.equal(restarted.name,'Phase B MP3');
 assert.ok(restarted.time>paused.time);

 // Event-driven foreground/page lifecycle smoke. These are DISPATCHED
 // lifecycle notifications, not claimed as real OS background/lockscreen.
 await page.evaluate(()=>{
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new Event('pagehide'));
  window.dispatchEvent(new Event('pageshow'));
 });
 await page.waitForFunction(t=>document.querySelector('#audio').currentTime>t+.14,
  restarted.time,{timeout:5000});
 const afterLifecycle=await page.evaluate(()=>({
  src:document.querySelector('#audio').currentSrc,
  currentTime:document.querySelector('#audio').currentTime,
  paused:document.querySelector('#audio').paused,
  title:document.querySelector('#lyrics-title')?.textContent,
  osTitle:window.__phase28OS.metadata?.title,
  audioCount:document.querySelectorAll('audio').length}));
 assert.ok(afterLifecycle.src.includes('format=mp3-cover'));
 assert.equal(afterLifecycle.title,'Phase B MP3');
 assert.equal(afterLifecycle.osTitle,'Phase B MP3');
 assert.equal(afterLifecycle.audioCount,1);
 assert.equal(media.filter(x=>x.format==='mp3-cover').length,1,
  'OS/lifecycle notifications must not re-fetch the media');
 assert.deepEqual(exceptions,[]);
 console.log('FYMUSIC_PHASE28_QUALITY_PLATFORM_OS_MATRIX '+JSON.stringify({
  realSearchClicks:2,
  firstRequestedQuality:'flac24bit',
  secondRequestedQuality:'320k',
  firstActualCodec:'flac24',
  secondActualCodec:'mp3-cover',
  selectedTabChangedWithoutMediaSwitch:true,
  oldWyMetadataIgnored:true,lateDuplicateResolverIgnored:true,
  unauthorizedOldAudioRequests:0,
  actualNativeHttpStatus:[206,206],
  oldTrackTitleNeverRestored:true,
  osMetadataTitle:afterLifecycle.osTitle,
  osActionPauseAndResume:true,
  playbackContinuesAfterSimulatedLifecycleSignals:true,
  oneRealAudioElement:true,
  qualityCapabilityNotClaimedAsMeasuredBitrate:true,
  requested320kDoesNotProve320kbps:true,
  noActualBackgroundOrLockscreenClaim:true,
  noThirdPartyMusicTested:true
 }));
 console.log('FYMUSIC_PHASE28_STATE_MATRIX_PASS');
 await page.evaluate(()=>document.querySelector('#audio').pause());
 await page.close();
}finally{await browser.close()}
