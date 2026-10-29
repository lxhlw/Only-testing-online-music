import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Real deployed UI, Flower-only resolution, real HTML5 Audio.
// No network stubs, no media or signed source URLs in logs.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
const row={platform:'kw',track:'宋冬野 / 郭源潮',expectedSeconds:446,
  phase:'NOT_STARTED',flowerActive:false,selected:false,
  resultFound:false,clicked:false,canonicalFlowerRequest:false,
  durationSeconds:null,playing:false,progressSeconds:0,
  seekEnabled:false,seekReachedMiddle:false,afterSeekProgress:0,
  audioError:false,verified:false};
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>{
    const a=window.LXSourceManager?.getActive?.();
    return !!(a?.inited&&a.sources?.kw?.actions?.includes('musicUrl'));
  },null,{timeout:20000});
  row.flowerActive=await page.evaluate(()=>{
    const a=window.LXSourceManager.getActive();
    return String(a.name||'').includes('野花')&&
      String(a.url||'').includes('/flower/latest.js');
  });
  if(!row.flowerActive){row.phase='NOT_FLOWER';}
  else{
    await page.locator('.nav-item[data-view="search"]').click();
    const channel=page.locator('#channel-list .channel-button[title="KW"]');
    await channel.click();
    row.selected=await channel.evaluate(el=>el.classList.contains('active'));
    for(const term of ['郭源潮','宋冬野']){
      row.phase='UI_SEARCH';
      await page.locator('#global-search-input').fill(term);
      await page.locator('#global-search-btn').click();
      try{await page.waitForFunction(()=>Array.isArray(
        window.__LXLastSearchResults)&&window.__LXLastSearchResults.length>0,
        null,{timeout:15000});}catch{}
      const index=await page.evaluate(()=>{
        const found=(window.__LXLastSearchResults||[]).findIndex(s=>
          s?.name==='郭源潮'&&String(s?.singer||'').includes('宋冬野')&&
          s?.source==='kw');
        const rows=document.querySelectorAll('#search-results .search-song-row').length;
        return found>=0&&found<rows?found:-1;
      });
      if(index<0)continue;
      row.resultFound=true;
      row.phase='UI_CLICK_PLAY';
      await page.locator('#audio').evaluate(a=>{a.muted=true;a.volume=0;});
      const baseline=await page.evaluate(()=>
        window.LXSourceManager.getActive().runtime.__debugRequests?.length||0);
      await page.locator('#search-results .search-song-row .search-song-main')
        .nth(index).click();
      row.clicked=true;
      row.phase='WAITING_FOR_AUDIO';
      try{await page.waitForFunction(()=>{
        const a=document.getElementById('audio');
        return !!a&&!a.paused&&a.readyState>=2&&a.currentTime>.8&&
          Number.isFinite(a.duration)&&a.duration>250;
      },null,{timeout:25000});}catch{}
      const state=await page.evaluate(start=>{
        const a=document.getElementById('audio');
        const reqs=(window.LXSourceManager.getActive().runtime.__debugRequests||[])
          .slice(start);
        const flower=reqs.some(r=>{
          try{
            const u=new URL(r.url);
            return u.hostname==='97.64.37.235'&&
              u.pathname.startsWith('/flower/v1/url/kw/');
          }catch{return false;}
        });
        return {canonical:flower,time:Number(a?.currentTime)||0,
          duration:Number(a?.duration)||null,paused:!!a?.paused,
          readyState:Number(a?.readyState)||0,error:!!a?.error,
          sliderEnabled:!document.getElementById('player-seek')?.disabled};
      },baseline);
      row.canonicalFlowerRequest=state.canonical;
      row.durationSeconds=state.duration;
      row.playing=!state.paused&&state.readyState>=2&&state.time>.8;
      row.audioError=state.error;
      row.seekEnabled=state.sliderEnabled;
      if(!row.playing||!state.duration||state.duration<300||
         state.duration>650){row.phase='AUDIO_NOT_ESTABLISHED';break;}
      await page.waitForTimeout(1550);
      const now=await page.locator('#audio')
        .evaluate(a=>Number(a.currentTime)||0);
      row.progressSeconds=Math.round(Math.max(0,now-state.time)*10)/10;
      if(row.progressSeconds<.7){row.phase='AUDIO_NO_PROGRESS';break;}
      if(!await page.locator('#player-seek').isEnabled()){
        row.phase='SEEK_DISABLED';break;
      }
      const b=await page.locator('#player-seek').boundingBox();
      if(!b||b.width<70){row.phase='SEEK_NOT_VISIBLE';break;}
      const y=b.y+b.height/2;
      await page.mouse.move(b.x+b.width*.16,y);
      await page.mouse.down();
      await page.mouse.move(b.x+b.width*.26,y,{steps:8});
      await page.mouse.up();
      try{await page.waitForFunction(()=>{
        const t=Number(document.getElementById('audio')?.currentTime)||0;
        return t>80&&t<190;
      },null,{timeout:10000});}catch{}
      const seek=await page.locator('#audio').evaluate(a=>({
        time:Number(a.currentTime)||0,paused:a.paused,error:!!a.error
      }));
      row.seekReachedMiddle=seek.time>80&&seek.time<190;
      await page.waitForTimeout(1400);
      const end=await page.locator('#audio')
        .evaluate(a=>Number(a.currentTime)||0);
      row.afterSeekProgress=Math.round(Math.max(0,end-seek.time)*10)/10;
      row.verified=row.selected&&row.flowerActive&&row.resultFound&&
        row.canonicalFlowerRequest&&row.playing&&row.durationSeconds>=300&&
        row.durationSeconds<=650&&row.progressSeconds>=.7&&
        row.seekEnabled&&row.seekReachedMiddle&&row.afterSeekProgress>=.5&&
        !row.audioError&&!seek.error&&!seek.paused;
      row.phase=row.verified?'REAL_UI_PLAYBACK_VERIFIED':'PARTIAL_UI_PLAYBACK';
      break;
    }
    if(!row.resultFound)row.phase='MATCHING_TRACK_NOT_VISIBLE';
  }
  console.log('FLOWER REAL KUWO UI ACCEPTANCE:',JSON.stringify(row));
  assert.equal(row.flowerActive,true,'Expected original Flower source');
}finally{await browser.close();}
