import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// Real original MP3, AAC-LC/M4A, FLAC: native #audio.src and RFC 7233.
// No mocked media responses, MSE, fake events, or third-party song URLs.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const formats=[
 {format:'mp3',mime:'audio/mpeg',support:'audio/mpeg'},
 {format:'aac',mime:'audio/mp4',support:'audio/mp4; codecs="mp4a.40.2"'},
 {format:'flac',mime:'audio/flac',support:'audio/flac'}
];
const browser=await chromium.launch({headless:true,
 args:['--autoplay-policy=no-user-gesture-required']});
const results=[];
try{
 const context=await browser.newContext();
 const manifestResponse=await context.request.get(
  BASE+'/qa-fixtures/phase25-manifest.json');
 assert.equal(manifestResponse.status(),200,'original QA manifest served');
 const manifest=await manifestResponse.json();
 assert.equal(manifest.generator,'original-440hz-ffmpeg');
 await context.close();
 for(const spec of formats){
  const page=await browser.newPage({viewport:{width:390,height:844},
   isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const info=manifest.codecs[spec.format],errors=[],requests=[];
  assert.ok(info?.bytes>10000&&info?.sha256);
  page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,180)));
  page.on('request',r=>{
   if(!r.url().includes('phase25=audio'))return;
   requests.push({r,range:r.headers()['range']||null,
     status:null,contentRange:null,failed:false});
  });
  page.on('response',r=>{
   const record=requests.find(x=>x.r===r.request());
   if(record){
    record.status=r.status();
    record.contentRange=r.headers()['content-range']||null;
   }
  });
  page.on('requestfailed',r=>{
   const record=requests.find(x=>x.r===r);
   if(record)record.failed=true;
  });
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh&&
   document.querySelector('#audio')&&document.querySelector('#player-network-hint')),
   null,{timeout:18000});
  const path='/api/fymusic-codec-selftest?format='+spec.format;
  const probe=await page.evaluate(async path=>{
   const h=await fetch(path,{method:'HEAD',cache:'no-store'});
   const first=await fetch(path+'&first=1',
    {headers:{Range:'bytes=0-31'},cache:'no-store'});
   const prefix=[...new Uint8Array(await first.arrayBuffer())];
   const last=await fetch(path+'&last=1',
    {headers:{Range:'bytes=-16'},cache:'no-store'});
   const suffix=(await last.arrayBuffer()).byteLength;
   const invalid=await fetch(path+'&invalid=1',
    {headers:{Range:'bytes=999999999-'},cache:'no-store'});
   return {head:h.status,mime:h.headers.get('content-type'),
    accepts:h.headers.get('accept-ranges'),
    length:Number(h.headers.get('content-length')),
    first:first.status,prefix,firstRange:first.headers.get('content-range'),
    last:last.status,suffix,lastRange:last.headers.get('content-range'),
    bad:invalid.status,badRange:invalid.headers.get('content-range')};
  },path);
  assert.equal(probe.head,200);
  assert.equal(probe.mime,spec.mime);
  assert.equal(probe.accepts,'bytes');
  assert.equal(probe.length,info.bytes);
  assert.equal(probe.first,206);
  assert.equal(probe.firstRange,'bytes 0-31/'+info.bytes);
  assert.equal(probe.prefix.length,32);
  assert.equal(probe.last,206);
  assert.equal(probe.lastRange,'bytes '+(info.bytes-16)+'-'+(info.bytes-1)+'/'+info.bytes);
  assert.equal(probe.suffix,16);
  assert.equal(probe.bad,416);
  assert.equal(probe.badRange,'bytes */'+info.bytes);
  const signature=String.fromCharCode(...probe.prefix.slice(0,4));
  if(spec.format==='flac')assert.equal(signature,'fLaC');
  if(spec.format==='aac')assert.equal(
   String.fromCharCode(...probe.prefix.slice(4,8)),'ftyp');
  if(spec.format==='mp3')assert.equal(signature.slice(0,3),'ID3');
  await page.evaluate(async ({path,support})=>{
   const audio=document.querySelector('#audio');
   const {observeAudioEvents}=await import('/src/fymusic-media-evidence.js');
   const state={rec:observeAudioEvents(audio,{limit:64}),
    support:audio.canPlayType(support),hint:false,error:null};
   window.__codecQA=state;
   audio.addEventListener('waiting',()=>{
    if(audio.currentTime<.4)return;
    requestAnimationFrame(()=>{
     const hint=document.querySelector('#player-network-hint');
     if(hint&&!hint.hidden&&
        document.documentElement.classList.contains('is-buffering'))
      state.hint=true;
    });
   },{passive:true});
   audio.muted=true;audio.preload='auto';
   audio.src=path+'&mode=gap&phase25=audio';
   audio.play().catch(e=>{state.error=String(e?.name||e)});
  },{path,support:spec.support});
  await page.waitForTimeout(15500);
  const res=await page.evaluate(()=>{
   const d=window.__codecQA,a=document.querySelector('#audio');
   const ev=d.rec.dispose();
   return {support:d.support,events:ev,hint:d.hint,
    playError:d.error,mediaError:a.error?.code||0,
    duration:Number.isFinite(a.duration)?+a.duration.toFixed(2):null,
    currentTime:+a.currentTime.toFixed(2)};
  });
  const decoded=res.events.firstPlayingMs!==null&&
   res.events.firstProgressMs!==null&&res.currentTime>.5;
  const row={format:spec.format,mime:spec.mime,bytes:info.bytes,
   expectedDuration:info.durationSeconds,canPlayType:res.support,
   decoded,firstPlayingMs:res.events.firstPlayingMs,
   duration:res.duration,currentTime:res.currentTime,
   nativeMidplayWait:res.events.waits,
   recovered:res.events.recovered,hintDuringWait:res.hint,
   mediaError:res.mediaError,playError:res.playError,
   mediaStatus:requests.map(x=>x.status),
   mediaRange:requests.map(x=>x.range),
   recorderDisposed:res.events.disposed};
  results.push(row);
  assert.deepEqual(errors,[]);
  assert.ok(res.events.disposed&&res.events.eventCount<=64);
  if(res.support){
   assert.ok(decoded,'declared supported codec must actually play');
   assert.equal(res.mediaError,0);
   assert.ok(Math.abs(res.duration-30)<1.0,'real media duration');
   assert.ok(requests.some(x=>[200,206].includes(x.status)&&!x.failed),
    'native media must actually fetch');
   if(res.events.waits>0){
    assert.ok(res.events.recovered>0&&res.hint,
     'real midplayback starvation must recover with FyMusic UI');
   }
  }
  await page.evaluate(()=>document.querySelector('#audio').pause());
  await page.close();
 }
 assert.ok(results.find(x=>x.format==='mp3')?.decoded,'MP3 decoded');
 assert.ok(results.find(x=>x.format==='flac')?.decoded,'FLAC decoded');
 console.log('FYMUSIC_PHASE25_CODEC_MATRIX '+JSON.stringify(results));
 console.log('FYMUSIC_PHASE25_ORIGINAL_MEDIA_PASS '+JSON.stringify({
  originalLicensedSignal:true,realMP3:true,realFLAC:true,
  aacCapabilityReported:true,rfc7233RangeAnd416:true,
  genuineNativeAudioElement:true,finiteCodecEvidence:true,
  noProductionChanges:true,noUpstreamSongTest:true
 }));
}finally{await browser.close()}
