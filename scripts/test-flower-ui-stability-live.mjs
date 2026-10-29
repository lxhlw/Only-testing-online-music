import {chromium} from 'playwright';

// Unmocked production UI reliability: two independent fresh sessions each
// for Kuwo and Migu, against the imported Flower musicUrl source only.
// No media URLs, source request tokens, raw errors, signed headers or audio
// content leave the browser. A green workflow is NOT an audio-pass result.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const channels=['kw','mg'];
const rounds=2;
const expectedSong='郭源潮',expectedArtist='宋冬野';
const browser=await chromium.launch({
  headless:true,args:['--autoplay-policy=no-user-gesture-required']
});
const trials=[];
async function testChannel(channel,round){
  const result={channel,round,phase:'START',flowerActive:false,
    channelSelected:false,matchingSong:false,rowClicked:false,
    originalFlowerRoute:false,started:false,durationSeconds:null,
    initialProgressSeconds:0,seekEnabled:false,mouseSeekReached:false,
    afterSeekProgressSeconds:0,postDeadlinePlaying:null,
    postDeadlineProgressSeconds:null,audioError:false,verified:false};
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  try{
    page.setDefaultTimeout(18000);
    await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
    await page.waitForFunction(()=>{
      const s=window.LXSourceManager?.getActive?.();
      return !!s?.inited;
    },null,{timeout:20000});
    result.flowerActive=await page.evaluate(()=>{
      const s=window.LXSourceManager.getActive();
      return !!s?.inited&&String(s?.name||'').includes('野花')&&
        String(s?.url||'').includes('/flower/latest.js');
    });
    if(!result.flowerActive){result.phase='ACTIVE_SOURCE_NOT_FLOWER';return result;}
    result.phase='SELECT_CHANNEL';
    await page.locator('.nav-item[data-view="search"]').click();
    const selected=page.locator('#channel-list .channel-button[title="'+channel.toUpperCase()+'"]');
    await selected.click();
    result.channelSelected=await selected.evaluate(el=>el.classList.contains('active'));
    if(!result.channelSelected){result.phase='CHANNEL_NOT_SELECTED';return result;}

    let matchIndex=-1;
    for(const keyword of [expectedSong,expectedArtist]){
      result.phase='SEARCH';
      await page.locator('#global-search-input').fill(keyword);
      await page.locator('#global-search-btn').click();
      try{
        await page.waitForFunction(({channel,title,artist})=>{
          const list=window.__LXLastSearchResults||[];
          const index=list.findIndex(s=>String(s?.name||'').trim()===title &&
            String(s?.singer||'').includes(artist) && s?.source===channel);
          return index>=0&&index<
            document.querySelectorAll('#search-results .search-song-row').length;
        },{channel,title:expectedSong,artist:expectedArtist},{timeout:15000});
      }catch{}
      matchIndex=await page.evaluate(({channel,title,artist})=>{
        const list=window.__LXLastSearchResults||[];
        const i=list.findIndex(s=>String(s?.name||'').trim()===title&&
          String(s?.singer||'').includes(artist)&&s?.source===channel);
        return i>=0&&i<document.querySelectorAll(
          '#search-results .search-song-row').length?i:-1;
      },{channel,title:expectedSong,artist:expectedArtist});
      if(matchIndex>=0)break;
    }
    result.matchingSong=matchIndex>=0;
    if(!result.matchingSong){result.phase='TRACK_NOT_FOUND_IN_UI';return result;}

    await page.locator('#audio').evaluate(a=>{a.muted=true;a.volume=0;});
    const requestStart=await page.evaluate(()=>
      window.LXSourceManager.getActive().runtime.__debugRequests?.length||0);
    result.phase='CLICK_PLAY';
    await page.locator('#search-results .search-song-row .search-song-main')
      .nth(matchIndex).click();
    result.rowClicked=true;
    result.phase='WAIT_FOR_MEDIA';
    try{
      await page.waitForFunction(()=>{
        const a=document.getElementById('audio');
        return !!a&&!a.paused&&a.readyState>=2&&a.currentTime>.9&&
          Number.isFinite(a.duration)&&a.duration>=300&&a.duration<=650;
      },null,{timeout:30000});
    }catch{}

    const state=await page.evaluate(({requestStart,channel})=>{
      const a=document.getElementById('audio');
      const requests=(window.LXSourceManager.getActive().runtime
        .__debugRequests||[]).slice(requestStart);
      const sourceHit=requests.some(r=>{
        try{
          const u=new URL(r.url);
          return u.protocol==='http:'&&u.hostname==='97.64.37.235'&&
            u.pathname.startsWith('/flower/v1/url/'+channel+'/');
        }catch{return false;}
      });
      return {sourceHit,time:Number(a?.currentTime)||0,
        duration:Number(a?.duration)||null,paused:!!a?.paused,
        readyState:Number(a?.readyState)||0,error:!!a?.error,
        sliderEnabled:!document.getElementById('player-seek')?.disabled};
    },{requestStart,channel});
    result.originalFlowerRoute=state.sourceHit;
    result.durationSeconds=state.duration===null?null:
      Math.round(state.duration*10)/10;
    result.started=!state.paused&&state.readyState>=2&&state.time>.9;
    result.audioError=state.error;
    result.seekEnabled=state.sliderEnabled;
    if(!result.started||!state.duration||state.duration<300||
       state.duration>650){result.phase='MEDIA_NOT_ESTABLISHED';return result;}
    await page.waitForTimeout(1700);
    const play=await page.locator('#audio').evaluate(a=>({
      time:Number(a.currentTime)||0,error:!!a.error,paused:a.paused
    }));
    result.initialProgressSeconds=Math.round(
      Math.max(0,play.time-state.time)*10)/10;
    result.audioError ||=play.error;
    if(play.paused||result.initialProgressSeconds<.7){
      result.phase='MEDIA_PROGRESS_STOPPED';return result;
    }
    if(!await page.locator('#player-seek').isEnabled()){
      result.phase='SEEK_CONTROL_DISABLED';return result;
    }
    const bounds=await page.locator('#player-seek').boundingBox();
    if(!bounds||bounds.width<80){result.phase='SEEK_NOT_VISIBLE';return result;}
    const y=bounds.y+bounds.height/2;
    await page.mouse.move(bounds.x+bounds.width*.16,y);
    await page.mouse.down();
    await page.mouse.move(bounds.x+bounds.width*.26,y,{steps:8});
    await page.mouse.up();
    try{
      await page.waitForFunction(()=>{
        const t=Number(document.getElementById('audio')?.currentTime)||0;
        return t>=80&&t<=190;
      },null,{timeout:11000});
    }catch{}
    const seek=await page.locator('#audio').evaluate(a=>({
      time:Number(a.currentTime)||0,error:!!a.error,paused:a.paused
    }));
    result.mouseSeekReached=seek.time>=80&&seek.time<=190;
    result.audioError ||=seek.error;
    if(!result.mouseSeekReached){result.phase='MOUSE_SEEK_FAILED';return result;}
    await page.waitForTimeout(1700);
    const after=await page.locator('#audio').evaluate(a=>({
      time:Number(a.currentTime)||0,error:!!a.error,paused:a.paused
    }));
    result.afterSeekProgressSeconds=Math.round(
      Math.max(0,after.time-seek.time)*10)/10;
    result.audioError ||=after.error;
    if(after.paused||result.afterSeekProgressSeconds<.7){
      result.phase='AFTER_SEEK_STALLED';return result;
    }
    if(channel==='mg'){
      // Ensure Migu's 25s playback watchdog does not terminate a stream
      // that has already established real progress after a midtrack seek.
      result.phase='MIGU_POST_25S_WATCHDOG';
      await page.waitForTimeout(27000);
      const late=await page.locator('#audio').evaluate(a=>({
        time:Number(a.currentTime)||0,error:!!a.error,
        paused:a.paused,readyState:a.readyState
      }));
      result.postDeadlinePlaying=!late.paused&&!late.error&&
        late.readyState>=2;
      result.postDeadlineProgressSeconds=Math.round(
        Math.max(0,late.time-after.time)*10)/10;
      result.audioError ||=late.error;
    }
    result.verified=result.flowerActive&&result.channelSelected&&
      result.matchingSong&&result.rowClicked&&result.originalFlowerRoute&&
      result.started&&result.seekEnabled&&result.mouseSeekReached&&
      result.durationSeconds>=300&&result.durationSeconds<=650&&
      result.initialProgressSeconds>=.7&&
      result.afterSeekProgressSeconds>=.7&&!result.audioError&&
      (channel!=='mg'||(result.postDeadlinePlaying===true&&
        result.postDeadlineProgressSeconds>=5));
    result.phase=result.verified?'UI_LONG_AUDIO_AND_SEEK_PASS':
      'UI_PLAYBACK_INCOMPLETE';
  }catch{
    // No raw exception details: network exceptions can include signed URLs.
    result.phase='SAFE_TEST_EXCEPTION';
  }finally{
    try{await page.close();}catch{}
  }
  return result;
}
try{
  for(let round=1;round<=rounds;round++)
    for(const channel of channels){
      const r=await testChannel(channel,round);
      trials.push(r);
      console.log('FLOWER UI REPEAT ATTEMPT:',JSON.stringify(r));
    }
  const summary=channels.map(channel=>{
    const values=trials.filter(r=>r.channel===channel);
    return {channel,attempts:values.length,
      verified:values.filter(r=>r.verified).length,
      phases:values.map(r=>r.phase)};
  });
  console.log('FLOWER UI TWO-ROUND STABILITY:',JSON.stringify({
    realProduction:true,flowerOnly:true,
    attempts:trials.length,summary,
    allVerified:trials.length===channels.length*rounds&&
      trials.every(r=>r.verified)
  }));
}finally{await browser.close();}
