import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {webkit} from 'playwright';

// Phase45: balance main and an explicitly curated candidate in the SAME CI
// browser environment. This is evidence about hosted headless WebKit only:
// do not translate RAF gaps to hardware FPS or declare a production defect.
const BASE=process.env.FYMUSIC_BASE_URL||'http://127.0.0.1:8787';
const CANDIDATE=process.env.FYMUSIC_CANDIDATE_URL||'http://127.0.0.1:8788';
const OUT=process.env.FYMUSIC_PHASE45_AB_REPORT||'';
const PAIRS=Number(process.env.FYMUSIC_PHASE45_PAIRS||8);
assert.ok(Number.isSafeInteger(PAIRS)&&PAIRS>=4&&PAIRS<=16);
assert.notEqual(new URL(BASE).origin,new URL(CANDIDATE).origin,
  'independent origins are required for baseline and candidate');

const round=value=>Math.round(value*10)/10;
const quantile=(array,p)=>{
 const sorted=[...array].sort((a,b)=>a-b);
 return sorted[Math.floor((sorted.length-1)*p)];
};
const versions={main:BASE,candidate:CANDIDATE};
const samples=[];
for(let pair=1;pair<=PAIRS;pair++){
 const browser=await webkit.launch({headless:true});
 const order=pair%2===1?['main','candidate']:['candidate','main'];
 try{
  for(const variant of order){
   const page=await browser.newPage({
    viewport:{width:1366,height:900},reducedMotion:'no-preference'
   });
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,180)));
   // No third-party audio, signed URLs, or metadata are exercised.
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    return u.origin===new URL(versions[variant]).origin
      ?route.continue():route.abort();
   });
   await page.goto(versions[variant],{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>Boolean(
    document.querySelector('#playlist-detail-songs')&&
    document.querySelector('#audio')&&
    document.querySelector('#lyrics-title')&&
    window.LXPlayerControls?.refresh
   ),null,{timeout:18000});
   const measurement=await page.evaluate(async variant=>{
    const list=document.querySelector('#playlist-detail-songs');
    const trackChange=window.CustomEvent;
    const nextFrame=()=>new Promise(resolve=>
      requestAnimationFrame(()=>resolve(performance.now())));
    let previous=await nextFrame();
    const records=[];
    for(let cycle=0;cycle<36;cycle++){
      const start=performance.now();
      const fragment=document.createDocumentFragment();
      for(let i=0;i<180;i++){
        const row=document.createElement('div');
        row.className='playlist-song-row';
        row.textContent='Phase45 neutral row '+cycle+' '+i;
        fragment.appendChild(row);
      }
      list.replaceChildren(fragment);
      const track={
        id:'phase45-'+cycle,source:'kw',name:'Phase45 '+cycle,
        singer:'Original QA',albumName:'Original QA',image:''
      };
      window.__LXNowPlayingTrack=track;
      window.dispatchEvent(new trackChange('lx:trackchange',{detail:track}));
      const endWork=performance.now();
      const next=await nextFrame();
      records.push({
        cycle,frameGapMs:round(next-previous),
        syncWorkMs:round(endWork-start),
        rafWaitMs:round(next-endWork)
      });
      previous=next;
    }
    // Idle frame controls distinguish animation/event work from general
    // browser scheduling under CI. These still share the loaded app page.
    const idle=[];
    for(let i=0;i<12;i++){
      const next=await nextFrame();
      idle.push(round(next-previous));
      previous=next;
    }
    const n=performance.getEntriesByType('navigation')[0];
    return {
      variant,records,idle,visibility:document.visibilityState,
      brand:document.querySelector('.brand')?.textContent?.trim()||null,
      navigationDclMs:n?round(n.domContentLoadedEventEnd-n.startTime):null,
      finalRows:list.children.length,
      lastRow:list.lastElementChild?.textContent,
      audioElements:document.querySelectorAll('audio').length
    };
   },variant);
   assert.equal(measurement.finalRows,180);
   assert.equal(measurement.lastRow,'Phase45 neutral row 35 179');
   assert.equal(measurement.audioElements,1);
   assert.equal(measurement.visibility,'visible');
   assert.deepEqual(errors,[],variant+' page errors');
   const gaps=measurement.records.map(x=>x.frameGapMs);
   const synchronous=measurement.records.map(x=>x.syncWorkMs);
   const waits=measurement.records.map(x=>x.rafWaitMs);
   const result={
    pair,variant,order:order.join('→'),brand:measurement.brand,
    dclMs:measurement.navigationDclMs,cycles:gaps.length,
    p50Ms:quantile(gaps,.5),p95Ms:quantile(gaps,.95),
    maxMs:Math.max(...gaps),
    firstFrameGapMs:gaps[0],maxSyncWorkMs:Math.max(...synchronous),
    maxRafWaitMs:Math.max(...waits),
    over100ms:gaps.filter(x=>x>=100).length,
    idleP95Ms:quantile(measurement.idle,.95),
    idleMaxMs:Math.max(...measurement.idle),
    pageErrors:0,audioElements:1,
    records:measurement.records
   };
   samples.push(result);
   console.log('FYMUSIC_PHASE45_AB_SAMPLE '+JSON.stringify({
    pair,variant,order:result.order,brand:result.brand,
    p95Ms:result.p95Ms,maxMs:result.maxMs,
    firstFrameGapMs:result.firstFrameGapMs,
    maxSyncWorkMs:result.maxSyncWorkMs,
    maxRafWaitMs:result.maxRafWaitMs,
    over100ms:result.over100ms,idleMaxMs:result.idleMaxMs
   }));
   await page.close();
  }
 }finally{await browser.close()}
}
const summarize=variant=>{
 const all=samples.filter(s=>s.variant===variant);
 return {
  sessions:all.length,
  firstPositionSessions:all.filter(s=>s.order.startsWith(variant)).length,
  p95PerSessionMs:all.map(s=>s.p95Ms),
  maxPerSessionMs:all.map(s=>s.maxMs),
  firstFrameGapMs:all.map(s=>s.firstFrameGapMs),
  globalMaxMs:Math.max(...all.map(s=>s.maxMs)),
  slowFrames100Ms:all.reduce((n,s)=>n+s.over100ms,0),
  over100MsSessionCount:all.filter(s=>s.over100ms>0).length,
  maxSyncWorkMs:Math.max(...all.map(s=>s.maxSyncWorkMs)),
  maxRafWaitMs:Math.max(...all.map(s=>s.maxRafWaitMs)),
  idleGlobalMaxMs:Math.max(...all.map(s=>s.idleMaxMs))
 };
};
const baseline=summarize('main');
const candidate=summarize('candidate');
assert.equal(baseline.sessions,PAIRS);
assert.equal(candidate.sessions,PAIRS);
assert.equal(baseline.firstPositionSessions,PAIRS/2);
assert.equal(candidate.firstPositionSessions,PAIRS/2);
const result={
 audit:'phase45-main-versus-curated-candidate',
 environment:'headless Playwright WebKit running in shared GitHub Actions CI',
 baselineSha:'c9a496ab580fb54775721b93a3944800bcaefc44',
 pairedSessions:PAIRS,cyclesEach:36,
 baseline,candidate,samples,
 conclusion:
 'Descriptive paired CI evidence only; cannot validate physical Safari/iOS FPS.',
 physicalDeviceStillRequired:true,releasePermissionGranted:false
};
if(OUT)writeFileSync(OUT,JSON.stringify(result,null,2)+'\n');
console.log('FYMUSIC_PHASE45_AB_SUMMARY '+JSON.stringify({
 pairedSessions:PAIRS,baseline,candidate,physicalDeviceStillRequired:true
}));
