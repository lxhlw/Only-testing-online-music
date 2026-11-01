import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 23: direct native audio.src MP3 with equal lead bytes / equal gap.
// Only transport semantics change: HTTP 200 (no Range) vs RFC 7233 206.
// Real fetch probes, real network-backed audio; no MSE, fake media events,
// audio clock mutation, production source changes, or additional player.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const ROOT='/api/fymusic-range-selftest';
const FULL=209*1600,LEAD=460,GAP=11000;
const variants=[
  {id:'progressive-200',mode:'primed'},
  {id:'range-capable',mode:'primed-range'}
];
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
try {
  const comparison=[];
  for(const variant of variants){
    const page=await browser.newPage({viewport:{width:390,height:844},
      isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const errors=[],requests=[];
    page.on('pageerror',error=>errors.push(String(error?.message||error).slice(0,180)));
    page.on('request',r=>{
      if(!r.url().includes('phase23=audio'))return;
      requests.push({request:r,openedAt:Date.now(),
        range:r.headers()['range']||null,status:null,
        responseRange:null,responseLength:null,
        completedAt:null,failed:false});
    });
    page.on('response',r=>{
      const record=requests.find(x=>x.request===r.request());
      if(!record)return;
      record.status=r.status();
      record.responseRange=r.headers()['content-range']||null;
      record.responseLength=r.headers()['content-length']||null;
    });
    page.on('requestfinished',r=>{
      const record=requests.find(x=>x.request===r);
      if(record)record.completedAt=Date.now();
    });
    page.on('requestfailed',r=>{
      const record=requests.find(x=>x.request===r);
      if(record)record.failed=true;
    });
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
      document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
      null,{timeout:18000});
    const path=ROOT+'?mode='+variant.mode+'&format=mp3&leadFrames='+LEAD+
      '&gapMs='+GAP;
    // Separate control fetches never attach to the native audio element.
    // They verify RFC 7233 response status, real byte ranges, and 416.
    const headers=await page.evaluate(async ({path,rangeMode})=>{
      const head=await fetch(path,{method:'HEAD',cache:'no-store'});
      const start=await fetch(path+'&phase23=range0',
        {headers:{Range:'bytes=0-63'},cache:'no-store'});
      const prefix=new Uint8Array(await start.arrayBuffer());
      const suffix=await fetch(path+'&phase23=suffix',
        {headers:{Range:'bytes=-16'},cache:'no-store'});
      const tail=new Uint8Array(await suffix.arrayBuffer());
      const invalid=await fetch(path+'&phase23=invalid',
        {headers:{Range:'bytes=9999999-99999999'},cache:'no-store'});
      const second=(await fetch(path+'&phase23=middle',
        {headers:{Range:'bytes=200000-200031'},cache:'no-store'}));
      const middle=new Uint8Array(await second.arrayBuffer());
      return {headStatus:head.status,headRanges:head.headers.get('accept-ranges'),
        headLength:head.headers.get('content-length'),
        firstStatus:start.status,firstRange:start.headers.get('content-range'),
        firstLen:prefix.byteLength,firstMagic:[...prefix.slice(0,2)],
        suffixStatus:suffix.status,suffixRange:suffix.headers.get('content-range'),
        suffixLen:tail.byteLength,invalidStatus:invalid.status,
        invalidRange:invalid.headers.get('content-range'),
        middleStatus:second.status,middleRange:second.headers.get('content-range'),
        middleLen:middle.byteLength,rangeMode};
    },{path,rangeMode:variant.mode==='primed-range'});
    if(variant.mode==='primed-range'){
      assert.equal(headers.headStatus,200);
      assert.equal(headers.headRanges,'bytes');
      assert.equal(headers.firstStatus,206);
      assert.equal(headers.firstRange,'bytes 0-63/'+FULL);
      assert.equal(headers.firstLen,64);
      assert.deepEqual(headers.firstMagic,[255,251]);
      assert.equal(headers.suffixStatus,206);
      assert.equal(headers.suffixRange,'bytes '+(FULL-16)+'-'+(FULL-1)+'/'+FULL);
      assert.equal(headers.suffixLen,16);
      assert.equal(headers.invalidStatus,416);
      assert.equal(headers.invalidRange,'bytes */'+FULL);
      assert.equal(headers.middleStatus,206);
      assert.equal(headers.middleRange,'bytes 200000-200031/'+FULL);
      assert.equal(headers.middleLen,32);
    }else{
      assert.equal(headers.headRanges,'none');
      assert.equal(headers.headStatus,200);
      assert.equal(headers.firstStatus,200,
        '200 full stream deliberately ignores the Range header');
      assert.equal(headers.firstRange,null);
      assert.equal(headers.firstLen,FULL);
      assert.deepEqual(headers.firstMagic,[255,251]);
    }
    // Direct media uses a brand-new URL: browser cannot reuse a range-probe
    // response. This preserves the real audio.src transport selection.
    await page.evaluate(async path=>{
      const {observeAudioEvents}=await import('/src/fymusic-media-evidence.js');
      const audio=document.querySelector('#audio');
      const recorder=observeAudioEvents(audio,{limit:56});
      const evidence={recorder,startEpoch:Date.now(),uiWaitSeen:false,
        error:null,network:{completed:false,bytes:0,maxGapMs:0,firstByteMs:null}};
      window.__fymusicPhase23=evidence;
      const checkHint=()=>{
        const hint=document.querySelector('#player-network-hint');
        if(audio.currentTime>.4&&
          document.documentElement.classList.contains('is-buffering')&&
          hint&&!hint.hidden)evidence.uiWaitSeen=true;
      };
      audio.addEventListener('waiting',()=>requestAnimationFrame(checkHint),{passive:true});
      // Native request and a separate transport probe are concurrent and
      // independent; the probe never supplies bytes to the media element.
      evidence.probe=(async()=>{
        const t=performance.now(),r=await fetch(path+'&phase23=probe',
          {headers:{Range:'bytes=0-'},cache:'no-store'});
        const rd=r.body.getReader();let last=null;
        while(true){
          const {done,value}=await rd.read();
          if(done)break;
          const elapsed=performance.now()-t;
          if(evidence.network.firstByteMs===null)
            evidence.network.firstByteMs=Math.round(elapsed);
          if(last!==null)evidence.network.maxGapMs=Math.max(
            evidence.network.maxGapMs,Math.round(elapsed-last));
          last=elapsed;evidence.network.bytes+=value.byteLength;
        }
        evidence.network.completed=true;
        evidence.network.status=r.status;
        evidence.network.range=r.headers.get('content-range');
        evidence.network.totalMs=Math.round(performance.now()-t);
      })().catch(e=>{evidence.error='probe: '+String(e?.message||e)});
      audio.muted=true;audio.preload='auto';
      audio.src=path+'&phase23=audio';
      audio.play().catch(e=>{evidence.error='play: '+String(e?.message||e)});
    },path);
    await page.waitForTimeout(15500);
    const result=await page.evaluate(()=>{
      const d=window.__fymusicPhase23,a=document.querySelector('#audio');
      const events=d.recorder.dispose();
      return {events,uiWaitSeen:d.uiWaitSeen,error:d.error,
        network:d.network,elapsedSeconds:+a.currentTime.toFixed(2),
        mediaError:a.error?.code||0,ready:a.readyState,
        epochStart:d.startEpoch};
    });
    const audioRequests=requests.map(x=>({range:x.range,status:x.status,
      contentRange:x.responseRange,contentLength:x.responseLength,
      openedAt:x.openedAt,completedAt:x.completedAt,failed:x.failed}));
    const starting=result.events.firstPlayingMs;
    const startedBeforeRequestDone=starting!==null&&requests.some(x=>
      x.status!==null&&x.completedAt!==null&&
      result.epochStart+starting<x.completedAt);
    const summary={mode:variant.id,headers,result:{
      firstPlayingMs:starting,firstProgressMs:result.events.firstProgressMs,
      waits:result.events.waits,recovered:result.events.recovered,
      rebufferMs:result.events.rebufferMs,stallEvents:result.events.stallEvents,
      uiWaitSeen:result.uiWaitSeen,mediaError:result.mediaError,
      elapsedSeconds:result.elapsedSeconds,
      eventCount:result.events.eventCount,disposed:result.events.disposed,
      startedBeforeRequestDone,
      eventSequence:result.events.events.filter(e=>['playing','waiting','stalled','canplay'].includes(e.type))
        .map(e=>e.type+'@'+e.position+'/'+e.ready+'/'+e.ms).slice(0,14)
    },network:result.network,audioRequests};
    comparison.push(summary);
    assert.deepEqual(errors,[]);
    assert.equal(result.error,null,'no app/probe error');
    assert.equal(result.mediaError,0,'native element must decode audio');
    assert.ok(result.events.firstPlayingMs!==null&&result.events.firstProgressMs!==null,
      'real native MP3 playback and progress are mandatory');
    assert.equal(result.events.disposed,true);
    assert.ok(result.events.eventCount<=56,'event sample must remain bounded');
    assert.equal(result.network.bytes,FULL);
    assert.equal(result.network.completed,true);
    assert.ok(result.network.maxGapMs>=8500,
      'real HTTP lead and prolonged network pause must occur');
    assert.ok(requests.some(x=>x.status===200||x.status===206),
      'actual audio.src must issue at least one successful HTTP media request');
    if(result.events.waits>0){
      assert.ok(result.events.recovered>0,
        'post-progress native wait must recover after network resumes');
      assert.equal(result.uiWaitSeen,true,
        'FyMusic UI must show real native buffer starvation');
    }
    // Retain previously proven 200 baseline as a strict positive control.
    if(variant.mode==='primed'){
      assert.ok(startedBeforeRequestDone,
        'HTTP 200 primed baseline must begin playback before response finishes');
      assert.ok(result.events.waits>0&&result.events.recovered>0&&result.uiWaitSeen,
        'primed 200 control must exhibit real wait and recovery');
    }
    await page.evaluate(()=>document.querySelector('#audio').pause());
    await page.close();
  }
  console.log('FYMUSIC_PHASE23_RANGE_VS_200 '+JSON.stringify(comparison));
  console.log('FYMUSIC_PHASE23_RANGE_CONTRACT_PASS '+JSON.stringify({
    acceptedRange206:true,invalidRange416:true,
    controlHttp200IgnoresRange:true,realMp3AudioDecoder:true,
    realHttpGap:true,nativeEventsUnmodified:true,
    noMSE:true,fixableRecorderDisposed:true,
    observedRangeBehaviorNotAssumed:true,
    noUpstreamMusicRequests:true
  }));
}finally{await browser.close()}
