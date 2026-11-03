import {chromium} from 'playwright';
// Read-only real-production acceptance for 孙燕姿《开始懂了》.
// Do not record or print any signed media URLs, lyric text, cookies, or headers.
// No mocked metadata, media, images, source script, or song search responses.
const base='https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const trials=[];
for(const source of ['kw','mg']){
 const result={song:'开始懂了',artist:'孙燕姿',source,phase:'init',
   flower:false,found:false,audioProgress:false,playIconCorrect:false,
   pauseIconCorrect:false,resumeIconCorrect:false,coverLoaded:false,
   lyricLines:0,lyricStatus:'',error:''};
 const page=await browser.newPage({viewport:{width:1320,height:860}});
 try{
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,
    null,{timeout:24000});
  result.flower=await page.evaluate(()=>String(window.LXSourceManager.getActive().name||'').includes('野花'));
  if(!result.flower){result.phase='Flower not active';continue;}
  await page.locator('.nav-item[data-view="search"]').click();
  await page.locator('#channel-list .channel-button[title="'+source.toUpperCase()+'"]').click();
  let matched=-1;
  for(const keyword of ['开始懂了','孙燕姿']){
   result.phase='search';
   await page.locator('#global-search-input').fill(keyword);
   await page.locator('#global-search-btn').click();
   try{await page.waitForFunction(({source})=>{
    const list=window.__LXLastSearchResults||[];
    return list.some(s=>s.source===source&&String(s.name||'').trim()==='开始懂了'&&
      String(s.singer||'').includes('孙燕姿'));
   },{source},{timeout:16000});}catch{}
   matched=await page.evaluate(({source})=>{
     const list=window.__LXLastSearchResults||[];
     return list.findIndex(s=>s.source===source&&String(s.name||'').trim()==='开始懂了'&&
       String(s.singer||'').includes('孙燕姿'));
   },{source});
   if(matched>=0)break;
  }
  result.found=matched>=0;
  if(!result.found){result.phase='song not found in current provider search';continue;}
  await page.locator('#audio').evaluate(a=>{a.muted=true;a.volume=0;});
  result.phase='real playback';
  await page.locator('#search-results .search-song-row .search-song-main').nth(matched).click();
  try{await page.waitForFunction(()=>{
    const a=document.getElementById('audio');
    return a&&!a.paused&&a.readyState>=2&&a.currentTime>.8;
  },null,{timeout:35000});}catch{}
  result.audioProgress=await page.locator('#audio').evaluate(a=>!a.paused&&a.readyState>=2&&a.currentTime>.8);
  if(!result.audioProgress){result.phase='real audio not established';continue;}
  result.phase='song detail';
  await page.locator('#player-cover-button').click();
  await page.locator('#lyrics-overlay').waitFor({state:'visible',timeout:7000});
  const getIcons=()=>page.evaluate(()=>{
    const btn=document.getElementById('detail-toggle-btn'),
      play=btn.querySelector('.detail-play-icon'),
      pause=btn.querySelector('.detail-pause-icon');
    return {paused:document.getElementById('audio').paused,
      state:btn.dataset.playbackState,
      playVisible:getComputedStyle(play).display!=='none',
      pauseVisible:getComputedStyle(pause).display!=='none'};
  });
  const on=await getIcons();
  result.playIconCorrect=!on.paused&&on.state==='playing'&&!on.playVisible&&on.pauseVisible;
  await page.locator('#detail-toggle-btn').click();
  await page.waitForFunction(()=>document.getElementById('audio')?.paused===true,null,{timeout:5000});
  const off=await getIcons();
  result.pauseIconCorrect=off.paused&&off.state==='paused'&&off.playVisible&&!off.pauseVisible;
  await page.locator('#detail-toggle-btn').click();
  await page.waitForFunction(()=>document.getElementById('audio')?.paused===false,null,{timeout:9000});
  const resumed=await getIcons();
  result.resumeIconCorrect=!resumed.paused&&resumed.state==='playing'&&!resumed.playVisible&&resumed.pauseVisible;
  result.phase='real cover and lyrics';
  try{await page.waitForFunction(()=>{
    const img=document.getElementById('lyrics-cover-image');
    return img&&img.complete&&img.naturalWidth>0&&
      document.querySelectorAll('#lyrics-lines .lyrics-line').length>=2;
  },null,{timeout:16000});}catch{}
  const media=await page.evaluate(()=>({
    coverLoaded:!!document.getElementById('lyrics-cover-image')?.naturalWidth,
    lyricLines:document.querySelectorAll('#lyrics-lines .lyrics-line').length,
    lyricStatus:(document.getElementById('lyrics-status')?.textContent||'').slice(0,100)
  }));
  Object.assign(result,media);
  result.phase=result.playIconCorrect&&result.pauseIconCorrect&&result.resumeIconCorrect&&
    result.coverLoaded&&result.lyricLines>=2?'FULL_REAL_SONG_UI_PASS':'PARTIAL_REAL_SONG_UI';
 }catch(e){result.error=String(e?.message||e).split('\n')[0].slice(0,190)}
 finally{trials.push(result);await page.close();}
}
await browser.close();
console.log('FYMUSIC_REAL_SUN_YANZI_PRODUCTION_REPORT',JSON.stringify(trials));
if(!trials.some(r=>r.phase==='FULL_REAL_SONG_UI_PASS'))process.exitCode=1;
