import assert from 'node:assert/strict';
import {chromium, firefox, webkit} from 'playwright';

const base=process.env.TEST_BASE_URL;
assert.equal(base,'https://only-testing-online-music.pages.dev');
const engines={chromium,firefox,webkit};
const samples=[];
for(const [engine,provider] of Object.entries(engines)){
 const browser=await provider.launch({headless:true,
  ...(engine==='chromium'?{args:['--autoplay-policy=no-user-gesture-required']}:{})});
 try{
  for(const [name,width,height] of [['desktop',1366,900],['mobile',390,844]]){
   const page=await browser.newPage({viewport:{width,height},
    reducedMotion:'no-preference',...(name==='mobile'?{hasTouch:true}:{} )});
   const errors=[],missing=[];
   page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,200)));
   page.on('response',res=>{
     const u=new URL(res.url());
     if(u.origin===base&&res.status()>=400&&
       /^\/(?:src|modern\.css|styles\.css|vendor)/.test(u.pathname))
       missing.push({path:u.pathname,status:res.status()});
   });
   const start=Date.now();
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>
    !!window.LXPlayerControls?.refresh&&
    !!window.LXSourceManager?.getActive&&
    !!document.getElementById('player-cover-button')&&
    !!document.getElementById('lyrics-overlay'),null,{timeout:25000});
   const runtimeWall=Date.now()-start;
   const metrics=await page.evaluate(async()=>{
     const nav=performance.getEntriesByType('navigation')[0];
     const paints=performance.getEntriesByType('paint');
     const fcp=paints.find(x=>x.name==='first-contentful-paint')?.startTime??null;
     const n=120;
     const frames=[];
     let prev=await new Promise(requestAnimationFrame);
     for(let i=0;i<n;i++){
      const t=await new Promise(requestAnimationFrame);
      frames.push(t-prev);prev=t;
     }
     const sorted=frames.slice().sort((a,b)=>a-b);
     const stat=q=>Math.round(sorted[Math.min(sorted.length-1,
      Math.floor((sorted.length-1)*q))]*10)/10;
     return {
      dclMs:Math.round(nav?.domContentLoadedEventEnd||0),
      loadMs:Math.round(nav?.loadEventEnd||0),
      fcpMs:fcp===null?null:Math.round(fcp),
      resources:performance.getEntriesByType('resource').length,
      bytesTransferred:performance.getEntriesByType('resource')
       .reduce((n,r)=>n+(Number(r.transferSize)||0),0),
      scriptTags:document.scripts.length,
      audioElements:document.querySelectorAll('audio').length,
      title:document.title,
      appReady:!!window.LXPlayerControls?.refresh&&
       !!window.LXSourceManager?.getActive,
      p50FrameMs:stat(.5),p95FrameMs:stat(.95),maxFrameMs:stat(1),
      htmlScrollWidth:document.documentElement.scrollWidth,
      viewportWidth:document.documentElement.clientWidth
     };
   });
   assert.equal(metrics.audioElements,1,engine+' single audio');
   assert.ok(metrics.title.includes('FyMusic'),engine+' app title');
   assert.equal(metrics.appReady,true);
   assert.deepEqual(missing,[],engine+' '+name+' first-party asset errors');
   assert.deepEqual(errors,[],engine+' '+name+' page JS errors');
   // CSS/JS loaded in actual browser; frame times are recorded, not used
   // as an assertion since Linux CI is NOT a physical-device FPS benchmark.
   const result={engine,viewport:name,width,height,runtimeWall,
    ...metrics,errors,missing,ciNotPhysicalFps:true};
   console.log('FYMUSIC_FULL_AUDIT_BROWSER',JSON.stringify(result));
   samples.push(result);
   await page.close();
  }
 }finally{await browser.close();}
}
console.log('FYMUSIC_FULL_AUDIT_BROWSER_COMPLETE',JSON.stringify({
 profiles:samples.length,engines:Object.keys(engines),pageErrors:0,
 firstPartyAssetErrors:0,physicalFpsClaim:false
}));
