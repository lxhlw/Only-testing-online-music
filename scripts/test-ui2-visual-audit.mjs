import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const dir=process.env.UI2_AUDIT_DIR||'.artifacts/ui2-visual';
fs.mkdirSync(dir,{recursive:true});
const sizes=[
 {name:'desktop',width:1440,height:900},
 {name:'tablet-large',width:980,height:800},
 {name:'tablet',width:820,height:900},
 {name:'tablet-small',width:741,height:900},
 {name:'mobile',width:390,height:844},
 {name:'mobile-small',width:320,height:640}
];
const results=[];
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true});
 try{
  for(const size of sizes){
   const mobile=size.width<=740,tablet=size.width>740&&size.width<=980;
   const page=await browser.newPage({
    viewport:{width:size.width,height:size.height},deviceScaleFactor:1,hasTouch:mobile
   });
   const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,120)));
   await page.route('**/*',route=>{
     if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();
     return route.abort('blockedbyclient');
   });
   await page.goto(base+'/?ui2=1',{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.FyMusicUI2Preview?.enabled===true,null,{timeout:20000});
   if(mobile)await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'),null,{timeout:10000});
   const state=await page.evaluate(()=>{
    const elem=sel=>document.querySelector(sel);
    const nav=elem('.nav-rail')?.getBoundingClientRect();
    const dock=elem('.player-bar')?.getBoundingClientRect();
    return {scrollWidth:document.documentElement.scrollWidth,width:innerWidth,
     navWidth:nav?.width,dockLeft:dock?.left,dockRight:dock?.right,
     searchBackground:getComputedStyle(elem('.global-search')).backgroundColor,
     audioCount:document.querySelectorAll('audio').length};
   });
   assert.equal(state.audioCount,1,'Must preserve one audio element');
   assert.ok(state.scrollWidth<=size.width+2,'Horizontal overflow '+engine+'/'+size.name+' '+JSON.stringify(state));
   assert.ok(state.dockLeft>=0&&state.dockRight<=size.width+2,'Dock clipping '+engine+'/'+size.name);
   if(tablet){assert.ok(state.navWidth<=90,'Tablet icon rail too wide '+JSON.stringify(state));assert.ok(state.dockLeft>=90,'Tablet dock overlaps rail');}
   const match=state.searchBackground.match(/\d+/g)?.slice(0,3).map(Number);
   assert.ok(match?.length===3&&match.reduce((a,b)=>a+b,0)<400,'Search panel not dark');
   await page.evaluate(()=>{
     const status=document.getElementById('status');if(status){status.textContent='UI 2.0 预览界面';status.className='status global-status';}
   });
   const perf=await page.evaluate(()=>new Promise(resolve=>{
     const frames=[];let start=0,last=0;
     const frame=t=>{
       if(!start){start=t;last=t;requestAnimationFrame(frame);return;}
       frames.push(t-last);last=t;
       if(t-start<1100)requestAnimationFrame(frame);
       else {
        frames.sort((a,b)=>a-b);
        resolve({frames:frames.length,p95FrameGapMs:Number((frames[Math.floor(frames.length*.95)]||0).toFixed(2)),
         maxFrameGapMs:Number((frames.at(-1)||0).toFixed(2)),
         intervalsOver50Ms:frames.filter(d=>d>50).length});
       }
     };requestAnimationFrame(frame);
   }));
   if(engine==='chromium')await page.screenshot({path:path.join(dir,'ui2-'+size.name+'-search.png'),animations:'disabled'});
   if(mobile){await page.locator('.mobile-menu-button').click();await page.locator('.nav-item[data-view="mylist"]').click();}
   else await page.locator('.nav-item[data-view="mylist"]').click();
   await page.waitForFunction(()=>document.documentElement.dataset.activeView==='mylist',null,{timeout:7000});
   assert.equal(await page.locator('#view-mylist .music-library-content').isVisible(),true);
   if(engine==='chromium'&&size.name==='tablet')
     await page.screenshot({path:path.join(dir,'ui2-tablet-library.png'),animations:'disabled'});
   await page.emulateMedia({reducedMotion:'reduce'});
   const reduced=await page.locator('.player-bar').evaluate(e=>getComputedStyle(e).transitionDuration);
   assert.ok(['0s','1e-05s','0.00001s'].includes(reduced),'Reduced motion not respected '+reduced);
   assert.deepEqual(errors,[],'Uncaught browser errors '+engine+'/'+size.name);
   results.push({engine,viewport:size.name,...state,...perf,reducedMotionDock:reduced});
   await page.close();
  }
 }finally{await browser.close()}
}
fs.writeFileSync(path.join(dir,'metrics.json'),JSON.stringify({scope:'GitHub CI browser only, not real-device FPS',results},null,2));
console.log('FYMUSIC_UI2_VISUAL_PERF_AUDIT_PASS',JSON.stringify(results));
