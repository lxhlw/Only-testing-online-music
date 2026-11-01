import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 21: direct #audio.src MP3 HTTP 200 with unknown total length.
// No MSE/Blob, no mocked transport, no native event dispatch or currentTime edits.
// The existing Phase 19 test remains the known-length Range control.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const PATH='/api/fymusic-range-selftest?mode=progressive&format=mp3';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},
   hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const pageErrors=[],mediaRequests=[];
 page.on('pageerror',e=>pageErrors.push(String(e?.message||e).slice(0,140)));
 page.on('request',request=>{
   if(request.url().includes('mode=progressive')){
     const info={url:new URL(request.url()).pathname,
       range:request.headers()['range']||null,
       started:Date.now(),status:null,length:null,finished:false,failed:false};
     mediaRequests.push(info);
     request.response().then(async r=>{
       if(r){info.status=r.status();info.length=r.headers()['content-length']||null;}
     }).catch(()=>{});
     request.finished?.().catch(()=>{});
     request.once?.('noop',()=>{});
   }
 });
 page.on('requestfinished',request=>{
   if(request.url().includes('mode=progressive')){
     const found=mediaRequests.find(x=>!x.finished&&!x.failed);
     if(found)found.finished=true;
   }
 });
 page.on('requestfailed',request=>{
   if(request.url().includes('mode=progressive')){
     const found=mediaRequests.find(x=>!x.finished&&!x.failed);
     if(found)found.failed=true;
   }
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
   document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
   null,{timeout:18000});

 // Independent browser fetch: validate genuine transport delivery and headers.
 // Request still supplies Range to verify that progressive mode intentionally
 // answers HTTP 200 without partial-content semantics.
 const transport=await page.evaluate(async path=>{
   const begin=performance.now();
   const response=await fetch(path+'&probe=1',
     {headers:{Range:'bytes=0-85000'},cache:'no-store'});
   const reader=response.body.getReader();
   let bytes=0,firstMs=null,maxGapMs=0,previous=0,chunks=0;
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     const elapsed=performance.now()-begin;
     if(firstMs===null)firstMs=elapsed;
     if(previous>0)maxGapMs=Math.max(maxGapMs,elapsed-previous);
     previous=elapsed;bytes+=value.byteLength;chunks++;
   }
   return {status:response.status,length:response.headers.get('content-length'),
     ranges:response.headers.get('accept-ranges'),bytes,chunks,
     firstMs:Math.round(firstMs),totalMs:Math.round(performance.now()-begin),
     maxGapMs:Math.round(maxGapMs)};
 },PATH);
 assert.equal(transport.status,200);
 assert.equal(transport.length,null,'unknown-length response must not send Content-Length');
 assert.equal(transport.ranges,'none');
 assert.equal(transport.bytes,209*1600);
 assert.ok(transport.totalMs>=4300,'real HTTP gap must be measurable');
 assert.ok(transport.maxGapMs>=3300,'first bytes must arrive before network stall ends');

 // Now repeat on ordinary audio.src using native browser decoding.
 await page.evaluate(path=>{
   const a=document.querySelector('#audio'),data={
     startedAt:performance.now(),events:[],samples:[],
     calls:{play:0,pause:0,load:0}
   };
   const snapshot=()=>{
     const buffered=[];
     for(let i=0;i<a.buffered.length;i++)
       buffered.push([Number(a.buffered.start(i).toFixed(2)),
         Number(a.buffered.end(i).toFixed(2))]);
     const hint=document.querySelector('#player-network-hint');
     return {ms:Math.round(performance.now()-data.startedAt),
       t:Number(a.currentTime.toFixed(2)),
       duration:Number.isFinite(a.duration)?Number(a.duration.toFixed(2)):null,
       ready:a.readyState,network:a.networkState,error:a.error?.code||0,
       paused:a.paused,buffered,
       hintVisible:!!hint&&!hint.hidden,
       isBuffering:document.documentElement.classList.contains('is-buffering')};
   };
   data.snap=snapshot;
   for(const type of ['loadstart','loadedmetadata','play','playing',
     'waiting','stalled','canplay','canplaythrough','suspend','timeupdate',
     'progress','pause','error','ended']){
     a.addEventListener(type,()=>{
       data.events.push({type,...snapshot()});
       if(data.events.length>450)data.events.shift();
     },{passive:true});
   }
   const play=a.play.bind(a),pause=a.pause.bind(a),load=a.load.bind(a);
   a.play=(...args)=>{data.calls.play++;return play(...args)};
   a.pause=(...args)=>{data.calls.pause++;return pause(...args)};
   a.load=(...args)=>{data.calls.load++;return load(...args)};
   window.__phase21=data;
   window.__phase21Timer=setInterval(()=>{
     data.samples.push(snapshot());
     if(data.samples.length>130)data.samples.shift();
   },200);
   a.preload='auto';
   a.muted=true;
   a.src=path+'&direct=1';
   window.__phase21Play=a.play().then(()=>true,()=>false);
 },PATH);
 await page.waitForTimeout(14500);
 const media=await page.evaluate(()=>{
   clearInterval(window.__phase21Timer);
   const d=window.__phase21;
   return {samples:d.samples,events:d.events,calls:{...d.calls},final:d.snap()};
 });
 const realProgress=media.events.some(e=>e.type==='timeupdate'&&e.t>.5);
 const started=media.events.some(e=>e.type==='playing');
 const delayedStart=media.events.find(e=>e.type==='playing')?.ms??null;
 const midWait=media.events.find(e=>e.type==='waiting'&&e.t>.5&&
   media.events.some(p=>p.type==='timeupdate'&&p.ms<e.ms&&p.t>.3));
 const resumed=!!midWait&&media.events.some(e=>e.type==='playing'&&e.ms>midWait.ms);
 const resumedProgress=!!midWait&&media.events.some(e=>e.type==='timeupdate'&&
   e.ms>midWait.ms&&e.t>midWait.t+.5);
 const duringWait=!!midWait&&media.samples.some(s=>s.ms>=midWait.ms&&
   s.ms<midWait.ms+1200&&s.isBuffering&&s.hintVisible);
 const playedBeforeGapEnd=delayedStart!==null&&delayedStart<transport.maxGapMs-600;
 const evidence={
   http200:transport.status,unknownLength:transport.length===null,
   actualNetworkGapMs:transport.maxGapMs,totalHttpMs:transport.totalMs,
   nativePlayed:started,nativeProgressed:realProgress,
   firstPlayingMs:delayedStart,startedBeforeExpectedGapEnd:playedBeforeGapEnd,
   nativeMidPlaybackWait:!!midWait,nativeResume:resumed,
   nativeProgressResumed:resumedProgress,fyMusicHintDuringWait:duringWait,
   finalCurrentTime:media.final.t,finalReady:media.final.ready,
   mediaError:media.final.error,
   eventSequence:media.events.filter(x=>!['timeupdate','progress'].includes(x.type))
     .map(x=>`${x.type}@${x.t}/${x.ready}/${x.ms}`).slice(0,55),
   sampled:media.samples.filter((_,i)=>i%8===0).map(x=>({
     ms:x.ms,t:x.t,buffered:x.buffered.at(-1)?.[1]||0,
     ready:x.ready,hint:x.hintVisible})).slice(0,19),
   mediaRequests
 };
 // Use this observation to identify whether direct src truly starts early,
 // rather than confusing transport fetch with audio decoder behavior.
 console.log('FYMUSIC_PHASE21_DIRECT_PROGRESSIVE_OBSERVATIONS '+JSON.stringify(evidence));
 assert.ok(started&&realProgress,'direct progressive MP3 must decode and advance');
 assert.equal(media.final.error,0,'direct progressive MP3 must not cause MediaError');
 assert.ok(mediaRequests.some(x=>x.status===200&&x.length===null),
   'actual audio.src must request the unknown-length HTTP 200 media');
 const before={...media.calls};
 await page.evaluate(()=>{
   window.dispatchEvent(new Event('online'));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await page.waitForTimeout(180);
 assert.deepEqual(await page.evaluate(()=>window.__phase21.calls),before,
   'foreground/online events must not create an unexpected media retry');
 await page.evaluate(()=>document.querySelector('#audio').pause());
 assert.deepEqual(pageErrors,[]);
 console.log('FYMUSIC_PHASE21_DIRECT_PROGRESSIVE_PASS '+JSON.stringify({
   genuineUnknownLengthMp3:true,networkGapObserved:true,directHtmlAudioElement:true,
   actualAudioPlayback:true,startedBeforeHttpComplete:playedBeforeGapEnd,
   midPlaybackWaitingObserved:!!midWait,nativeResumeObserved:resumed,
   bufferingHintDuringMidWait:duringWait,noAutomaticReplay:true,
   noMseOrMediaEventForgery:true,onlySyntheticAuthorizedMp3:true,
   thirdPartySongNotVerified:true
 }));
} finally {await browser.close()}
