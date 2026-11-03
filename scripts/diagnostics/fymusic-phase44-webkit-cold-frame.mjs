import assert from 'node:assert/strict';
import {webkit} from 'playwright';
import {writeFileSync} from 'node:fs';

// Phase44 cold-session diagnostic. A RAF delay is an observation, NOT a
// reliable hardware-FPS attribution. Split synchronous JS DOM churn from
// time waiting for the compositor/browser to supply the next RAF callback.
const URL_BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const traces=[];
for(let trial=1;trial<=4;trial++){
 const browser=await webkit.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:900},
   reducedMotion:'no-preference'});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.goto(URL_BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(
    window.LXPlayerControls?.refresh&&
    document.querySelector('#playlist-detail-songs')&&
    document.querySelector('#player-cover-button')
  ),null,{timeout:18000});
  const data=await page.evaluate(async()=>{
   const list=document.querySelector('#playlist-detail-songs');
   const frame=()=>new Promise(resolve=>
     requestAnimationFrame(()=>resolve(performance.now())));
   let prior=await frame();
   const frames=[];
   for(let cycle=0;cycle<36;cycle++){
    const start=performance.now();
    const frag=document.createDocumentFragment();
    for(let i=0;i<180;i++){
     const row=document.createElement('div');
     row.className='playlist-song-row';
     row.textContent='Phase44 frame attribution '+cycle+' '+i;
     frag.appendChild(row);
    }
    list.replaceChildren(frag);
    const track={id:'phase44-'+cycle,source:'kw',
     name:'Phase44 cold '+cycle,singer:'Original QA',image:''};
    window.__LXNowPlayingTrack=track;
    window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:track}));
    const endWork=performance.now();
    const now=await frame();
    frames.push({cycle,frameGapMs:Math.round((now-prior)*10)/10,
      syncWorkMs:Math.round((endWork-start)*10)/10,
      rafWaitMs:Math.round((now-endWork)*10)/10});
    prior=now;
   }
   return {
    frames,visibility:document.visibilityState,
    finalRows:list.children.length,
    audioCount:document.querySelectorAll('audio').length,
    lastTitle:document.querySelector('#lyrics-title')?.textContent,
    covers:document.querySelectorAll(
     '#player-cover-image,#lyrics-cover-image').length
   };
  });
  assert.equal(data.finalRows,180);
  assert.equal(data.audioCount,1);
  assert.equal(data.covers,2);
  assert.equal(data.lastTitle,'Phase44 cold 35');
  assert.deepEqual(errors,[]);
  const frames=[...data.frames].sort((a,b)=>a.frameGapMs-b.frameGapMs);
  const p95=frames[Math.floor((frames.length-1)*.95)].frameGapMs;
  const worst=frames.at(-1);
  const slow=data.frames.filter(x=>x.frameGapMs>=100);
  const report={trial,engine:'webkit',visibility:data.visibility,
    count:frames.length,p95FrameGapMs:p95,
    maxFrameGapMs:worst.frameGapMs,maxCycle:worst.cycle,
    maxCycleSyncWorkMs:worst.syncWorkMs,
    maxCycleRafWaitMs:worst.rafWaitMs,
    maxSyncWorkMs:Math.max(...data.frames.map(x=>x.syncWorkMs)),
    maxRafWaitMs:Math.max(...data.frames.map(x=>x.rafWaitMs)),
    slowFrames:slow,noPageErrors:true,
    siteHtmlAudioElements:1,
    diagnosticLimits:'CI headless WebKit; no CPU profiler or physical device'};
  traces.push(report);
  console.log('FYMUSIC_PHASE44_WEBKIT_COLD_FRAME_PASS '+
    JSON.stringify(report));
 }finally{await browser.close()}
}
const allSlow=traces.flatMap(x=>x.slowFrames);
const summary={sessions:traces.length,
 maxFrameGapMs:Math.max(...traces.map(x=>x.maxFrameGapMs)),
 slowFrames100ms:allSlow.length,
 hasUnattributedSlowFrame:allSlow.some(x=>x.rafWaitMs>100),
 crossSessionEvidence:true,canClaimUserHardwareFps:false,
 realDeviceReviewStillRequired:true,traces};
if(process.env.FYMUSIC_PHASE44_COLD_REPORT)
 writeFileSync(process.env.FYMUSIC_PHASE44_COLD_REPORT,
  JSON.stringify(summary,null,2)+'\n');
console.log('FYMUSIC_PHASE44_WEBKIT_COLD_SUMMARY '+JSON.stringify({
 sessions:summary.sessions,maxFrameGapMs:summary.maxFrameGapMs,
 slowFrames100ms:summary.slowFrames100ms,
 hasUnattributedSlowFrame:summary.hasUnattributedSlowFrame,
 realDeviceReviewStillRequired:true
}));
