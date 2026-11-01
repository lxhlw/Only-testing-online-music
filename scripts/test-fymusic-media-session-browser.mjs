import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Synthetic OS Media Session actions in real Chromium. The test never claims
// that a real lock screen or an external Flower music URL was exercised.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,
  isMobile:true,reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',error=>errors.push(String(error.message||error).slice(0,120)));
 await page.addInitScript(()=>{
   const fake={
     handlers:{},positionCalls:[],stateWrites:[],metadata:null,
     setActionHandler(name,fn){this.handlers[name]=fn},
     setPositionState(value){this.positionCalls.push(value)},
     get playbackState(){return this.stateWrites.at(-1)||'none'},
     set playbackState(value){this.stateWrites.push(value)}
   };
   Object.defineProperty(navigator,'mediaSession',{configurable:true,value:fake});
   window.__fymusicOS=fake;
   window.MediaMetadata=class{
     constructor(data){Object.assign(this,data)}
   };
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Object.keys(window.__fymusicOS.handlers).length>=7&&
   Boolean(window.LXPlayerControls?.refresh&&
     document.querySelector('#player-seek')),null,{timeout:20000});
 const result=await page.evaluate(async()=>{
   const os=window.__fymusicOS;
   const audio=document.querySelector('#audio');
   const baseSeek=document.querySelector('#player-seek');
   const button=document.querySelector('#player-toggle-btn');
   const prev=document.querySelector('#prev-track-btn');
   const next=document.querySelector('#next-track-btn');
   const counts={toggle:0,prev:0,next:0,preview:0,commit:0,
     directPlay:0,directPause:0,positionWrites:0};
   let source='',time=25,paused=true,duration=200;
   Object.defineProperty(audio,'currentSrc',{configurable:true,get:()=>source});
   Object.defineProperty(audio,'duration',{configurable:true,get:()=>duration});
   Object.defineProperty(audio,'currentTime',{configurable:true,
     get:()=>time,set(value){counts.positionWrites++;time=Number(value)}});
   Object.defineProperty(audio,'paused',{configurable:true,get:()=>paused});
   Object.defineProperty(audio,'ended',{configurable:true,get:()=>false});
   Object.defineProperty(audio,'readyState',{configurable:true,get:()=>4});
   audio.play=()=>{counts.directPlay++;return Promise.resolve()};
   audio.pause=()=>{counts.directPause++};
   button.onclick=()=>counts.toggle++;
   prev.onclick=()=>counts.prev++;
   next.onclick=()=>counts.next++;
   baseSeek.oninput=()=>counts.preview++;
   baseSeek.onchange=()=>counts.commit++;
   const tick=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   // No source, no valid user-approved resolved stream.
   os.handlers.play();
   os.handlers.pause();
   os.handlers.seekto({seekTime:55});
   os.handlers.nexttrack();
   os.handlers.previoustrack();
   await tick();
   const noSource={...counts,state:os.playbackState};
   // A valid browser media element alone is not enough: seeking still
   // requires the application's base seek control to be enabled.
   source='https://example.invalid/synthetic-os-media';
   baseSeek.disabled=true;
   os.handlers.seekto({seekTime:60});
   const disabled={...counts};
   baseSeek.disabled=false;
   os.handlers.play();
   // An OS play command while already playing must not toggle to pause.
   paused=false;
   os.handlers.play();
   os.handlers.pause();
   os.handlers.pause();
   os.handlers.seekto({seekTime:80});
   const requested=baseSeek.value;
   os.handlers.seekbackward({seekOffset:15});
   const backward=baseSeek.value;
   os.handlers.seekforward({seekOffset:20});
   const forward=baseSeek.value;
   os.handlers.seekto({seekTime:100000});
   const clamped=baseSeek.value;
   os.handlers.seekto({seekTime:Number.NaN});
   os.handlers.seekto({});
   // Queue action is not permitted without a selected track identity.
   os.handlers.nexttrack();os.handlers.previoustrack();
   const noTrack={...counts};
   window.__LXNowPlayingTrack={id:'synthetic-os-track',source:'kw',name:'Synthetic OS control QA',
     singer:'Fixture artist',albumName:'Fixture album'};
   os.handlers.nexttrack();os.handlers.previoustrack();
   audio.dispatchEvent(new Event('timeupdate'));
   audio.dispatchEvent(new Event('playing'));
   await tick();
   const playing=os.playbackState;
   const posCalls=os.positionCalls.length;
   for(let i=0;i<12;i++)audio.dispatchEvent(new Event('timeupdate'));
   await tick();
   const unchangedPositionCalls=os.positionCalls.length;
   time=28;
   audio.dispatchEvent(new Event('timeupdate'));
   await tick();
   const updatedPositionCalls=os.positionCalls.length;
   paused=true;
   audio.dispatchEvent(new Event('pause'));
   await tick();
   const pausedState=os.playbackState;
   // The immersive layer is the owner of rich metadata. A later title
   // observer must not replace the album or artwork with a generic value.
   window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:{
     id:'synthetic-os-track',source:'kw',name:'Synthetic OS control QA',
     singer:'Fixture artist',albumName:'Fixture album'
   }}));
   document.querySelector('#player-title').textContent='Synthetic OS control QA';
   await tick();
   const metadata={
     title:os.metadata?.title,artist:os.metadata?.artist,album:os.metadata?.album
   };
   source='';
   audio.dispatchEvent(new Event('emptied'));
   await tick();
   return {noSource,disabled,counts,requested,backward,forward,clamped,
     noTrack,playing,pausedState,positionCallDelta:unchangedPositionCalls-posCalls,
     positionUpdates:updatedPositionCalls-posCalls,metadata,
     lastPosition:os.positionCalls.at(-1),
     lastState:os.playbackState,
     availableHandlers:Object.keys(os.handlers).sort()};
 });
 assert.deepEqual(result.noSource,{toggle:0,prev:0,next:0,preview:0,
   commit:0,directPlay:0,directPause:0,positionWrites:0,state:'none'});
 assert.equal(result.disabled.commit,0,'disabled seek must ignore OS commands');
 assert.equal(result.counts.toggle,2,
   'media play/pause must call existing UI transport only once each');
 assert.equal(result.counts.directPlay,0,'OS command must not call audio.play directly');
 assert.equal(result.counts.directPause,0,'OS command must not call audio.pause directly');
 assert.equal(result.counts.positionWrites,0,'OS seeking must not directly write currentTime');
 assert.equal(result.requested,'400','OS seekto must delegate through base slider');
 assert.equal(result.backward,'50','OS seekbackward must use existing current time');
 assert.equal(result.forward,'225','OS seekforward must use existing current time');
 assert.equal(result.clamped,'1000','OS seekto must clamp to valid duration');
 assert.equal(result.noTrack.prev,0);
 assert.equal(result.noTrack.next,0);
 assert.equal(result.counts.prev,1);
 assert.equal(result.counts.next,1);
 assert.equal(result.counts.preview,result.counts.commit,
   'OS seek should have exactly one preview and commit each');
 assert.equal(result.playing,'playing');
 assert.equal(result.pausedState,'paused');
 assert.equal(result.lastState,'none');
 assert.equal(result.positionCallDelta,0,'same second must not spam OS position updates');
 assert.equal(result.positionUpdates,1,'new position must update OS position');
 assert.equal(result.lastPosition.duration,200);
 assert.equal(result.metadata.title,'Synthetic OS control QA');
 assert.equal(result.metadata.artist,'Fixture artist');
 assert.equal(result.metadata.album,'Fixture album',
   'generic title observer must not overwrite real media metadata');
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_MEDIA_SESSION_OS_CONTROLS_PASS '+JSON.stringify({
   systemActionsRegistered:result.availableHandlers.length,
   blockedWithoutSource:true,blockedDisabledSeeking:true,
   delegatedTransport:true,seekClampedAndRouted:true,
   trackActionsExplicit:true,positionUpdateDeduplicated:true,
   playbackStateActual:true,richMetadataPreserved:true,
   noDirectPlayOrSeekWrites:true,syntheticOnly:true
 }));
}finally{await browser.close()}
