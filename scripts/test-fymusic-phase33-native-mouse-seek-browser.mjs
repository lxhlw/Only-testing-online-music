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
  const page=await browser.newPage({viewport:{width:1366,height:900},
    isMobile:false,hasTouch:false,reducedMotion:'reduce'});
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


  await page.locator('#player-toggle-btn').click();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  await page.evaluate(()=>{
    const seek=document.querySelector('#player-seek');
    window.__phase33Mouse={events:[],changes:0,writes:[]};
    // Observe writes while forwarding to the native accessor unchanged.
    // This does not mock the media clock, decoding or seek behavior.
    const audio=document.querySelector('#audio');
    const native=Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,'currentTime');
    if(!native?.get||!native?.set)throw Error('native media accessor missing');
    Object.defineProperty(audio,'currentTime',{configurable:true,
      get(){return native.get.call(this)},
      set(value){
        window.__phase33Mouse.writes.push(Number(value));
        return native.set.call(this,value);
      }
    });
    for(const kind of ['pointerdown','pointermove','pointerup',
      'mousedown','mousemove','mouseup','input','change']){
      seek.addEventListener(kind,event=>{
        window.__phase33Mouse.events.push({type:kind, trusted:event.isTrusted,
          value:seek.value});
        if(window.__phase33Mouse.events.length>100)
          window.__phase33Mouse.events.shift();
      });
    }
    seek.addEventListener('change',()=>window.__phase33Mouse.changes++);
  });
  const control=page.locator('#player-seek');
  const geometry=async()=>{
    const box=await control.boundingBox();
    assert.ok(box&&box.width>=120&&box.height>=3,'desktop base seek visible');
    const v=Number(await control.inputValue())/1000;
    return {x:box.x+Math.max(9,Math.min(box.width-9,
      8+(box.width-16)*v)),y:box.y+box.height/2,
      end:box.x+box.width*.88};
  };
  const beginMouse=async()=>{
    const p=await geometry();
    await page.mouse.move(p.x,p.y);
    await page.mouse.down();
    await page.mouse.move(p.end,p.y,{steps:8});
    const during=await page.evaluate(()=>({
      value:document.querySelector('#player-seek').value,
      hidden:document.querySelector('#player-seek-preview')?.
        classList.contains('hidden'),
      events:window.__phase33Mouse.events.map(e=>e.type),
      trusted:window.__phase33Mouse.events.filter(e=>e.type==='input')
        .every(e=>e.trusted)}));
    console.log('FYMUSIC_PHASE33_MOUSE_PREVIEW '+JSON.stringify(during));
    assert.ok(during.events.includes('pointerdown')&&
      during.events.includes('pointermove')&&during.events.includes('input')&&
      !during.hidden&&during.trusted,
      'real mouse gesture must own browser range preview');
    return p;
  };
  const ptr=await beginMouse();
  const beforeOS=await page.evaluate(()=>window.__phase33Mouse.writes.length);
  await page.evaluate(()=>window.__phase32OS.handlers.seekto({seekTime:3}));
  // Browser is still holding the real mouse button: this movement is the
  // potential late native input that can reapply a superseded gesture.
  await page.mouse.move(ptr.end-22,ptr.y,{steps:3});
  await page.mouse.up();
  const result=await page.evaluate(()=>({
    current:document.querySelector('#audio').currentTime,
    commits:window.__phase33Mouse.writes.length,
    rawChanges:window.__phase33Mouse.changes,
    writes:window.__phase33Mouse.writes.slice(-5),
    previewHidden:document.querySelector('#player-seek-preview')?.
      classList.contains('hidden'),
    recent:window.__phase33Mouse.events.slice(-16)}));
  console.log('FYMUSIC_PHASE33_DESKTOP_OS_CONFLICT '+JSON.stringify({beforeOS,result}));
  assert.equal(result.commits-beforeOS,1,
    'physical desktop drag must not commit after OS owns seek');
  assert.ok(Math.abs(result.current-3)<.2,
    'physical desktop drag must not override OS position');
  report.osMouseOwnership=true;
  // A fresh drag followed by user-selected new track must also never retain
  // old song's pointer capture or overwrite B when its decoder starts.
  const newPtr=await beginMouse();
  await page.evaluate(()=>document.querySelectorAll(
    '.search-song-row .search-song-main')[1].click());
  await ready('3202');
  await page.locator('#player-toggle-btn').click();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  const beforeTrack=await page.evaluate(()=>({
    time:document.querySelector('#audio').currentTime,
    commits:window.__phase33Mouse.writes.length}));
  await page.mouse.move(newPtr.end-30,newPtr.y,{steps:3});
  await page.mouse.up();
  const afterTrack=await page.evaluate(()=>({
    time:document.querySelector('#audio').currentTime,
    commits:window.__phase33Mouse.writes.length,
    title:window.__LXNowPlayingTrack?.name,
    osTitle:window.__phase32OS.metadata?.title,
    count:document.querySelectorAll('audio').length}));
  console.log('FYMUSIC_PHASE33_DESKTOP_TRACK_CONFLICT '+
    JSON.stringify({beforeTrack,afterTrack}));
  assert.equal(afterTrack.commits,beforeTrack.commits,
    'old mouse release must not commit on newly selected track');
  assert.ok(Math.abs(afterTrack.time-beforeTrack.time)<.2);
  assert.equal(afterTrack.title,'Phase32 Original B');
  assert.equal(afterTrack.osTitle,'Phase32 Original B');
  assert.equal(afterTrack.count,1);
  assert.deepEqual(errors,[]);
  assert.ok(network.some(x=>x.id==='3201'&&x.status===206));
  assert.ok(network.some(x=>x.id==='3202'&&x.status===206));
  report.realMouseNative=true;
  report.trackOwnership=true;
  report.http206=true;
  report.oneNativeAudio=true;
  console.log('FYMUSIC_PHASE33_NATIVE_MOUSE_PASS '+JSON.stringify(report));


} finally {await browser.close()}
