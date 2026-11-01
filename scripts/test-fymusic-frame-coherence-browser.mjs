import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Deterministic browser UX regression. This uses only in-page synthetic text
// and HTMLAudioElement events; it does not pretend to decode real Flower media.
const BASE=process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];
 page.on('pageerror',error=>errors.push(String(error.message||error).slice(0,100)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXSourceManager?.getActive &&
   document.querySelector('#player-lyric') &&
   document.querySelector('#lyrics-overlay') &&
   document.documentElement.dataset.activeView),
   null,{timeout:18000});
 await page.waitForTimeout(450);
 const state=await page.evaluate(async()=>{
   const status=document.querySelector('#status');
   const source=document.querySelector('#top-source-label');
   const lyrics=document.querySelector('#lyrics-lines');
   const search=document.querySelector('#search-results');
   if(!status||!source||!lyrics||!search)throw Error('missing modern UI node');
   const row=document.createElement('div');
   row.className='lyrics-line active';
   row.textContent='FyMusic synthetic frame coherence QA';
   const reveal=document.createElement('div');
   reveal.className='synthetic-frame-row';
   // All four independent observers are notified inside ONE JS task. The
   // old one-slot scheduler ran only the first and silently lost the others.
   status.textContent='正在解析 synthetic frame QA';
   source.textContent='stale source label';
   lyrics.replaceChildren(row);
   search.appendChild(reveal);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const expected='当前音源：'+(window.LXSourceManager.getActive()?.name||'正在准备');
   return {
     resolving:document.documentElement.classList.contains('is-resolving'),
     source:source.textContent,expected,
     smallLyric:document.querySelector('#player-lyric')?.textContent,
     animated:reveal.dataset.motionSeen==='1',
     footer:document.querySelector('#bottom-play-status')?.textContent
   };
 });
 assert.equal(state.resolving,true,'status update was lost within the frame');
 assert.equal(state.source,state.expected,'source update was dropped by the scheduler');
 assert.match(state.smallLyric,/FyMusic synthetic frame coherence QA/,
   'lyric summary update was dropped');
 assert.equal(state.animated,true,'list animation was dropped');
 assert.match(state.footer,/正在解析/,
   'footer status must match the latest state');
 // The immersive modal is closed. It must not continuously render hidden
 // playback controls on every timeupdate, but opening it must catch up.
 const dormant=await page.evaluate(async()=>{
   const audio=document.querySelector('#audio');
   const time=document.querySelector('#detail-current-time');
   const overlay=document.querySelector('#lyrics-overlay');
   if(!overlay.classList.contains('hidden'))throw Error('overlay unexpectedly open');
   const before=time.textContent;
   Object.defineProperty(audio,'currentTime',{configurable:true,get:()=>47});
   Object.defineProperty(audio,'duration',{configurable:true,get:()=>200});
   let mutations=0;
   const observer=new MutationObserver(entries=>{mutations+=entries.length});
   observer.observe(time,{childList:true,characterData:true,subtree:true});
   for(let i=0;i<12;i++)audio.dispatchEvent(new Event('timeupdate'));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   observer.disconnect();
   return {before,after:time.textContent,mutations};
 });
 assert.equal(dormant.mutations,0,
   'closed immersive screen should not rewrite hidden time labels');
 await page.locator('#player-cover-button').click();
 const opened=await page.locator('#detail-current-time').textContent();
 assert.equal(opened,'0:47',
   'opening immersive player must update to current media position');
 const shown=await page.locator('#lyrics-overlay').getAttribute('aria-hidden');
 assert.equal(shown,'false');
 await page.locator('#lyrics-close-btn').click();
 assert.equal(await page.locator('#lyrics-overlay').getAttribute('aria-hidden'),'true');
 assert.deepEqual(errors,[], 'modern UI scheduling caused page exceptions');
 console.log('FYMUSIC_FRAME_COHERENCE_BROWSER_PASS '+JSON.stringify({
   statusSynced:true,sourceSynced:true,lyricSynced:true,
   listMotionSynced:true,footerSynced:true,hiddenTransportIdle:true,
   modalReopenCatchUp:true
 }));
}finally{await browser.close();}
