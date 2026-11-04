import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const screenshotDir=process.env.UI2_AUDIT_DIR||'.artifacts/ui2-visual';
fs.mkdirSync(screenshotDir,{recursive:true});
const samples=[];
const rgba=value=>{
 const x=value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/);
 return x?[+x[1],+x[2],+x[3]]:null;
};
const luminance=rgb=>{
 const n=rgb.map(v=>{
  v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
 });
 return n[0]*.2126+n[1]*.7152+n[2]*.0722;
};
const contrast=(a,b)=>{
 const hi=Math.max(luminance(a),luminance(b));
 const lo=Math.min(luminance(a),luminance(b));
 return (hi+.05)/(lo+.05);
};
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true});
 try{
  for(const size of [
   {label:'desktop',width:1440,height:900},
   {label:'tablet',width:820,height:900},
   {label:'phone',width:390,height:844},
   {label:'small-phone',width:320,height:640}
  ]){
   const context=await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:1,hasTouch:size.width<=740});
   const page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(String(e).slice(0,150)));
   // Theme-only browser visuals use local fixture; independent live-song
   // acceptance remains unmocked and mandatory. No JS errors are ignored.
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
   await page.route('**/*',route=>{
    if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();
    return route.abort('blockedbyclient');
   });
   await page.goto(base+'/?ui2=1&theme=light',{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.FyMusicUI2Preview?.enabled===true,null,{timeout:20000});
   if(size.width<=740)await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'));
   const state=await page.evaluate(()=>{
    const style=s=>getComputedStyle(document.querySelector(s));
    return {
     theme:document.documentElement.dataset.ui2Theme,
     rootLight:document.documentElement.classList.contains('fy-ui2-light'),
     bg:style('.topbar').backgroundColor,
     inputBg:style('.global-search').backgroundColor,
     title:style('.view-header h1').color,
     titleBg:style('.view-container').backgroundColor,
     playerBg:style('.player-bar').backgroundColor,
     width:document.documentElement.scrollWidth,
     audioCount:document.querySelectorAll('audio').length,
     headerToggleCount:document.querySelectorAll('#ui2-theme-toggle').length,
     settingToggleCount:document.querySelectorAll('#ui2-theme-settings-toggle').length,
     meta:document.querySelector('meta[name="theme-color"]').content
    };
   });
   assert.equal(state.theme,'light');
   assert.equal(state.rootLight,true);
   assert.equal(state.audioCount,1);
   assert.equal(state.headerToggleCount,1);
   assert.equal(state.settingToggleCount,1);
   assert.ok(state.width<=size.width+2,engine+'/'+size.label+' light horizontal overflow');
   for(const [name,color] of [['header',state.bg],['search',state.inputBg],['player',state.playerBg]]){
     const v=rgba(color);
     assert.ok(v&&v.reduce((a,b)=>a+b,0)>540,
       engine+'/'+size.label+' '+name+' should be light: '+color);
   }
   const titleContrast=contrast(rgba(state.title),rgba(state.titleBg));
   assert.ok(titleContrast>=4.5,engine+'/'+size.label+' title contrast '+titleContrast);
   assert.equal(state.meta,'#f4faf6');
   if(engine==='chromium'){
    await page.screenshot({path:path.join(screenshotDir,'ui2-light-'+size.label+'.png'),animations:'disabled'});
   }
   const top=page.locator('#ui2-theme-toggle');
   assert.equal(await top.getAttribute('aria-pressed'),'true');
   await top.focus();
   await page.keyboard.press('Enter');
   await page.waitForFunction(()=>document.documentElement.dataset.ui2Theme==='dark');
   assert.equal(await page.locator('#ui2-theme-settings-toggle').getAttribute('aria-pressed'),'false');
   assert.equal(new URL(page.url()).searchParams.get('theme'),'dark');
   // The settings control is an actual user-facing button in the settings
   // view, so navigate there instead of clicking a hidden tab panel.
   if(size.width<=740){
     await page.locator('.mobile-menu-button').click();
     await page.locator('.nav-item[data-view="settings"]').click();
   }else await page.locator('.nav-item[data-view="settings"]').click();
   await page.waitForFunction(()=>document.documentElement.dataset.activeView==='settings',null,{timeout:7000});
   await page.locator('#ui2-theme-settings-toggle').click();
   await page.waitForFunction(()=>document.documentElement.dataset.ui2Theme==='light');
   assert.equal(await top.getAttribute('aria-pressed'),'true');
   assert.equal(new URL(page.url()).searchParams.get('theme'),'light');
   assert.ok((await page.evaluate(()=>localStorage.getItem('fymusic-ui2-theme')))==='light');
   await page.reload({waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.FyMusicUI2Preview?.theme()==='light');
   assert.equal(await page.locator('audio').count(),1);
   await page.emulateMedia({reducedMotion:'reduce'});
   const transition=await top.evaluate(el=>getComputedStyle(el).transitionDuration);
   assert.ok(transition==='0s'||transition==='1e-05s'||transition==='0.00001s',
     'reduced motion not honored: '+transition);
   assert.deepEqual(errors,[],'unhandled JS errors: '+engine+'/'+size.label);
   samples.push({engine,viewport:size.label,titleContrast:Number(titleContrast.toFixed(2)),
    persisted:true,keyboard:true,oneAudio:true,overflow:false,reducedMotion:true});
   await context.close();
  }
  // Modern mode is default; only ui2=0 keeps the classic website unchanged.
  const page=await browser.newPage();
  await page.goto(base+'/?ui2=0',{waitUntil:'domcontentloaded',timeout:40000});
  assert.equal(await page.locator('#ui2-theme-toggle').count(),0);
  assert.equal(await page.locator('#ui2-theme-settings-toggle').count(),0);
  await page.close();
 }finally{await browser.close();}
}
console.log('FYMUSIC_UI2_LIGHT_A11Y_BROWSER_PASS',JSON.stringify(samples));
