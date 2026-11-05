// Stage D extended UI3 browser endurance, NOT a physical-device performance test.
// One native audio element, two reused shader canvases; never request source music.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const folder='.artifacts/ui3-stage-d';
mkdirSync(folder,{recursive:true});
const results=[];
const scenes=['search','playlist','ranking','mylist'];
for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await launcher.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
   for(const theme of ['dark','light']){
    const mobile=viewport.width<=740;
    const page=await browser.newPage({viewport,hasTouch:mobile});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e).slice(0,220)));
    await page.addInitScript(()=>{
      window.__fyEndurance={trustedNavigationClicks:0,longTasks:0,
        longTaskMaxMs:0,longTaskTotalMs:0,observerSupported:false};
      document.addEventListener('click',e=>{
        if(e.isTrusted&&e.target.closest?.('.nav-item[data-view]'))
          window.__fyEndurance.trustedNavigationClicks++;
      },true);
      if(typeof PerformanceObserver==='function'&&
        (PerformanceObserver.supportedEntryTypes||[]).includes('longtask')){
       try{
        const obs=new PerformanceObserver(list=>{
         for(const e of list.getEntries()){
          window.__fyEndurance.longTasks++;
          window.__fyEndurance.longTaskMaxMs=Math.max(window.__fyEndurance.longTaskMaxMs,e.duration);
          window.__fyEndurance.longTaskTotalMs+=e.duration;
         }
        });
        obs.observe({type:'longtask'});
        window.__fyEndurance.observerSupported=true;
       }catch{/* Browser without longtask telemetry. */}
      }
      localStorage.setItem('only-testing-online-music.default-source-disabled','1');
    });
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin===new URL(base).origin)
        return route.continue();
      return route.abort('blockedbyclient');
    });
    try{
     await page.goto(base+'/?theme='+theme,{waitUntil:'domcontentloaded',timeout:45000});
     await page.waitForFunction(()=>window.FyMusicCinematic?.scene()==='search',
       null,{timeout:24000});
     if(mobile)await page.waitForFunction(()=>
       document.documentElement.classList.contains('mobile-shell-ready'),
       null,{timeout:13000});
     const baseline=await page.evaluate(()=>{
       window.__fyInitialAudio=document.querySelector('audio');
       return {audio:document.querySelectorAll('audio').length,
         canvas:document.querySelectorAll('canvas.fy3-scene').length,
         gpu:window.FyMusicCinematic.gpu(),
         jsHeap:performance.memory?.usedJSHeapSize||null};
     });
     assert.equal(baseline.audio,1,'Only original native audio is allowed');
     assert.ok(baseline.canvas<=2,'No duplicate GPU canvas at startup');
     const check=async context=>{
       const s=await page.evaluate(()=>{
        const el=document.querySelector('.player-bar'),r=el?.getBoundingClientRect();
        const scenes=document.querySelectorAll('canvas.fy3-scene');
        const a=document.querySelector('audio');
        return {scene:window.FyMusicCinematic.scene(),
          nativeAudio:document.querySelectorAll('audio').length,
          originalAudio:a===window.__fyInitialAudio,
          gpuCanvases:scenes.length,
          duplicateSceneLayers:document.querySelectorAll('.fy3-scene-header').length>1||
            document.querySelectorAll('.fy3-scene-immersive').length>1,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,
          dockInside:!!r&&r.left>=-2&&r.right<=innerWidth+2&&
            r.top>=0&&r.bottom<=innerHeight+2};
       });
       assert.equal(s.nativeAudio,1,context+' duplicated audio');
       assert.equal(s.originalAudio,true,context+' replaced original audio');
       assert.ok(s.gpuCanvases<=2&&!s.duplicateSceneLayers,context+' leaked GPU canvases');
       assert.ok(!s.horizontalOverflow,context+' overflow');
       assert.ok(s.dockInside,context+' player dock detached');
       return s;
     };
     const nav=async scene=>{
       if(mobile){
        await page.locator('.mobile-menu-button').tap({timeout:6000});
        await page.waitForFunction(()=>
          document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded')==='true',
          null,{timeout:4000});
        await page.waitForFunction(dest=>{
          const r=document.querySelector('.nav-item[data-view="'+dest+'"]')?.getBoundingClientRect();
          return !!r&&r.width>=28&&r.left>=0&&r.right<=innerWidth+2;
        },scene,{timeout:6500});
        await page.locator('.nav-item[data-view="'+scene+'"]').tap({timeout:7000});
        await page.waitForFunction(()=>
          document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded')==='false',
          null,{timeout:4000});
       }else{
        await page.locator('.nav-item[data-view="'+scene+'"]').focus();
        await page.keyboard.press('Enter');
       }
       await page.waitForFunction(dest=>window.FyMusicCinematic?.scene()===dest,
         scene,{timeout:7000});
     };
     for(const scene of ['playlist','ranking','mylist','search'])await nav(scene);
     await check('after trusted navigation');
     const trusted=await page.evaluate(()=>window.__fyEndurance.trustedNavigationClicks);
     assert.ok(trusted>=4,'Four genuine trusted navigation events required');
     // 64 additional yielded scene swaps ensure MutationObservers and rendering run.
     for(let i=0;i<64;i++){
       const expectedScene=scenes[i%4];
       await page.evaluate(async scene=>{
        document.querySelector('.nav-item[data-view="'+scene+'"]').click();
        await new Promise(resolve=>requestAnimationFrame(resolve));
       },expectedScene);
       if(i%8===7){
        const snap=await check('scene cycle '+(i+1));
        assert.equal(snap.scene,expectedScene,'Scene state lost after navigation');
       }
     }
     const sample=await page.evaluate(()=>new Promise(resolve=>{
       const durations=[];
       let prev=0,start=0;
       function tick(t){
        if(!start)start=t;
        if(prev)durations.push(t-prev);
        prev=t;
        if(t-start<2200){requestAnimationFrame(tick);return;}
        durations.sort((a,b)=>a-b);
        const p=f=>durations.length?
          Math.round(durations[Math.min(durations.length-1,
            Math.floor(f*(durations.length-1)))]*100)/100:null;
        resolve({frames:durations.length,p50Ms:p(.5),p95Ms:p(.95),maxMs:p(1)});
       }
       requestAnimationFrame(tick);
     }));
     // Headless RAF activity sanity only; never interpret as physical GPU FPS.
     assert.ok(sample.frames>=5,'Browser animation loop starved');
     const end=await check('post endurance');
     await page.locator('#player-cover-button').click({timeout:7000});
     await page.locator('#lyrics-overlay').waitFor({state:'visible',timeout:6000});
     assert.equal(await page.locator('audio').count(),1,
       'Immersive overlay cannot duplicate media');
     await page.locator('#lyrics-close-btn').click({timeout:7000});
     await page.locator('#lyrics-overlay').waitFor({state:'hidden',timeout:6000});
     await check('after immersive return');
     const measured=await page.evaluate(()=>({
       longTasks:window.__fyEndurance.longTasks,
       longTaskMaxMs:Math.round(window.__fyEndurance.longTaskMaxMs),
       longTaskObserver:window.__fyEndurance.observerSupported,
       trustedClicks:window.__fyEndurance.trustedNavigationClicks,
       heapAfter:performance.memory?.usedJSHeapSize||null
     }));
     assert.deepEqual(errors,[],'Uncaught scripts: '+engine+'/'+viewport.width+'/'+theme);
     await page.screenshot({
       path:folder+'/endurance-'+engine+'-'+viewport.width+'-'+theme+'.png',
       animations:'disabled'
     });
     results.push({engine,width:viewport.width,theme,
       input:mobile?'touch':'keyboard',trustedClicks:measured.trustedClicks,
       sceneChanges:68,nativeAudio:end.nativeAudio,gpuCanvases:end.gpuCanvases,
       headlessRaf:sample,longTaskObserver:measured.longTaskObserver,
       longTaskCount:measured.longTasks,longTaskMaxMs:measured.longTaskMaxMs,
       heapBefore:baseline.jsHeap,heapAfter:measured.heapAfter,
       noOverflow:true,noMediaDuplication:true});
    }finally{await page.close();}
   }
  }
 }finally{await browser.close();}
}
console.log('FYMUSIC_UI3_STAGE_D_ENDURANCE_BROWSER_PASS',JSON.stringify(results));
