import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 24 isolated QA: four samples per transport, counterbalanced order.
// Browser actually streams each MP3 through the one existing #audio element.
// Every sample uses a new browser context plus a distinct URL and no-store
// responses. No MSE, route mocking, fake media events or production changes.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const BYTES=209*1600,LEAD=460,GAP=11000;
const ORDER=['200','206','206','200','206','200','200','206'];
const browser=await chromium.launch({headless:true,
 args:['--autoplay-policy=no-user-gesture-required']});
const round=(n)=>Math.round(n*100)/100;
const med=values=>{
 const v=[...values].sort((a,b)=>a-b),n=v.length;
 return round(n%2?v[Math.floor(n/2)]:(v[n/2-1]+v[n/2])/2);
};
const describe=values=>{
 const v=[...values].sort((a,b)=>a-b);
 return {n:v.length,min:v[0],median:med(v),max:v.at(-1),
   samples:values.map(x=>round(x))};
};
const results=[];
try{
 for(let index=0;index<ORDER.length;index++){
   const kind=ORDER[index],mode=kind==='200'?'primed':'primed-range';
   const page=await browser.newPage({viewport:{width:390,height:844},
     hasTouch:true,isMobile:true,reducedMotion:'reduce'});
   const errors=[],mediaRequests=[];
   const token='phase24-'+index+'-'+kind;
   const path='/api/fymusic-range-selftest?mode='+mode+
     '&format=mp3&leadFrames='+LEAD+'&gapMs='+GAP+'&phase24='+token;
   page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,180)));
   page.on('request',request=>{
     if(!request.url().includes('phase24='+token)||!request.url().includes('&channel=audio'))
       return;
     mediaRequests.push({request,range:request.headers()['range']||null,
       startedAt:Date.now(),status:null,contentRange:null,
       cacheControl:null,serviceWorker:false,completedAt:null,failed:false});
   });
   page.on('response',response=>{
     const record=mediaRequests.find(x=>x.request===response.request());
     if(!record)return;
     record.status=response.status();
     const headers=response.headers();
     record.contentRange=headers['content-range']||null;
     record.cacheControl=headers['cache-control']||null;
     record.serviceWorker=response.fromServiceWorker();
   });
   page.on('requestfinished',r=>{
     const x=mediaRequests.find(x=>x.request===r);
     if(x)x.completedAt=Date.now();
   });
   page.on('requestfailed',r=>{
     const x=mediaRequests.find(x=>x.request===r);
     if(x)x.failed=true;
   });
   await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
     document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
     null,{timeout:18000});
   await page.evaluate(async path=>{
     const {observeAudioEvents}=await import('/src/fymusic-media-evidence.js');
     const a=document.querySelector('#audio');
     const d={recorder:observeAudioEvents(a,{limit:48}),
       origin:Date.now(),hintSeen:false,probe:null,playError:null};
     window.__phase24=d;
     a.addEventListener('waiting',()=>{
       if(a.currentTime<.4)return;
       requestAnimationFrame(()=>{
         const hint=document.querySelector('#player-network-hint');
         if(hint&&!hint.hidden&&
           document.documentElement.classList.contains('is-buffering'))d.hintSeen=true;
       });
     },{passive:true});
     d.probeDone=(async()=>{
       const start=performance.now();
       const r=await fetch(path+'&channel=probe',{cache:'no-store',
         headers:{Range:'bytes=0-'}});
       let previous=null,first=null,maxGap=0,bytes=0,chunks=0;
       const reader=r.body.getReader();
       while(true){
         const {done,value}=await reader.read();
         if(done)break;
         const at=performance.now()-start;
         if(first===null)first=at;
         if(previous!==null)maxGap=Math.max(maxGap,at-previous);
         previous=at;
         bytes+=value.byteLength;chunks++;
       }
       d.probe={status:r.status,range:r.headers.get('content-range'),
         acceptRanges:r.headers.get('accept-ranges'),
         cacheControl:r.headers.get('cache-control'),
         bytes,chunks,firstByteMs:Math.round(first),
         gapMs:Math.round(maxGap),totalMs:Math.round(performance.now()-start)};
     })().catch(e=>{d.probe={error:String(e?.message||e)}});
     a.preload='auto';a.muted=true;
     a.src=path+'&channel=audio';
     a.play().catch(e=>{d.playError=String(e?.message||e)});
   },path);
   await page.waitForFunction(()=>window.__phase24?.probe?.bytes===334400&&
     window.__phase24?.recorder.snapshot().firstPlayingMs!==null,
     null,{timeout:16000});
   // A bounded settle period allows native progress/recovery and request
   // completion notification, without measuring media using synthetic clocks.
   await page.waitForTimeout(1100);
   const outcome=await page.evaluate(()=>{
     const d=window.__phase24,a=document.querySelector('#audio');
     const evidence=d.recorder.dispose();
     return {evidence,probe:d.probe,origin:d.origin,playError:d.playError,
       hintSeen:d.hintSeen,error:a.error?.code||0,
       currentTime:Math.round(a.currentTime*100)/100};
   });
   const requestRecords=mediaRequests.map(r=>({
     range:r.range,status:r.status,contentRange:r.contentRange,
     cacheControl:r.cacheControl,serviceWorker:r.serviceWorker,
     startedAt:r.startedAt,completedAt:r.completedAt,failed:r.failed
   }));
   const playedEarly=outcome.evidence.firstPlayingMs!==null&&
     requestRecords.some(r=>r.completedAt!==null&&
       outcome.origin+outcome.evidence.firstPlayingMs<r.completedAt);
   const metric={trial:index+1,transport:kind,
     firstPlayingMs:outcome.evidence.firstPlayingMs,
     firstProgressMs:outcome.evidence.firstProgressMs,
     waits:outcome.evidence.waits,recovered:outcome.evidence.recovered,
     rebufferMs:outcome.evidence.rebufferMs,
     hintSeen:outcome.hintSeen,playedEarly,
     currentTime:outcome.currentTime,
     gapMs:outcome.probe?.gapMs,
     probeStatus:outcome.probe?.status,
     requests:requestRecords.map(({startedAt,completedAt,...r})=>({
       ...r,finished:completedAt!==null
     }))};
   results.push(metric);
   assert.deepEqual(errors,[],'browser page must not throw');
   assert.equal(outcome.playError,null);
   assert.equal(outcome.error,0,'MP3 must decode in native audio');
   assert.equal(outcome.probe?.bytes,BYTES,'actual HTTP probe bytes');
   assert.ok(outcome.probe.gapMs>=8500,
     'server must pause actual MP3 HTTP transfer for 11s');
   assert.ok(outcome.probe.cacheControl?.includes('no-store'),
     'QA transport must explicitly prevent normal caching');
   assert.equal(outcome.probe.status,kind==='206'?206:200);
   if(kind==='206')assert.equal(outcome.probe.range,
     'bytes 0-'+(BYTES-1)+'/'+BYTES);
   assert.ok(requestRecords.length>=1&&requestRecords.some(r=>
     r.status===(kind==='206'?206:200)&&!r.failed),
     'real #audio request must receive intended response status');
   assert.ok(requestRecords.every(r=>!r.serviceWorker),
     'audio must not be served through a Service Worker');
   assert.ok(requestRecords.every(r=>r.cacheControl?.includes('no-store')),
     'audio responses must advertise no-store');
   assert.ok(outcome.evidence.firstPlayingMs!==null&&
     outcome.evidence.firstProgressMs!==null,
     'native playback must start and genuinely advance');
   assert.ok(outcome.evidence.eventCount<=48&&outcome.evidence.disposed,
     'QA recorder must remain bounded and be detached');
   assert.ok(playedEarly,'native audio must play before media transfer completes');
   assert.ok(outcome.evidence.waits>=1&&outcome.evidence.recovered>=1,
     'real midplayback wait and natural recovery expected for 11s gap');
   assert.ok(outcome.hintSeen,'FyMusic must show buffering hint for actual wait');
   await page.evaluate(()=>document.querySelector('#audio').pause());
   await page.close();
 }
 const group=kind=>results.filter(x=>x.transport===kind);
 const a=group('200'),b=group('206');
 assert.equal(a.length,4);assert.equal(b.length,4);
 const paired=[];
 for(let i=0;i<ORDER.length;i+=2){
   const first=results[i],second=results[i+1];
   assert.notEqual(first.transport,second.transport,
     'each pair must contain both transport modes');
   paired.push({pair:i/2+1,order:first.transport+'-'+second.transport,
     difference206Minus200Ms:round((first.transport==='206'?first:second).firstPlayingMs-
       (first.transport==='200'?first:second).firstPlayingMs)});
 }
 const report={
   fixedLeadFrames:LEAD,realNetworkPauseMs:GAP,
   order:ORDER,independentBrowserContexts:8,uniqueMediaUrls:8,
   mode200:{startup:describe(a.map(x=>x.firstPlayingMs)),
     firstProgress:describe(a.map(x=>x.firstProgressMs)),
     rebuffer:describe(a.map(x=>x.rebufferMs))},
   mode206:{startup:describe(b.map(x=>x.firstPlayingMs)),
     firstProgress:describe(b.map(x=>x.firstProgressMs)),
     rebuffer:describe(b.map(x=>x.rebufferMs))},
   pairDifferences:paired,observations:results
 };
 console.log('FYMUSIC_PHASE24_REPEATED_RANGE_DISTRIBUTION '+JSON.stringify(report));
 console.log('FYMUSIC_PHASE24_ORDER_CACHE_ISOLATION_PASS '+JSON.stringify({
   fourSamplesEach:true,balancedAlternatingPairs:true,
   uniqueUrlsAndFreshContexts:true,noStoreResponse:true,
   originalNativeHtmlAudio:true,real206And200:true,
   naturalMidPlaybackWaitRecovered:true,noProductionPlayerChanges:true,
   noRealThirdPartyMusicTested:true
 }));
}finally{await browser.close()}
