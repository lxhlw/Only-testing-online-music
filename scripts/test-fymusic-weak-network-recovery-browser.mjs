import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Browser-level synthetic weak-network events only. Never infer that a real
// Flower audio stream, upstream CDN, or physical offline/online recovery works.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
let page,cdp;
try{
 page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,
   hasTouch:true,reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',error=>errors.push(String(error?.message||error).slice(0,140)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(
  window.LXPlayerControls?.refresh&&
  document.querySelector('#player-network-hint')&&
  document.querySelector('#audio')&&
  document.querySelector('#playlist-detail-songs')
 ),null,{timeout:18000});
 await page.evaluate(()=>{
  const media=document.querySelector('#audio');
  const counts={play:0,load:0,pause:0,seek:0,fetch:0};
  window.__fymusicWeakCounts=counts;
  const oldFetch=window.fetch.bind(window);
  window.fetch=(...args)=>{counts.fetch++;return oldFetch(...args)};
  window.__weakSource='https://example.invalid/fymusic-synthetic-audio';
  window.__weakCurrent=45;
  window.__weakPaused=false;
  window.__weakReady=2;
  window.__weakOnline=true;
  window.__weakHidden=false;
  Object.defineProperty(media,'currentSrc',{configurable:true,
    get:()=>window.__weakSource});
  Object.defineProperty(media,'currentTime',{configurable:true,
    get:()=>window.__weakCurrent,
    set:value=>{counts.seek++;window.__weakCurrent=value}});
  Object.defineProperty(media,'paused',{configurable:true,
    get:()=>window.__weakPaused});
  Object.defineProperty(media,'ended',{configurable:true,get:()=>false});
  Object.defineProperty(media,'error',{configurable:true,get:()=>null});
  Object.defineProperty(media,'readyState',{configurable:true,
    get:()=>window.__weakReady});
  Object.defineProperty(navigator,'onLine',{configurable:true,
    get:()=>window.__weakOnline});
  Object.defineProperty(document,'hidden',{configurable:true,
    get:()=>window.__weakHidden});
  media.play=()=>{counts.play++;return Promise.resolve()};
  media.pause=()=>{counts.pause++};
  media.load=()=>{counts.load++};
 });
 const frame=()=>page.evaluate(()=>new Promise(done=>
  requestAnimationFrame(()=>requestAnimationFrame(done))));
 const emit=(name)=>page.evaluate(name=>
  document.querySelector('#audio').dispatchEvent(new Event(name)),name);
 const read=()=>page.evaluate(()=>({
  buffering:document.documentElement.classList.contains('is-buffering'),
  offline:document.documentElement.classList.contains('is-offline'),
  hint:document.querySelector('#player-network-hint').textContent,
  hidden:document.querySelector('#player-network-hint').hidden,
  current:document.querySelector('#audio').currentTime,
  counts:{...window.__fymusicWeakCounts}
 }));
 const starting=await read();
 assert.equal(starting.hidden,true);
 await emit('waiting');await frame();
 const waiting=await read();
 assert.equal(waiting.buffering,true);
 assert.match(waiting.hint,/音频缓冲中/);
 assert.equal(waiting.offline,false);
 // Waiting must not falsely become "playing" after an ordinary timeupdate
 // while readyState is still insufficient for future audio.
 await emit('timeupdate');await frame();
 assert.equal((await read()).buffering,true);
 await page.evaluate(()=>{
  window.__weakOnline=false;
  window.dispatchEvent(new Event('offline'));
 });
 await frame();
 const offline=await read();
 assert.equal(offline.offline,true);
 assert.equal(offline.buffering,false);
 assert.match(offline.hint,/浏览器报告离线/);
 await page.evaluate(()=>{
  window.__weakHidden=true;
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
  window.__weakCurrent=62;
  document.querySelector('#audio').dispatchEvent(new Event('stalled'));
  // Simulate a background rapid view replacement without any network fetch.
  const list=document.querySelector('#playlist-detail-songs');
  const fragment=document.createDocumentFragment();
  for(let i=0;i<350;i++){
   const row=document.createElement('div');
   row.className='playlist-song-row';
   row.textContent='Network synthetic row '+i;
   fragment.appendChild(row);
  }
  list.replaceChildren(fragment);
 });
 await page.evaluate(()=>{
  window.__weakOnline=true;
  window.dispatchEvent(new Event('online'));
  window.__weakHidden=false;
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await frame();
 const resumed=await read();
 assert.equal(resumed.offline,false);
 assert.equal(resumed.buffering,true);
 assert.equal(resumed.current,62);
 assert.equal((await page.locator('#playlist-detail-songs').locator('.playlist-song-row').count()),350);
 // A real recovery event should clear buffering without any forced play/load.
 await page.evaluate(()=>{window.__weakReady=4});
 await emit('canplay');await frame();
 const recovered=await read();
 assert.equal(recovered.buffering,false);
 assert.equal(recovered.offline,false);
 assert.equal(recovered.hidden,true);
 await emit('playing');await frame();
 assert.equal((await read()).hidden,true);
 // Rapid src switch: an old "waiting" request belongs to a different URL.
 await page.evaluate(()=>{
  window.__weakReady=2;
  document.querySelector('#audio').dispatchEvent(new Event('waiting'));
 });
 await frame();
 assert.equal((await read()).buffering,true);
 await page.evaluate(()=>{
  window.__weakSource='https://example.invalid/fymusic-synthetic-next';
  window.__weakCurrent=0;
  window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
 });
 await frame();
 const next=await read();
 assert.equal(next.buffering,false,'old source buffering must not follow new media');
 assert.equal(next.hidden,true);
 // Paused media and media with no source cannot show a "connection issue".
 await page.evaluate(()=>{
  window.__weakPaused=true;
  window.__weakOnline=false;
  window.dispatchEvent(new Event('offline'));
  document.querySelector('#audio').dispatchEvent(new Event('pause'));
 });
 await frame();
 assert.equal((await read()).hidden,true);
 await page.evaluate(()=>{
  window.__weakPaused=false;
  window.__weakSource='';
  document.querySelector('#audio').dispatchEvent(new Event('emptied'));
 });
 await frame();
 assert.equal((await read()).hidden,true);
 await page.evaluate(()=>{
  window.__weakOnline=true;
  window.__weakSource='https://example.invalid/fymusic-synthetic-next';
  window.__weakReady=2;
  window.dispatchEvent(new Event('online'));
 });
 await frame();
 cdp=await page.context().newCDPSession(page);
 await cdp.send('HeapProfiler.enable');
 const sample=async()=>{
  await cdp.send('HeapProfiler.collectGarbage');
  await frame();
  const [heap,dom]=await Promise.all([
   cdp.send('Runtime.getHeapUsage'),
   cdp.send('Memory.getDOMCounters')
  ]);
  return {heap:heap.usedSize,nodes:dom.nodes,listeners:dom.jsEventListeners};
 };
 const base=await sample();
 const statusText=await page.locator('#bottom-play-status').textContent();
 // ~300 buffer/offline/online/visibility event bursts. No timers or polling
 // are added to the application by this test.
 for(let i=0;i<300;i++){
  await page.evaluate(i=>{
   const media=document.querySelector('#audio');
   window.__weakOnline=i%2!==0;
   window.dispatchEvent(new Event(i%2===0?'offline':'online'));
   media.dispatchEvent(new Event(i%3===0?'stalled':'waiting'));
   if(i%10===0){
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   }
  },i);
  if(i%60===59)await frame();
 }
 await page.evaluate(()=>{
  window.__weakOnline=true;
  window.__weakReady=4;
  window.dispatchEvent(new Event('online'));
  document.querySelector('#audio').dispatchEvent(new Event('playing'));
 });
 await frame();
 const final=await read();
 const after=await sample();
 assert.equal(final.hidden,true);
 assert.equal(final.offline,false);
 assert.equal(final.buffering,false);
 assert.deepEqual(final.counts,{play:0,load:0,pause:0,seek:0,fetch:0},
   'network events and page restores must never request/replay/seek media');
 assert.equal(await page.locator('#bottom-play-status').textContent(),statusText,
   'presentation-only hints must not overwrite authoritative app status');
 assert.ok(after.nodes-base.nodes<=120,
   'network oscillation should not accumulate DOM elements');
 assert.ok(after.listeners-base.listeners<=8,
   'network oscillation should not accumulate event listeners');
 assert.ok(after.heap-base.heap<=12*1024*1024,
   'GC heap must not grow unbounded during synthetic network events');
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_WEAK_NETWORK_RECOVERY_PASS '+JSON.stringify({
  bufferingVisibleDuringWaiting:true,
  offlineOverridesBuffering:true,
  hiddenRestoreReconciles:true,
  normalCanplayClears:true,
  oldSourceBufferingDiscarded:true,
  pausedOrUnloadedHasNoAlert:true,
  burstEvents:300,
  noAutoRequestsOrSeek:true,
  appStatusUnchanged:true,
  postGcHeapDeltaBytes:after.heap-base.heap,
  postGcDomDelta:after.nodes-base.nodes,
  postGcListenerDelta:after.listeners-base.listeners,
  syntheticOnly:true
 }));
}finally{
 await cdp?.detach?.().catch(()=>{});
 await browser.close();
}
