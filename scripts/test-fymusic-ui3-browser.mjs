// FyMusic UI3 Stage A: actual Chromium / WebKit rendering and scene-mood checks.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
mkdirSync('.artifacts/ui3-cinematic',{recursive:true});
for(const [engine,launcher] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await launcher.launch({headless:true});
 try{
  for(const width of [1440,390,320]){
   const page=await browser.newPage({viewport:{width,height:900}});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e)));
   try{
    await page.goto(base+'/?theme=dark',{waitUntil:'domcontentloaded',timeout:40000});
    await page.waitForFunction(()=>window.FyMusicCinematic?.scene()==='search',null,{timeout:24000});
    const scenarios=[];
    for(const scene of ['search','playlist','ranking','mylist']){
     if(scene!=='search')await page.evaluate(name=>{
       const anchor=document.querySelector('.nav-item[data-view="'+name+'"]');
       if(!anchor)throw Error('Navigation missing: '+name);
       anchor.click();
     },scene);
     await page.waitForFunction(name=>window.FyMusicCinematic?.scene()===name,scene,{timeout:9000});
     const snap=await page.evaluate(()=>{
       const section=document.querySelector('.view-panel.active');
       const header=section?.querySelector('.view-header');
       const layer=header?.querySelector('.fy3-scene-header');
       return {scene:window.FyMusicCinematic.scene(),gpu:window.FyMusicCinematic.gpu(),
        layer:Boolean(layer),headerHeight:Math.round(header?.getBoundingClientRect().height||0),
        narrow:document.documentElement.scrollWidth>innerWidth+2,
        headerVisible:!!header&&getComputedStyle(header).display!=='none',
        nativeAudio:document.querySelectorAll('audio').length};
     });
     assert.equal(snap.scene,scene);
     assert.equal(snap.layer,snap.gpu,'Shader layer must reflect context availability');
     if(engine==='chromium'&&width===1440){
       const support=await page.evaluate(()=>Boolean(
         document.createElement('canvas').getContext('webgl2')));
       assert.equal(snap.gpu,support,
         'Available Chromium WebGL2 must compile and display actual shaders');
     }
     assert.equal(snap.headerVisible,true);
     assert.ok(snap.headerHeight>=(width<=740?40:52));
     const editorial=await page.evaluate(scene=>{
       const head=document.querySelector('#view-'+scene+' > .view-header');
       const lens=head?.querySelector('.fy3-scene-header');
       const hr=head?.getBoundingClientRect(),lr=lens?.getBoundingClientRect();
       return {
         radius:getComputedStyle(head).borderRadius,
         lensFill:!lr||Math.abs(lr.width-hr.width)<3&&Math.abs(lr.height-hr.height)<3,
         lensSize:lr?[Math.round(lr.width),Math.round(lr.height)]:null,
         headerSize:hr?[Math.round(hr.width),Math.round(hr.height)]:null,
         accent:getComputedStyle(head).backgroundColor,
         transitionCount:window.FyMusicCinematic.transitionCounts().scene
       };
     },scene);
     assert.ok(editorial.radius!=='0px'&&editorial.accent!=='rgba(0, 0, 0, 0)',
       'Every scene requires an editorial header, not an unstyled strip');
     assert.equal(editorial.lensFill,true,
       'GPU must integrate into full header composition, not a floating rectangular lens: '+
        JSON.stringify({header:editorial.headerSize,lens:editorial.lensSize,scene,width}));
     if(scene!=='search')assert.ok(editorial.transitionCount>=1,
       'Navigation must enable a nonblocking scene entrance');
     assert.equal(snap.narrow,false,'No cinematic horizontal scrolling');
     assert.equal(snap.nativeAudio,1,'Original music playback element must be reused');
     scenarios.push({scene,gpu:snap.gpu});
     if(width===1440){
       await page.waitForTimeout(240);
       await page.screenshot({path:'.artifacts/ui3-cinematic/'+engine+'-'+scene+'-dark.png',
         animations:'disabled'});
     }
    }
    await page.evaluate(()=>document.getElementById('ui2-theme-toggle').click());
    await page.waitForFunction(()=>document.documentElement.classList.contains('fy-ui2-light'));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
    if(width===1440)await page.screenshot({path:'.artifacts/ui3-cinematic/'+engine+'-mylist-light.png',animations:'disabled'});
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForFunction(()=>window.FyMusicCinematic.reducedMotion());
    const before=await page.evaluate(()=>window.FyMusicCinematic.transitionCounts().scene);
    await page.evaluate(()=>document.querySelector('.nav-item[data-view="ranking"]').click());
    await page.waitForFunction(()=>window.FyMusicCinematic.scene()==='ranking');
    assert.equal(await page.evaluate(()=>window.FyMusicCinematic.transitionCounts().scene),before,
      'Reduced-motion navigation must not start a decorative WAAPI transition');
    assert.equal(await page.locator('audio').count(),1);
    await page.goto(base+'/?ui2=0',{waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('.fy3-scene').count(),0,
      'Classic mode must not create cinematic canvases');
    assert.deepEqual(errors,[],'Browser did not report script errors');
    console.log('FYMUSIC_UI3_CINEMATIC_BROWSER_PASS',JSON.stringify({engine,width,scenarios,
      classicClean:true,reducedMotion:true,oneNativeAudio:true}));
   }finally{await page.close();}
  }
 }finally{await browser.close();}
}