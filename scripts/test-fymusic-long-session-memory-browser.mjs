import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Short, repeatable synthetic lifecycle soak. CDP gives actual Chromium heap
// and DOM counters after explicit GC; this is NOT a mobile 30-minute test.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
let page,cdp;
try{
 page=await browser.newPage({viewport:{width:390,height:844},
  hasTouch:true,isMobile:true,reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,160)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh &&
  document.querySelector('#lyrics-close-btn')&&
  document.querySelector('#playlist-detail-songs')&&
  document.querySelector('#lyrics-lines')),null,{timeout:18000});
 cdp=await page.context().newCDPSession(page);
 await cdp.send('HeapProfiler.enable');
 await page.evaluate(()=>{
  // No audio source, no third-party metadata, no signed source/stream URLs.
  window.__fymusicSoak={tracks:0,opens:0,closes:0,replacements:0,
   restored:0,focusRecovered:0};
  const list=document.querySelector('#playlist-detail-songs');
  const frag=document.createDocumentFragment();
  for(let i=0;i<240;i++){
   const row=document.createElement('div');
   row.className='playlist-song-row';
   row.textContent='Baseline synthetic row '+i;
   frag.appendChild(row);
  }
  list.replaceChildren(frag);
 });
 const waitFrame=()=>page.evaluate(()=>new Promise(done=>
  requestAnimationFrame(()=>requestAnimationFrame(done))));
 await waitFrame();
 // Warm up event listeners, modal layout, lazy observers, and JS shapes
 // before taking the first comparable memory sample.
 const cycle=async(batch)=>{
  return page.evaluate(async batch=>{
   const counts=window.__fymusicSoak;
   const list=document.querySelector('#playlist-detail-songs');
   const lines=document.querySelector('#lyrics-lines');
   const cover=document.querySelector('#player-cover-button');
   const close=document.querySelector('#lyrics-close-btn');
   const overlay=document.querySelector('#lyrics-overlay');
   const frame=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
   const start=performance.now();
   for(let j=0;j<160;j++){
    const number=batch*160+j;
    const item={id:'soak-'+number,source:'kw',
      name:'Soak track '+number,singer:'Fixture singer',
      albumName:'Synthetic album',image:''};
    window.__LXNowPlayingTrack=item;
    window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:item}));
    counts.tracks++;
    if(j%16===0){
     const temp=document.createElement('button');
     temp.textContent='Temporary opener '+number;
     document.body.appendChild(temp);
     temp.focus();
     cover.click();
     counts.opens++;
     temp.remove();
     if(j%32===0){
      const group=document.createDocumentFragment();
      for(let k=0;k<24;k++){
       const node=document.createElement('div');
       node.className='lyrics-line'+(k===8?' active':'');
       node.textContent='Synthetic lyric '+k+' for '+number;
       group.appendChild(node);
      }
      lines.replaceChildren(group);
     }
     close.click();
     counts.closes++;
     if(overlay.getAttribute('aria-hidden')!=='true')throw Error('modal was left open');
     if(!document.activeElement?.isConnected)throw Error('focus retained detached node');
     counts.focusRecovered++;
    }
    if(j%20===0){
     const fragment=document.createDocumentFragment();
     for(let k=0;k<240;k++){
      const row=document.createElement('div');
      row.className='playlist-song-row';
      row.textContent='Batch '+batch+' entry '+j+' '+k;
      fragment.appendChild(row);
     }
     list.replaceChildren(fragment);
     counts.replacements++;
    }
    if(j%40===0){
     window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
     window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
     counts.restored++;
    }
    // Process mutations between replacement groups; a large synchronous
    // burst exercises the pending UI queue before one final frame.
    if(j%80===79)await frame();
   }
   await frame();await frame();
   const rows=[...list.children];
   const covers=document.querySelectorAll('#player-cover-image,#lyrics-cover-image');
   return {
    elapsedMs:Math.round(performance.now()-start),
    listRows:rows.length,
    reducedMotionAnimated:rows.filter(el=>el.classList.contains('reveal-item')||
      Boolean(el.style.animationDelay)).length,
    coverNodes:covers.length,
    actualCovers:[...covers].filter(el=>el.hasAttribute('src')).length,
    modalClosed:overlay.getAttribute('aria-hidden')==='true',
    song:document.querySelector('#lyrics-title').textContent,
    counters:{...counts}
   };
  },batch);
 };
 // Before the first measured sample, run one identical full cycle to
 // initialize any lazily allocated framework-free DOM event paths.
 const warm=await cycle(0);
 assert.equal(warm.reducedMotionAnimated,0,
  'reduced motion should create no lingering animation styles/listeners');
 await waitFrame();
 const sample=async label=>{
  await cdp.send('HeapProfiler.collectGarbage');
  await waitFrame();
  await cdp.send('HeapProfiler.collectGarbage');
  const [heap,dom]=await Promise.all([
   cdp.send('Runtime.getHeapUsage'),
   cdp.send('Memory.getDOMCounters')
  ]);
  return {label,heapBytes:heap.usedSize,
   documents:dom.documents,nodes:dom.nodes,listeners:dom.jsEventListeners};
 };
 const baseline=await sample('after-warmup');
 const samples=[baseline],batches=[warm];
 for(const round of [1,2,3,4]){
  const run=await cycle(round);
  batches.push(run);
  samples.push(await sample('round-'+round));
  assert.equal(run.listRows,240);
  assert.equal(run.coverNodes,2);
  assert.equal(run.actualCovers,0);
  assert.equal(run.reducedMotionAnimated,0);
  assert.equal(run.modalClosed,true);
  assert.equal(run.song,'Soak track '+(round*160+159));
  assert.equal(run.counters.tracks,(round+1)*160);
 }
 const final=samples.at(-1),after=samples.slice(1);
 const maxNodes=Math.max(...after.map(s=>s.nodes));
 const maxListeners=Math.max(...after.map(s=>s.listeners));
 const maxHeap=Math.max(...after.map(s=>s.heapBytes));
 const maxNodesExtra=maxNodes-baseline.nodes;
 const maxListenersExtra=maxListeners-baseline.listeners;
 const maxHeapExtra=maxHeap-baseline.heapBytes;
 assert.ok(maxNodesExtra<=180,
  'after GC, DOM node count must not accumulate across repeated fixed-size list replacements');
 assert.ok(maxListenersExtra<=60,
  'event listeners must not grow with track/modal/list lifecycle churn');
 // A generous, repeatable guard for runaway *JavaScript* retained growth,
 // not a strong leak-free guarantee or a memory/energy benchmark.
 const heapBudget=Math.max(14*1024*1024,baseline.heapBytes*0.65);
 assert.ok(maxHeapExtra<=heapBudget,
  'post-GC JavaScript heap grew beyond broad smoke-test budget');
 assert.equal(final.documents,baseline.documents,
  'test must not spawn or leak additional document contexts');
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_LONG_SESSION_HEAP_SOAK_PASS '+JSON.stringify({
  rounds:4,syntheticTrackChanges:800,
  modalOpenCloseCycles:batches.at(-1).counters.opens,
  listReplacements:batches.at(-1).counters.replacements,
  simulatedPageRestores:batches.at(-1).counters.restored,
  reducedMotionAnimatedRows:0,
  coverDomNodes:2,stableListRows:240,
  maxNodesExtra,maxListenersExtra,maxHeapExtraBytes:maxHeapExtra,
  heapBudgetBytes:Math.round(heapBudget),samples,
  batchElapsedMs:batches.map(b=>b.elapsedMs),
  realAudioRequests:false,deviceMemoryTest:false
 }));
}finally{
 await cdp?.detach?.().catch(()=>{});
 await browser.close();
}
