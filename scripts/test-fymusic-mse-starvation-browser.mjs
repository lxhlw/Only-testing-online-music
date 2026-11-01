import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 20: real HTTP bytes -> MediaSource -> native HTMLAudioElement.
// MSE is isolated test instrumentation; FyMusic production never uses MSE here.
// No fake waiting, playing, timeupdate, seek, paused, or readyState.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},
    hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,150)));
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh &&
    document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
    null,{timeout:18000});
  const supported=await page.evaluate(()=>Boolean(window.MediaSource&&
    MediaSource.isTypeSupported('audio/mpeg')));
  assert.ok(supported,'Chromium must support MSE audio/mpeg to verify MP3 buffer starvation');

  await page.evaluate(()=>{
    const audio=document.querySelector('#audio'),media=new MediaSource();
    const data={events:[],samples:[],chunks:0,bytes:0,status:null,
      networkGapMs:null,firstByteMs:null,finished:false,
      pipelineError:null,playingResult:null,startAt:performance.now(),
      calls:{play:0,load:0,pause:0}};
    const sample=()=>{
      const buffered=[];
      for(let i=0;i<audio.buffered.length;i++)
        buffered.push([+audio.buffered.start(i).toFixed(2),
          +audio.buffered.end(i).toFixed(2)]);
      const hint=document.querySelector('#player-network-hint');
      return {ms:Math.round(performance.now()-data.startAt),
        time:+audio.currentTime.toFixed(2),ready:audio.readyState,
        network:audio.networkState,paused:audio.paused,
        buffered,error:audio.error?.code||0,
        uiBuffering:document.documentElement.classList.contains('is-buffering'),
        hintVisible:!!hint&&!hint.hidden};
    };
    data.sample=sample;
    for(const type of ['loadstart','loadedmetadata','canplay','play','playing',
      'waiting','stalled','timeupdate','progress','error','ended','pause']){
      audio.addEventListener(type,()=>{
        data.events.push({type,...sample()});
        if(data.events.length>400)data.events.shift();
      },{passive:true});
    }
    const origPlay=audio.play.bind(audio),origPause=audio.pause.bind(audio),
      origLoad=audio.load.bind(audio);
    audio.play=(...args)=>{data.calls.play++;return origPlay(...args)};
    audio.pause=(...args)=>{data.calls.pause++;return origPause(...args)};
    audio.load=(...args)=>{data.calls.load++;return origLoad(...args)};
    let sourceBuffer=null,queue=[],done=false;
    const pump=()=>{
      if(!sourceBuffer||sourceBuffer.updating||media.readyState!=='open')return;
      try{
        if(queue.length)sourceBuffer.appendBuffer(queue.shift());
        else if(done){media.endOfStream();data.finished=true;}
      }catch(e){data.pipelineError='append: '+String(e?.message||e)}
    };
    media.addEventListener('sourceopen',async()=>{
      try{
        sourceBuffer=media.addSourceBuffer('audio/mpeg');
        sourceBuffer.mode='sequence';
        sourceBuffer.addEventListener('updateend',pump);
        sourceBuffer.addEventListener('error',()=>{data.pipelineError='sourcebuffer error'});
        // This fetch has a REAL 5.5s server-side network gap after 3.55s
        // of decodable MP3 frames. It is not Playwright route.fulfill().
        const started=performance.now();
        const r=await fetch('/api/fymusic-range-selftest?mode=gap&format=mp3',
          {headers:{Range:'bytes=0-85000'},cache:'no-store'});
        data.status=r.status;
        const reader=r.body.getReader();
        let firstAt=null,lastAt=null;
        while(true){
          const {done:ended,value}=await reader.read();
          if(ended)break;
          const now=performance.now();
          if(firstAt===null){firstAt=now;data.firstByteMs=Math.round(now-started)}
          if(lastAt!==null){
            const gap=now-lastAt;
            data.networkGapMs=Math.max(data.networkGapMs||0,Math.round(gap));
          }
          lastAt=now;
          data.chunks++;data.bytes+=value.byteLength;
          queue.push(value);
          pump();
        }
        done=true;
        pump();
      }catch(e){data.pipelineError='stream: '+String(e?.message||e)}
    },{once:true});
    const url=URL.createObjectURL(media);
    window.__phase20Mse={data,url};
    window.__phase20MseSampler=setInterval(()=>{
      data.samples.push(sample());
      if(data.samples.length>150)data.samples.shift();
    },200);
    audio.muted=true;
    audio.src=url;
    audio.play().then(()=>{data.playingResult=true},
      e=>{data.playingResult=false;data.playError=String(e?.message||e)});
  });

  await page.waitForFunction(()=>window.__phase20Mse.data.pipelineError||
    document.querySelector('#audio').currentTime>.5,null,{timeout:23000});
  await page.waitForTimeout(11800);
  const state=await page.evaluate(()=>{
    clearInterval(window.__phase20MseSampler);
    const d=window.__phase20Mse.data;
    return {events:d.events,samples:d.samples,chunks:d.chunks,bytes:d.bytes,
      status:d.status,firstByteMs:d.firstByteMs,networkGapMs:d.networkGapMs,
      pipelineError:d.pipelineError,finished:d.finished,
      playError:d.playError||null,playingResult:d.playingResult,
      final:d.sample(),calls:{...d.calls}};
  });
  const progress=state.events.filter(x=>x.type==='timeupdate'&&x.time>.5);
  const waiting=state.events.find(x=>x.type==='waiting'&&x.time>.5&&
    progress.some(p=>p.ms<x.ms));
  const resumed=waiting&&state.events.some(x=>x.type==='playing'&&
    x.ms>waiting.ms&&x.time>=waiting.time);
  const resumedProgress=waiting&&progress.some(x=>
    x.ms>waiting.ms&&x.time>waiting.time+.8);
  const hint=waiting&&state.samples.some(x=>x.ms>=waiting.ms&&
    x.ms<waiting.ms+1600&&x.uiBuffering&&x.hintVisible);
  const summary={
    mediaSourceMpegSupported:supported,realMp3NetworkBytes:state.bytes,
    streamChunks:state.chunks,networkGapMs:state.networkGapMs,
    actualPlaybackProgress:progress.length>0,
    nativeWaitingAfterProgress:!!waiting,
    nativePlayingAfterWait:!!resumed,
    progressResumedAfterWait:!!resumedProgress,
    fyMusicHintShownDuringWait:!!hint,
    mediaEnded:state.events.some(x=>x.type==='ended'),
    finalPosition:state.final.time,pipelineError:state.pipelineError,
    eventSequence:state.events.filter(x=>!['timeupdate','progress'].includes(x.type))
      .map(x=>`${x.type}@${x.time}s/${x.ready}`).slice(0,50),
    sampledBuffer:state.samples.filter((_,i)=>i%9===0).map(x=>({
      ms:x.ms,time:x.time,end:x.buffered.at(-1)?.[1]||0,
      ready:x.ready,hint:x.hintVisible})).slice(0,20)
  };
  console.log('FYMUSIC_PHASE20_MSE_OBSERVATIONS '+JSON.stringify(summary));
  assert.equal(state.pipelineError,null);
  assert.equal(state.status,206);
  assert.equal(state.bytes,85001);
  assert.ok((state.networkGapMs||0)>=3500,
    'MSE bytes must be supplied by genuine interrupted HTTP stream');
  assert.ok(progress.length>0,'MSE must cause real HTMLAudioElement playback');
  assert.ok(waiting,'Playback must naturally exhaust the first buffered MP3 frames');
  assert.ok(resumed&&resumedProgress,'Playback must recover after bytes resume');
  assert.ok(hint,'FyMusic UI must show buffering when native media waits');
  const before=state.calls;
  await page.evaluate(()=>{
    window.dispatchEvent(new Event('online'));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await page.waitForTimeout(180);
  assert.deepEqual(await page.evaluate(()=>window.__phase20Mse.data.calls),before,
    'Foreground/network signals must not generate app-level replay');
  await page.evaluate(()=>{
    const audio=document.querySelector('#audio');
    audio.pause();
    URL.revokeObjectURL(window.__phase20Mse.url);
  });
  assert.deepEqual(errors,[]);
  console.log('FYMUSIC_MSE_BUFFER_STARVATION_PASS '+JSON.stringify({
    nativeWait:true,nativeResume:true,nativeUiHint:true,
    genuineMp3NetworkGap:true,singleExistingHtmlAudioElement:true,
    qaOnlyMseNotProductionPlayer:true,noForcedMediaEvents:true,
    thirdPartySongNotVerified:true
  }));
}finally{await browser.close()}
