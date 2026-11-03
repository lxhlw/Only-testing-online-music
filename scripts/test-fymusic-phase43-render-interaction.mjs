import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';

// Phase43 browser-rendering acceptance, NOT a hardware FPS benchmark.
// This churns the real FyMusic DOM and animation scheduler in a visible page.
// It uses synthetic names and no external source resolver or licensed music.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const ENGINE=process.env.BROWSER_ENGINE||'chromium';
assert.ok(['chromium','firefox','webkit'].includes(ENGINE));
const browser=await ({chromium,firefox,webkit})[ENGINE].launch({headless:true});
try{
  const page=await browser.newPage({
    viewport:{width:1366,height:900},reducedMotion:'no-preference'
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error?.message||error).slice(0,160)));
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(
    document.querySelector('#playlist-detail-songs')&&
    document.querySelector('#lyrics-overlay')&&
    document.querySelector('#player-cover-button')&&
    document.querySelector('#lyrics-close-btn')&&
    window.LXPlayerControls?.refresh
  ),null,{timeout:18000});
  const trace=await page.evaluate(async()=>{
    const list=document.querySelector('#playlist-detail-songs');
    const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
    const frameGaps=[];
    let previous=await frame();
    for(let cycle=0;cycle<36;cycle++){
      const fragment=document.createDocumentFragment();
      for(let i=0;i<180;i++){
        const row=document.createElement('div');
        row.className='playlist-song-row';
        row.textContent='Phase43 synthetic '+cycle+' / '+i;
        fragment.appendChild(row);
      }
      list.replaceChildren(fragment);
      const track={id:'phase43-'+cycle,source:'kw',
        name:'Phase43 synthetic '+cycle,singer:'QA fixture',
        albumName:'QA fixture',image:''};
      window.__LXNowPlayingTrack=track;
      window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:track}));
      const now=await frame();
      frameGaps.push(Math.max(0,now-previous));
      previous=now;
    }
    await frame();await frame();
    const sorted=[...frameGaps].sort((a,b)=>a-b);
    const percentile=p=>Math.round(sorted[Math.min(sorted.length-1,
      Math.floor((sorted.length-1)*p))]*10)/10;
    return {
      iterations:36,createdRows:36*180,remainingRows:list.children.length,
      lastRow:list.lastElementChild?.textContent,
      trackTitle:document.querySelector('#lyrics-title')?.textContent,
      audioElements:document.querySelectorAll('audio').length,
      coverNodes:document.querySelectorAll(
        '#player-cover-image,#lyrics-cover-image').length,
      p50FrameGapMs:percentile(.50),p95FrameGapMs:percentile(.95),
      maxFrameGapMs:percentile(1),
      animationSeen:[...list.children].filter(
        item=>item.dataset.motionSeen==='1').length
    };
  });
  assert.equal(trace.iterations,36);
  assert.equal(trace.remainingRows,180,
    'repeated list replacements must not leave accumulated attached rows');
  assert.equal(trace.lastRow,'Phase43 synthetic 35 / 179');
  assert.equal(trace.trackTitle,'Phase43 synthetic 35',
    'latest frame must retain last track instead of stale track');
  assert.equal(trace.audioElements,1,
    'UI animation churn must not create another media element');
  assert.equal(trace.coverNodes,2,
    'UI animation churn must keep only the two stable cover nodes');
  // The p50/p95/max frame samples are evidence only: hosted CI frame
  // pacing is not a valid substitute for 60/120Hz physical-device testing.
  for(let i=0;i<3;i++){
    await page.locator('#player-cover-button').click();
    assert.equal(await page.locator('#lyrics-overlay').getAttribute(
      'aria-hidden'),'false');
    await page.locator('#lyrics-close-btn').click();
    assert.equal(await page.locator('#lyrics-overlay').getAttribute(
      'aria-hidden'),'true');
  }
  const last=await page.locator('#lyrics-title').textContent();
  assert.equal(last,'Phase43 synthetic 35');
  assert.deepEqual(errors,[],'cross-browser animation churn caused page errors');
  console.log('FYMUSIC_PHASE43_RENDER_INTERACTION_PASS_'+ENGINE+' '+
    JSON.stringify({...trace,modalCycles:3,noPageErrors:true,
      originalMedia:false,hardwareFpsClaim:false}));
}finally{
  await browser.close();
}
