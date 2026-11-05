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
         lensPosition:lens?getComputedStyle(lens).position:null,
         lensSize:lr?[Math.round(lr.width),Math.round(lr.height)]:null,
         headerSize:hr?[Math.round(hr.width),Math.round(hr.height)]:null,
         headerClient:head?[head.clientWidth,head.clientHeight]:null,
         headerTransform:head?getComputedStyle(head).transform:null,
         lensInline:lens?lens.getAttribute('style'):null,
         lensComputed:lens?{
           width:getComputedStyle(lens).width,height:getComputedStyle(lens).height,
           maxWidth:getComputedStyle(lens).maxWidth,
           transform:getComputedStyle(lens).transform,
           scale:getComputedStyle(lens).scale,
           zoom:getComputedStyle(lens).zoom
         }:null,
         accent:getComputedStyle(head).backgroundColor,
         transitionCount:window.FyMusicCinematic.transitionCounts().scene
       };
     },scene);
     assert.ok(editorial.radius!=='0px'&&editorial.accent!=='rgba(0, 0, 0, 0)',
       'Every scene requires an editorial header, not an unstyled strip');
     if(editorial.lensSize)assert.equal(editorial.lensPosition,'absolute',
       'WebGL canvas must not be a flex item (legacy UI2 header rule)');
     assert.equal(editorial.lensFill,true,
       'GPU must integrate into full header composition, not a floating rectangular lens: '+
        JSON.stringify({header:editorial.headerSize,lens:editorial.lensSize,client:editorial.headerClient,transform:editorial.headerTransform,inline:editorial.lensInline,computed:editorial.lensComputed,scene,width}));
     if(scene!=='search')assert.ok(editorial.transitionCount>=1,
       'Navigation must enable a nonblocking scene entrance');
     assert.equal(snap.narrow,false,'No cinematic horizontal scrolling');
     assert.equal(snap.nativeAudio,1,'Original music playback element must be reused');
     if(scene==='search'){
       const discovery=await page.evaluate(()=>{
         const n=document.querySelector('#view-search .search-inspiration');
         const head=document.querySelector('#view-search #search-song-view .results-head');
         return {record:getComputedStyle(n,'::after').animationName,
           introBorder:getComputedStyle(head).borderLeftWidth};
       });
       assert.equal(discovery.record,'fy3-c2-record-drift',
         'Search record atmosphere must be a distinct scene animation');
       assert.ok(parseFloat(discovery.introBorder)>=3);
     }
     if(scene==='ranking'){
       const lane=await page.evaluate(()=>{
         const el=document.querySelector('#ranking-songs');
         const content=document.querySelector('#view-ranking .ranking-content');
         return {empty:el.childElementCount===0,
           minHeight:parseFloat(getComputedStyle(el).minHeight),
           surface:getComputedStyle(content).backgroundImage,
           prompt:getComputedStyle(el,'::before').content};
       });
       assert.ok(lane.surface.includes('gradient'),
         'Ranking content must have its own editorial material');
       if(lane.empty){
         assert.ok(lane.minHeight>=100);
         assert.ok(lane.prompt.includes('选择一张榜单'));
       }
     }
     if(scene==='mylist'){
       const library=await page.evaluate(()=>({
         background:getComputedStyle(document.querySelector('#view-mylist .music-library-content')).backgroundImage
       }));
       assert.ok(library.background.includes('gradient'),
         'Library needs an analog sleeve content material, not a blank sheet');
     }
     if(scene==='playlist'){
       const loading=await page.evaluate(()=>{
         const node=document.getElementById('playlist-featured');
         return {empty:!node?.querySelector(':scope > .playlist-card'),
           display:node?getComputedStyle(node).display:null};
       });
       if(loading.empty){
         await page.waitForTimeout(260);
         const loadingGeometry=await page.evaluate(()=>{
           const filter=document.getElementById('playlist-filter-stack');
           const area=document.getElementById('playlist-featured');
           if(!area.querySelector(':scope > .loading-note'))return null;
           const a=filter.getBoundingClientRect(),b=area.getBoundingClientRect();
           return {gap:b.top-a.bottom,filterPosition:getComputedStyle(filter).position};
         });
         if(loadingGeometry){
           assert.equal(loadingGeometry.filterPosition,'relative',
             'Loading catalog filters must not float over a moving placeholder');
           assert.ok(loadingGeometry.gap>=-2&&loadingGeometry.gap<=38,
             'Filters must precede the loading theater without overlap/gap: '+
               JSON.stringify(loadingGeometry));
         }
         assert.equal(loading.display,'block',
           'Loading playlist text cannot shrink into a one-column grid item');
         const state=await page.evaluate(()=>{
           const host=document.getElementById('playlist-featured');
           const realLoading=host.querySelector(':scope > .loading-note');
           if(!realLoading)return null;
           const css=getComputedStyle(host),ring=getComputedStyle(host,'::after');
           return {height:parseFloat(css.minHeight),
             material:css.backgroundImage,ring:ring.animationName,
             text:realLoading.textContent};
         });
         if(state){
           assert.ok(state.height>=(width<=740?100:140));
           assert.ok(state.material.includes('gradient'));
           assert.equal(state.ring,'fy3-c2-loading-breathe');
           assert.ok(state.text.includes('歌单'),'Keep real loading status text visible');
         }
       }
       // The mobile shell's !important 3-column grid must not override the
       // editorial 2-column card layout after actual cards arrive.
       if(width<=740){
         const actual=await page.evaluate(()=>{
           const el=document.getElementById('playlist-featured');
           if(el.querySelector(':scope > .playlist-card')){
             const css=getComputedStyle(el);
             return {loaded:true,display:css.display,columns:css.gridTemplateColumns};
           }
           return {loaded:false};
         });
         if(actual.loaded){
           assert.equal(actual.display,'grid','Loaded playlists must use a grid');
           assert.equal(actual.columns.trim().split(/\\s+/).length,2,
             'Loaded mobile playlist cards need two editorial columns');
         }
       }
     }
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
    const quiet=await page.evaluate(()=>{
      const record=document.querySelector('#view-search .search-inspiration');
      return getComputedStyle(record,'::after').animationName;
    });
    assert.equal(quiet,'none','Decorative rotating record must stop with reduced motion');
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