import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 19: real RFC 7233 responses, actual ReadableStream byte delivery and
// a genuine Chromium HTMLAudioElement. No copyrighted music, signed URLs,
// upstream Flower requests or synthetic media event dispatch.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},
   hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,160)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh &&
   document.querySelector('#audio')&&
   document.querySelector('#player-network-hint')),null,{timeout:18000});
 const endpoint='/api/fymusic-range-selftest';

 // Verify both range grammar and the actual binary slices, independent of
 // Chrome's decoder deciding how aggressively to prebuffer a particular codec.
 const ranges=await page.evaluate(async endpoint=>{
   const head=await fetch(endpoint+'?mode=normal',{method:'HEAD'});
   const first=await fetch(endpoint+'?mode=normal',
     {headers:{Range:'bytes=0-63'}});
   const firstBuf=new Uint8Array(await first.arrayBuffer());
   const suffix=await fetch(endpoint+'?mode=normal',
     {headers:{Range:'bytes=-16'}});
   const suffixBuf=new Uint8Array(await suffix.arrayBuffer());
   const invalid=await fetch(endpoint+'?mode=normal',
     {headers:{Range:'bytes=999999-'}});
   return {
     head:{status:head.status,len:head.headers.get('content-length'),
       ranges:head.headers.get('accept-ranges')},
     first:{status:first.status,range:first.headers.get('content-range'),
       type:first.headers.get('content-type'),length:firstBuf.length,
       riff:String.fromCharCode(...firstBuf.slice(0,4))},
     suffix:{status:suffix.status,range:suffix.headers.get('content-range'),
       length:suffixBuf.length},
     invalid:{status:invalid.status,range:invalid.headers.get('content-range')}
   };
 },endpoint);
 const total=44+14*8000*2;
 assert.deepEqual(ranges,{
   head:{status:200,len:String(total),ranges:'bytes'},
   first:{status:206,range:`bytes 0-63/${total}`,type:'audio/wav',
     length:64,riff:'RIFF'},
   suffix:{status:206,range:`bytes ${total-16}-${total-1}/${total}`,
     length:16},
   invalid:{status:416,range:`bytes */${total}`}
 });

 // A genuine HTTP byte-stream probe: three seconds of MP3 frames, then a
 // deliberate 5.5 second server-side stall, followed by more bytes. Track
 // first/last received byte times without assuming the Cloudflare/Chromium
 // pipeline necessarily flushes the first chunk before the last one.
 const gapTransport=await page.evaluate(async endpoint=>{
   const start=performance.now();
   const r=await fetch(endpoint+'?mode=gap&format=mp3',
     {headers:{Range:'bytes=0-85000'},cache:'no-store'});
   const reader=r.body.getReader();
   let bytes=0,firstAt=null,chunks=0;
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     if(firstAt===null)firstAt=performance.now()-start;
     bytes+=value.byteLength;chunks++;
   }
   return {status:r.status,range:r.headers.get('content-range'),
     bytes,chunks,firstByteMs:Math.round(firstAt),
     totalMs:Math.round(performance.now()-start)};
 },endpoint);
 assert.equal(gapTransport.status,206);
 assert.equal(gapTransport.bytes,85001);
 assert.ok(gapTransport.totalMs>=4200,
   'streaming fixture must enforce a real network delay across its byte stream');
 const deliveredIncrementally=gapTransport.totalMs-gapTransport.firstByteMs>=3000;

 // The cut mode terminates the actual server response before the declared
 // end. Some HTTP intermediaries buffer or reject an errored stream; both
 // failed fetch and truncated body are acceptable evidence of interruption.
 const cutTransport=await page.evaluate(async endpoint=>{
   let status=0,received=0,failed=false,reason='';
   try{
     const r=await fetch(endpoint+'?mode=cut&format=mp3',
       {headers:{Range:'bytes=0-85000'},cache:'no-store'});
     status=r.status;
     const reader=r.body.getReader();
     while(true){
       const {done,value}=await reader.read();
       if(done)break;
       received+=value.byteLength;
     }
   }catch(e){failed=true;reason=e?.name||'network-error'}
   return {status,received,failed,reason};
 },endpoint);
 assert.ok(cutTransport.failed||cutTransport.received<85001,
   'cut fixture must not deliver a complete response despite declared length');

 // Real media-element test; no overridden readyState/paused/currentTime, and
 // no manually dispatched media events. Its prebuffering decisions are recorded,
 // never misreported as proof that mid-playback waiting occurred.
 await page.evaluate(()=>{
   const audio=document.querySelector('#audio');
   const calls={play:0,load:0,pause:0,seek:0},events=[];
   const names=['loadstart','loadedmetadata','canplay','canplaythrough',
     'waiting','stalled','playing','play','pause','timeupdate','error',
     'seeking','seeked','abort','emptied'];
   for(const name of names)audio.addEventListener(name,()=>{
     const src=audio.currentSrc||'';
     events.push({type:name,mode:src?new URL(src).searchParams.get('mode'):'',
       time:Number(audio.currentTime)||0,ready:audio.readyState});
     if(events.length>700)events.splice(0,events.length-500);
   },{passive:true});
   const play=audio.play.bind(audio),pause=audio.pause.bind(audio),
     load=audio.load.bind(audio);
   audio.play=(...args)=>{calls.play++;return play(...args)};
   audio.pause=(...args)=>{calls.pause++;return pause(...args)};
   audio.load=(...args)=>{calls.load++;return load(...args)};
   window.__fymusicRangeMedia={calls,events};
   audio.muted=true;
 });
 const state=()=>page.evaluate(()=>{
   const a=document.querySelector('#audio'),
     hint=document.querySelector('#player-network-hint'),
     data=window.__fymusicRangeMedia;
   return {time:a.currentTime,duration:a.duration,error:a.error?.code||0,
     paused:a.paused,buffering:document.documentElement.classList.contains('is-buffering'),
     hint:hint.textContent,hidden:hint.hidden,
     calls:{...data.calls},events:[...data.events]};
 });
 const frame=()=>page.evaluate(()=>new Promise(done=>
   requestAnimationFrame(()=>requestAnimationFrame(done))));

 await page.evaluate(endpoint=>{
   const a=document.querySelector('#audio');
   a.src=endpoint+'?mode=gap&format=mp3';
   window.__gapPlayback=a.play().then(()=>true,()=>false);
 },endpoint);
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.4,
   null,{timeout:18000});
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>4.1,
   null,{timeout:13000});
 await frame();
 const gapMedia=await state();
 assert.equal(gapMedia.error,0);
 assert.ok(gapMedia.events.some(e=>e.type==='playing'&&e.mode==='gap'));
 assert.ok(gapMedia.events.some(e=>e.type==='loadedmetadata'&&e.mode==='gap'));
 assert.equal(await page.evaluate(()=>window.__gapPlayback),true);
 const midPlaybackWait=gapMedia.events.some(e=>e.type==='waiting'&&
   e.mode==='gap'&&e.time>=1.25);
 // The Chromium media pipeline may have downloaded the entire 42s file
 // before beginning to decode it; do not invent a midstream stall result.
 if(midPlaybackWait){
   assert.ok(gapMedia.events.some(e=>e.type==='playing'&&e.mode==='gap'));
 }
 const beforeRestore={...gapMedia.calls};
 await page.evaluate(()=>{
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   window.dispatchEvent(new Event('online'));
 });
 await frame();
 assert.deepEqual((await state()).calls,beforeRestore);
 await page.evaluate(()=>document.querySelector('#audio').pause());

 // In a second real media request, cut the byte stream after several seconds
 // of MP3 frames. The browser may raise a media error before starting or wait
 // for more bytes, depending on whether its loader prebuffers the response.
 await page.evaluate(endpoint=>{
   const a=document.querySelector('#audio');
   a.src=endpoint+'?mode=cut&format=mp3';
   window.__cutPlayback=a.play().then(()=>true,()=>false);
 },endpoint);
 await page.waitForFunction(()=>Boolean(document.querySelector('#audio').error)||
   document.querySelector('#audio').currentTime>.3,
   null,{timeout:16000});
 await page.waitForTimeout(400);
 await frame();
 const cutMedia=await state();
 const cutHadNativeError=cutMedia.error>0;
 const cutHadNativeProgress=cutMedia.events.some(e=>
   e.mode==='cut'&&e.type==='timeupdate'&&e.time>.3);
 const cutCalls={...cutMedia.calls};
 await page.evaluate(()=>{
   window.dispatchEvent(new Event('online'));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await frame();
 assert.deepEqual((await state()).calls,cutCalls,
   'network cut and visibility restore must not trigger app retries');
 // An explicit next selection is the only app-level recovery step.
 await page.evaluate(async endpoint=>{
   const audio=document.querySelector('#audio');
   audio.pause();
   audio.src=endpoint+'?mode=normal';
   await audio.play();
 },endpoint);
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.35,
   null,{timeout:14000});
 await frame();
 const healthy=await state();
 assert.equal(healthy.error,0);
 assert.equal(healthy.buffering,false);
 assert.equal(healthy.hidden,true);
 assert.ok(healthy.duration>13&&healthy.duration<15);
 assert.ok(healthy.events.some(e=>e.type==='playing'&&e.mode==='normal'));
 await page.evaluate(()=>document.querySelector('#audio').pause());
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_RANGE_STREAM_RECOVERY_PASS '+JSON.stringify({
   range206And416:true,rangeWavByteChecks:true,
   delayedHttpStreamObserved:true,
   delayedMs:gapTransport.totalMs,
   firstByteMs:gapTransport.firstByteMs,
   incrementalDeliveryObserved:deliveredIncrementally,
   earlyMp3FramesInterrupted:true,cutFetchFailed:cutTransport.failed,
   cutBytesReceived:cutTransport.received,
   chromiumRealMp3Decoder:true,
   nativeMidPlaybackWaitObserved:midPlaybackWait,
   nativeCutMediaErrorObserved:cutHadNativeError,
   nativeCutMediaProgressObserved:cutHadNativeProgress,
   foregroundNoAutoReplay:true,
   explicitNormalWavRecovered:true,
   syntheticFixtureOnly:true,
   noUpstreamMusicRequests:true
 }));
}finally{await browser.close()}
