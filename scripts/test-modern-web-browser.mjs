import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const browser = await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
function makeWav(seconds=8,rate=8000){
  const frames=seconds*rate;
  const out=Buffer.alloc(44+frames*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);
  out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);
  out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);
  out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
  out.write('data',36);out.writeUInt32LE(frames*2,40);
  return out;
}
const fixture = [
  '/** @name 野花🌷 */',
  '(function(){',
  ' var api=globalThis.lx;',
  ' api.on(api.EVENT_NAMES.request, function(input){',
  '  window.__resolvedActions=(window.__resolvedActions||0)+1;',
  '  return Promise.resolve({url:"https://media.example.test/song.wav?id=demo"});',
  ' });',
  ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
  '  wy:{name:"网易云音乐",type:"music",actions:["musicUrl"],qualitys:["128k","320k"]}',
  ' }});',
  '})();'
].join('\n');
const sourceUrl='https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const checks=[];
try {
  const page = await browser.newPage({viewport:{width:1366,height:900}});
  const failures=[], requests=[];
  page.on('pageerror',error=>failures.push(String(error)));
  page.on('request',request=>requests.push(request.url()));
  await page.addInitScript(({sourceUrl,fixture})=>{
    window.__audioPlayCalls=0;
    window.__resolvedActions=0;
    const originalPlay=HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play=function(){
      window.__audioPlayCalls++;
      return originalPlay.apply(this,arguments);
    };
    localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
      {id:'old-huibq',url:'https://example.test/old-source.js',name:'Huibq',code:'/** @name Huibq */'},
      {id:'saved-flower',url:sourceUrl,name:'野花🌷',code:fixture}
    ]));
    localStorage.setItem('only-testing-online-music.active-source-id','old-huibq');
  },{sourceUrl,fixture});
  await page.route('https://media.example.test/**',route=>route.fulfill({
    status:200,contentType:'audio/wav',body:makeWav()
  }));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:14000});
  assert.equal(await page.locator('.brand').textContent(),'LX Music Web');
  assert.equal(await page.locator('#app-version').textContent(),'v0.4.0');
  assert.equal(await page.locator('#top-source-label').textContent(),'当前音源：野花🌷');
  assert.deepEqual(await page.evaluate(()=>window.LXSourceManager.getSources().map(x=>x.name)),['野花🌷']);
  assert.equal(await page.locator('#legacy-media-panel').count(),0);
  await page.locator('[data-view="settings"]').click();
  assert.equal(await page.locator('#source-url').isVisible(),false);
  const lightTheme=await page.evaluate(()=>{
    const css=selector=>getComputedStyle(document.querySelector(selector));
    const contrast=(a,b)=>{
      const toLinear=n=>{n/=255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4};
      const luminance=s=>{const rgb=(s.match(/\\d+(?:\\.\\d+)?/g)||[]).slice(0,3).map(Number);return rgb.length===3?.2126*toLinear(rgb[0])+.7152*toLinear(rgb[1])+.0722*toLinear(rgb[2]):0};
      const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
    };
    return {
      main:css('.main-stage').backgroundColor,
      sidebar:css('.nav-rail').backgroundColor,
      settings:css('.settings-section').backgroundColor,
      headingContrast:contrast(css('.view-header h1').color,css('.main-stage').backgroundColor)
    };
  });
  assert.equal(lightTheme.main,'rgb(244, 248, 242)','Main background must stay eye-care mint');
  assert.equal(lightTheme.sidebar,'rgb(234, 244, 233)','Navigation must be pale green, not charcoal gray');
  assert.equal(lightTheme.settings,'rgb(255, 255, 255)','Settings cards must remain crisp white');
  assert.ok(lightTheme.headingContrast>=7,'Headings must be readable with high contrast: '+JSON.stringify(lightTheme));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.global-search-bar')).display==='none');

  assert.equal(await page.locator('#restore-default-sources-btn').isVisible(),true);
  await page.locator('[data-view="search"]').click();
  assert.equal(await page.locator('.search-inspiration').isVisible(),true,'Search landing must not be a blank canvas');
  assert.equal(await page.locator('.search-suggestions button').count(),5);
  const style=await page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.equal(style,'rgb(244, 248, 242)');
  await page.evaluate(()=>{
    window.LXMusicSearch.resolveMusicUrl=()=>{throw new Error('legacy waterfall invoked')};
    window.LXMusicSearch.resolveMusicUrlFast=()=>{throw new Error('legacy provider race invoked')};
    window.OnlyTestingMusicApp.playMusic({id:'demo',songmid:'demo',name:'成都',singer:'赵雷',source:'wy',interval:8});
  });
  await page.waitForFunction(()=>window.__audioPlayCalls>=1,{timeout:6000});
  const state=await page.evaluate(()=>({
    requests:window.__resolvedActions,
    audioPlays:window.__audioPlayCalls,
    src:document.getElementById('audio').src,
    title:document.getElementById('player-title').textContent
  }));
  assert.equal(state.requests,1,'Modern Flower must resolve exactly once');
  assert.ok(state.audioPlays>=1,'Audio.play must begin without waiting for metadata');
  const mediaUrl=new URL(state.src);
  const target=mediaUrl.pathname==='/api/proxy' ?
    mediaUrl.searchParams.get('url') : mediaUrl.href;
  assert.equal(target,'https://media.example.test/song.wav?id=demo');
  assert.ok(mediaUrl.protocol==='https:'||mediaUrl.origin===new URL(url).origin,
    'Media may stream directly over HTTPS or use the protected first-party proxy');
  assert.equal(state.title,'成都');
  const old=requests.filter(p=>/promise-lite|android-native-|android-external-audio|\/api\/babel|babel\.min\.js/.test(p));
  assert.deepEqual(old,[],'Legacy compatibility scripts must not load');
  assert.deepEqual(failures,[],'No page errors on desktop');
  checks.push('desktop');
  await page.locator('[data-view="playlist"]').click();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('#view-playlist').evaluate(el=>el.classList.contains('active')),true);
  checks.push('navigation');
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(100);
  const measure=await page.evaluate(()=>({
    page:document.documentElement.scrollWidth,
    viewport:window.innerWidth,
    nav:getComputedStyle(document.querySelector('.main-nav')).gridTemplateColumns.split(' ').length,
    controls:document.getElementById('player-toggle-btn').getBoundingClientRect()
  }));
  assert.ok(measure.page<=measure.viewport+2,'No sideways mobile scrolling');
  assert.equal(measure.nav,5,'Five bottom/top mobile navigation choices visible');
  assert.ok(measure.controls.width>=40,'Transport remains easily tappable');
  checks.push('mobile');
  console.log('PASS modern-web:',checks.join(', '),'Flower-only, one request, immediate stream, no legacy assets');
}finally{await browser.close()}
