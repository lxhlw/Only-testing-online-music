import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// The tested response is an original WAV synthesizer served as a real
// streaming Cloudflare Pages function, with RFC 7233 partial-content support.
// No Flower, commercial track, signed transport URL or external source is used.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},
   isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,160)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh &&
  document.querySelector('#audio')&&
  document.querySelector('#player-network-hint')),null,{timeout:18000});
 const endpoint='/api/fymusic-range-selftest';
 const ranges=await page.evaluate(async endpoint=>{
   const head=await fetch(endpoint+'?mode=normal',{method:'HEAD'});
   const first=await fetch(endpoint+'?mode=normal',{
     headers:{Range:'bytes=0-63'}});
   const firstBuf=new Uint8Array(await first.arrayBuffer());
   const suffix=await fetch(endpoint+'?mode=normal',{
     headers:{Range:'bytes=-16'}});
   const suffixBuf=new Uint8Array(await suffix.arrayBuffer());
   const invalid=await fetch(endpoint+'?mode=normal',{
     headers:{Range:'bytes=999999-'}});
   return {
     head:{status:head.status,len:head.headers.get('content-length'),
       ranges:head.headers.get('accept-ranges')},
     first:{status:first.status,range:first.headers.get('content-range'),
       contentType:first.headers.get('content-type'),length:firstBuf.length,
       riff:String.fromCharCode(...firstBuf.slice(0,4))},
     suffix:{status:suffix.status,range:suffix.headers.get('content-range'),
       length:suffixBuf.length},
     invalid:{status:invalid.status,range:invalid.headers.get('content-range')}
   };
 },endpoint);
 const expectedTotal=44+14*8000*2;
 assert.equal(ranges.head.status,200);
 assert.equal(Number(ranges.head.len),expectedTotal);
 assert.equal(ranges.head.ranges,'bytes');
 assert.deepEqual(ranges.first,{
  status:206,range:`bytes 0-63/${expectedTotal}`,
  contentType:'audio/wav',length:64,riff:'RIFF'
 });
 assert.deepEqual(ranges.suffix,{
  status:206,range:`bytes ${expectedTotal-16}-${expectedTotal-1}/${expectedTotal}`,
  length:16
 });
 assert.deepEqual(ranges.invalid,{
  status:416,range:`bytes */${expectedTotal}`
 });
 await page.evaluate(()=>{
   const audio=document.querySelector('#audio');
   const calls={play:0,pause:0,load:0,seek:0};
   const events=[];
   const types=['loadstart','loadedmetadata','durationchange','loadeddata',
    'waiting','stalled','progress','playing','play','pause','timeupdate',
    'seeking','seeked','canplay','canplaythrough','error','abort','emptied'];
   for(const type of types)audio.addEventListener(type,()=>{
     const src=audio.currentSrc||'';
     const name=src?new URL(src).searchParams.get('mode'):'';
     events.push({type,mode:name,t:Number(audio.currentTime)||0,
       readyState:audio.readyState,at:performance.now()});
     if(events.length>700)events.splice(0,events.length-500);
   },{passive:true});
   const play=audio.play.bind(audio),pause=audio.pause.bind(audio),
    load=audio.load.bind(audio);
   audio.play=(...args)=>{calls.play++;return play(...args)};
   audio.pause=(...args)=>{calls.pause++;return pause(...args)};
   audio.load=(...args)=>{calls.load++;return load(...args)};
   window.__fymusicRangeFixture={calls,events};
   audio.muted=true;
 });
 const frame=()=>page.evaluate(()=>new Promise(done=>
   requestAnimationFrame(()=>requestAnimationFrame(done))));
 const state=()=>page.evaluate(()=>{
   const a=document.querySelector('#audio');
   const el=document.querySelector('#player-network-hint');
   const data=window.__fymusicRangeFixture;
   return {time:a.currentTime,duration:a.duration,paused:a.paused,
     readyState:a.readyState,error:a.error?.code||0,
     buffering:document.documentElement.classList.contains('is-buffering'),
     offline:document.documentElement.classList.contains('is-offline'),
     hint:el?.textContent,hidden:el?.hidden,
     calls:{...data.calls},events:[...data.events]};
 });
 // Mode "gap" sends 3 seconds of genuine PCM audio, holds the remaining
 // HTTP body for 3.8 sec, then resumes the same Response stream. No DOM event
 // is fabricated and no Playwright route fulfills a fully buffered file.
 await page.evaluate(endpoint=>{
   const a=document.querySelector('#audio');
   a.src=endpoint+'?mode=gap';
   window.__fymusicGapPlay=a.play().then(()=>true,()=>false);
 },endpoint);
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.6,
   null,{timeout:13000});
 try{
   await page.waitForFunction(()=>window.__fymusicRangeFixture.events.some(
     e=>e.type==='waiting'&&e.mode==='gap'&&e.t>=1.25),
     null,{timeout:13000});
 }catch(error){
   const diagnosis=await state();
   console.log('FYMUSIC_RANGE_STALL_DIAGNOSTIC '+JSON.stringify({
     time:diagnosis.time,duration:diagnosis.duration,
     error:diagnosis.error,buffering:diagnosis.buffering,
     readyState:diagnosis.readyState,
     events:diagnosis.events.filter(e=>e.mode==='gap').map(
       e=>({type:e.type,t:Number(e.t.toFixed(2)),readyState:e.readyState}))
   }));
   throw error;
 }
 await page.waitForFunction(()=>document.documentElement.classList.contains('is-buffering'),
   null,{timeout:5500});
 const waiting=await state();
 assert.equal(waiting.offline,false);
 assert.match(waiting.hint,/音频缓冲中/);
 assert.ok(waiting.time>=1.25,'stream must stall after actual audio progress');
 const callsDuringGap={...waiting.calls};
 // A same-origin browser page restoration must not issue a second app
 // playback request. Browser-managed network byte-range fetches are separate.
 await page.evaluate(()=>{
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   window.dispatchEvent(new Event('online'));
 });
 await frame();
 const resumedUI=await state();
 assert.deepEqual(resumedUI.calls,callsDuringGap);
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>4.2,
   null,{timeout:14500});
 await frame();
 const postGap=await state();
 assert.equal(postGap.error,0);
 assert.equal(postGap.buffering,false);
 assert.equal(postGap.hidden,true);
 assert.ok(postGap.events.some(e=>e.type==='playing'&&e.mode==='gap'));
 assert.ok(postGap.events.some(e=>e.type==='waiting'&&e.mode==='gap'&&e.t>=1.25));
 assert.equal(await page.evaluate(()=>window.__fymusicGapPlay),true);
 await page.evaluate(()=>document.querySelector('#audio').pause());

 // Mode "cut" closes the actual HTTP Response stream with a network error
 // after 3 playable seconds. Depending on Chromium's internal media retry
 // policy, the HTML audio layer may emit an error or hold at waiting. Neither
 // permits the app UI to silently replay, reload or select another source.
 await page.evaluate(endpoint=>{
   const a=document.querySelector('#audio');
   a.src=endpoint+'?mode=cut';
   window.__fymusicCutPlay=a.play().then(()=>true,()=>false);
 },endpoint);
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.6,
   null,{timeout:13000});
 await page.waitForFunction(()=>window.__fymusicRangeFixture.events.some(
   e=>e.mode==='cut'&&(e.type==='error'||(e.type==='waiting'&&e.t>1.25))),
   null,{timeout:13000});
 await frame();
 const cut=await state();
 assert.ok(cut.time>.5);
 const cutCalls={...cut.calls};
 await page.evaluate(()=>{
   window.dispatchEvent(new Event('online'));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await frame();
 const cutAfterRestore=await state();
 assert.deepEqual(cutAfterRestore.calls,cutCalls);
 const cutError=Boolean(cutAfterRestore.error);
 assert.ok(cutError||cutAfterRestore.buffering||cutAfterRestore.paused,
  'interrupted stream must not be displayed as successfully recovered');
 // The network interruption is not authorization to switch music platforms.
 // An explicitly selected healthy fixture should still decode and play.
 await page.evaluate(async endpoint=>{
   const a=document.querySelector('#audio');
   a.pause();
   a.src=endpoint+'?mode=normal';
   await a.play();
 },endpoint);
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.45,
   null,{timeout:12000});
 await frame();
 const recovered=await state();
 assert.equal(recovered.error,0);
 assert.equal(recovered.buffering,false);
 assert.equal(recovered.offline,false);
 assert.ok(recovered.duration>13&&recovered.duration<15);
 assert.ok(recovered.events.some(e=>e.type==='playing'&&e.mode==='normal'));
 await page.evaluate(()=>document.querySelector('#audio').pause());
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_RANGE_STREAM_RECOVERY_PASS '+JSON.stringify({
   rangeHeadAndSuffix:true,
   partial206Riff:true,invalidRange416:true,
   nativeDecoderAndMidstreamWaiting:true,
   bufferedSecondsBeforeGap:Number(waiting.time.toFixed(2)),
   sameSourceStreamResumed:true,
   gapRecoveredSeconds:Number(postGap.time.toFixed(2)),
   noAutoPlayLoadOnRestore:true,
   interruptedHttpStreamObserved:true,
   interruptedMediaError:cutError,
   cutState:cutError?'error':cutAfterRestore.buffering?'buffering':'paused',
   explicitHealthySourceRecovers:true,
   signedUrlsExposed:false,externalMusicRequests:false,
   syntheticOnly:true
 }));
}finally{await browser.close()}
