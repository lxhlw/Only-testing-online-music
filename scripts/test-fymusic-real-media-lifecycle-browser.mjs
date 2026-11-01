import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Real HTMLAudioElement and Chromium decoder. All media bytes are a synthetic
// WAV tone generated here; no signed URLs, Flower APIs or copyrighted songs.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
function makeWav(seconds=8,rate=8000){
  const samples=seconds*rate,buf=Buffer.alloc(44+samples*2);
  buf.write('RIFF',0);buf.writeUInt32LE(buf.length-8,4);
  buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);
  buf.writeUInt16LE(1,22);buf.writeUInt16LE(rate,24);
  buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);
  buf.writeUInt16LE(16,34);buf.write('data',36);
  buf.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)
    buf.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/rate)*1500),44+i*2);
  return buf;
}
const browser=await chromium.launch({
 headless:true,args:['--autoplay-policy=no-user-gesture-required']
});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},
   hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const wav=makeWav(),responses=[],errors=[];
 let slowRequests=0,normalRequests=0,invalidRequests=0;
 page.on('pageerror',error=>errors.push(String(error?.message||error).slice(0,140)));
 page.on('response',response=>{
   const name=new URL(response.url()).pathname;
   if(name.startsWith('/fymusic-phase18-'))
     responses.push({path:name,status:response.status()});
 });
 await page.route('**/fymusic-phase18-slow.wav',async route=>{
   slowRequests++;
   // Withhold the actual bytes long enough for native waiting/buffering.
   await new Promise(done=>setTimeout(done,1100));
   await route.fulfill({status:200,contentType:'audio/wav',body:wav});
 });
 await page.route('**/fymusic-phase18-good.wav',async route=>{
   normalRequests++;
   await route.fulfill({status:200,contentType:'audio/wav',body:wav});
 });
 await page.route('**/fymusic-phase18-invalid.mp3',async route=>{
   invalidRequests++;
   await route.fulfill({status:200,contentType:'text/html',
     body:'<!doctype html><title>Not a valid media stream</title>'});
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh &&
  document.querySelector('#audio')&&
  document.querySelector('#player-network-hint')),null,{timeout:18000});
 await page.evaluate(()=>{
   const audio=document.querySelector('#audio');
   const calls={play:0,load:0,pause:0};
   const events=[];
   const names=['loadstart','loadedmetadata','durationchange','loadeddata',
     'canplay','canplaythrough','waiting','stalled','playing','play','pause',
     'timeupdate','seeking','seeked','error','emptied','abort'];
   for(const name of names)audio.addEventListener(name,()=>{
     events.push({type:name,source:audio.currentSrc&&
       new URL(audio.currentSrc).pathname||'',time:Number(audio.currentTime)||0});
     if(events.length>500)events.splice(0,events.length-300);
   },{passive:true});
   const realPlay=audio.play.bind(audio);
   const realPause=audio.pause.bind(audio);
   const realLoad=audio.load.bind(audio);
   audio.play=(...args)=>{calls.play++;return realPlay(...args)};
   audio.pause=(...args)=>{calls.pause++;return realPause(...args)};
   audio.load=(...args)=>{calls.load++;return realLoad(...args)};
   window.__fymusicRealLifecycle={calls,events};
 });
 const snap=()=>page.evaluate(()=>{
   const a=document.querySelector('#audio');
   const root=document.documentElement;
   const hint=document.querySelector('#player-network-hint');
   const data=window.__fymusicRealLifecycle;
   return {
     paused:a.paused,readyState:a.readyState,error:a.error?.code||0,
     currentTime:a.currentTime,duration:a.duration,
     hint:hint.textContent,hidden:hint.hidden,
     buffering:root.classList.contains('is-buffering'),
     offline:root.classList.contains('is-offline'),
     calls:{...data.calls},events:[...data.events]
   };
 });
 const frame=()=>page.evaluate(()=>new Promise(done=>
   requestAnimationFrame(()=>requestAnimationFrame(done))));
 // Start genuine loading and decoding on the existing app's single element.
 await page.evaluate(()=>{
   const a=document.querySelector('#audio');
   a.muted=true;
   a.src='/fymusic-phase18-slow.wav';
   window.__fymusicRealLifecycle.firstPlay=a.play().then(
     ()=>({ok:true}),error=>({ok:false,name:error.name}));
 });
 await page.waitForFunction(()=>
   document.documentElement.classList.contains('is-buffering') &&
   !document.querySelector('#player-network-hint').hidden,
   null,{timeout:5000});
 const pending=await snap();
 assert.equal(pending.buffering,true);
 assert.match(pending.hint,/音频缓冲中/);
 assert.ok(pending.events.some(e=>e.type==='waiting'),
  'native audio must emit a genuine waiting event on delayed response');
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.3,
   null,{timeout:12000});
 await frame();
 const playing=await snap();
 assert.equal(playing.buffering,false);
 assert.equal(playing.hidden,true);
 assert.ok(playing.duration>7&&playing.duration<9);
 const firstResult=await page.evaluate(()=>window.__fymusicRealLifecycle.firstPlay);
 assert.equal(firstResult.ok,true);
 assert.ok(playing.events.some(e=>e.type==='loadedmetadata'));
 assert.ok(playing.events.some(e=>e.type==='canplay'));
 assert.ok(playing.events.some(e=>e.type==='playing'));
 assert.ok(playing.events.some(e=>e.type==='timeupdate'));
 const index=type=>playing.events.findIndex(e=>e.type===type);
 assert.ok(index('loadstart')>=0&&index('loadstart')<index('loadedmetadata'));
 assert.ok(index('loadedmetadata')<index('playing'));
 // User pauses. Page restore and online signals must not call play or load.
 await page.evaluate(()=>document.querySelector('#audio').pause());
 await page.waitForFunction(()=>document.querySelector('#audio').paused);
 const paused=await snap();
 await page.evaluate(()=>{
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   window.dispatchEvent(new Event('online'));
 });
 await frame();
 const restoredPaused=await snap();
 assert.equal(restoredPaused.paused,true);
 assert.equal(restoredPaused.calls.play,paused.calls.play);
 assert.equal(restoredPaused.calls.load,paused.calls.load);
 assert.equal(restoredPaused.calls.pause,paused.calls.pause);
 assert.ok(Math.abs(restoredPaused.currentTime-paused.currentTime)<.08);
 assert.equal(restoredPaused.hidden,true);
 // An explicit subsequent play resumes this SAME real decoded stream.
 await page.evaluate(()=>document.querySelector('#audio').play());
 await page.waitForFunction(t=>document.querySelector('#audio').currentTime>t+.2,
   paused.currentTime,{timeout:7000});
 await page.evaluate(()=>{document.querySelector('#audio').currentTime=2.5});
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>=2.45,
   null,{timeout:6500});
 await page.waitForFunction(()=>window.__fymusicRealLifecycle.events.some(
   e=>e.type==='seeked'),null,{timeout:6500});
 const sought=await snap();
 assert.ok(sought.events.some(e=>e.type==='seeking'));
 assert.ok(sought.events.some(e=>e.type==='seeked'));
 // Invalid real HTTP response must produce an actual HTMLMediaElement error,
 // not a fake event or a false indication of successful decoder playback.
 await page.evaluate(async()=>{
   const a=document.querySelector('#audio');
   a.pause();
   a.src='/fymusic-phase18-invalid.mp3';
   a.load();
   await a.play().catch(()=>{});
 });
 await page.waitForFunction(()=>Boolean(document.querySelector('#audio').error),
   null,{timeout:9000});
 await frame();
 const invalid=await snap();
 assert.ok(invalid.error>0);
 assert.ok(invalid.events.some(e=>e.type==='error'));
 assert.equal(invalid.buffering,false);
 assert.equal(invalid.hidden,true);
 const beforeRecovery={...invalid.calls};
 await page.evaluate(()=>{
   window.dispatchEvent(new Event('online'));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await frame();
 const afterRecovery=await snap();
 assert.deepEqual(afterRecovery.calls,beforeRecovery,
   'error recovery UI must not auto-play/reload/retry');
 assert.ok(afterRecovery.error>0,'background resume must not silently clear media error');
 // Only a NEW, explicit test action selects a healthy audio fixture.
 await page.evaluate(async()=>{
   const a=document.querySelector('#audio');
   a.src='/fymusic-phase18-good.wav';
   await a.play();
 });
 await page.waitForFunction(()=>document.querySelector('#audio').currentTime>.25,
   null,{timeout:9000});
 await frame();
 const healthy=await snap();
 assert.equal(healthy.error,0);
 assert.equal(healthy.buffering,false);
 assert.equal(healthy.hidden,true);
 assert.ok(healthy.events.some(e=>e.type==='playing' &&
   e.source==='/fymusic-phase18-good.wav'));
 await page.evaluate(()=>document.querySelector('#audio').pause());
 assert.equal(slowRequests,1);
 assert.ok(normalRequests>=1);
 assert.ok(invalidRequests>=1);
 assert.ok(responses.some(r=>r.path==='/fymusic-phase18-slow.wav'&&r.status===200));
 assert.ok(responses.some(r=>r.path==='/fymusic-phase18-invalid.mp3'&&r.status===200));
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_REAL_MEDIA_LIFECYCLE_PASS '+JSON.stringify({
   realChromiumDecoder:true,
   controlledWavSeconds:8,
   delayedLoadingWaiting:true,
   nativeMetadataAndPlayback:true,
   nativePauseResume:true,
   realSeekEvents:true,
   realMediaErrorOnInvalidContent:true,
   noUnrequestedErrorRecovery:true,
   explicitValidFixtureRecovery:true,
   delayedFixtureRequests:slowRequests,
   invalidFixtureRequests:invalidRequests,
   validFixtureRequests:normalRequests,
   noExternalMusicRequests:true,
   syntheticFixtureOnly:true
 }));
}finally{await browser.close()}
