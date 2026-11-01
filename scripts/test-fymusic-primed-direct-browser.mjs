import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 21 controlled comparison: more initial MP3 data (~12 seconds), then
// an actual 16-second HTTP gap. Native audio.src only; no MSE or fake events.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const URL_PATH='/api/fymusic-range-selftest?mode=primed&format=mp3';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844},
   hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const errors=[],reqs=[];
 page.on('pageerror',e=>errors.push(String(e?.message||e)));
 page.on('request',req=>{
   if(!req.url().includes('mode=primed'))return;
   reqs.push({range:req.headers()['range']||null,openedMs:Date.now(),
     completeMs:null,failedMs:null,status:null,bytes:null,request:req});
 });
 page.on('response',res=>{
   if(!res.url().includes('mode=primed'))return;
   const r=reqs.find(x=>x.request===res.request());
   if(r){r.status=res.status();r.bytes=res.headers()['content-length']||null;}
 });
 page.on('requestfinished',req=>{
   const r=reqs.find(x=>x.request===req);
   if(r)r.completeMs=Date.now();
 });
 page.on('requestfailed',req=>{
   const r=reqs.find(x=>x.request===req);
   if(r)r.failedMs=Date.now();
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
   document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
   null,{timeout:18000});

 await page.evaluate(path=>{
   const a=document.querySelector('#audio');
   const data={events:[],samples:[],begin:performance.now(),calls:{play:0,load:0,pause:0},
     transport:{status:0,range:null,length:null,firstByteMs:null,
       bytes:0,maxGapMs:0,chunks:0,done:false,failed:null}};
   const sample=()=>{
     const ranges=[];
     for(let i=0;i<a.buffered.length;i++)
       ranges.push([+a.buffered.start(i).toFixed(2),
         +a.buffered.end(i).toFixed(2)]);
     const hint=document.querySelector('#player-network-hint');
     return {at:Math.round(performance.now()-data.begin),epoch:Date.now(),
       t:+a.currentTime.toFixed(2),ready:a.readyState,
       error:a.error?.code||0,ranges,paused:a.paused,
       hint:!!hint&&!hint.hidden,
       buffering:document.documentElement.classList.contains('is-buffering')};
   };
   data.snapshot=sample;
   for(const type of ['loadstart','loadedmetadata','play','playing','waiting',
     'stalled','canplay','canplaythrough','progress','timeupdate','pause','error']){
     a.addEventListener(type,()=>{
       data.events.push({type,...sample()});
       if(data.events.length>500)data.events.shift();
     },{passive:true});
   }
   const play=a.play.bind(a),load=a.load.bind(a),pause=a.pause.bind(a);
   a.play=(...args)=>{data.calls.play++;return play(...args)};
   a.load=(...args)=>{data.calls.load++;return load(...args)};
   a.pause=(...args)=>{data.calls.pause++;return pause(...args)};
   window.__phase21Primed=data;
   window.__phase21PrimedTimer=setInterval(()=>{
     data.samples.push(sample());
     if(data.samples.length>170)data.samples.shift();
   },200);
   // A separate real fetch observes server byte delivery in parallel. It is
   // not connected to audio and cannot fabricate an audio event.
   window.__phase21PrimedProbe=(async()=>{
     const t=data.transport,start=performance.now();
     try{
       const response=await fetch(path+'&probe=1',
         {headers:{Range:'bytes=0-85000'},cache:'no-store'});
       t.status=response.status;
       t.range=response.headers.get('accept-ranges');
       t.length=response.headers.get('content-length');
       const reader=response.body.getReader();let prev=null;
       while(true){
         const {done,value}=await reader.read();
         if(done)break;
         const at=performance.now()-start;
         if(t.firstByteMs===null)t.firstByteMs=Math.round(at);
         if(prev!==null)t.maxGapMs=Math.max(t.maxGapMs,Math.round(at-prev));
         prev=at;t.bytes+=value.byteLength;t.chunks++;
       }
       t.done=true;
     }catch(e){t.failed=String(e?.message||e)}
   })();
   a.muted=true;a.preload='auto';
   a.src=path+'&direct=1';
   window.__phase21PrimedPlay=a.play().then(()=>true,()=>false);
 },URL_PATH);
 await page.waitForTimeout(28000);
 const data=await page.evaluate(()=>{
   clearInterval(window.__phase21PrimedTimer);
   const d=window.__phase21Primed;
   return {events:d.events,samples:d.samples,
     calls:{...d.calls},transport:{...d.transport},final:d.snapshot()};
 });
 const audioReqs=reqs.filter(x=>x.request.url().includes('direct=1')).map(x=>({
   range:x.range,status:x.status,length:x.bytes,openedMs:x.openedMs,
   completedMs:x.completeMs,failedMs:x.failedMs
 }));
 const playEvent=data.events.find(e=>e.type==='playing'&&e.t<.5);
 const madeProgress=data.events.some(e=>e.type==='timeupdate'&&e.t>.5);
 const wait=data.events.find(e=>e.type==='waiting'&&e.t>.5&&
   data.events.some(p=>p.type==='timeupdate'&&p.t>.4&&p.at<e.at));
 const recovered=!!wait&&data.events.some(e=>e.type==='playing'&&e.at>wait.at);
 const progressedAfter=!!wait&&data.events.some(e=>e.type==='timeupdate'&&
   e.at>wait.at&&e.t>wait.t+.5);
 const midHint=!!wait&&data.samples.some(x=>x.at>=wait.at&&x.at<wait.at+1000&&
   x.hint&&x.buffering);
 const firstCompleted=audioReqs.map(x=>x.completedMs).filter(Boolean).sort()[0];
 const beganBeforeRequestFinished=!!playEvent&&
   (!firstCompleted||playEvent.epoch<firstCompleted);
 const probe=data.transport;
 const evidence={
   transport:{status:probe.status,range:probe.range,length:probe.length,
     bytes:probe.bytes,chunks:probe.chunks,maxGapMs:probe.maxGapMs,
     firstByteMs:probe.firstByteMs,completed:probe.done,error:probe.failed},
   audioRequests:audioReqs,
   firstPlayingMs:playEvent?.at??null,startedBeforeResponseCompleted:beganBeforeRequestFinished,
   nativeMidPlaybackWait:!!wait,waitAtSeconds:wait?.t??null,
   nativeRecovered:recovered,progressAfterRecovery:progressedAfter,
   nativeBufferHint:midHint,realPlaybackProgress:madeProgress,
   lastTime:data.final.t,lastReady:data.final.ready,lastError:data.final.error,
   events:data.events.filter(x=>!['progress','timeupdate'].includes(x.type))
     .map(x=>`${x.type}@${x.t}/${x.ready}/${x.at}`).slice(0,60),
   sampleRanges:data.samples.filter((_,i)=>i%11===0).map(s=>({
     at:s.at,time:s.t,buffered:s.ranges.at(-1)?.[1]||0,
     ready:s.ready,hint:s.hint})).slice(0,20)
 };
 console.log('FYMUSIC_PHASE21_PRIMED_DIRECT_OBSERVATIONS '+JSON.stringify(evidence));
 assert.equal(probe.status,200);
 assert.equal(probe.range,'none');
 assert.equal(probe.length,String(209*1600));
 assert.equal(probe.bytes,209*1600);
 assert.ok(probe.done&&!probe.failed&&probe.maxGapMs>=12500,
   'real primed MP3 HTTP must transmit leading bytes then pause for ~16s');
 assert.ok(playEvent&&madeProgress,'real direct audio.src must decode and play');
 assert.equal(data.final.error,0);
 assert.ok(audioReqs.some(x=>x.status===200),
   'native audio.src should receive HTTP 200');
 // Distinguish initial waiting from a genuine wait after playback progress.
 if(wait)assert.ok(recovered&&progressedAfter&&midHint,
   'native mid-playback stall must recover and correctly show UI hint');
 const before={...data.calls};
 await page.evaluate(()=>{
   window.dispatchEvent(new Event('online'));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await page.waitForTimeout(150);
 assert.deepEqual(await page.evaluate(()=>window.__phase21Primed.calls),before);
 await page.evaluate(()=>document.querySelector('#audio').pause());
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_PHASE21_PRIMED_DIRECT_PASS '+JSON.stringify({
   genuineServerLeadAndGap:true,directNativeMp3Decoded:true,
   responseNotMse:true,nativeStartupBeforeHttpCompletion:beganBeforeRequestFinished,
   nativeMidPlaybackWait:!!wait,autoRecovered:recovered,
   nativeHintDuringMidWait:midHint,unchangedPlayerLogic:true,
   noThirdPartySongVerification:true
 }));
}finally{await browser.close()}
