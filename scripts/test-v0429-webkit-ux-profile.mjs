import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const results=[];
for(const [engine,provider] of Object.entries({chromium,webkit})){
 const browser=await provider.launch({headless:true});
 try{
  for(const [width,height] of [[390,844],[1440,900]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:width===390});
   const page=await context.newPage();
   const exceptions=[];
   page.on('pageerror',error=>exceptions.push(String(error.message||error)));
   await page.addInitScript(()=>{
    localStorage.setItem('only-testing-online-music.default-source-disabled','1');
   });
   try{
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
    await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.refresh)&&
      Boolean(document.querySelector('#search-results'))&&
      Boolean(window.OnlyTestingNavigate),null,{timeout:18000});
    const stats=await page.evaluate(async()=>{
      const container=document.querySelector('#search-results');
      const fragment=document.createDocumentFragment();
      for(let i=0;i<240;i++){
        const row=document.createElement('div');
        row.className='search-song-row';
        row.textContent='WebKit 性能审计样本 '+i;
        fragment.append(row);
      }
      container.replaceChildren(fragment);
      const frames=[];
      let prev=await new Promise(requestAnimationFrame);
      for(let i=0;i<135;i++){
        const now=await new Promise(requestAnimationFrame);
        frames.push(now-prev);prev=now;
      }
      const p=frames.slice().sort((a,b)=>a-b);
      const quantile=q=>Number(p[Math.min(p.length-1,
       Math.floor((p.length-1)*q))].toFixed(1));
      return {
        count:container.children.length,
        motionNodes:container.querySelectorAll('.reveal-item').length,
        maxWidth:document.documentElement.scrollWidth,
        viewportWidth:document.documentElement.clientWidth,
        medianMs:quantile(.5),p95Ms:quantile(.95),p99Ms:quantile(.99),
        maxMs:quantile(1),spikesOver50:frames.filter(x=>x>50).length,
        spikesOver100:frames.filter(x=>x>100).length
      };
    });
    assert.equal(stats.count,240);
    assert.ok(stats.motionNodes<=12,'Mutation observer must keep animation budget bounded');
    assert.ok(stats.maxWidth<=width+2,'No width overflow');
    assert.deepEqual(exceptions,[]);
    // Linux headless WebKit has intermittent 100-205ms RAF spikes. This is
    // a recorded regression signal, not a reliable physical Safari FPS gate.
    const result={engine,width,details:stats,jsErrors:exceptions,
      headlessNotPhysicalSafari:true,webkitFrameWarning:engine==='webkit'&&stats.maxMs>80};
    results.push(result);
    console.log('FYMUSIC_V0429_WEBKIT_PROFILE',JSON.stringify(result));
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
assert.equal(results.length,4);
console.log('FYMUSIC_V0429_PROFILE_COMPLETE',JSON.stringify({
 total:results.length,
 webkitLongFrameProfiles:results.filter(x=>x.webkitFrameWarning).length,
 noRuntimeErrors:true,
 performanceClaim:'monitor-only, not proof of real-device fps'
}));
