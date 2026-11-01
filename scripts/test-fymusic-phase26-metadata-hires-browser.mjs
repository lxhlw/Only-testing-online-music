import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Phase 26: real FFmpeg-encoded original metadata/hi-res media via native audio.src.
// No fake HTMLMediaElement events, synthetic decoder or production source changes.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const ROOT='/api/fymusic-codec-selftest?format=';
const CASES=[
 {id:'mp3-cover',mime:'audio/mpeg',canPlay:'audio/mpeg',
  header:[73,68,51]},
 {id:'aac-tail',mime:'audio/mp4',
  canPlay:'audio/mp4; codecs="mp4a.40.2"'},
 {id:'flac24',mime:'audio/flac',canPlay:'audio/flac',
  header:[102,76,97,67]}
];
const browser=await chromium.launch({headless:true,
 args:['--autoplay-policy=no-user-gesture-required']});
const results=[];
try{
 const setup=await browser.newContext();
 const response=await setup.request.get(BASE+'/qa-fixtures/phase26-manifest.json');
 assert.equal(response.status(),200,'Phase 26 generated manifest available');
 const manifest=await response.json();
 await setup.close();
 assert.equal(manifest.generator,'phase26-original-signal-metadata');
 for(const spec of CASES){
  const info=manifest.assets[spec.id];
  assert.ok(info&&info.bytes>15000&&info.bytes<2500000);
  const page=await browser.newPage({viewport:{width:390,height:844},
    isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const errors=[],mediaRequests=[];
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,160)));
  page.on('request',r=>{
   if(!r.url().includes('phase26=media'))return;
   mediaRequests.push({r,range:r.headers()['range']||null,
     status:null,contentRange:null,failed:false,finished:false});
  });
  page.on('response',r=>{
   const record=mediaRequests.find(x=>x.r===r.request());
   if(record){
    record.status=r.status();
    record.contentRange=r.headers()['content-range']||null;
   }
  });
  page.on('requestfailed',r=>{
   const record=mediaRequests.find(x=>x.r===r);
   if(record)record.failed=true;
  });
  page.on('requestfinished',r=>{
   const record=mediaRequests.find(x=>x.r===r);
   if(record)record.finished=true;
  });
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
    document.querySelector('#audio')),null,{timeout:18000});
  const path=ROOT+spec.id;
  const transport=await page.evaluate(async path=>{
   const head=await fetch(path,{method:'HEAD',cache:'no-store'});
   const first=await fetch(path+'&part=first',
     {headers:{Range:'bytes=0-31'},cache:'no-store'});
   const prefix=[...new Uint8Array(await first.arrayBuffer())];
   const tail=await fetch(path+'&part=tail',
     {headers:{Range:'bytes=-16'},cache:'no-store'});
   const tailLen=(await tail.arrayBuffer()).byteLength;
   const bad=await fetch(path+'&part=invalid',
     {headers:{Range:'bytes=99999999-'},cache:'no-store'});
   return {head:head.status,mime:head.headers.get('content-type'),
     accepts:head.headers.get('accept-ranges'),
     total:Number(head.headers.get('content-length')),
     first:first.status,firstRange:first.headers.get('content-range'),
     prefix,tail:tail.status,tailRange:tail.headers.get('content-range'),
     tailLen,bad:bad.status,badRange:bad.headers.get('content-range')};
  },path);
  assert.equal(transport.head,200);
  assert.equal(transport.mime,spec.mime);
  assert.equal(transport.accepts,'bytes');
  assert.equal(transport.total,info.bytes);
  assert.equal(transport.first,206);
  assert.equal(transport.firstRange,'bytes 0-31/'+info.bytes);
  assert.equal(transport.tail,206);
  assert.equal(transport.tailRange,'bytes '+(info.bytes-16)+'-'+(info.bytes-1)+'/'+info.bytes);
  assert.equal(transport.tailLen,16);
  assert.equal(transport.bad,416);
  assert.equal(transport.badRange,'bytes */'+info.bytes);
  if(spec.header)assert.deepEqual(transport.prefix.slice(0,4).slice(0,spec.header.length),spec.header);
  if(spec.id==='aac-tail')
   assert.equal(String.fromCharCode(...transport.prefix.slice(4,8)),'ftyp');
  await page.evaluate(async ({path,mime})=>{
   const audio=document.querySelector('#audio');
   const {observeAudioEvents}=await import('/src/fymusic-media-evidence.js');
   const d={rec:observeAudioEvents(audio,{limit:48}),
     capability:audio.canPlayType(mime),playError:null};
   window.__phase26=d;
   audio.muted=true;
   audio.preload='auto';
   audio.src=path+'&mode=normal&phase26=media';
   audio.play().catch(e=>{d.playError=e?.name||String(e)});
  },{path,mime:spec.canPlay});
  await page.waitForFunction(()=>{
   const a=document.querySelector('#audio');
   return a.currentTime>.8||Boolean(a.error);
  },null,{timeout:13000});
  const data=await page.evaluate(()=>{
   const a=document.querySelector('#audio'),d=window.__phase26;
   return {canPlayType:d.capability,duration:Number.isFinite(a.duration)?
       +a.duration.toFixed(3):null,
     currentTime:+a.currentTime.toFixed(3),
     readyState:a.readyState,mediaError:a.error?.code||0,
     playError:d.playError,evidence:d.rec.dispose(),
     activeSource:a.currentSrc.split('?')[1]?.split('&')[0]||'',
     audioElements:document.querySelectorAll('audio').length};
  });
  const decoded=data.evidence.firstPlayingMs!==null&&
   data.evidence.firstProgressMs!==null&&data.currentTime>.8;
  const observed={id:spec.id,mime:spec.mime,bytes:info.bytes,
    sampleRate:info.sampleRate,bitDepth:info.bitDepth,
    embeddedCover:info.embeddedCover,moovAfterMdat:info.moovAfterMdat,
    canPlayType:data.canPlayType,decoded,
    firstPlayingMs:data.evidence.firstPlayingMs,
    duration:data.duration,currentTime:data.currentTime,
    rangeStatus:mediaRequests.map(x=>x.status),
    responseRanges:mediaRequests.map(x=>x.contentRange),
    requestRanges:mediaRequests.map(x=>x.range),
    mediaError:data.mediaError,recordingDisposed:data.evidence.disposed};
  results.push(observed);
  assert.deepEqual(errors,[],'page errors');
  assert.equal(data.audioElements,1,'one existing HTMLAudioElement only');
  assert.ok(data.canPlayType,'record support, never infer solely from extension');
  assert.ok(decoded,'real codec '+spec.id+' must decode and progress');
  assert.equal(data.mediaError,0);
  assert.equal(data.playError,null);
  assert.ok(Math.abs(data.duration-info.durationSeconds)<.6);
  assert.ok(mediaRequests.some(x=>x.status===206&&!x.failed),
    'actual native HTTP Range 206 required');
  assert.ok(data.evidence.disposed&&data.evidence.eventCount<=48);
  if(spec.id==='mp3-cover')assert.equal(info.embeddedCover,true);
  if(spec.id==='aac-tail')assert.equal(info.moovAfterMdat,true);
  if(spec.id==='flac24'){
   assert.equal(info.bitDepth,24);assert.equal(info.sampleRate,96000);
  }
  await page.evaluate(()=>document.querySelector('#audio').pause());
  await page.close();
 }

 // Fast source replacement uses the SAME real element, real network files,
 // and normal browser abort/cancellation semantics, not a simulated player.
 const page=await browser.newPage({viewport:{width:390,height:844},
   isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const errors=[],requestStates=[];
 page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,160)));
 page.on('request',r=>{
  if(!r.url().includes('phase26=rapid'))return;
  requestStates.push({r,status:null,failed:false});
 });
 page.on('response',r=>{
  const entry=requestStates.find(x=>x.r===r.request());
  if(entry)entry.status=r.status();
 });
 page.on('requestfailed',r=>{
  const entry=requestStates.find(x=>x.r===r);
  if(entry)entry.failed=true;
 });
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
   document.querySelector('#audio')),null,{timeout:18000});
 await page.evaluate(()=>{
  const a=document.querySelector('#audio');
  window.__phase26Rapid={events:[],start:performance.now(),playErrors:[]};
  const d=window.__phase26Rapid;
  for(const event of ['loadstart','loadedmetadata','playing',
    'waiting','stalled','timeupdate','error','abort','emptied']){
   a.addEventListener(event,()=>{
    if(d.events.length>=90)return;
    d.events.push({name:event,ms:Math.round(performance.now()-d.start),
      source:a.currentSrc.includes('flac24')?'flac24':
        a.currentSrc.includes('aac-tail')?'aac-tail':'mp3-cover',
      currentTime:+a.currentTime.toFixed(2)});
   },{passive:true});
  }
  a.muted=true;a.preload='auto';
  a.src='/api/fymusic-codec-selftest?format=mp3-cover&mode=gap&phase26=rapidA';
  a.play().catch(e=>d.playErrors.push(e?.name||String(e)));
 });
 await page.waitForTimeout(170);
 await page.evaluate(()=>{
  const a=document.querySelector('#audio');
  a.src='/api/fymusic-codec-selftest?format=aac-tail&mode=gap&phase26=rapidB';
  a.play().catch(e=>window.__phase26Rapid.playErrors.push(e?.name||String(e)));
 });
 await page.waitForTimeout(170);
 await page.evaluate(()=>{
  const a=document.querySelector('#audio'),d=window.__phase26Rapid;
  d.finalSwitchAt=Math.round(performance.now()-d.start);
  a.src='/api/fymusic-codec-selftest?format=flac24&mode=normal&phase26=rapidC';
  a.play().catch(e=>d.playErrors.push(e?.name||String(e)));
 });
 await page.waitForFunction(()=>{
  const a=document.querySelector('#audio');
  return a.currentSrc.includes('flac24')&&a.currentTime>1.1&&
   a.readyState>=2&&!a.paused||Boolean(a.error);
 },null,{timeout:16000});
 await page.waitForTimeout(450);
 const rapid=await page.evaluate(()=>{
  const a=document.querySelector('#audio'),d=window.__phase26Rapid;
  return {events:d.events,finalSwitchAt:d.finalSwitchAt,
   currentTime:+a.currentTime.toFixed(3),
   duration:Number.isFinite(a.duration)?+a.duration.toFixed(3):null,
   currentSrc:a.currentSrc,paused:a.paused,mediaError:a.error?.code||0,
   audioElements:document.querySelectorAll('audio').length,
   playErrors:d.playErrors};
 });
 const afterFinal=rapid.events.filter(e=>e.ms>=rapid.finalSwitchAt&&
   ['playing','loadedmetadata','timeupdate'].includes(e.name));
 assert.deepEqual(errors,[]);
 assert.equal(rapid.mediaError,0);
 assert.equal(rapid.audioElements,1);
 assert.ok(rapid.currentSrc.includes('format=flac24'));
 assert.ok(rapid.currentTime>1.1&&!rapid.paused);
 assert.ok(Math.abs(rapid.duration-12)<.5);
 assert.ok(afterFinal.length>0&&afterFinal.every(e=>e.source==='flac24'),
   'late obsolete media events must not replace final native media');
 assert.ok(!rapid.playErrors.some(x=>x!=='AbortError'),
   'cancelled previous plays may reject AbortError only');
 assert.ok(requestStates.some(x=>x.r.url().includes('rapidC')&&x.status===206),
   'final FLAC source must use real 206 stream');
 const summary={switches:3,oneNativeAudioElement:true,
   finalFormat:'flac24',duration:rapid.duration,
   finalTime:rapid.currentTime,oldPlayAbortErrors:rapid.playErrors,
   previousRequests:requestStates.filter(x=>!x.r.url().includes('rapidC')).map(x=>({
      status:x.status,failed:x.failed})),
   postFinalEvents:afterFinal.length,
   stalePostFinalMediaEvents:afterFinal.filter(x=>x.source!=='flac24').length,
   noForcedFallback:true};
 console.log('FYMUSIC_PHASE26_NATIVE_METADATA_MATRIX '+JSON.stringify(results));
 console.log('FYMUSIC_PHASE26_FAST_SOURCE_REPLACEMENT '+JSON.stringify(summary));
 console.log('FYMUSIC_PHASE26_METADATA_HIRES_PASS '+JSON.stringify({
  mp3AttachedID3Cover:true,aacMoovAfterMdat:true,
  flac24Bit96kHz:true,allThreeRealNativeDecoded:true,
  real206RangeAnd416:true,rapidSourceReplacement:true,
  noSecondPlayer:true,noProductionChange:true,
  noRealUpstreamSongTested:true}));
 await page.evaluate(()=>document.querySelector('#audio').pause());
 await page.close();
}finally{await browser.close()}
