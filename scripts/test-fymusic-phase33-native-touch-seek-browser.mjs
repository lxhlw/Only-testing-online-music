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
  await page.locator('#detail-toggle-btn').tap();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  const touch=await page.context().newCDPSession(page);
  const slider=page.locator('#detail-seek');
  const traceSetup=()=>page.evaluate(()=>{
    const d=document.querySelector('#detail-seek');
    window.__phase33={events:[],baseChanges:0};
    const kinds=['pointerdown','pointermove','pointerup','pointercancel',
      'touchstart','touchmove','touchend','touchcancel','input','change'];
    for(const kind of kinds)d.addEventListener(kind,event=>{
      window.__phase33.events.push({type:kind,
        value:d.value,t:Math.round(performance.now()),
        trusted:event.isTrusted});
      if(window.__phase33.events.length>90)window.__phase33.events.shift();
    });
    document.querySelector('#player-seek').addEventListener('change',
      ()=>window.__phase33.baseChanges++);
    return true;
  });
  await traceSetup();
  const geometry=async()=>{
    const box=await slider.boundingBox();
    assert.ok(box&&box.width>60&&box.height>=25,'real visible slider geometry');
    const value=Number(await slider.inputValue())/1000;
    return {x:box.x+Math.max(10,Math.min(box.width-10,
      8+(box.width-16)*value)), y:box.y+box.height/2,
      end:box.x+box.width*.89};
  };
  const beginTouch=async()=>{
    const p=await geometry();
    await touch.send('Input.dispatchTouchEvent',
      {type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:11}]});
    for(let i=1;i<=6;i++){
      const x=p.x+(p.end-p.x)*i/6;
      await touch.send('Input.dispatchTouchEvent',
        {type:'touchMove',touchPoints:[{x,y:p.y,id:11}]});
    }
    const snap=await page.evaluate(()=>({
      value:document.querySelector('#detail-seek').value,
      events:window.__phase33.events.map(e=>e.type),
      previewHidden:document.querySelector('#player-seek-preview')?.
        classList.contains('hidden')}));
    console.log('FYMUSIC_PHASE33_TOUCH_IN_PROGRESS '+JSON.stringify(snap));
    assert.ok(snap.events.includes('touchstart')&&snap.events.includes('touchmove'),
      'CDP must deliver actual trusted browser touch events');
    assert.ok(snap.events.includes('input')&&!snap.previewHidden,
      'physical gesture must reach actual range preview before interruption');
    return snap;
  };
  const endTouch=()=>touch.send('Input.dispatchTouchEvent',
    {type:'touchEnd',touchPoints:[]});
  const initial=await beginTouch();
  const first=await page.evaluate(()=>{
    const a=document.querySelector('#audio');
    const before=window.__phase33.baseChanges;
    window.__phase32OS.handlers.seekto({seekTime:3});
    return {current:a.currentTime,baseChanges:window.__phase33.baseChanges-before};
  });
  assert.ok(Math.abs(first.current-3)<.2,'OS real media seek to 3 seconds');
  await endTouch();
  const osAfter=await page.evaluate(()=>({
    current:document.querySelector('#audio').currentTime,
    commits:window.__phase33.baseChanges,
    trace:window.__phase33.events.slice(-17),
    overlay:document.querySelector('#lyrics-overlay')?.getAttribute('aria-hidden')}));
  console.log('FYMUSIC_PHASE33_REAL_TOUCH_OS '+JSON.stringify(osAfter));
  assert.ok(Math.abs(osAfter.current-3)<.2,
    'real touchEnd must not override newer OS seek');
  assert.equal(osAfter.commits,1,
    'real touchEnd cannot commit a stale seek');
  report.nativeTouchOS=true;
  await page.evaluate(()=>{
    document.querySelector('#detail-seek').dispatchEvent(new Event('blur'));
    window.__phase33.events=[];
  });
  await beginTouch();
  await page.evaluate(()=>{
    document.querySelectorAll('.search-song-row .search-song-main')[1].click();
  });
  await ready('3202');
  await page.locator('#detail-toggle-btn').tap();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  const before=await page.evaluate(()=>({
    current:document.querySelector('#audio').currentTime,
    commits:window.__phase33.baseChanges}));
  await endTouch();
  const newTrack=await page.evaluate(()=>({
    current:document.querySelector('#audio').currentTime,
    commits:window.__phase33.baseChanges,
    title:window.__LXNowPlayingTrack?.name,
    osTitle:window.__phase32OS.metadata?.title,
    audioCount:document.querySelectorAll('audio').length,
    trace:window.__phase33.events.slice(-17)}));
  console.log('FYMUSIC_PHASE33_REAL_TOUCH_TRACK '+JSON.stringify({before,newTrack}));
  assert.equal(newTrack.title,'Phase32 Original B');
  assert.equal(newTrack.osTitle,'Phase32 Original B');
  assert.equal(newTrack.audioCount,1);
  assert.equal(newTrack.commits,before.commits,
    'real stale touchEnd after track selection cannot seek new track');
  assert.ok(Math.abs(newTrack.current-before.current)<.2,
    'real stale touchEnd cannot modify new song clock');
  assert.deepEqual(errors,[]);
  const resolvers=await page.evaluate(()=>window.__phase32.resolvers
    .map(({id,quality})=>({id,quality})));
  assert.deepEqual(resolvers,[
    {id:'3201',quality:'flac24bit'},{id:'3202',quality:'flac24bit'}]);
  assert.ok(network.some(x=>x.id==='3201'&&x.status===206));
  assert.ok(network.some(x=>x.id==='3202'&&x.status===206));
  report.nativeTouchTrack=true;
  report.genuineTouchEvents=true;
  report.noSyntheticAudioEvents=true;
  report.realFlacHttp206=true;
  report.oneAudio=true;
  console.log('FYMUSIC_PHASE33_REAL_TOUCH_PASS '+JSON.stringify(report));

} finally {await browser.close()}
