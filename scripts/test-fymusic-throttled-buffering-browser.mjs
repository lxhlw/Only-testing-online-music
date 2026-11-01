import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 20: same HTMLAudioElement as the application, genuine network bytes.
// Observe actual native events; never dispatch waiting/error or mutate readyState.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const PATH='/api/fymusic-throttle-selftest';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},
    hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e?.message||e).slice(0,150)));
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh &&
    document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
    null,{timeout:18000});

  const total=44+90*8000*2;
  const probe=await page.evaluate(async path=>{
    const head=await fetch(path+'?mode=slow',{method:'HEAD',cache:'no-store'});
    const begin=performance.now();
    const response=await fetch(path+'?mode=slow',
      {headers:{Range:'bytes=0-125000'},cache:'no-store'});
    const reader=response.body.getReader();
    let bytes=0,chunks=0,firstByteMs=null;
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(firstByteMs===null)firstByteMs=Math.round(performance.now()-begin);
      bytes+=value.byteLength;chunks++;
    }
    const slowMs=Math.round(performance.now()-begin);
    const invalid=await fetch(path+'?mode=normal',
      {headers:{Range:'bytes=9999999-'}});
    return {headStatus:head.status,total:head.headers.get('content-length'),
      acceptRanges:head.headers.get('accept-ranges'),status:response.status,
      range:response.headers.get('content-range'),bytes,chunks,firstByteMs,slowMs,
      invalidStatus:invalid.status,invalidRange:invalid.headers.get('content-range')};
  },PATH);
  assert.deepEqual({
    headStatus:probe.headStatus,total:probe.total,acceptRanges:probe.acceptRanges,
    status:probe.status,range:probe.range,bytes:probe.bytes,
    invalidStatus:probe.invalidStatus,invalidRange:probe.invalidRange
  },{
    headStatus:200,total:String(total),acceptRanges:'bytes',
    status:206,range:`bytes 0-125000/${total}`,bytes:125001,
    invalidStatus:416,invalidRange:`bytes */${total}`
  });
  assert.ok(probe.slowMs>=7500,
    'Low-bandwidth transport must measurably delay 125KB despite fast first bytes');

  await page.evaluate(path=>{
    const audio=document.querySelector('#audio');
    audio.muted=true;
    const data={events:[],samples:[],calls:{play:0,load:0,pause:0},
      startedAt:performance.now()};
    const eventTypes=['loadstart','loadedmetadata','canplay','canplaythrough',
      'play','playing','timeupdate','waiting','stalled','error',
      'pause','seeking','seeked','progress','suspend'];
    const inspect=()=>{
      const buffered=[];
      for(let i=0;i<audio.buffered.length;i++)
        buffered.push([+audio.buffered.start(i).toFixed(2),
          +audio.buffered.end(i).toFixed(2)]);
      const hint=document.querySelector('#player-network-hint');
      return {atMs:Math.round(performance.now()-data.startedAt),
        time:+audio.currentTime.toFixed(2),duration:audio.duration,
        ready:audio.readyState,network:audio.networkState,
        paused:audio.paused,buffered,
        buffering:document.documentElement.classList.contains('is-buffering'),
        hintVisible:!!hint&&!hint.hidden,
        error:audio.error?.code||0};
    };
    for(const type of eventTypes)audio.addEventListener(type,()=>{
      data.events.push({type,...inspect()});
      if(data.events.length>320)data.events.shift();
    },{passive:true});
    data.sample=inspect;
    const play=audio.play.bind(audio),pause=audio.pause.bind(audio),
      load=audio.load.bind(audio);
    audio.play=(...args)=>{data.calls.play++;return play(...args)};
    audio.pause=(...args)=>{data.calls.pause++;return pause(...args)};
    audio.load=(...args)=>{data.calls.load++;return load(...args)};
    window.__phase20=data;
    window.__phase20Sampler=setInterval(()=>{
      data.samples.push(inspect());
      if(data.samples.length>140)data.samples.shift();
    },250);
    audio.src=path+'?mode=slow';
    window.__phase20Play=audio.play().then(()=>true,()=>false);
  },PATH);

  // A network-limited 90s media item: initial 6s playable bytes,
  // then ~2KB/s for 11s (below the 16KB/s media consumption rate).
  // Chromium might prebuffer or delay play: record what actually happens.
  let startupTimedOut=false;
  try{
    await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.4,
      null,{timeout:32000});
  }catch(e){startupTimedOut=true}
  await page.waitForTimeout(startupTimedOut?1200:16000);
  const slow=await page.evaluate(()=>{
    clearInterval(window.__phase20Sampler);
    const a=document.querySelector('#audio'),data=window.__phase20;
    return {samples:data.samples,events:data.events,calls:{...data.calls},
      playSettled:a.currentTime>.4,src:a.currentSrc,
      final:data.sample()};
  });
  const played=slow.events.some(e=>e.type==='playing');
  const progressed=slow.events.some(e=>e.type==='timeupdate'&&e.time>.4);
  const waitingAfterProgress=slow.events.some(e=>
    e.type==='waiting'&&e.time>.5&&
      slow.events.some(p=>p.type==='timeupdate'&&p.time>.3&&p.atMs<e.atMs));
  const stalledAfterProgress=slow.events.some(e=>
    e.type==='stalled'&&e.time>.5);
  const visibleBufferHint=slow.samples.some(s=>s.buffering&&s.hintVisible);
  const minBufferAhead=slow.samples.reduce((min,s)=>{
    const end=s.buffered.find(r=>r[0]<=s.time&&r[1]>=s.time)?.[1];
    return end===undefined?min:Math.min(min,end-s.time);
  },Infinity);
  const progressAfterWait=waitingAfterProgress&&slow.events.some(e=>
    e.type==='playing'&&e.atMs>
      slow.events.find(w=>w.type==='waiting'&&w.time>.5)?.atMs);
  const downloadRange=slow.samples.map(s=>s.buffered.at(-1)?.[1]||0);
  const maximumBufferEnd=Math.max(0,...downloadRange);
  const mediaSummary={
    slowHttpMs:probe.slowMs,firstByteMs:probe.firstByteMs,
    chunks:probe.chunks,realMediaStarted:played,
    realMediaProgressed:progressed,mediaStartupTimedOut:startupTimedOut,
    nativeWaitingAfterProgress:waitingAfterProgress,
    nativeStalledAfterProgress:stalledAfterProgress,
    uiBufferHintObserved:visibleBufferHint,
    nativeResumedAfterWaiting:progressAfterWait,
    minBufferAheadSeconds:Number.isFinite(minBufferAhead)?+minBufferAhead.toFixed(2):null,
    maxBufferedSeconds:+maximumBufferEnd.toFixed(2),
    mediaElapsedSeconds:slow.final.time,
    mediaErrorCode:slow.final.error,
    nativeEventSequence:slow.events.filter(x=>!['timeupdate','progress'].includes(x.type))
      .map(x=>`${x.type}@${x.time}s/${x.ready}`).slice(0,60),
    sampleWindow:slow.samples.filter((_,i)=>i%8===0).map(s=>({
      t:s.atMs,current:s.time,buffered:s.buffered.at(-1)?.[1]||0,
      ready:s.ready,buffering:s.buffering})).slice(0,18)
  };
  console.log('FYMUSIC_PHASE20_NATIVE_OBSERVATIONS '+JSON.stringify(mediaSummary));
  // Never treat HTTP delay itself as evidence of native mid-playback waiting.
  if(waitingAfterProgress)assert.ok(played&&progressed);
  if(waitingAfterProgress&&slow.final.time>8)
    assert.ok(progressAfterWait,'Native mid-playback wait should recover naturally');
  assert.ok(slow.src.includes(PATH+'?mode=slow'));
  const before=slow.calls;
  await page.evaluate(()=>{
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    window.dispatchEvent(new Event('online'));
  });
  await page.waitForTimeout(200);
  assert.deepEqual(await page.evaluate(()=>window.__phase20.calls),before,
    'Visibility/online events must not initiate extra player play/load/pause calls');

  // Explicit recovery on the same native element, without changing song platform/quality.
  await page.evaluate(path=>{
    const a=document.querySelector('#audio');
    a.pause();
    a.src=path+'?mode=normal';
    window.__phase20NormalPlay=a.play().then(()=>true,()=>false);
  },PATH);
  await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.4,
    null,{timeout:25000});
  const recovered=await page.evaluate(()=>{
    const a=document.querySelector('#audio');
    return {time:a.currentTime,duration:a.duration,error:a.error?.code||0,
      src:a.currentSrc,success:window.__phase20NormalPlay};
  });
  assert.equal(recovered.error,0);
  assert.ok(recovered.duration>89&&recovered.duration<91);
  assert.ok(recovered.src.includes(PATH+'?mode=normal'));
  await page.evaluate(()=>document.querySelector('#audio').pause());
  assert.deepEqual(pageErrors,[]);
  assert.ok(recovered.time>.4,'Genuine decoded recovery must advance time');
  console.log('FYMUSIC_THROTTLED_BUFFERING_PASS '+JSON.stringify({
    genuineSlowHttpTransport:true,range206And416:true,
    actualMediaProgressObserved:progressed,nativeWaitObserved:waitingAfterProgress,
    nativeResumeObserved:progressAfterWait,uiBufferHintObserved:visibleBufferHint,
    explicitNormalRecovery:true,foregroundNoAutoRetry:true,
    isolatedSyntheticFixtureOnly:true,thirdPartySongNotVerified:true
  }));
}finally{await browser.close()}
