// Stage 5.3: isolated, deterministic browser gate for the safe FFT path.
// Synthesised oscillator stream is TEST-ONLY; it is not claimed to represent
// third-party music, real-provider frequency access or physical hardware FPS.
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {chromium} from 'playwright';

const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const mediaUrl=base+'/__fymusic_stage53_local_tone.wav';
const out='.artifacts/ui2-atmosphere/visualizer';
mkdirSync(out,{recursive:true});
function wav(seconds=12,rate=8000){
  const samples=seconds*rate,buf=Buffer.alloc(44+samples*2);
  buf.write('RIFF',0);buf.writeUInt32LE(buf.length-8,4);
  buf.write('WAVE',8);buf.write('fmt ',12);
  buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);
  buf.writeUInt16LE(1,22);buf.writeUInt32LE(rate,24);
  buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);
  buf.writeUInt16LE(16,34);buf.write('data',36);
  buf.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++){
    const amp=Math.round(9000*Math.sin(Math.PI*2*220*i/rate));
    buf.writeInt16LE(amp,44+i*2);
  }
  return buf;
}
const sound=wav();
const fixtureSource=[
  '/** @name FYMUSIC Stage 5.3 local only */','(function(){',
  'var api=globalThis.lx;',
  'api.on(api.EVENT_NAMES.request,function(){return Promise.resolve({url:'+JSON.stringify(mediaUrl)+'});});',
  'api.send(api.EVENT_NAMES.inited,{status:true,sources:{kw:{name:"Local",type:"music",actions:["musicUrl"],qualitys:["128k"]}}});',
  '})();'
].join('\n');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const cases=[];
try {
 for(const forcedCapture of [true,false]){
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];
  page.on('pageerror',err=>errors.push(String(err).slice(0,190)));
  await page.addInitScript(({source,forced})=>{
    localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
      {id:'stage53-local',name:'Stage53 synthetic fixture',code:source,url:'https://example.test/local.js'}
    ]));
    localStorage.setItem('only-testing-online-music.active-source-id','stage53-local');
    window.__stage53CaptureCalls=0;
    // This test never alters an actual provider or production media element.
    // A muted oscillator enters only an independent MediaStream analyser graph.
    if(forced){
      Object.defineProperty(HTMLMediaElement.prototype,'captureStream',{
        configurable:true,value:function(){
          window.__stage53CaptureCalls++;
          const ctx=new (window.AudioContext||window.webkitAudioContext)();
          const oscillator=ctx.createOscillator();
          const destination=ctx.createMediaStreamDestination();
          oscillator.frequency.value=330;
          oscillator.connect(destination);
          oscillator.start();
          ctx.resume?.().catch(()=>{});
          window.__stage53Signal={ctx,oscillator};
          return destination.stream;
        }
      });
    }else{
      // Inaccessible third-party audio should NOT give invented FFT movement.
      Object.defineProperty(HTMLMediaElement.prototype,'captureStream',{configurable:true,value:undefined});
      if('mozCaptureStream'in HTMLMediaElement.prototype)
        Object.defineProperty(HTMLMediaElement.prototype,'mozCaptureStream',{configurable:true,value:undefined});
    }
  },{source:fixtureSource,forced:forcedCapture});
  await page.route(mediaUrl,route=>route.fulfill({status:200,body:sound,contentType:'audio/wav'}));
  await page.route('**/api/kuwo-song-meta?*',route=>route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({id:'440613',source:'kw',name:'测试音频',singer:'本地测试',albumName:'测试',
      lyric:'[00:00.00]第一行\n[00:01.00]第二行'})
  }));
  try{
   await page.goto(base+'/?theme=dark',{waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>Boolean(window.OnlyTestingMusicApp?.playMusic)&&
     window.LXSourceManager?.getActive?.()?.inited&&
     window.FyMusicUI2AudioVisualizer?.spectrumPresent(),null,{timeout:23000});
   assert.equal(await page.locator('audio').count(),1);
   await page.evaluate(()=>{
     const button=document.createElement('button');
     button.id='start-stage53';button.textContent='start local media';
     button.style.cssText='position:fixed;top:0;left:0;z-index:99999';
     button.onclick=()=>window.OnlyTestingMusicApp.playMusic({
       source:'kw',id:'440613',songmid:'440613',name:'测试音频',
       singer:'本地测试',albumName:'测试',interval:12
     });
     document.body.appendChild(button);
   });
   await page.locator('#start-stage53').click();
   await page.waitForFunction(()=>document.getElementById('audio')?.currentTime>.35,null,{timeout:16000});
   await page.waitForFunction(expected=>{
     const v=window.FyMusicUI2AudioVisualizer;
     if(!v)return false;
     return expected?v.mode()==='live'&&v.liveFrames()>=2:v.mode()==='ambient';
   },forcedCapture,{timeout:9000});
   const play=await page.evaluate(()=>({
     nativeCurrentTime:document.getElementById('audio').currentTime,
     audioNodes:document.querySelectorAll('audio').length,
     mode:window.FyMusicUI2AudioVisualizer.mode(),
     captureCalls:window.__stage53CaptureCalls,
     activeClass:document.documentElement.classList.contains('fy-ui2-audio-live'),
     spectrumWidth:document.getElementById('ui2-audio-spectrum').getBoundingClientRect().width
   }));
   assert.ok(play.nativeCurrentTime>.35);
   assert.equal(play.audioNodes,1);
   assert.equal(await page.evaluate(()=>window.FyMusicUI2AudioVisualizer.bands()),64);
   assert.equal(await page.locator('#fy3-immersive-spectrum canvas').count(),1);
   assert.ok(play.spectrumWidth>90&&play.spectrumWidth<150);
   assert.equal(play.activeClass,forcedCapture);
   if(forcedCapture)assert.ok(play.captureCalls>=1);
   await page.screenshot({
     path:out+'/'+(forcedCapture?'live':'static')+'-dark.png',animations:'disabled'
   });
   await page.locator('#player-toggle-btn').click();
   await page.waitForFunction(()=>document.getElementById('audio')?.paused===true &&
     window.FyMusicUI2AudioVisualizer?.mode()==='idle',null,{timeout:5500});
   const paused=await page.evaluate(()=>window.FyMusicUI2AudioVisualizer.liveFrames());
   await page.waitForTimeout(170);
   assert.equal(await page.evaluate(()=>window.FyMusicUI2AudioVisualizer.liveFrames()),paused,
     'No spectrum frames while native playback is paused');
   await page.locator('#player-toggle-btn').click();
   await page.waitForFunction(()=>document.getElementById('audio')?.paused===false,null,{timeout:7500});
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>window.FyMusicUI2AudioVisualizer?.mode()==='idle',null,{timeout:4500});
   assert.equal(await page.locator('audio').evaluate(a=>a.paused),false,
     'Reduced motion cannot interrupt the original song');
   await page.emulateMedia({reducedMotion:'no-preference'});
   await page.locator('#ui2-theme-toggle').click();
   await page.waitForFunction(()=>document.documentElement.classList.contains('fy-ui2-light'));
   await page.locator('#player-cover-button').click();
   await page.locator('#lyrics-overlay').waitFor({state:'visible',timeout:5000});
   const cover=await page.evaluate(()=>{
     const node=document.querySelector('.now-playing-album-column');
     return {background:getComputedStyle(node,'::before').backgroundImage,
       audioNodes:document.querySelectorAll('audio').length};
   });
   assert.ok(cover.background.includes('gradient'),'Immersive cover glow missing');
   assert.equal(cover.audioNodes,1);
   const stage=await page.locator('#fy3-immersive-spectrum').evaluate(el=>({
     width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height,
     canvases:el.querySelectorAll('canvas').length
   }));
   assert.ok(stage.width>=240&&stage.height>=50&&stage.canvases===1,
    'Immersive spectrum must be displayed without replacing the original album cover');
   await page.screenshot({path:out+'/'+(forcedCapture?'live':'static')+'-light-cover.png',
     animations:'disabled'});
   assert.deepEqual(errors,[]);
   cases.push({fixture:forcedCapture?'separate test oscillator':'uncapturable test media',
     nativeAudio:true,realProvider:false,pausedStops:true,reducedMotionStops:true,mode:play.mode});
  } finally{
   await page.evaluate(()=>{
     const x=window.__stage53Signal;
     if(x){try{x.oscillator.stop();}catch{};try{x.ctx.close();}catch{}}
   }).catch(()=>{});
   await page.close();
  }
 }
 const classic=await browser.newPage();
 try{
  await classic.goto(base+'/?ui2=0',{waitUntil:'domcontentloaded',timeout:30000});
  assert.equal(await classic.locator('#ui2-audio-spectrum').count(),0,
   'Classic UI should not instantiate the modern audio spectrum');
 }finally{await classic.close()}
}finally{await browser.close()}
console.log('FYMUSIC_STAGE53_CAPTURE_ONLY_SPECTRUM_BROWSER_PASS',JSON.stringify(cases));