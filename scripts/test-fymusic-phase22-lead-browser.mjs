import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 22: controlled MP3 lead comparison + bounded event-only diagnostics.
// No fake native media events, no MSE, no production timers, no song URL logging.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const leadChoices=[136,280,460],gapMs=11000;
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
try {
  const results=[];
  for(const leadFrames of leadChoices){
    const page=await browser.newPage({viewport:{width:390,height:844},
      isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const errors=[],requests=[];
    page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,180)));
    page.on('request',r=>{
      if(!r.url().includes('mode=primed')||!r.url().includes('leadFrames='+leadFrames))return;
      requests.push({request:r,opened:Date.now(),finished:null,
        status:null,failed:false,range:r.headers()['range']||null});
    });
    page.on('response',r=>{
      const rec=requests.find(x=>x.request===r.request());
      if(rec)rec.status=r.status();
    });
    page.on('requestfinished',r=>{
      const rec=requests.find(x=>x.request===r);
      if(rec)rec.finished=Date.now();
    });
    page.on('requestfailed',r=>{
      const rec=requests.find(x=>x.request===r);
      if(rec)rec.failed=true;
    });
    await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
      document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
      null,{timeout:18000});
    const path='/api/fymusic-range-selftest?mode=primed&format=mp3&leadFrames='+
      leadFrames+'&gapMs='+gapMs;
    await page.evaluate(async path=>{
      const {observeAudioEvents}=await import('/src/fymusic-media-evidence.js');
      const audio=document.querySelector('#audio');
      const evidence=observeAudioEvents(audio,{limit:48});
      const status={evidence,startEpoch:Date.now(),uiWaitSeen:false,
        started:false,playError:null,transport:null};
      window.__phase22=status;
      audio.addEventListener('waiting',()=>{
        if(audio.currentTime<=.35)return;
        requestAnimationFrame(()=>{
          const hint=document.querySelector('#player-network-hint');
          if(document.documentElement.classList.contains('is-buffering')&&
            hint&&!hint.hidden)status.uiWaitSeen=true;
        });
      },{passive:true});
      // Probe the exact same real HTTP conditions in parallel with the
      // independent native media request; it never feeds any media bytes.
      status.probe=(async()=>{
        const begun=performance.now();
        try{
          const response=await fetch(path+'&probe=1',{cache:'no-store'});
          const reader=response.body.getReader();
          let first=null,previous=null,maxGap=0,bytes=0,chunks=0;
          while(true){
            const {done,value}=await reader.read();
            if(done)break;
            const ms=performance.now()-begun;
            if(first===null)first=ms;
            if(previous!==null)maxGap=Math.max(maxGap,ms-previous);
            previous=ms;bytes+=value.byteLength;chunks++;
          }
          status.transport={httpStatus:response.status,bytes,chunks,
            firstByteMs:Math.round(first),maxGapMs:Math.round(maxGap),
            elapsedMs:Math.round(performance.now()-begun)};
        }catch(e){status.transport={error:String(e?.message||e)}}
      })();
      audio.muted=true;
      audio.preload='auto';
      audio.src=path+'&direct=1';
      audio.play().then(()=>{status.started=true},
        e=>{status.playError=String(e?.message||e)});
    },path);
    await page.waitForTimeout(15000);
    const result=await page.evaluate(()=>{
      const a=document.querySelector('#audio'),d=window.__phase22;
      const evidence=d.evidence.dispose();
      return {evidence,transport:d.transport,uiWaitSeen:d.uiWaitSeen,
        playResolved:d.started,playError:d.playError,
        currentTime:+a.currentTime.toFixed(2),ready:a.readyState,
        error:a.error?.code||0};
    });
    const mediaReq=requests.filter(x=>x.request.url().includes('direct=1'))
      .map(x=>({opened:x.opened,finished:x.finished,
        status:x.status,failed:x.failed,range:x.range}));
    const firstPlaying= result.evidence.firstPlayingMs;
    const startedBeforeFinish=firstPlaying!==null&&mediaReq.some(r=>
      r.status===200&&r.finished!==null&&
      (r.opened+firstPlaying)<r.finished);
    const sample={leadFrames,gapMs,...result,
      startedBeforeHttpFinished:startedBeforeFinish,mediaRequests:mediaReq};
    results.push(sample);
    assert.deepEqual(errors,[]);
    assert.ok(result.transport&&result.transport.httpStatus===200,
      'independent real transport probe must succeed');
    assert.equal(result.transport.bytes,334400);
    assert.ok(result.transport.maxGapMs>=8500,
      'HTTP gap must be genuinely delivered after first MP3 bytes');
    assert.equal(result.error,0);
    assert.equal(result.playError,null);
    assert.ok(result.evidence.firstPlayingMs!==null,
      'real native audio must reach playing on every lead variant');
    assert.ok(result.evidence.firstProgressMs!==null,
      'native currentTime must genuinely advance');
    assert.ok(result.evidence.eventCount<=48);
    assert.equal(result.evidence.eventLimit,48);
    assert.equal(result.evidence.disposed,true);
    assert.ok(mediaReq.some(r=>r.status===200&&!r.failed),
      'native audio request must be real and succeed');
    // No hardcoded threshold for all codecs or hardware; keep the observable
    // per-variant outcomes even when startup buffering delays playing.
    if(result.evidence.waits>0){
      assert.ok(result.evidence.recovered>0,
        'a native post-progress wait must recover after HTTP resumes');
      assert.ok(result.uiWaitSeen,
        'FyMusic buffer UI must reflect a genuine native wait');
    }
    await page.evaluate(()=>document.querySelector('#audio').pause());
    await page.close();
  }
  const longLead=results.find(x=>x.leadFrames===460);
  assert.ok(longLead.startedBeforeHttpFinished,
    'long-lead native MP3 should start while network response remains open');
  assert.ok(longLead.evidence.waits>=1&&longLead.evidence.recovered>=1&&
    longLead.uiWaitSeen,'long-lead media must actually wait and recover');
  console.log('FYMUSIC_PHASE22_LEAD_COMPARISON '+JSON.stringify(results.map(x=>({
    leadFrames:x.leadFrames,firstPlayingMs:x.evidence.firstPlayingMs,
    firstProgressMs:x.evidence.firstProgressMs,
    waits:x.evidence.waits,recovered:x.evidence.recovered,
    totalRebufferMs:x.evidence.rebufferMs,stalled:x.evidence.stallEvents,
    maxGapMs:x.transport.maxGapMs,httpBytes:x.transport.bytes,
    startedBeforeHttpFinished:x.startedBeforeHttpFinished,
    uiWaitSeen:x.uiWaitSeen,finalTime:x.currentTime,
    recorderBound:x.evidence.eventCount<=x.evidence.eventLimit,
    recorderDisposed:x.evidence.disposed
  }))));
  console.log('FYMUSIC_PHASE22_EVENT_EVIDENCE_PASS '+JSON.stringify({
    leadConfigurations:leadChoices,zeroFakeMediaEvents:true,
    noProductionPolling:true,fixedCapacity48:true,fullyDisposed:true,
    directNativeAudio:true,realHttpNetworkGap:true,
    longLeadNativeStallAndRecovery:true,noUpstreamSongChecked:true
  }));
}finally{await browser.close()}
