import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// Read-only live Cloudflare Preview acceptance. Real catalog search and Flower
// media for the substitute; only the *original Kugou musicUrl* is fault-injected
// to model the user's known failing provider. Never log signed media URLs.
const base=process.env.TEST_BASE_URL?.replace(/\/+$/,'')||'';
const target=new URL(base);
const production=target.hostname==='only-testing-online-music.pages.dev';
assert.ok(production?process.env.FYMUSIC_ACCEPT_PRODUCTION==='1':
 /^[a-f0-9]{8}\.only-testing-online-music\.pages\.dev$/.test(target.hostname),
 'Only immutable Preview or explicitly authorized production probe');
assert.equal(target.protocol,'https:');
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1360,height:900}});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,null,{timeout:24000});
 const flower=await page.evaluate(()=>String(window.LXSourceManager.getActive()?.name||'').includes('野花'));
 assert.equal(flower,true,'Actual Flower LX source must be installed');
 await page.locator('.nav-item[data-view="search"]').click();
 await page.locator('#channel-list .channel-button[title="KG"]').click();
 let index=-1;
 for(const keyword of ['开始懂了','孙燕姿']){
  await page.locator('#global-search-input').fill(keyword);
  await page.locator('#global-search-btn').click();
  try{await page.waitForFunction(()=>window.__LXLastSearchResults?.some(s=>
   s.source==='kg'&&String(s.name||'').trim()==='开始懂了'&&
   String(s.singer||'').includes('孙燕姿')),null,{timeout:17000});}catch{}
  index=await page.evaluate(()=>window.__LXLastSearchResults?.findIndex(s=>
   s.source==='kg'&&String(s.name||'').trim()==='开始懂了'&&
   String(s.singer||'').includes('孙燕姿'))??-1);
  if(index>=0)break;
 }
 const audit={song:'开始懂了',artist:'孙燕姿',initial:'kg',
  songFound:index>=0,sourceAfter:'',playing:false,lyricLines:0,
  coverLoaded:false,offeredManualUI:false,qualityRequests:[],
  error:'',matchedCandidate:false};
 if(index<0){
  console.log('FYMUSIC_REAL_KUGOU_FAULT_INJECTION_RESULT',JSON.stringify(audit));
  throw new Error('Exact Kugou target song was absent from live search');
 }
 await page.evaluate(()=>{
  window.__fymusicFaultQuality=[];
  const manager=window.LXSourceManager;
  const original=manager.requestAction.bind(manager);
  manager.requestAction=function(source,action,args,done){
   if(source==='kg'&&action==='musicUrl'){
    window.__fymusicFaultQuality.push(String(args?.type||''));
    return done(new Error('Controlled Kagou resolver HTTP 502'));
   }
   return original(source,action,args,done);
  };
  const audio=document.getElementById('audio');
  audio.muted=true;audio.volume=0;
 });
 await page.locator('#search-results .search-song-row .search-song-main').nth(index).click();
 try{
  await page.waitForFunction(()=>{
   const a=document.getElementById('audio');
   const source=window.__LXNowPlayingTrack?.source;
   return a&&!a.paused&&a.readyState>=2&&a.currentTime>.9&&
    ['kw','mg','wy'].includes(source);
  },null,{timeout:75000});
 }catch(error){audit.error='Fallback did not establish real alternate audio';}
 try{
  await page.waitForFunction(()=>document.querySelectorAll('#lyrics-lines .lyrics-line').length>=2,
   null,{timeout:22000});
 }catch(error){audit.error='Real matching audio is playing but lyrics did not appear';}
 const result=await page.evaluate(()=>({
  sourceAfter:window.__LXNowPlayingTrack?.source||'',
  playing:(()=>{const a=document.getElementById('audio');return !a.paused&&a.readyState>=2&&a.currentTime>.9})(),
  lyricLines:document.querySelectorAll('#lyrics-lines .lyrics-line').length,
  coverLoaded:!!document.getElementById('lyrics-cover-image')?.naturalWidth,
  offeredManualUI:document.querySelectorAll('.fymusic-alternate-search').length>0,
  qualityRequests:window.__fymusicFaultQuality||[],
  displayTitle:document.getElementById('player-title')?.textContent||'',
  status:(document.getElementById('status')?.textContent||'').slice(0,135)
 }));
 Object.assign(audit,result);
 console.log('FYMUSIC_REAL_KUGOU_FAULT_INJECTION_RESULT',JSON.stringify(audit));
 assert.equal(audit.playing,true,'Must play the real substituted recording');
 assert.ok(['kw','mg','wy'].includes(audit.sourceAfter));
 assert.equal(audit.offeredManualUI,false,'No popup or manual search gate');
 assert.equal(audit.displayTitle,'开始懂了');
 assert.ok(audit.qualityRequests.length>=1);
 assert.ok(audit.lyricLines>=2,'Real matching lyrics should appear after audio starts');
 console.log('FYMUSIC_REAL_CROSS_PROVIDER_LYRIC_PASS');
 console.log('FYMUSIC_REAL_KUGOU_SEAMLESS_AUDIO_FALLBACK_PASS');
}finally{await browser.close()}
