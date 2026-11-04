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