import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase32: real native media, real UI selection, OS handler routing and
// delayed browser range "change". Only the catalog/URL resolver and OS API
// are controlled; no fake media clock, synthetic audio event or third-party URL.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
const report={};
try{
  const page=await browser.newPage({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const errors=[],network=[];
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,150)));
  page.on('response',response=>{
    if(response.url().includes('/api/fymusic-codec-selftest?'))
      network.push({status:response.status(),
        id:new URL(response.url()).searchParams.get('phase32')});
  });
  await page.addInitScript(()=>{
    const os={handlers:{},metadata:null,positions:[],states:[],
      setActionHandler(key,fn){this.handlers[key]=fn},
      setPositionState(value){this.positions.push(value)},
      get playbackState(){return this.states.at(-1)||'none'},
      set playbackState(value){this.states.push(value)}
    };
    Object.defineProperty(navigator,'mediaSession',
      {configurable:true,value:os});
    window.MediaMetadata=class{constructor(x){Object.assign(this,x)}};
    window.__phase32OS=os;
    const rawFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>{
      const target=String(url instanceof Request?url.url:url);
      if(target.startsWith('/api/netease-song-meta?'))
        return Promise.resolve(new Response('{}',
          {status:200,headers:{'content-type':'application/json'}}));
      return rawFetch(url,options);
    };
  });
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(
    window.LXPlaySettings?.save&&window.LXSourceManager?.getActive&&
    window.LXMusicSearch?.search&&window.LXPlayerControls?.refresh&&
    window.__phase32OS.handlers.seekto&&
    document.querySelector('#detail-seek')),null,{timeout:22000});
  await page.evaluate(()=>{
    window.LXPlaySettings.save({qualityMode:'fixed',
      fixedQuality:'flac24bit',autoFallback:false});
    const tracks=[
      {id:'3201',source:'wy',name:'Phase32 Original A',
        singer:'Fixture A',albumName:'Original A',interval:'00:12'},
      {id:'3202',source:'wy',name:'Phase32 Original B',
        singer:'Fixture B',albumName:'Original B',interval:'00:12'}
    ];
    const active={id:'phase32-controlled',name:'Original Playback QA',
      inited:true,runtime:{},sources:{wy:{name:'网易云音乐',
      actions:['musicUrl'],qualitys:['flac24bit','320k','128k']}}};
    window.LXSourceManager.getActive=()=>active;
    window.__phase32={resolvers:[],baseChanges:0,tracks:[],seeked:0};
    document.querySelector('#player-seek').addEventListener('change',
      ()=>window.__phase32.baseChanges++);
    document.querySelector('#audio').addEventListener('seeked',
      ()=>window.__phase32.seeked++);
    window.addEventListener('lx:trackchange',e=>
      window.__phase32.tracks.push(e.detail?.name));
    window.LXSourceManager.requestAction=(source,action,info,cb)=>{
      const id=String(info?.musicInfo?.id||'');
      window.__phase32.resolvers.push({source,action,id,quality:info.type});
      if(source!=='wy'||action!=='musicUrl')throw Error('Unexpected resolver');
      cb(null,{url:location.origin+
        '/api/fymusic-codec-selftest?format=flac24&mode=normal&phase32='+id});
    };
    window.LXMusicSearch.search=(source,term,p,n,cb)=>
      cb(null,{list:tracks,searchProvider:'netease-native'});
    window.LXMusicSearch.isPlayableUrlForSource=(source,url)=>
      source==='wy'&&new URL(url).pathname==='/api/fymusic-codec-selftest';
  });
  // The channel sidebar is off-canvas on a 390px mobile viewport.
  // Invoke its real existing click handler without Playwright visibility gating.
  await page.evaluate(()=>{
    document.querySelector('#channel-list .channel-button[title="WY"]').click();
    document.querySelector('#global-search-input').value='Phase32 Original';
    document.querySelector('#global-search-btn').click();
    const row=document.querySelector('.search-song-row .search-song-main');
    if(!row)throw Error('Expected actual search row');
    row.click();
  });
  const ready=id=>page.waitForFunction(id=>{
    const a=document.querySelector('#audio');
    return a.currentSrc.includes('phase32='+id)&&a.readyState>=2&&
      a.currentTime>.55&&!a.paused&&
      !document.querySelector('#player-seek').disabled;
  },id,{timeout:17000});
  await ready('3201');
  assert.equal(await page.locator('#audio').evaluate(a=>a.error?.code||0),0);
  await page.locator('#player-cover-button').tap();
  assert.equal(await page.locator('#lyrics-overlay').getAttribute('aria-hidden'),'false');
  assert.equal(await page.locator('#detail-seek').isDisabled(),false);
  await page.locator('#detail-toggle-btn').tap();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  // A genuine media element keeps its real currentTime during preview.
  const preview=await page.evaluate(()=>{
    const a=document.querySelector('#audio'),d=document.querySelector('#detail-seek');
    const before=a.currentTime;
    d.value='525';d.dispatchEvent(new Event('input',{bubbles:true}));
    const during=a.currentTime;
    d.dispatchEvent(new Event('change',{bubbles:true}));
    return {before,during,after:a.currentTime,
      baseChanges:window.__phase32.baseChanges};
  });
  assert.ok(Math.abs(preview.during-preview.before)<.1,
    'preview cannot seek real audio before change');
  await page.waitForFunction(()=>Math.abs(document.querySelector('#audio').currentTime-6.3)<.45,
    null,{timeout:4500});
  assert.equal(preview.baseChanges,1,'immersive commit exactly once');
  report.immersiveCommit={target:6.3,previewDidNotSeek:true,changes:1};
  // Media Session handlers must route through app-owned native audio,
  // preserving both the single audio and current selected track.
  const os=await page.evaluate(()=>{
    const api=window.__phase32OS.handlers,a=document.querySelector('#audio');
    api.seekto({seekTime:4});const to=a.currentTime;
    api.seekbackward({seekOffset:2});const back=a.currentTime;
    api.seekforward({seekOffset:3});const forward=a.currentTime;
    return {to,back,forward,changes:window.__phase32.baseChanges};
  });
  assert.ok(Math.abs(os.to-4)<.15);
  assert.ok(Math.abs(os.back-2)<.15);
  assert.ok(Math.abs(os.forward-5)<.15);
  assert.equal(os.changes,4,'each OS seek must commit once');
  report.os={directNativeSeek:true,to:os.to,back:os.back,
    forward:os.forward,commits:3};
  // OS seek while a mobile range drag is in progress must supersede that
  // preview, not let its delayed touch/change overwrite the OS target.
  const overlap=await page.evaluate(()=>{
    const a=document.querySelector('#audio'),d=document.querySelector('#detail-seek');
    const base=window.__phase32.baseChanges;
    d.value='920';d.dispatchEvent(new Event('input',{bubbles:true}));
    window.__phase32OS.handlers.seekto({seekTime:3});
    const afterOS=a.currentTime;
    d.dispatchEvent(new Event('change',{bubbles:true}));
    return {afterOS,afterLateChange:a.currentTime,
      commits:window.__phase32.baseChanges-base,
      previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden')};
  });
  console.log('FYMUSIC_PHASE32_OS_PREVIEW_OWNERSHIP '+JSON.stringify(overlap));
  assert.equal(overlap.commits,1,
    'old preview change must not commit after Media Session seek');
  assert.ok(Math.abs(overlap.afterLateChange-3)<.2,
    'late mobile gesture must not override OS seek');
  assert.equal(overlap.previewHidden,true);
  report.osPreviewSuperseded=true;
  // Selecting B through the genuine search-row handler while the overlay is
  // open invalidates A's uncommitted preview. Delayed A change must never
  // seek B after its own verified media is ready.
  await page.evaluate(()=>{
    const d=document.querySelector('#detail-seek');
    d.value='940';d.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelectorAll('.search-song-row .search-song-main')[1].click();
  });
  await ready('3202');
  await page.locator('#detail-toggle-btn').tap();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  const switching=await page.evaluate(()=>{
    const a=document.querySelector('#audio'),d=document.querySelector('#detail-seek');
    const before=a.currentTime,count=window.__phase32.baseChanges;
    d.dispatchEvent(new Event('change',{bubbles:true}));
    return {before,after:a.currentTime,changes:window.__phase32.baseChanges-count,
      title:window.__LXNowPlayingTrack?.name,
      osTitle:window.__phase32OS.metadata?.title,
      src:a.currentSrc,baseDisabled:document.querySelector('#player-seek').disabled,
      fullDisabled:d.disabled,audioCount:document.querySelectorAll('audio').length};
  });
  console.log('FYMUSIC_PHASE32_STALE_CHANGE_OWNERSHIP '+JSON.stringify(switching));
  assert.equal(switching.changes,0,'stale A change must never commit on B');
  assert.ok(Math.abs(switching.after-switching.before)<.2);
  assert.equal(switching.title,'Phase32 Original B');
  assert.equal(switching.osTitle,'Phase32 Original B');
  assert.ok(switching.src.includes('phase32=3202'));
  assert.equal(switching.baseDisabled,false);
  assert.equal(switching.fullDisabled,false);
  assert.equal(switching.audioCount,1);
  assert.deepEqual(errors,[]);
  const tally=await page.evaluate(()=>({
    resolvers:window.__phase32.resolvers.map(({id,quality})=>({id,quality})),
    tracks:window.__phase32.tracks,
    seeked:window.__phase32.seeked}));
  assert.deepEqual(tally.resolvers,[
    {id:'3201',quality:'flac24bit'},{id:'3202',quality:'flac24bit'}]);
  assert.deepEqual(tally.tracks,['Phase32 Original A','Phase32 Original B']);
  assert.ok(network.some(x=>x.id==='3201'&&x.status===206));
  assert.ok(network.some(x=>x.id==='3202'&&x.status===206));
  report.trackSwitch={blockedLateChange:true,newTrackCorrect:true,
    format:'original FLAC 24bit/96kHz',seeked:tally.seeked};
  report.http206=true;
  report.realNativeAudio=true;
  report.oneAudio=true;
  report.noSyntheticAudioEvents=true;
  report.noThirdPartyMedia=true;
  console.log('FYMUSIC_PHASE32_REAL_SEEK_OWNERSHIP '+JSON.stringify(report));
  console.log('FYMUSIC_PHASE32_REAL_SEEK_PASS');
} finally {await browser.close()}
