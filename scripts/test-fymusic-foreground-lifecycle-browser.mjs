import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Controlled mobile lifecycle and BFCache fixture. No external Flower
// availability or licensed media is involved: only event/UI state is verified.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,
  hasTouch:true,reducedMotion:'reduce'});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,130)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.cancelSeek &&
  window.LXSourceManager?.getActive && document.querySelector('#detail-seek') &&
  document.documentElement.dataset.activeView),null,{timeout:18000});
 await page.evaluate(()=>{
   const audio=document.querySelector('#audio');
   const calls={play:0,load:0,seekWrites:0};
   window.__fymusicLifecycleCalls=calls;
   window.__fymusicHidden=false;
   Object.defineProperty(document,'hidden',{configurable:true,
     get:()=>window.__fymusicHidden});
   let current=30,paused=false;
   Object.defineProperty(audio,'currentTime',{configurable:true,
     get:()=>current,set:value=>{calls.seekWrites++;current=Number(value)}});
   Object.defineProperty(audio,'duration',{configurable:true,get:()=>200});
   Object.defineProperty(audio,'paused',{configurable:true,get:()=>paused,
     set:value=>{paused=Boolean(value)}});
   Object.defineProperty(audio,'ended',{configurable:true,get:()=>false});
   Object.defineProperty(audio,'readyState',{configurable:true,get:()=>4});
   audio.play=()=>{calls.play++;return Promise.resolve()};
   audio.load=()=>{calls.load++};
   window.__fymusicSetTime=value=>{current=value};
   window.__fymusicSetPaused=value=>{paused=value};
   // Phase41 bounded lifecycle diagnostics; no mutation of player behavior.
   const trace=[];window.__phase41ForegroundTrace=trace;
   const record=event=>{
     const status=document.querySelector('#status');
     const a=document.querySelector('#audio');
     trace.push({event,at:Math.round(performance.now()*10)/10,
       hidden:document.hidden,hasFocus:document.hasFocus(),
       status:(status?.textContent||'').slice(0,100),
       isResolving:document.documentElement.classList.contains('is-resolving'),
       isPlaying:document.documentElement.classList.contains('is-playing'),
       currentTime:a?.currentTime,paused:a?.paused});
     if(trace.length>90)trace.shift();
   };
   window.__phase41Record=record;
   const status=document.querySelector('#status');
   if(status)new MutationObserver(()=>record('status-mutation'))
     .observe(status,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
   new MutationObserver(()=>record('root-class'))
     .observe(document.documentElement,{attributes:true,attributeFilter:['class']});
   for(const event of ['visibilitychange','timeupdate'])
     document.addEventListener(event,()=>record('document-'+event),{passive:true});
   for(const event of ['pagehide','pageshow'])
     window.addEventListener(event,()=>record('window-'+event),{passive:true});
   record('fixture-ready');
 });
 const frame=()=>page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>
   requestAnimationFrame(done))));
 await page.locator('#player-cover-button').tap();
 assert.equal(await page.locator('#lyrics-overlay').getAttribute('aria-hidden'),'false');
 const first=await page.locator('#detail-current-time').textContent();
 assert.equal(first,'0:30');
 // A touch preview that has not emitted change must be *cancelled* when
 // the browser backgrounds the page, and must never seek on return.
 await page.evaluate(()=>{
   const small=document.querySelector('#player-seek');
   const full=document.querySelector('#detail-seek');
   small.disabled=false;full.disabled=false;
   full.value='725';
   full.dispatchEvent(new Event('input',{bubbles:true}));
 });
 assert.equal(await page.locator('#detail-current-time').textContent(),'2:25');
 await page.evaluate(()=>{
   window.__fymusicHidden=true;
   document.dispatchEvent(new Event('visibilitychange'));
   const status=document.querySelector('#status');
   status.textContent='正在准备 synthetic background status';
   document.querySelector('#top-source-label').textContent='stale';
   document.querySelector('#lyrics-lines').replaceChildren(
     Object.assign(document.createElement('div'),{className:'lyrics-line active',
       textContent:'FyMusic foreground lifecycle lyric'}));
   window.__fymusicSetTime(70);
   const audio=document.querySelector('#audio');
   audio.dispatchEvent(new Event('timeupdate'));
   window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
 });
 const hidden=await page.evaluate(()=>({
   mediaTime:document.querySelector('#audio').currentTime,
   previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),
   seek:document.querySelector('#detail-seek').value,
   calls:{...window.__fymusicLifecycleCalls}
 }));
 assert.equal(hidden.mediaTime,70);
 assert.equal(hidden.previewHidden,true,'hidden transition must clear unfinished seek');
 assert.equal(hidden.calls.seekWrites,0,'background state must not write currentTime');
 assert.equal(hidden.calls.play,0);
 assert.equal(hidden.calls.load,0);
 await page.evaluate(()=>{
   window.__phase41Record('before-visible-dispatch');
   window.__fymusicHidden=false;
   document.dispatchEvent(new Event('visibilitychange'));
   window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
   window.__phase41Record('after-visible-dispatch');
 });
 await frame();
 const visible=await page.evaluate(()=>{
   const root=document.documentElement;
   return {
     status:document.querySelector('#status')?.textContent,
     statusClass:document.querySelector('#status')?.className,
     trace:window.__phase41ForegroundTrace.slice(-70),
     resolving:root.classList.contains('is-resolving'),
     playing:root.classList.contains('is-playing'),
     footer:document.querySelector('#bottom-play-status')?.textContent,
     source:document.querySelector('#top-source-label')?.textContent,
     expectedSource:'当前音源：'+(window.LXSourceManager?.getActive?.()?.name||'正在准备'),
     lyric:document.querySelector('#player-lyric')?.textContent,
     detailTime:document.querySelector('#detail-current-time')?.textContent,
     detailValue:document.querySelector('#detail-seek')?.value,
     playback:document.querySelector('#audio').currentTime,
     calls:{...window.__fymusicLifecycleCalls}
   };
 });
 console.log('FYMUSIC_PHASE41_FOREGROUND_DIAGNOSTIC '+JSON.stringify(visible));
 // The app's asynchronous source initialization may legitimately update
 // #status AFTER foreground reconciliation. Compare the status class and
 // footer against the latest atomic UI snapshot, not against an obsolete
 // synthetic "正在准备" message. This preserves strict status coherence.
 const statusValue=String(visible.status||'').toLowerCase();
 const shouldResolve=/正在|连接|请求|解析|等待|下载|准备/.test(statusValue)&&
   !/已开始播放|搜索完成|已经播放/.test(statusValue);
 assert.equal(visible.resolving,shouldResolve,
   'foreground must reflect the latest actual status, including an async source init');
 assert.equal(visible.playing,true,'foreground must resync audio playing indicator');
 assert.equal(visible.footer,(visible.status||'就绪').slice(0,44),
   'footer must match the currently rendered status after foreground');
 assert.equal(visible.source,visible.expectedSource);
 assert.match(visible.lyric,/FyMusic foreground lifecycle lyric/);
 assert.equal(visible.detailTime,'1:10');
 assert.equal(visible.detailValue,'350');
 assert.equal(visible.playback,70,'restored UI must not force a new seek');
 assert.deepEqual(visible.calls,{play:0,load:0,seekWrites:0},
   'foreground/BFCache restore must never start, load, or seek media');
 // A pause or play event after restoration should reflect the *current*
 // audio element without reinitializing the player.
 await page.evaluate(()=>{
   window.__fymusicSetPaused(true);
   document.querySelector('#audio').dispatchEvent(new Event('pause'));
 });
 await frame();
 assert.equal(await page.evaluate(()=>
   document.documentElement.classList.contains('is-playing')),false);
 await page.evaluate(()=>{
   window.__fymusicSetPaused(false);
   document.querySelector('#audio').dispatchEvent(new Event('playing'));
 });
 await frame();
 assert.equal(await page.evaluate(()=>
   document.documentElement.classList.contains('is-playing')),true);
 await page.locator('#lyrics-close-btn').tap();
 assert.equal(await page.locator('#lyrics-overlay').getAttribute('aria-hidden'),'true');
 // Hidden-to-visible without the immersive screen must not open it.
 await page.evaluate(()=>{
   window.__fymusicHidden=true;
   document.dispatchEvent(new Event('visibilitychange'));
   window.__fymusicHidden=false;
   document.dispatchEvent(new Event('visibilitychange'));
 });
 await frame();
 assert.equal(await page.locator('#lyrics-overlay').getAttribute('aria-hidden'),'true');
 assert.deepEqual(await page.evaluate(()=>window.__fymusicLifecycleCalls),
   {play:0,load:0,seekWrites:0});
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_FOREGROUND_LIFECYCLE_PASS '+JSON.stringify({
   backgroundSeekPreviewCancelled:true,foregroundStateReconciled:true,
   statusDerivedFromLatestText:true,asyncSourceStatusMaySupersedeFixture:true,
   bfcacheShowRestoresUi:true,miniAndImmersiveCoherent:true,
   pauseResumeReflectsAudio:true,noAutomaticPlayLoadOrSeek:true,
   hiddenOverlayStaysClosed:true,syntheticOnly:true
 }));
}finally{await browser.close()}
