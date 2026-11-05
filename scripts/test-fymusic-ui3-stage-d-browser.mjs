// Stage D: deterministic browser acceptance, not a physical-device benchmark.
// Existing strict original-provider media tests run separately and unchanged.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,webkit} from 'playwright';

const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const dir='.artifacts/ui3-stage-d';
mkdirSync(dir,{recursive:true});
const observations=[];
const sizes=[{width:1440,height:900},{width:820,height:900},
  {width:390,height:844},{width:320,height:640}];

for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await launcher.launch({headless:true});
 try{
  for(const viewport of sizes){
   for(const theme of ['dark','light']){
    const page=await browser.newPage({viewport,hasTouch:viewport.width<=740});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e).slice(0,200)));
    await page.addInitScript(()=>{
      // Instrument the test page only. Count WebGL draws, never inspect pixels,
      // sample audio, read provider URLs, or add analytics.
      window.__fyStageD={draws:0};
      const proto=window.WebGL2RenderingContext?.prototype;
      if(proto){
        const actual=proto.drawArrays;
        proto.drawArrays=function(...args){
          window.__fyStageD.draws++;
          return actual.apply(this,args);
        };
      }
      localStorage.setItem('only-testing-online-music.default-source-disabled','1');
    });
    // Self-contained visual fixture: no third-party song, account or artwork.
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();
      return route.abort('blockedbyclient');
    });
    try{
      await page.goto(base+'/?theme='+theme,{waitUntil:'domcontentloaded',timeout:45000});
      await page.waitForFunction(()=>window.FyMusicCinematic?.scene()==='search',
        null,{timeout:24000});
      if(viewport.width<=740)await page.waitForFunction(()=>
        document.documentElement.classList.contains('mobile-shell-ready'),
        null,{timeout:13000});
      await page.locator('#global-search-input').focus();
      assert.equal(await page.evaluate(()=>
        document.activeElement?.id),'global-search-input',
        'Search must accept keyboard focus');

      // On desktop, navigate a real link with Enter once; other views reuse
      // the same preexisting navigation handler (no artificial state mutation).
      if(viewport.width>=741){
        await page.locator('.nav-item[data-view="playlist"]').focus();
        await page.keyboard.press('Enter');
      }else{
        await page.evaluate(()=>document.querySelector('.nav-item[data-view="playlist"]').click());
      }
      await page.waitForFunction(()=>window.FyMusicCinematic.scene()==='playlist',
        null,{timeout:9000});

      const scenes=['playlist','ranking','mylist','search','playlist','ranking','mylist','search'];
      const checks=[];
      for(const scene of scenes){
        await page.evaluate(scene=>{
          document.querySelector('.nav-item[data-view="'+scene+'"]').click();
        },scene);
        await page.waitForFunction(scene=>window.FyMusicCinematic?.scene()===scene,
          scene,{timeout:9000});
        const snapshot=await page.evaluate(()=>{
          const panel=document.querySelector('.view-panel.active');
          const header=panel?.querySelector(':scope > .view-header');
          const dock=document.querySelector('.player-bar');
          const dr=dock?.getBoundingClientRect();
          const canvas=header?.querySelector('.fy3-scene-header');
          const cv=canvas?.getBoundingClientRect();
          const hr=header?.getBoundingClientRect();
          const filters=document.getElementById('playlist-filter-stack');
          const loading=document.querySelector('#playlist-featured > .loading-note');
          let loadingGap=null;
          if(panel?.id==='view-playlist'&&loading){
            loadingGap=document.getElementById('playlist-featured').getBoundingClientRect().top-
              filters.getBoundingClientRect().bottom;
          }
          return {
            scene:window.FyMusicCinematic.scene(),
            gpu:window.FyMusicCinematic.gpu(),
            contextCount:document.querySelectorAll('canvas.fy3-scene').length,
            nativeAudio:document.querySelectorAll('audio').length,
            rootOverflow:document.documentElement.scrollWidth>innerWidth+2,
            dockInside:!!dr&&dr.left>=-2&&dr.right<=innerWidth+2&&
              dr.top>=0&&dr.bottom<=innerHeight+2,
            headerCanvasHidden:!canvas||getComputedStyle(canvas).display==='none',
            headerFill:!cv||!hr||Math.abs(cv.width-hr.width)<3&&Math.abs(cv.height-hr.height)<3,
            canvasAriaHidden:!canvas||canvas.getAttribute('aria-hidden')==='true',
            loadingGap
          };
        });
        assert.equal(snapshot.scene,scene,engine+' navigation failed');
        assert.equal(snapshot.nativeAudio,1,'Original single audio must persist');
        assert.ok(!snapshot.rootOverflow,'Horizontal overflow: '+JSON.stringify({engine,viewport,theme,scene}));
        assert.ok(snapshot.dockInside,'Dock escapes viewport '+JSON.stringify({engine,viewport,theme,scene}));
        assert.ok(snapshot.headerFill,'GPU header not aligned '+JSON.stringify({engine,viewport,theme,scene}));
        assert.ok(snapshot.canvasAriaHidden,'Decorative GPU must be hidden from screen readers');
        assert.ok(snapshot.contextCount<=2,'Repeated navigation leaked GPU canvases');
        if(snapshot.loadingGap!==null)assert.ok(snapshot.loadingGap>=-2&&snapshot.loadingGap<=38,
          'Playlist loading filter overlaps its content '+JSON.stringify(snapshot));
        if(checks.length===0)assert.equal(snapshot.contextCount,snapshot.gpu?2:0,
          'Each UI3 page should reuse exactly two GPU canvases or fall back cleanly');
        checks.push(snapshot.scene);
        if(checks.length<=4)await page.screenshot({
          path:dir+'/'+engine+'-'+viewport.width+'-'+theme+'-'+scene+'.png',
          animations:'disabled'
        });
      }

      // The headless CI browser provides a useful draw-cadence sanity sample,
      // NOT a physical GPU/frame-time/battery benchmark.
      const before=await page.evaluate(()=>window.__fyStageD.draws);
      await page.waitForTimeout(520);
      const after=await page.evaluate(()=>window.__fyStageD.draws);
      const drawSample=after-before;
      if(await page.evaluate(()=>window.FyMusicCinematic.gpu())){
        assert.ok(drawSample>=2&&drawSample<=110,
          'GPU must animate with bounded draw cadence in visible tab: '+drawSample);
      }
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.waitForFunction(()=>window.FyMusicCinematic.reducedMotion(),null,{timeout:6000});
      await page.waitForTimeout(160);
      const reducedBefore=await page.evaluate(()=>window.__fyStageD.draws);
      await page.waitForTimeout(330);
      const reducedAfter=await page.evaluate(()=>window.__fyStageD.draws);
      assert.ok(reducedAfter-reducedBefore<=2,
        'Reduced motion must stop continuous GPU animation');
      const reducedCSS=await page.evaluate(()=>({
        record:getComputedStyle(document.querySelector('.search-inspiration'),'::after').animationName,
        loader:getComputedStyle(document.querySelector('#playlist-featured'),'::after').animationName
      }));
      assert.equal(reducedCSS.record,'none','Record must not rotate under reduced motion');
      assert.equal(reducedCSS.loader,'none','Loading ornament must not pulse under reduced motion');

      await page.emulateMedia({forcedColors:'active',reducedMotion:'reduce'});
      const contrast=await page.evaluate(()=>{
        const canvas=document.querySelector('.fy3-scene');
        const active=document.querySelector('.view-panel.active>.view-header');
        return {canvasHidden:!canvas||getComputedStyle(canvas).display==='none',
          bg:getComputedStyle(active).backgroundColor};
      });
      assert.ok(contrast.canvasHidden,'High-contrast mode must hide decorative canvases');
      assert.equal(await page.locator('audio').count(),1);
      assert.deepEqual(errors,[],'Uncaught scripts: '+engine+'/'+viewport.width+'/'+theme);
      observations.push({engine,width:viewport.width,theme,scenes:checks.length,
        gpuDrawsIn520ms:drawSample,reducedMotionDraws:reducedAfter-reducedBefore,
        highContrast:true,oneAudio:true,overflow:false,keyboard:true});
    }finally{await page.close();}
   }
  }
 }finally{await browser.close();}
}
console.log('FYMUSIC_UI3_STAGE_D_BROWSER_ACCEPTANCE_PASS',JSON.stringify(observations));
