import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const base=process.env.TEST_BASE_URL?.replace(/\/+$/,'');
assert.ok(base,'TEST_BASE_URL required');
const u=new URL(base);
assert.equal(u.protocol,'https:');
assert.ok(u.hostname.endsWith('.only-testing-online-music.pages.dev'));
assert.notEqual(u.hostname,'only-testing-online-music.pages.dev','Production is out of scope');
assert.notEqual(u.hostname,'cleanup-pr108-nonproduction.only-testing-online-music.pages.dev','Use immutable preview URL, not mutable branch alias');

const dir='audit-pr108-real-preview';
await mkdir(dir,{recursive:true});
const evidence={origin:u.origin,tests:{},attempts:[],apiResponses:[],failures:[],loggedAt:new Date().toISOString()};
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const wait=(n)=>new Promise(resolve=>setTimeout(resolve,n));
const isCurrent=()=>fetch(base+'/version.json',{signal:AbortSignal.timeout(18000)})
  .then(r=>{assert.equal(r.status,200);return r.json()})
  .then(v=>{assert.equal(v.name,'FyMusic');assert.equal(v.version,'0.4.27');return v});

try {
 evidence.tests.version=await isCurrent();

 // Negative probes never submit user data or call arbitrary public networks.
 const blocked=['README.md','package.json','.github/workflows/verify-and-deploy.yml',
  'scripts/test-modern-web-browser.mjs','android-companion/README.md',
  'scripts/test-via44-no-source-browser.mjs','src/android-native-resolver.js',
  'functions/api/proxy.js','src/source-transpiler.js'];
 const blockedStatuses=[];
 for(const path of blocked){
  const r=await fetch(base+'/'+path,{redirect:'follow',signal:AbortSignal.timeout(15000)});
  const body=await r.text();
  assert.equal(r.status,404,'Repository path exposed: '+path);
  assert.ok(body.includes('404 · Not found'),'Missing genuine not-found page: '+path);
  blockedStatuses.push({path,status:r.status});
 }
 evidence.tests.privateFiles=blockedStatuses;
 const proxyMissing=await fetch(base+'/api/proxy',{signal:AbortSignal.timeout(15000)});
 const proxyLoopback=await fetch(base+'/api/proxy?url='+encodeURIComponent('http://127.0.0.1/'),
  {signal:AbortSignal.timeout(15000)});
 const lyricsMissing=await fetch(base+'/api/netease-lyrics',{signal:AbortSignal.timeout(15000)});
 assert.equal(proxyMissing.status,400);
 assert.equal(proxyLoopback.status,403);
 assert.equal(lyricsMissing.status,400);
 evidence.tests.functions={proxyMissing:400,proxyLoopback:403,lyricsMissing:400};

 const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 try{
  const page=await mobile.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('only-testing-online-music.default-source-disabled','1'));
  await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready'),
   null,{timeout:20000});
  await page.locator('.mobile-menu-button').click();
  await page.locator('.mobile-drawer-heading strong').waitFor({state:'visible',timeout:5000});
  const brand=(await page.locator('.mobile-drawer-heading strong').innerText()).trim();
  assert.equal(brand,'FyMusic');
  assert.equal(await page.locator('.nav-item').count(),5);
  await page.screenshot({path:dir+'/mobile-drawer-FyMusic.png',animations:'disabled'});
  await page.locator('.nav-item[data-view="settings"]').click();
  await page.waitForFunction(()=>document.getElementById('view-settings')?.classList.contains('active'));
  const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  assert.ok(docWidth<=392,'mobile horizontal overflow');
  assert.deepEqual(errors,[]);
  evidence.tests.mobile={brand,navItems:5,documentWidth:docWidth,errors};
 }finally{await mobile.close()}

 // Preserve source-supported quality: default "highest". No 128k cap.
 async function realPlaybackAttempt(round){
  const ctx=await browser.newContext({viewport:{width:1366,height:900}});
  const page=await ctx.newPage(),errors=[],calls=[];
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,300)));
  page.on('response',res=>{
   try{
    const target=new URL(res.url());
    if(target.origin===base&&target.pathname.startsWith('/api/'))
     calls.push({route:target.pathname,status:res.status(),
      range:res.headers()['content-range']?true:false});
   }catch{}
  });
  const state={round,status:'START',provider:'Flower',track:'孙燕姿《开始懂了》'};
  try {
   await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>!!window.LXSourceManager?.getActive&&
    !!window.LXMusicLibrary&&!!window.LXPlayerControls,null,{timeout:25000});
   await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited===true,
    null,{timeout:30000});
   const source=await page.evaluate(()=>window.LXSourceManager.getActive()?.name);
   assert.ok(source&&/野花|Flower/i.test(source),'The expected Flower source is not active: '+source);
   state.source=source;

   const quality=await page.locator('#inline-quality').inputValue();
   assert.equal(quality,'highest','Unexpected forced quality selection');
   state.qualityMode=quality;

   await page.locator('#global-search-input').fill('开始懂了');
   await page.locator('#global-search-btn').click();
   await page.locator('#search-results .search-song-row').first()
    .waitFor({state:'visible',timeout:28000});
   const results=page.locator('#search-results .search-song-row');
   const count=await results.count();
   assert.ok(count>=2,'Too few results to test track switching');
   state.results=count;
   const first=results.filter({hasText:'孙燕姿'}).first();
   await first.waitFor({state:'visible',timeout:7000});
   const title=(await first.locator('.song-title').innerText()).trim();
   const artist=(await first.locator('.song-artist').innerText()).trim();
   assert.ok(title.includes('开始懂了')&&artist.includes('孙燕姿'));
   state.selected={title,artist};

   await first.locator('.song-action-queue').first().click();
   await first.locator('.song-action-favorite').first().click();
   const second=results.nth(1);
   const secondArtist=(await second.locator('.song-artist').innerText()).trim();
   state.secondArtist=secondArtist;
   let currentFavorite=await page.evaluate(()=>
    window.LXMusicLibrary.snapshot().favorites.some(m=>
      m.name.includes('开始懂了')&&m.singer.includes('孙燕姿')));
   assert.ok(currentFavorite,'Favorite did not update');
   assert.ok((await page.evaluate(()=>window.LXMusicLibrary.snapshot().queue.length))>=1,
     'The selected song is not queued');

   await first.locator('.song-action-play').click();
   await page.waitForFunction(()=>{const a=document.querySelector('#audio');
     return !!a&&a.readyState>=2&&!a.paused&&a.currentTime>1&&
      Number.isFinite(a.duration)&&a.duration>50&&!a.error;
   },null,{timeout:45000});
   const initial=await page.evaluate(()=>({
    time:document.querySelector('#audio').currentTime,
    duration:document.querySelector('#audio').duration,
    readyState:document.querySelector('#audio').readyState,
    seekDisabled:document.querySelector('#player-seek').disabled,
    title:document.querySelector('#player-title').textContent,
    artist:document.querySelector('#player-artist').textContent,
    qualityStatus:document.querySelector('#status').textContent.slice(0,190)
   }));
   assert.equal(initial.seekDisabled,false,'Seek disabled even after actual playback confirmed');
   state.initial=initial;
   await page.screenshot({path:dir+'/round'+round+'-real-audio.png',animations:'disabled'});
   const seek=page.locator('#player-seek'),bounds=await seek.boundingBox();
   assert.ok(bounds?.width>140,'Seek is not interactable');
   await seek.click({position:{x:Math.round(bounds.width*.29),
    y:Math.max(1,Math.round(bounds.height/2))}});
   await page.waitForFunction(()=>{const a=document.querySelector('#audio');
     return a&&a.currentTime>Math.max(8,a.duration*.10);
   },null,{timeout:12000});
   const afterSeek=await page.locator('#audio').evaluate(e=>e.currentTime);
   await wait(2400);
   const afterProgress=await page.locator('#audio').evaluate(e=>e.currentTime);
   assert.ok(afterProgress>afterSeek+0.6,'Media did not progress after Seek');
   state.seek={before:initial.time,afterSeek,afterProgress};
   await page.screenshot({path:dir+'/round'+round+'-after-seek.png',animations:'disabled'});

   await page.locator('#player-toggle-btn').click();
   await page.waitForFunction(()=>document.querySelector('#audio')?.paused===true,null,{timeout:6000});
   const pausedAt=await page.locator('#audio').evaluate(e=>e.currentTime);
   await page.locator('#player-toggle-btn').click();
   await page.waitForFunction(v=>{const a=document.querySelector('#audio');
    return a&&!a.paused&&a.currentTime>v+0.5;
   },pausedAt,{timeout:18000});
   state.pauseResume=true;

   await page.locator('#player-cover-button').click();
   await page.locator('#lyrics-overlay').waitFor({state:'visible',timeout:6000});
   await page.waitForFunction(()=>{
     const el=document.querySelector('#lyrics-lines');
     return !!el&&el.querySelectorAll('.lyrics-line').length>=2;
   },null,{timeout:15000});
   state.lyrics={lines:await page.locator('#lyrics-lines .lyrics-line').count(),
    status:await page.locator('#lyrics-status').innerText()};
   await page.screenshot({path:dir+'/round'+round+'-real-lyrics.png',animations:'disabled'});
   await page.locator('#lyrics-close-btn').click();

   // The search Play action itself re-adds the selected track to the
   // end of the playback queue; append the next track AFTER playback starts
   // so the test exercises a normal [current,next] queue, not [next,current].
   await second.locator('.song-action-queue').first().click();
   const queue=await page.evaluate(()=>window.LXMusicLibrary.snapshot().queue.map(
     x=>({name:x.name,singer:x.singer})));
   state.queueOrder=queue;
   assert.ok(queue.length>=2&&queue[0].singer.includes('孙燕姿')&&
     queue[1].singer===secondArtist,
     'Cannot test Next because queue is not ordered as [current, next]');
   state.queueCount=queue.length;

   // Sequential navigation tests actual Next/Previous controls, not synthetic
   // replacement of player metadata. Source availability for the second
   // recording can vary and is captured separately.
   await page.locator('#player-mode-btn').click();
   await page.locator('#player-mode-menu [data-mode="sequence"]').click();
   await page.locator('#next-track-btn').click();
   // Next must select the actual queued candidate, even if the music
   // provider cannot resolve its URL. A 502 is recorded as provider failure,
   // not misreported as a broken Next button.
   await page.waitForFunction(expected=>
    window.__LXNowPlayingTrack?.singer?.trim()===expected,
    secondArtist,{timeout:10000});
   state.nextArtist=await page.locator('#player-artist').innerText();
   let nextPlayable=false;
   try{
    await page.waitForFunction(expected=>{
      const a=document.querySelector('#audio');
      return window.__LXNowPlayingTrack?.singer?.trim()===expected&&
        a&&a.readyState>=2&&!a.paused&&a.currentTime>.65&&!a.error;
    },secondArtist,{timeout:14000});
    nextPlayable=true;
   }catch{}
   state.nextPlayable=nextPlayable;
   if(!nextPlayable){
    const status=await page.locator('#status').innerText();
    const providerError=calls.some(x=>x.status>=500);
    assert.ok(providerError&&/解析失败|播放地址|502|服务器/.test(status),
      'Next selected a new song but no valid upstream-error explanation appeared: '+status);
    state.nextSourceWarning={status:status.slice(0,220),
      upstreamHTTP:([...calls].reverse().find(x=>x.status>=500)||{}).status,
      uiDisplayedArtist:state.nextArtist};
   }
   await page.locator('#prev-track-btn').click();
   await page.waitForFunction(firstArtist=>
    window.__LXNowPlayingTrack?.singer?.includes(firstArtist),
    artist,{timeout:12000});
   await page.waitForFunction(()=>{
    const a=document.querySelector('#audio');
    return a&&a.readyState>=2&&!a.paused&&a.currentTime>.65&&!a.error;
   },null,{timeout:42000});
   state.previousReturned=true;
   await page.screenshot({path:dir+'/round'+round+'-after-next-prev.png',animations:'disabled'});

   await page.reload({waitUntil:'domcontentloaded',timeout:35000});
   await page.waitForFunction(()=>window.LXMusicLibrary?.snapshot,null,{timeout:15000});
   const restored=await page.evaluate(()=>{
    const s=window.LXMusicLibrary.snapshot();
    return {
     queue:s.queue.length,history:s.history.length,favorites:s.favorites.length,
     originalFavorite:s.favorites.some(x=>x.name.includes('开始懂了')&&x.singer.includes('孙燕姿'))
    };
   });
   assert.ok(restored.originalFavorite&&restored.queue>=2,'Reload lost queue/favorite data');
   state.afterReload=restored;
   state.status='PASS';
   assert.deepEqual(errors,[],'No JS page errors');
   return state;
  }catch(error){
   state.status='FAIL';
   state.error=String(error.message||error).slice(0,500);
   state.lastStatus=await page.locator('#status').innerText().catch(()=>null);
   state.playback=await page.locator('#audio').evaluate(e=>({
     time:e.currentTime,paused:e.paused,readyState:e.readyState,error:e.error?.code??null
   })).catch(()=>null);
   try{await page.screenshot({path:dir+'/round'+round+'-failure.png',animations:'disabled'})}catch{}
   return state;
  }finally{
   state.jsErrors=errors;
   state.apiCalls=calls.slice(-25);
   evidence.attempts.push(state);
   await ctx.close();
  }
 }

 let passed=false;
 for(let round=1;round<=2;round++){
  const detail=await realPlaybackAttempt(round);
  console.log('FYMUSIC_PR108_REAL_AUDIO_ATTEMPT',JSON.stringify(detail));
  if(detail.status==='PASS'){passed=true;break;}
 }
 evidence.tests.realSong={passed,rounds:evidence.attempts.length,
   unstable:evidence.attempts.length>1&&passed};
 if(!passed)evidence.failures.push('No successful end-to-end real audio, seek, lyrics, next/previous and persistence run');
}finally{
 await writeFile(dir+'/acceptance.json',JSON.stringify(evidence,null,2));
 await browser.close();
}
console.log('FYMUSIC_PR108_PREVIEW_ACCEPTANCE',JSON.stringify({
 origin:evidence.origin,static404:evidence.tests.privateFiles?.length||0,
 functions:evidence.tests.functions,mobile:evidence.tests.mobile,
 qualityNotForced:true,realSong:evidence.tests.realSong,failures:evidence.failures
}));
assert.equal(evidence.failures.length,0,evidence.failures.join('; '));
