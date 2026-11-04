import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
// Simulated UI reachability; physical FPS/CPU/real screen-reader unverified.
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const rows=[];
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true});
 try{
  for(const viewport of [{width:1440,height:900},{width:320,height:640}]){
   for(const item of [
    {path:'/',ui2:true,light:false,label:'default'},
    {path:'/?theme=light',ui2:true,light:true,label:'default-light'},
    {path:'/?ui2=1',ui2:true,light:false,label:'explicit-new'},
    {path:'/?ui2=0&theme=light',ui2:false,light:false,label:'classic-opt-out'}
   ]){
    const page=await browser.newPage({viewport,hasTouch:viewport.width===320});
    const errors=[];
    page.on('pageerror',e=>{
     // The visual-only harness explicitly blocks all external URLs, which
     // makes the legacy XMLHttpRequest adapter throw an expected browser
     // network exception. Audio/provider correctness is gated separately
     // by strict real-source CI. Do not mask unrelated JS exceptions.
     const message=String(e.message||'');
     if(/^XMLHttpRequest cannot load https?:/.test(message))return;
     errors.push(e.name+':'+message.slice(0,100));
    });
    // Seed a deterministic, local-only LX source to prevent the visual
    // layout test from contacting external catalogs. Live real-source tests
    // remain strict and entirely separate.
    await page.addInitScript(()=>{
     const fixture=[
      '/** @name UI2 fixture source */',
      '(function(){',
      ' var api=globalThis.lx;',
      ' api.on(api.EVENT_NAMES.request,function(){return Promise.resolve({url:"https://media.example.test/song.wav"});});',
      ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{kw:{name:"Kuwo",type:"music",actions:["musicUrl"],qualitys:["128k"]}}});',
      '})();'
     ].join('\n');
     localStorage.setItem('only-testing-online-music.lx-sources',
      JSON.stringify([{id:'ui2-layout-test',name:'UI2 fixture',code:fixture,url:'https://example.com/source.js'}]));
     localStorage.setItem('only-testing-online-music.active-source-id','ui2-layout-test');
    });
    await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?
      route.continue():route.abort('blockedbyclient'));
    try{
     await page.goto(base+item.path,{waitUntil:'domcontentloaded',timeout:40000});
     await page.waitForFunction(()=>typeof window.OnlyTestingMusicApp?.playMusic==='function',null,{timeout:23000});
     if(item.ui2)await page.waitForFunction(()=>window.FyMusicUI2Preview?.enabled===true,null,{timeout:18000});
     if(viewport.width===320)await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'),null,{timeout:18000});
     const s=await page.evaluate(()=>{
      const root=document.documentElement,h=document.querySelector('.search-inspiration'),
       d=document.querySelector('.player-bar');
      return {ui2:root.classList.contains('fy-ui2'),light:root.classList.contains('fy-ui2-light'),
       themeButtons:document.querySelectorAll('#ui2-theme-toggle').length,
       settingsButtons:document.querySelectorAll('#ui2-theme-settings-toggle').length,
       audioNodes:document.querySelectorAll('audio').length,
       noOverflow:root.scrollWidth<=innerWidth+2,scrollY:scrollY,
       cardBottom:h?.getBoundingClientRect().bottom,dockTop:d?.getBoundingClientRect().top,
       meta:document.querySelector('meta[name="theme-color"]')?.content};
     });
     assert.equal(s.ui2,item.ui2,engine+'/'+item.label);
     assert.equal(s.light,item.light,engine+'/'+item.label);
     assert.equal(s.themeButtons,item.ui2?1:0);
     assert.equal(s.settingsButtons,item.ui2?1:0);
     assert.equal(s.audioNodes,1);
     assert.equal(s.noOverflow,true,engine+'/'+item.label+' horizontal overflow');
     if(item.ui2&&viewport.width===320){
      assert.equal(s.scrollY,0);
      assert.ok(Number.isFinite(s.cardBottom)&&Number.isFinite(s.dockTop)&&
       s.cardBottom<=s.dockTop-8,'320px first-screen card behind dock '+JSON.stringify(s));
     }
     if(!item.ui2){
      assert.equal(s.meta,'#f4f8f2');
      await page.reload({waitUntil:'domcontentloaded'});
      assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('fy-ui2')),false);
     }
     assert.deepEqual(errors,[]);
     rows.push({engine,width:viewport.width,mode:item.label,oneAudio:true,noOverflow:true});
    }finally{await page.close()}
   }
  }
 }finally{await browser.close()}
}
console.log('FYMUSIC_UI2_DEFAULT_LEGACY_GATE_PASS',JSON.stringify(rows));
