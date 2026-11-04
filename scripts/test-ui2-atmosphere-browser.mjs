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
  for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:640}]){
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
       heroBackground:heroCSS.backgroundImage,recordDisplay:discCSS.display,
       recordContent:discCSS.content,playerBackground:getComputedStyle(dock).backgroundImage,
       audioNodes:document.querySelectorAll('audio').length,
       scrollWidth:root.scrollWidth,screenWidth:innerWidth,scrollY:scrollY,
       cardBottom:hero.getBoundingClientRect().bottom,dockTop:dock.getBoundingClientRect().top
      };
     });
     assert.equal(audit.ui2,true);
     assert.equal(audit.light,light);
     if(light){
      const match=audit.searchBackground.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
      assert.ok(match&&(+match[1])+(+match[2])+(+match[3])>540,
       'Light search needs an opaque high-luminance base: '+audit.searchBackground);
     }
     assert.ok(audit.accent.startsWith('#'));
     assert.ok(audit.heroBackground.includes('gradient'),'Hero has no editorial atmosphere');
     assert.ok(audit.playerBackground.includes('gradient'),'Dock has no atmospheric surface');
     assert.equal(audit.audioNodes,1);
     assert.ok(audit.scrollWidth<=audit.screenWidth+2,'Horizontal overflow');
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
     rows.push({engine,width:viewport.width,theme:light?'light':'dark',oneAudio:true,noOverflow:true});
    }finally{await page.close()}
   }
  }
 }finally{await browser.close()}
}
console.log('FYMUSIC_UI2_ATMOSPHERE_BROWSER_PASS',JSON.stringify(rows));
