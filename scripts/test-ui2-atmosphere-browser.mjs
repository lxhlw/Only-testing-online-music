import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import path from 'node:path';
import {chromium,webkit} from 'playwright';

// Visual-only CI uses a local fixture; strict live music/audio gates run separately.
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const out='.artifacts/ui2-atmosphere';
mkdirSync(out,{recursive:true});
const rows=[];
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:820,height:900},{width:390,height:844},{width:320,height:640}]){
   for(const light of [false,true]){
    const page=await browser.newPage({viewport,hasTouch:viewport.width<=740});
    const errors=[];
    page.on('pageerror',err=>errors.push(String(err).slice(0,170)));
    await page.addInitScript(()=>{
     const source=[
      '/** @name UI2 visual fixture */',
      '(function(){',
      ' var api=globalThis.lx;',
      ' api.on(api.EVENT_NAMES.request,function(){return Promise.resolve({url:"https://media.example.test/song.wav"});});',
      ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{kw:{name:"Kuwo",type:"music",actions:["musicUrl"],qualitys:["128k"]}}});',
      '})();'
     ].join('\n');
     localStorage.setItem('only-testing-online-music.lx-sources',
      JSON.stringify([{id:'ui2-atmosphere-fixture',name:'Visual fixture',code:source,url:'https://example.com/source.js'}]));
     localStorage.setItem('only-testing-online-music.active-source-id','ui2-atmosphere-fixture');
    });
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?
      route.continue():route.abort('blockedbyclient'));
    try{
     await page.goto(base+(light?'/?theme=light':'/'),{waitUntil:'domcontentloaded',timeout:40000});
     await page.waitForFunction(()=>window.FyMusicUI2Preview?.enabled===true,null,{timeout:23000});
     if(viewport.width<=740)await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'));
     const audit=await page.evaluate(()=>{
      const root=document.documentElement,hero=document.querySelector('.search-inspiration'),
       dock=document.querySelector('.player-bar');
      const heroCSS=getComputedStyle(hero),discCSS=getComputedStyle(hero,'::after');
      return {
       ui2:root.classList.contains('fy-ui2'),light:root.classList.contains('fy-ui2-light'),
       accent:getComputedStyle(root).getPropertyValue('--fy-atmosphere-accent').trim(),
       searchBackground:getComputedStyle(document.querySelector('.global-search')).backgroundColor,
       playerBase:getComputedStyle(dock).backgroundColor,
       focusRing:getComputedStyle(document.querySelector('.search-suggestions button'),':focus-visible').outlineStyle,
       dockShadow:getComputedStyle(dock).boxShadow,
       titleWeight:getComputedStyle(document.querySelector('.view-header h1')).fontWeight,
       heroBackground:heroCSS.backgroundImage,recordDisplay:discCSS.display,
       recordContent:discCSS.content,playerBackground:getComputedStyle(dock).backgroundImage,
       audioNodes:document.querySelectorAll('audio').length,
       scrollWidth:root.scrollWidth,screenWidth:innerWidth,scrollY:scrollY,
       cardWidth:hero.getBoundingClientRect().width,
       cardBottom:hero.getBoundingClientRect().bottom,dockTop:dock.getBoundingClientRect().top
      };
     });
     assert.equal(audit.ui2,true);
     assert.equal(audit.light,light);
     if(light){
      const match=audit.searchBackground.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
      assert.ok(match&&(+match[1])+(+match[2])+(+match[3])>540,
       'Light search needs an opaque high-luminance base: '+audit.searchBackground);
      const playerMatch=audit.playerBase.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
      assert.ok(playerMatch&&(+playerMatch[1])+(+playerMatch[2])+(+playerMatch[3])>540,
       'Light player needs an opaque high-luminance base: '+audit.playerBase);
     }
     assert.ok(audit.accent.startsWith('#'));
     assert.ok(audit.heroBackground.includes('gradient'),'Hero has no editorial atmosphere');
     assert.ok(audit.playerBackground.includes('gradient'),'Dock has no atmospheric surface');
     assert.notEqual(audit.dockShadow,'none','Player lacks visual elevation');
     if(viewport.width>=741){
      assert.ok(+audit.titleWeight>=700,'Desktop headline hierarchy weakened');
     }
     assert.equal(audit.audioNodes,1);
     assert.ok(audit.scrollWidth<=audit.screenWidth+2,'Horizontal overflow');
     if(viewport.width>=741){
      const minWidth=viewport.width>=1100?800:470;
      assert.ok(audit.cardWidth>=minWidth,
       'Discovery hero should use editorial content width: '+JSON.stringify(audit));
      assert.ok(audit.cardBottom<=audit.dockTop-12,
       'Desktop discovery content hidden behind fixed player: '+JSON.stringify(audit));
     }
     if(viewport.width===1440){
      assert.notEqual(audit.recordDisplay,'none');
      assert.notEqual(audit.recordContent,'none');
     }
     if(viewport.width===320){
      assert.equal(audit.scrollY,0);
      assert.ok(audit.cardBottom<=audit.dockTop-8,'320px card obstructed by fixed dock');
     }
     assert.deepEqual(errors,[],'Uncaught JS errors: '+engine+'/'+viewport.width+'/'+light);
     const label=engine+'-'+viewport.width+(light?'-light':'-dark');
     await page.screenshot({path:path.join(out,label+'.png'),animations:'disabled'});
     // Real web navigation acceptance. Previous audits only examined the
     // discovery page, missing chart and empty-library theme collisions.
     if(viewport.width===1440){
      const inputCheck=await page.evaluate(()=>{
       const input=document.querySelector('.global-search'),button=document.querySelector('#global-search-btn');
       const x=input.getBoundingClientRect(),b=button.getBoundingClientRect();
       return {within:b.right<=x.right+1,center:Math.abs((b.top+b.bottom)/2-(x.top+x.bottom)/2),contextHidden:getComputedStyle(document.querySelector('.search-context')).display==='none'};
      });
      assert.equal(inputCheck.within,true,'Search button escaped field');
      assert.ok(inputCheck.center<4,'Search button is off-center');
      assert.equal(inputCheck.contextHidden,true,'Redundant search hint wastes width');
      for(const view of ['playlist','ranking','mylist']){
       await page.locator('.nav-item[data-view="'+view+'"]').click();
       await page.waitForFunction(v=>document.getElementById('view-'+v).classList.contains('active'),view);
       const state=await page.evaluate(v=>{
        const color=x=>getComputedStyle(document.querySelector(x)).backgroundColor;
        const title=document.querySelector('#ranking-title');
        const cover=document.querySelector('.playlist-cover');
        return {active:document.querySelector('.view-panel.active')?.id,
         darkRankingText:getComputedStyle(title).color,
         rankingBackground:color('#ranking-title'),
         libraryBackground:color('#view-mylist .music-library-content'),
         coverFit:cover?getComputedStyle(cover).backgroundSize:null,
         audio:document.querySelectorAll('audio').length,
         overflow:document.documentElement.scrollWidth>innerWidth+2};
       },view);
       assert.equal(state.active,'view-'+view);
       assert.equal(state.audio,1,'Navigating must not introduce audio');
       assert.equal(state.overflow,false,'Horizontal overflow on '+view);
       if(view==='ranking'){
        const rgb=state.rankingBackground.match(/\d+/g)?.slice(0,3).map(Number)||[];
        const sum=rgb.reduce((a,b)=>a+b,0);
        assert.ok(light?sum>450:sum<390,'Ranking header wrong-theme slab: '+state.rankingBackground);
       }
       if(view==='mylist'){
        const rgb=state.libraryBackground.match(/\d+/g)?.slice(0,3).map(Number)||[];
        const sum=rgb.reduce((a,b)=>a+b,0);
        assert.ok(light?sum>500:sum<360,'Library panel wrong-theme surface: '+state.libraryBackground);
       }
       if(view==='playlist'&&state.coverFit)assert.equal(state.coverFit,'contain','Playlist covers should not be cropped');
       await page.screenshot({path:path.join(out,label+'-'+view+'.png'),animations:'disabled'});
      }
     }
     rows.push({engine,width:viewport.width,theme:light?'light':'dark',oneAudio:true,noOverflow:true,desktopDockClear:viewport.width>=741?true:null});
    }finally{await page.close()}
   }
  }
 }finally{await browser.close()}
}
console.log('FYMUSIC_UI2_ATMOSPHERE_BROWSER_PASS',JSON.stringify(rows));
