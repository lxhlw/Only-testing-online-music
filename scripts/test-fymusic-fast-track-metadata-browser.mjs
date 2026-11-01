import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Deterministic out-of-order metadata responses, no external music source,
// signed media URL, or third-party NetEase call. Chromium executes real UI code.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,120)));
 await page.addInitScript(()=>{
   const original=window.fetch.bind(window);
   window.__fymusicPendingMetadata=[];
   window.fetch=(url,options)=>{
     const request=String(url instanceof Request?url.url:url);
     if(!request.startsWith('/api/netease-song-meta?'))return original(url,options);
     // Intentional AbortSignal non-compliance tests the sequence guard even
     // when an upstream response arrives after the user changed tracks.
     return new Promise(resolve=>{
       const id=new URL(request,location.href).searchParams.get('id');
       window.__fymusicPendingMetadata.push({id,
         fulfill(data){resolve(new Response(JSON.stringify(data),{
           status:200,headers:{'Content-Type':'application/json'}}))}});
     });
   };
   Object.defineProperty(navigator,'mediaSession',{configurable:true,
     value:{metadata:null,setActionHandler(){},setPositionState(){},
       playbackState:'none'}});
   window.MediaMetadata=class{constructor(o){Object.assign(this,o)}};
 });
 const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY7kAAAAASUVORK5CYII=';
 await page.route(/https:\/\/p[0-9]+\.music\.126\.net\//,
   route=>route.fulfill({status:200,contentType:'image/png',
      body:Buffer.from(pixel,'base64')}));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls&&
   document.querySelector('#lyrics-title')),null,{timeout:18000});
 const pushTrack=(id,name,image='')=>page.evaluate(({id,name,image})=>{
   const track={id,source:'wy',name,singer:name+' singer',
     albumName:name+' album',image};
   window.__LXNowPlayingTrack=track;
   window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:track}));
 },{id,name,image});
 const respond=(index,data)=>page.evaluate(({index,data})=>{
   const item=window.__fymusicPendingMetadata[index];
   if(!item)throw Error('Missing pending request '+index);
   item.fulfill(data);
 },{index,data});
 const snap=()=>page.evaluate(()=>({
   name:document.querySelector('#lyrics-title')?.textContent,
   artist:document.querySelector('#now-playing-artist')?.textContent,
   album:document.querySelector('#now-playing-album')?.textContent,
   source:document.querySelector('#now-playing-platform')?.textContent,
   cover:document.querySelector('#lyrics-cover-image')?.getAttribute('src')||'',
   miniCover:document.querySelector('#player-cover-image')?.getAttribute('src')||'',
   os:{
     title:navigator.mediaSession.metadata?.title,
     artist:navigator.mediaSession.metadata?.artist,
     album:navigator.mediaSession.metadata?.album,
     artwork:navigator.mediaSession.metadata?.artwork?.[0]?.src||''
   }
 }));
 await pushTrack('111','Track A');
 await page.waitForFunction(()=>window.__fymusicPendingMetadata.length===1);
 await pushTrack('222','Track B');
 await page.waitForFunction(()=>window.__fymusicPendingMetadata.length===2);
 await respond(1,{id:'222',name:'OVERRIDE B',source:'kg',sequence:999,
   singer:'Resolved B singer',albumName:'Resolved B album',
   image:'https://p1.music.126.net/b.jpg'});
 await page.waitForFunction(()=>document.querySelector('#now-playing-album')?.textContent===
   '专辑：Resolved B album');
 const freshB=await snap();
 assert.equal(freshB.name,'Track B','network metadata must never change selected title');
 assert.equal(freshB.artist,'Resolved B singer');
 assert.equal(freshB.source,'来源：网易云音乐',
   'network response must never change the selected audio platform');
 assert.equal(freshB.os.title,'Track B');
 assert.equal(freshB.os.album,'Resolved B album');
 assert.equal(freshB.os.artwork,'https://p1.music.126.net/b.jpg');
 // A's delayed response arrives after B has already applied its metadata.
 await respond(0,{id:'111',singer:'STALE A',albumName:'STALE A',
   source:'kg',sequence:888,image:'https://p2.music.126.net/a.jpg'});
 await page.waitForTimeout(40);
 const afterStale=await snap();
 assert.deepEqual(afterStale,freshB,
   'late previous-track metadata may not overwrite current art or OS metadata');
 // Invalid supplied artwork must not prevent trusted album-art fallback.
 await pushTrack('333','Track C','https://example.invalid/wrong-art.jpg');
 await page.waitForFunction(()=>window.__fymusicPendingMetadata.length===3);
 const waitingC=await snap();
 assert.equal(waitingC.cover,'','untrusted image URL is never rendered');
 assert.equal(waitingC.os.artwork,'','untrusted image URL is never exported to OS');
 await respond(2,{id:'333',name:'FORGED TITLE',source:'kg',
   sequence:-100,singer:'Resolved C singer',albumName:'Resolved C album',
   image:'https://p3.music.126.net/c.jpg'});
 await page.waitForFunction(()=>document.querySelector('#now-playing-album')?.textContent===
   '专辑：Resolved C album');
 const freshC=await snap();
 assert.equal(freshC.name,'Track C');
 assert.equal(freshC.source,'来源：网易云音乐');
 assert.equal(freshC.artist,'Resolved C singer');
 assert.equal(freshC.cover,'https://p3.music.126.net/c.jpg');
 assert.equal(freshC.miniCover,freshC.cover);
 assert.equal(freshC.os.title,'Track C');
 // Same ID with another track selection still has a fresh sequence. An
 // interrupted request for that ID must not mutate the new selection.
 await pushTrack('444','Track D');
 await page.waitForFunction(()=>window.__fymusicPendingMetadata.length===4);
 await pushTrack('444','Track D newer');
 await page.waitForFunction(()=>window.__fymusicPendingMetadata.length===5);
 await respond(4,{id:'444',singer:'Newest D',albumName:'Newest D album',
   image:'https://p4.music.126.net/d.jpg'});
 await page.waitForFunction(()=>document.querySelector('#now-playing-album')?.textContent===
   '专辑：Newest D album');
 await respond(3,{id:'444',singer:'OLD D',albumName:'OLD D album',
   image:'https://p5.music.126.net/old.jpg'});
 await page.waitForTimeout(40);
 const final=await snap();
 assert.equal(final.name,'Track D newer');
 assert.equal(final.artist,'Newest D');
 assert.equal(final.cover,'https://p4.music.126.net/d.jpg');
 assert.equal(final.os.album,'Newest D album');
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_FAST_TRACK_METADATA_PASS '+JSON.stringify({
   rapidTrackChanges:5,latePreviousTrackIgnored:true,
   sameIdNewSequenceWins:true,metadataIdentityLocked:true,
   trustedFallbackCover:true,oldOsArtworkNotRestored:true,
   miniAndImmersiveArtworkAligned:true,noExternalMedia:true
 }));
}finally{await browser.close()}
