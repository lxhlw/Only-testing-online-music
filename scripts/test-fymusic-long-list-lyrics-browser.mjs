import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Synthetic DOM performance/interaction regression, never claimed as live
// Flower music, licensed media, or a real network playlist.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e?.message||e).slice(0,120)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXMusicLyrics?.getActiveLine&&
   document.querySelector('#playlist-detail-songs')&&
   document.querySelector('#lyrics-scroll')&&
   document.querySelector('#player-cover-button')),
   null,{timeout:18000});
 await page.waitForTimeout(400);
 const lists=await page.evaluate(async()=>{
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const node=document.querySelector('#playlist-detail-songs');
   const make=(from,count)=>{
     const frag=document.createDocumentFragment();
     for(let i=from;i<from+count;i++){
       const row=document.createElement('div');
       row.className='playlist-song-row';
       row.textContent='Synthetic list row '+i;
       frag.appendChild(row);
     }
     return frag;
   };
   node.replaceChildren(make(0,700));
   await frame();
   const initial=[...node.children].filter(x=>x.dataset.motionSeen==='1').length;
   node.appendChild(make(700,250));
   await frame();
   const newRows=[...node.children].slice(700);
   const appended=newRows.filter(x=>x.dataset.motionSeen==='1').length;
   const initialStill=[...node.children].slice(0,700).filter(x=>x.dataset.motionSeen==='1').length;
   return {total:node.children.length,initial,appended,initialStill,
     newFirstAnimated:newRows[0]?.dataset.motionSeen==='1'};
 });
 assert.deepEqual(lists,{total:950,initial:12,appended:12,initialStill:12,
   newFirstAnimated:true},
  'each long-list append must animate only twelve newly appended rows');
 const lyrics=await page.evaluate(()=>{
   const raw=window.LXMusicLyrics;
   let reads=0;
   const lines=Array.from({length:65536},(_,i)=>({
     get time(){reads++;return i*.25},text:'Synthetic lyric '+i
   }));
   const times=[-1,0,.1,1.2,154.75,819.25,4096,16383.75,20000];
   let maxReads=0;
   for(const time of times){
     reads=0;
     const result=raw.getActiveLine(lines,time);
     const expected=Math.min(65535,Math.max(0,Math.floor(time/.25)));
     if(result!==expected)return {error:'wrong timestamp result',time,result,expected};
     maxReads=Math.max(maxReads,reads);
   }
   const duplicate=[{time:0},{time:1},{time:1},{time:1},{time:2}];
   const duplicateResult=raw.getActiveLine(duplicate,1);
   return {maxReads,duplicateResult,largeCount:lines.length};
 });
 assert.equal(lyrics.error,undefined,JSON.stringify(lyrics));
 assert.equal(lyrics.duplicateResult,3,
   'same timestamp must still select last matching lyric line');
 assert.ok(lyrics.maxReads<=17,
   'synchronized lyric lookup must be logarithmic not a 65k row scan');
 await page.locator('#player-cover-button').click();
 const scrolls=await page.evaluate(async()=>{
   const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   const root=document.querySelector('#lyrics-scroll');
   const lines=document.querySelector('#lyrics-lines');
   root.style.height='220px';
   root.style.overflowY='auto';
   const frag=document.createDocumentFragment();
   for(let i=0;i<100;i++){
     const row=document.createElement('div');
     row.className='lyrics-line'+(i===0?' active':'');
     row.dataset.lyricIndex=String(i);
     row.textContent='Synthetic lyric entry '+i;
     row.style.minHeight='32px';
     frag.appendChild(row);
   }
   lines.replaceChildren(frag);
   await frame();
   const calls=[];
   root.scrollTo=arg=>{calls.push({top:arg.top,behavior:arg.behavior});
     root.scrollTop=arg.top;};
   let prior=lines.children[0];
   for(let i=1;i<85;i++){
     const next=lines.children[i];
     prior.classList.remove('active');
     next.classList.add('active');
     prior=next;
   }
   await frame();
   const inOneFrame=calls.length;
   const activeText=lines.querySelector('.lyrics-line.active')?.textContent;
   calls.length=0;
   // Once the listener switches tracks, queued centering must not be
   // applied to the previous song after the user closes the overlay.
   lines.children[85].classList.add('active');
   prior.classList.remove('active');
   window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:{
     source:'kw',id:'synthetic-rapid-switch',name:'Synthetic QA track',
     singer:'FyMusic test',albumName:'Fixture'
   }}));
   document.querySelector('#lyrics-close-btn').click();
   await frame();
   return {inOneFrame,activeText,staleAfterClose:calls.length,
     overlayClosed:document.querySelector('#lyrics-overlay').getAttribute('aria-hidden')==='true'};
 });
 assert.ok(scrolls.inOneFrame<=1,
   'fast lyric updates must not start many competing smooth-scroll animations');
 assert.match(scrolls.activeText,/Synthetic lyric entry 84/);
 assert.equal(scrolls.staleAfterClose,0,
   'stale lyric scroll must be cancelled after rapid track switch and close');
 assert.equal(scrolls.overlayClosed,true);
 assert.deepEqual(errors,[], 'long-list/lyric stress caused page errors');
 console.log('FYMUSIC_LONG_LIST_LYRIC_STRESS_PASS '+JSON.stringify({
   initialRows:700,appendedRows:250,limitedAnimation:lists.appended,
   binarySearchMaxComparisons:lyrics.maxReads,duplicateTimestampsPreserved:true,
   rapidLyricUpdatesCoalesced:true,staleScrollCancelled:true,
   syntheticOnly:true
 }));
}finally{await browser.close();}
