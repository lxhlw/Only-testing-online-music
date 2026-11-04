import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium,webkit } from 'playwright';
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const fixture=[
 '/** @name audio test source */','(function(){',
 ' var api=globalThis.lx;',
 ' api.on(api.EVENT_NAMES.request,function(){return Promise.resolve({url:"https://media.example.test/song.wav"});});',
 ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
 '  kw:{name:"酷我音乐",type:"music",actions:["musicUrl"],qualitys:["128k","320k"]}',
 ' }});','})();'
].join('\n');
function wav(seconds=12,rate=8000){
 const b=Buffer.alloc(44+seconds*rate*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);
 b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);
 b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);
 b.writeUInt32LE(seconds*rate*2,40);return b;
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8X0AAAAASUVORK5CYII=','base64');
const results=[];
// Synthetic artwork/lyrics snapshots are CI fixtures, never real provider evidence.
fs.mkdirSync('.artifacts/ui2-atmosphere/immersive',{recursive:true});
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true,...(engine==='chromium'?{args:['--autoplay-policy=no-user-gesture-required']}:{})});
 try{
  for(const mode of ['desktop','mobile']){
   const desktop=mode==='desktop';
   const page=await browser.newPage({viewport:{width:desktop?1440:390,height:desktop?900:844},hasTouch:!desktop});
   const exceptions=[];
   page.on('pageerror',e=>exceptions.push(String(e)));
   await page.addInitScript(code=>{
    localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
     {id:'ui2-test',name:'Test music source',code,url:'https://example.com/source.js'}
    ]));
    localStorage.setItem('only-testing-online-music.active-source-id','ui2-test');
   },fixture);
   await page.route('https://media.example.test/**',route=>route.fulfill({status:200,body:wav(),contentType:'audio/wav'}));
   await page.route('https://img1.kuwo.cn/**',route=>route.fulfill({status:200,body:png,contentType:'image/png'}));
   await page.route('**/api/kuwo-song-meta?*',route=>route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({id:'440613',source:'kw',name:'稻香',singer:'周杰伦',albumName:'魔杰座',
      image:'https://img1.kuwo.cn/star/albumcover/500/fake.jpg',
      lyric:'[00:00.00]测试歌词一\n[00:01.00]测试歌词二'})}));
   await page.goto(base+'/?ui2=1',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>Boolean(window.OnlyTestingMusicApp?.playMusic)&&
     window.LXSourceManager?.getActive?.()?.inited&&window.FyMusicUI2Preview?.enabled,null,{timeout:22000});
   await page.waitForFunction(()=>window.FyMusicUI2AudioVisualizer?.spectrumPresent()===true,null,{timeout:8000});
   const theme=await page.evaluate(()=>({
    root:document.documentElement.classList.contains('fy-ui2'),
    bg:getComputedStyle(document.querySelector('.lyrics-sheet.now-playing-screen')).backgroundColor,
    dock:getComputedStyle(document.querySelector('.player-bar')).borderRadius,
    dockPos:getComputedStyle(document.querySelector('.player-bar')).position,
    audioNodes:document.querySelectorAll('audio').length,
    overflow:document.documentElement.scrollWidth>window.innerWidth+2
   }));
   assert.equal(theme.root,true);
   assert.equal(theme.audioNodes,1,'Only the original audio element may exist');

   const vizBefore=await page.evaluate(()=>({
    mode:window.FyMusicUI2AudioVisualizer?.mode(),
    count:document.querySelectorAll('#ui2-audio-spectrum canvas').length
   }));
   assert.equal(vizBefore.count,1,'Exactly one visualizer canvas');
   assert.equal(vizBefore.mode,'idle','Visualizer should be idle before playback');

   assert.equal(theme.overflow,false,'UI2 must not create horizontal overflow');
   if(desktop){
     assert.equal(theme.dockPos,'fixed');
     assert.ok(parseFloat(theme.dock)>18,'Desktop player must be floating, not squared off');
     assert.equal(await page.locator('.player-bar').evaluate(e=>parseFloat(getComputedStyle(e).left)>200),true);
   } else {
     assert.ok(parseFloat(theme.dock)<20,'Mobile layout must retain current shell; UI2 desktop only');
   }
   await page.evaluate(()=>{
    const b=document.createElement('button');b.id='ui2-start';
    b.textContent='test click';b.style.cssText='position:fixed;top:12px;left:12px;z-index:2147483647';
    b.onclick=()=>window.OnlyTestingMusicApp.playMusic({
     source:'kw',id:'440613',songmid:'440613',name:'稻香',singer:'周杰伦',
     albumName:'魔杰座',interval:12
    });
    document.body.appendChild(b);
   });
   await page.locator('#ui2-start').click();
   await page.waitForFunction(()=>document.getElementById('audio')?.currentTime>.35,null,{timeout:18000});

   const afterPlay=await page.evaluate(()=>({
    mode:window.FyMusicUI2AudioVisualizer?.mode(),
    oneAudio:window.FyMusicUI2AudioVisualizer?.originalAudio(),
    originalCurrentTime:document.getElementById('audio').currentTime,
    visible:getComputedStyle(document.getElementById('ui2-audio-spectrum')).display!=='none'
   }));
   assert.equal(afterPlay.oneAudio,true,'Capture must not replace native audio');
   assert.ok(afterPlay.originalCurrentTime>.35,'Real native audio playback must advance');
   assert.equal(afterPlay.visible,desktop,'Spectrum remains hidden on narrow screens');
   assert.ok(['ambient','live','idle'].includes(afterPlay.mode),
     'Visualizer must label its state without claiming unsupported FFT');

   await page.locator('#player-cover-button').click();
   await page.locator('#lyrics-overlay').waitFor({state:'visible',timeout:5000});
   await page.waitForFunction(()=>document.querySelectorAll('#lyrics-lines .lyrics-line').length>=2&&
     document.getElementById('lyrics-cover-image')?.naturalWidth>0,null,{timeout:9000});
   await page.waitForFunction(()=>window.FyMusicUI2Preview.artworkActive(),null,{timeout:6000});
   const state=await page.evaluate(()=>{
    const btn=document.getElementById('detail-toggle-btn');
    return {
     open:window.FyMusicUI2Preview.immersiveOpen(),
     overlayPosition:getComputedStyle(document.getElementById('lyrics-overlay')).position,
     lyricCount:document.querySelectorAll('#lyrics-lines .lyrics-line').length,
     coverWidth:document.getElementById('lyrics-cover-image').naturalWidth,
     artwork:window.FyMusicUI2Preview.artworkActive(),
     play:btn.getAttribute('aria-label')
    };
   });
   assert.deepEqual([state.open,state.lyricCount,state.artwork,state.play],[true,2,true,'暂停']);
   // Capture both themes while the real single audio element is playing the
   // local WAV fixture. Explicitly mark these as synthetic visual snapshots.
   await page.locator('#ui2-start').evaluate(el=>el.remove());
   const immersion=await page.evaluate(()=>{
    const box=document.getElementById('lyrics-overlay');
    const sleeve=document.querySelector('.now-playing-cover-box');
    const detail=document.querySelector('.now-playing-detail-column');
    return {
     overlayWidth:box.clientWidth,
     overlayScrollWidth:box.scrollWidth,
     coverWidth:sleeve.getBoundingClientRect().width,
     lyricsWidth:detail.getBoundingClientRect().width,
     audioNodes:document.querySelectorAll('audio').length
    };
   });
   assert.equal(immersion.audioNodes,1);
   assert.ok(immersion.coverWidth>0&&immersion.lyricsWidth>0,'Immersive album and lyrics must be visible');
   assert.ok(immersion.overlayScrollWidth<=immersion.overlayWidth+3,
    'Immersive screen must not overflow horizontally: '+JSON.stringify(immersion));
   const shot='.artifacts/ui2-atmosphere/immersive/'+engine+'-'+mode;
   await page.screenshot({path:shot+'-dark.png',animations:'disabled'});
   await page.evaluate(()=>document.getElementById('ui2-theme-toggle').click());
   await page.waitForFunction(()=>document.documentElement.classList.contains('fy-ui2-light'));
   assert.equal(await page.locator('#lyrics-overlay').isVisible(),true);
   assert.equal(await page.locator('#audio').count(),1);
   await page.screenshot({path:shot+'-light.png',animations:'disabled'});
   await page.evaluate(()=>document.getElementById('ui2-theme-toggle').click());
   await page.waitForFunction(()=>!document.documentElement.classList.contains('fy-ui2-light'));
   await page.locator('#detail-toggle-btn').click();
   await page.waitForFunction(()=>document.getElementById('audio')?.paused===true,null,{timeout:6000});
   assert.equal(await page.locator('#detail-toggle-btn').getAttribute('aria-label'),'播放');
   await page.locator('#detail-toggle-btn').click();
   await page.waitForFunction(()=>document.getElementById('audio')?.paused===false,null,{timeout:8000});
   await page.locator('#lyrics-close-btn').click();
   await page.waitForFunction(()=>!window.FyMusicUI2Preview.immersiveOpen()&&
     !window.FyMusicUI2Preview.artworkActive(),null,{timeout:5000});
   assert.deepEqual(exceptions,[]);
   if(desktop){
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.player-bar').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
   }
   results.push({engine,mode,theme,playing:true,cover:true,lyrics:state.lyricCount,artworkCleared:true});
   await page.close();
  }
 }finally{await browser.close();}
}
console.log('FYMUSIC_UI2_DESKTOP_MOBILE_BROWSER_PASS',JSON.stringify(results));
