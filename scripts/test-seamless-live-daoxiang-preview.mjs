import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Independent, unmocked alternate-media acceptance. Only KG's known failing
// resolver is fault-injected; catalog searches, KW/MG/WY resolving, audio,
// album artwork and lyrics are the real public services.
const base=(process.env.TEST_BASE_URL||'').replace(/\/+$/,'');
const origin=new URL(base);
assert.match(origin.hostname,/^[a-f0-9]{8}\.only-testing-online-music\.pages\.dev$/);
assert.equal(origin.protocol,'https:');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const audit={song:'稻香',artist:'周杰伦',originalPlatform:'kg',
 selectedDuration:null,searchResultCount:0,queries:[],qualityRequests:[],
 sourceAfter:'',audioPlaying:false,lyricLines:0,coverLoaded:false,
 manualFallback:false,error:''};
try{
 const page=await browser.newPage({viewport:{width:1360,height:900}});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,
  null,{timeout:24000});
 assert.ok(await page.evaluate(()=>String(window.LXSourceManager.getActive().name).includes('野花')));
 await page.locator('.nav-item[data-view="search"]').click();
 await page.locator('#channel-list .channel-button[title="KG"]').click();
 await page.locator('#global-search-input').fill('稻香');
 await page.locator('#global-search-btn').click();
 await page.waitForFunction(()=>window.__LXLastSearchResults?.some(s=>
  s.source==='kg'&&String(s.name||'').trim()==='稻香'&&
  String(s.singer||'').includes('周杰伦')),null,{timeout:24000});
 const selection=await page.evaluate(()=>{
  const all=window.__LXLastSearchResults||[];
  const eligible=all.map((s,index)=>({s,index})).filter(x=>
   x.s.source==='kg'&&String(x.s.name||'').trim()==='稻香'&&
   String(x.s.singer||'').includes('周杰伦'));
  const preferred=eligible.find(x=>window.FyMusicCrossPlatformMatch.durationSeconds(x.s)===198);
  const chosen=preferred||eligible[0];
  return {index:chosen.index,duration:window.FyMusicCrossPlatformMatch.durationSeconds(chosen.s),
   eligibleCount:eligible.length};
 });
 audit.selectedDuration=selection.duration;
 audit.searchResultCount=selection.eligibleCount;
 await page.evaluate(()=>{
  window.__daoxiangSearch=[];
  window.__daoxiangQuality=[];
  const search=window.LXMusicSearch.search;
  window.LXMusicSearch.search=function(source,keyword,page,limit,callback){
   if(['kw','mg','wy'].includes(source))
    window.__daoxiangSearch.push({platform:source,keyword:String(keyword).slice(0,50)});
   return search.call(this,source,keyword,page,limit,callback);
  };
  const manager=window.LXSourceManager;
  const original=manager.requestAction.bind(manager);
  manager.requestAction=function(source,action,args,callback){
   if(source==='kg'&&action==='musicUrl'){
    window.__daoxiangQuality.push(String(args?.type||''));
    return callback(new Error('Controlled Kugou musicUrl HTTP 502'));
   }
   return original(source,action,args,callback);
  };
  const audio=document.getElementById('audio');
  audio.volume=0;audio.muted=true;
 });
 await page.locator('#search-results .search-song-row .search-song-main').nth(selection.index).click();
 try{
  await page.waitForFunction(()=>{
   const a=document.getElementById('audio');
   const s=window.__LXNowPlayingTrack?.source;
   return a&&!a.paused&&a.readyState>=2&&a.currentTime>1&&['kw','mg','wy'].includes(s);
  },null,{timeout:85000});
 }catch(error){audit.error='No real alternate audio could be played';}
 try{
  await page.waitForFunction(()=>document.querySelectorAll('#lyrics-lines .lyrics-line').length>=2,
   null,{timeout:18000});
 }catch(error){if(!audit.error)audit.error='Audio did play, but timed lyrics were unavailable';}
 const result=await page.evaluate(()=>{
  const a=document.getElementById('audio');
  return {
   sourceAfter:window.__LXNowPlayingTrack?.source||'',
   audioPlaying:!!a&&!a.paused&&a.readyState>=2&&a.currentTime>1,
   lyricLines:document.querySelectorAll('#lyrics-lines .lyrics-line').length,
   coverLoaded:!!document.getElementById('lyrics-cover-image')?.naturalWidth,
   manualFallback:document.querySelectorAll('.fymusic-alternate-search').length>0,
   queries:window.__daoxiangSearch||[],
   qualityRequests:window.__daoxiangQuality||[],
   displayTitle:document.getElementById('player-title')?.textContent||'',
   status:(document.getElementById('status')?.textContent||'').slice(0,160)
  };
 });
 Object.assign(audit,result);
 console.log('FYMUSIC_REAL_DAOXIANG_FALLBACK_DIAGNOSTIC',JSON.stringify(audit));
 assert.equal(audit.audioPlaying,true,'Daoxiang must actually produce unmocked audio');
 assert.ok(['kw','mg','wy'].includes(audit.sourceAfter),'Must automatically switch to an alternate platform');
 assert.equal(audit.manualFallback,false,'No manual confirmation gate');
 assert.equal(audit.displayTitle,'稻香');
 assert.ok(audit.qualityRequests.length>=1);
 assert.ok(audit.queries.some(q=>q.platform==='kw'&&q.keyword==='稻香'),
  'Recovery must try title-only Kuwo search');
 assert.ok(audit.lyricLines>=2,'Timed lyrics required for accepted Daoxiang fallback');
 console.log('FYMUSIC_REAL_DAOXIANG_SEAMLESS_FALLBACK_PASS');
}finally{await browser.close()}
