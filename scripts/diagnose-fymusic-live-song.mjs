import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';

// FyMusic live experiment. All search/resolver/audio traffic is REAL.
// No request mocks. Never output signed URLs, song IDs, headers or response bodies.
// An unavailable third-party source is a valid diagnostic finding, not a passing playback claim.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const flower='https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const TITLE='开始懂了',ARTIST='孙燕姿';
const platformNames=['wy','tx','kg'];
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s_.·-]+/g,'');
const safe=s=>String(s||'unknown').toLowerCase().replace(/[^a-z0-9_-]/g,'_').slice(0,38);
const snooze=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const rows=[];
let page,active=null;
const running=[];
try{
 page=await browser.newPage({viewport:{width:1366,height:900}});
 page.setDefaultTimeout(10000);
 page.on('response',response=>{
  const row=active;
  if(!row)return;
  const promise=(async()=>{
   try{
    const u=new URL(response.url());
    if(u.pathname==='/api/proxy'&&response.status()>=400){
     let channel='';
     try{
      const target=new URL(u.searchParams.get('url')||'');
      channel=target.pathname.match(/^\/flower\/v1\/url\/(wy|tx|kg|kw|mg)\//)?.[1]||'';
     }catch{}
     if(channel===row.platform&&row.resolverHttp.length<10)
      row.resolverHttp.push(response.status());
    }
    if(response.request().resourceType()!=='media')return;
    const original=response.url(); // NEVER persisted or printed
    const matching=await page.evaluate(url=>
     document.getElementById('audio')?.currentSrc===url,original).catch(()=>false);
    if(!matching)return;
    const status=response.status();
    const contentType=await response.headerValue('content-type');
    const kind=String(contentType||'').toLowerCase().startsWith('audio/')?'audio':
     String(contentType||'').toLowerCase().includes('text/html')?'html':
     String(contentType||'').toLowerCase().includes('application/json')?'json':'other';
    if(row.mediaHttp.length<6)row.mediaHttp.push({status,kind});
    await page.evaluate(data=>{
     if(document.getElementById('audio')?.currentSrc!==data.url)return;
     window.dispatchEvent(new CustomEvent('fymusic:media-http',{
      detail:{status:data.status,contentType:data.type,provenance:'browser_test'}
     }));
    },{url:original,status,type:contentType}).catch(()=>{});
   }catch{}
  })();
  running.push(promise);
 });
 page.on('requestfailed',request=>{
  const row=active;
  if(!row||request.resourceType()!=='media')return;
  // A previous song's aborted request must NOT be attributed to the next song.
  const url=request.url(); // transient only, never logged or stored
  running.push(page.evaluate(current=>
    document.getElementById('audio')?.currentSrc===current,url)
   .then(matches=>{if(matches)row.mediaNetworkError=true;}).catch(()=>{}));
 });
 await page.addInitScript(()=>{
  localStorage.setItem('only-testing-online-music.play-settings',JSON.stringify({
   qualityMode:'highest',fixedQuality:'320k',autoFallback:true
  }));
 });
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>!!window.FyMusicPlaybackDiagnostics?.report,
  null,{timeout:18000});
 await page.locator('.nav-item[data-view="settings"]').click();
 await page.locator('#source-url').fill(flower);
 await page.locator('#install-btn').click();
 let ready=false;
 try{
  await page.waitForFunction(url=>{
   const s=window.LXSourceManager?.getActive?.();
   return !!(s?.inited&&s?.runtime&&s?.url===url);
  },flower,{timeout:40000});
  ready=true;
 }catch{}
 const channels=await page.evaluate(()=>{
  const s=window.LXSourceManager?.getActive?.();
  return {isFlower:!!s?.inited&&String(s?.url||'').endsWith('/flower/latest.js'),
   declared:Object.fromEntries(['wy','tx','kg'].map(p=>
    [p,Array.isArray(s?.sources?.[p]?.qualitys)?s.sources[p].qualitys:[]]))};
 });
 if(!ready||!channels.isFlower){
  for(const platform of platformNames)rows.push({
   platform,stage:'source_init',outcome:'flower_not_initialized'
  });
 }else{
  await page.locator('.nav-item[data-view="search"]').click();
  await page.evaluate(()=>{
   window.__fyLiveSearch={finished:false,status:'pending'};
   window.addEventListener('fymusic:search-start',()=>{
    window.__fyLiveSearch={finished:false,status:'pending'};
   });
   window.addEventListener('fymusic:search-page',event=>{
    window.__fyLiveSearch={finished:true,status:'result',
     count:event.detail?.items?.length||0};
   });
   window.addEventListener('fymusic:search-error',()=>{
    window.__fyLiveSearch={finished:true,status:'error'};
   });
  });
  for(const platform of platformNames){
   const row={platform,stage:'search',outcome:'not_tested',
    candidates:0,searchQueries:0,requestedQuality:'unknown',
    declaredQuality:channels.declared[platform].filter(x=>typeof x==='string').slice(0,12),
    resolverHttp:[],mediaHttp:[],mediaNetworkError:false,
    progressConfirmed:false};
   rows.push(row);active=row;
   try{
    const button=page.locator('#channel-list .channel-button[title="'+platform.toUpperCase()+'"]');
    if(!await button.count()){row.outcome='channel_unavailable';continue;}
    await button.click();
    let index=-1;
    for(const query of ['开始懂了','孙燕姿 开始懂了']){
     row.searchQueries++;
     await page.locator('#global-search-input').fill(query);
     await page.locator('#global-search-btn').click();
     try{
      await page.waitForFunction(()=>window.__fyLiveSearch?.finished===true,
       null,{timeout:18000});
     }catch{row.outcome='search_timeout';continue;}
     const info=await page.evaluate(({title,artist})=>{
      const normalize=s=>String(s||'').normalize('NFKC').toLowerCase()
       .replace(/[\s_.·-]+/g,'');
      const data=window.__LXLastSearchResults||[];
      const hits=[];
      for(let i=0;i<data.length;i++){
       if(normalize(data[i]?.name)===normalize(title)&&
          normalize(data[i]?.singer).includes(normalize(artist)))hits.push(i);
      }
      return {hits:hits.slice(0,20),status:window.__fyLiveSearch?.status,
       provider:window.FyMusicPlaybackDiagnostics.report()?.search?.provider};
     },{title:TITLE,artist:ARTIST});
     // The report() API reflects the last *selected* song while the next
     // search is in progress. Provider attribution happens AFTER row click.
     row.candidates=info.hits.length;
     row.searchStatus=safe(info.status);
     if(info.hits.length){index=info.hits[0];break;}
    }
    if(index<0){
     row.outcome=row.outcome==='search_timeout'?'search_timeout':
      row.searchStatus==='error'?'search_failed':'exact_song_not_found';
     continue;
    }
    if(!row.declaredQuality.length){row.outcome='no_declared_quality';continue;}
    row.stage='resolve_and_play';
    const song=page.locator('#search-results .search-song-row .search-song-main').nth(index);
    if(!await song.count()){row.outcome='row_missing';continue;}
    await song.click();
    // The actual app controls source requests, quality fallback and streaming.
    try{
     await page.waitForFunction(()=>{
      const report=window.FyMusicPlaybackDiagnostics.report();
      if(report.outcome==='playback_progress_confirmed')return true;
      const status=document.getElementById('status')?.textContent||'';
      return /当前歌曲暂未取得播放地址|音频播放连接失败|当前音质无法播放/.test(status);
     },null,{timeout:33000});
    }catch{}
    await snooze(250);
    let r=await page.evaluate(()=>window.FyMusicPlaybackDiagnostics.report());
    // A transient 0.7s clip is insufficient: verify the SAME stream
    // continues for another 3.6s and exposes plausible song duration.
    if(r.media?.progressConfirmed){
     const start=r.media.mediaSeconds||0;
     await snooze(3600);
     const sustained=await page.evaluate(()=>{
      const a=document.getElementById('audio');
      return {seconds:Number(a?.currentTime)||0,duration:Number(a?.duration)||0,
       paused:!!a?.paused,ended:!!a?.ended,errorCode:a?.error?.code||null};
     });
     row.durationSeconds=Math.round(sustained.duration*10)/10;
     row.sustainedProgress=sustained.seconds>=Math.max(3,start+2.3)&&
      sustained.duration>=120&&sustained.duration<=700&&!sustained.ended&&
      !sustained.errorCode;
     r=await page.evaluate(()=>window.FyMusicPlaybackDiagnostics.report());
    }
    row.outcome=safe(r.outcome==='pending'?'playback_unconfirmed':r.outcome);
    row.searchProvider=safe(r.search?.provider);
    row.linkedSource=safe(r.source);
    row.provenanceConsistent=row.linkedSource===platform&&
      r.search?.status==='selected';
    row.stage=safe(r.blockedAt|| (r.media?.progressConfirmed?'media_progress':
      r.media?.urlResolved?'media_load':'resolve'));
    row.searchLink=safe(r.search?.status);
    row.catalogMatch=safe(r.stages?.catalog);
    row.resolverPhase=safe(r.stages?.resolver);
    row.resolverFailure=safe(r.resolver?.failure);
    row.resolverAttempts=Number(r.resolver?.attemptCount)||0;
    row.requestedQuality=safe(r.resolver?.quality);
    row.urlResolved=!!r.media?.urlResolved;
    row.metadataLoaded=!!r.media?.metadataLoaded;
    row.mediaReady=!!r.media?.mediaReady;
    row.progressConfirmed=!!r.media?.progressConfirmed;
    row.mediaSeconds=Math.round((Number(r.media?.mediaSeconds)||0)*10)/10;
    // 'progressConfirmed' is a short clock-observation, not a multi-second
    // playback guarantee. The sustained flag is the stronger independent check.
    row.httpStatus=Number.isInteger(r.media?.http?.status)?r.media.http.status:null;
    row.httpClassification=safe(r.media?.http?.result);
    row.audioErrorCode=Number.isInteger(r.media?.mediaErrorCode)?r.media.mediaErrorCode:null;
   }catch{
    row.stage='harness';row.outcome='browser_step_error';
   }finally{active=null;}
  }
 }
 await Promise.allSettled(running);
}finally{
 await browser.close();
}
const output={schema:'fymusic.live-flower.v1',
 target:{title:TITLE,artist:ARTIST},
 source:'unmodified Flower/latest.js',
 environment:'GitHub Actions Chromium, isolated local Cloudflare Pages server',
 qualityPolicy:'highest declared quality first, allow fallback',
 verification:'real HTMLAudioElement clock movement; not song identity or audible confirmation',
 results:rows};
await mkdir('diagnostics',{recursive:true});
await writeFile('diagnostics/fymusic-live-flower.json',JSON.stringify(output,null,2)+'\n');
console.log('FYMUSIC_LIVE_SONG_REPORT '+JSON.stringify(output));
console.log('FYMUSIC_LIVE_SONG_FINISHED');
// Actual upstream failures are diagnostic results, not test infrastructure failures.
