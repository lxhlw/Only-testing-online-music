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
  await page.evaluate(()=>{
    const a=document.querySelector('#audio'),range=document.querySelector('#detail-seek');
    const native=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
    window.__phase36={writes:[],events:[],baseChanges:0};
    Object.defineProperty(a,'currentTime',{
      configurable:true,
      get(){return native.get.call(this)},
      set(value){
        window.__phase36.writes.push(Number(value));
        return native.set.call(this,value);
      }
    });
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel',
      'touchstart','touchmove','touchend','input','change']){
      range.addEventListener(type,e=>{
        window.__phase36.events.push({
          type, trusted:e.isTrusted,value:range.value,
          time:Math.round(performance.now())
        });
        if(window.__phase36.events.length>90)window.__phase36.events.shift();
      });
    }
    document.querySelector('#player-seek').addEventListener('change',
      ()=>window.__phase36.baseChanges++);
  });
  const touch=await page.context().newCDPSession(page);
  const slider=page.locator('#detail-seek');
  const dimensions=async()=>{
    const b=await slider.boundingBox();
    assert.ok(b&&b.width>60&&b.height>=25,'visible native range');
    return {x:b.x,y:b.y,w:b.width,h:b.height};
  };
  const start=async(id,finish=.88)=>{
    const b=await dimensions();
    const from=b.x+b.w*.19,y=b.y+b.h/2;
    await touch.send('Input.dispatchTouchEvent',
      {type:'touchStart',touchPoints:[{id,x:from,y}]});
    for(let i=1;i<=6;i++){
      await touch.send('Input.dispatchTouchEvent',
        {type:'touchMove',touchPoints:[{id,x:from+(b.x+b.w*finish-from)*i/6,y}]});
    }
    const state=await page.evaluate(()=>({
      preview:!document.querySelector('#player-seek-preview').classList.contains('hidden'),
      trustedInput:window.__phase36.events.some(e=>e.type==='input'&&e.trusted),
      pointerdown:window.__phase36.events.some(e=>e.type==='pointerdown'&&e.trusted),
      time:document.querySelector('#audio').currentTime,
      fullDisabled:document.querySelector('#detail-seek').disabled,
      baseDisabled:document.querySelector('#player-seek').disabled,
      overlay:document.querySelector('#lyrics-overlay').getAttribute('aria-hidden'),
      tail:window.__phase36.events.slice(-8)
    }));
    console.log('FYMUSIC_PHASE36_TOUCH_BEGIN '+JSON.stringify({id,state}));
    assert.ok(state.preview&&state.trustedInput&&state.pointerdown,
      'real native touch must enter immersive seek preview');
    return {id,b,y};
  };
  const continueOld=async(p,at=.94)=>{
    await touch.send('Input.dispatchTouchEvent',
      {type:'touchMove',touchPoints:[{id:p.id,x:p.b.x+p.b.w*at,y:p.y}]});
    await touch.send('Input.dispatchTouchEvent',
      {type:'touchEnd',touchPoints:[]});
  };
  const snapshot=()=>page.evaluate(()=>{
    const a=document.querySelector('#audio'),z=window.__phase36;
    return {time:a.currentTime,writes:z.writes.slice(),changes:z.baseChanges,
      previewHidden:document.querySelector('#player-seek-preview').classList.contains('hidden'),
      trace:z.events.slice(-16),title:window.__LXNowPlayingTrack?.name,
      osTitle:window.__phase32OS.metadata?.title,
      paused:a.paused,audioCount:document.querySelectorAll('audio').length};
  });

  const first=await start(11);
  const preOS=await snapshot();
  assert.equal(preOS.writes.length,0);
  await page.evaluate(()=>window.__phase32OS.handlers.seekto({seekTime:3}));
  const osWrite=await snapshot();
  assert.ok(Math.abs(osWrite.time-3)<.18&&osWrite.writes.length===1,
    'OS seek must write native media time exactly once');
  await continueOld(first);
  const afterOS=await snapshot();
  console.log('FYMUSIC_PHASE36_OS_TOUCH_CONTINUATION '+JSON.stringify({preOS,osWrite,afterOS}));
  assert.equal(afterOS.writes.length,1,
    'old touchmove after Media Session must not seek again');
  assert.ok(Math.abs(afterOS.time-3)<.18);
  assert.equal(afterOS.previewHidden,true);
  report.osSupersedesOldTouch=true;

  const fresh=await start(12,.45);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const afterFresh=await snapshot();
  console.log('FYMUSIC_PHASE36_FRESH_TOUCH_AFTER_OS '+JSON.stringify(afterFresh));
  assert.equal(afterFresh.writes.length,2,'new touch must commit after OS gesture interruption');
  assert.ok(afterFresh.time>3.5&&afterFresh.time<8);
  report.newTouchAfterOS=true;

  const oldB=await start(13);
  const beforeTrack=await snapshot();
  await page.evaluate(()=>document.querySelectorAll('.search-song-row .search-song-main')[1].click());
  await ready('3202');
  await page.locator('#detail-toggle-btn').tap();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  const trackB=await snapshot();
  const beforeReleaseWrites=trackB.writes.length;
  await continueOld(oldB);
  const afterTrack=await snapshot();
  console.log('FYMUSIC_PHASE36_TRACK_TOUCH_CONTINUATION '+
    JSON.stringify({beforeTrack,trackB,afterTrack}));
  assert.equal(afterTrack.title,'Phase32 Original B');
  assert.equal(afterTrack.osTitle,'Phase32 Original B');
  assert.equal(afterTrack.audioCount,1);
  assert.equal(afterTrack.writes.length,beforeReleaseWrites,
    'old A touchmove after B song is ready must not seek B');
  assert.ok(Math.abs(afterTrack.time-trackB.time)<.16);
  assert.equal(afterTrack.previewHidden,true);
  report.trackSupersedesOldTouch=true;
  const freshB=await start(14,.49);
  await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const afterB=await snapshot();
  console.log('FYMUSIC_PHASE36_NEW_TOUCH_ON_B '+JSON.stringify(afterB));
  assert.equal(afterB.writes.length,beforeReleaseWrites+1);
  assert.ok(afterB.time>3.5);
  assert.equal(afterB.audioCount,1);
  const resolver=await page.evaluate(()=>window.__phase32.resolvers
    .map(x=>({id:x.id,quality:x.quality})));
  assert.deepEqual(resolver,[{id:'3201',quality:'flac24bit'},
    {id:'3202',quality:'flac24bit'}]);
  assert.ok(network.some(x=>x.id==='3201'&&x.status===206));
  assert.ok(network.some(x=>x.id==='3202'&&x.status===206));
  assert.deepEqual(errors,[]);
  report.realNativeTouch=true;
  report.nativeAudioHttp206=true;
  report.oneAudio=true;
  report.newTouchOnB=true;
  report.noSyntheticAudioEvents=true;
  console.log('FYMUSIC_PHASE36_TOUCH_OS_TRACK_PASS '+JSON.stringify(report));

} finally {await browser.close()}
