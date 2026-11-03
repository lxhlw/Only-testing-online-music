import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const production='https://only-testing-online-music.pages.dev';
const out='audit-ui-live-depth';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:1366,height:900},deviceScaleFactor:1});
const page=await context.newPage();
const checked=[],findings=[],upstream=[];
const errors=[],api=[];
page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,400)));
page.on('response',res=>{
 const url=new URL(res.url());if(url.origin===production&&url.pathname.startsWith('/api/'))
 api.push({endpoint:url.pathname,status:res.status()});
});
const capture=async name=>page.screenshot({path:out+'/'+name+'.png',animations:'disabled'});
async function scenario(name,fn,strict=true){
 try{const value=await fn();
  checked.push({name,status:'PASS',value});
  console.log('FYMUSIC_LIVE_UI_PASS',JSON.stringify({name,value}));
 }catch(e){
  const value=String(e.message||e).slice(0,1200);
  if(strict)findings.push({name,error:value});else upstream.push({name,error:value});
  checked.push({name,status:strict?'FAIL':'UPSTREAM_INCONCLUSIVE',value});
  console.log(strict?'FYMUSIC_LIVE_UI_FAIL':'FYMUSIC_LIVE_UI_UPSTREAM_UNKNOWN',
    JSON.stringify({name,error:value}));
  try{await capture('issue-'+name.replace(/[^a-z0-9-]+/gi,'-'))}catch{}
 }
}
const go=async(name)=>{
 await page.locator('.nav-item[data-view="'+name+'"]').click();
 await page.waitForFunction(v=>document.querySelector('#view-'+v)?.classList.contains('active'),name);
};
try{
 await page.goto(production+'/',{waitUntil:'domcontentloaded',timeout:40000});
 await page.waitForFunction(()=>Boolean(window.OnlyTestingMusicApp&&window.LXSourceManager),null,{timeout:15000});
 await scenario('official-song-live-search-and-queue-favorite-controls',async()=>{
  await go('search');
  await page.locator('#global-search-input').fill('开始懂了');
  await page.locator('#global-search-btn').click();
  await page.locator('#search-results .search-song-row').first().waitFor({state:'visible',timeout:22000});
  const matches=await page.locator('#search-results .search-song-row').count();
  const row=page.locator('#search-results .search-song-row').filter({hasText:'孙燕姿'}).first();
  await row.waitFor({state:'visible',timeout:8000});
  const song=await row.locator('.song-title').innerText();
  const singer=await row.locator('.song-artist').innerText();
  assert.ok(song.includes('开始懂了')&&singer.includes('孙燕姿'));
  await row.locator('.song-action-queue').first().click();
  await row.locator('.song-action-favorite').first().click();
  const stored=await page.evaluate(()=>({
    queue:window.LXMusicLibrary.snapshot().queue.length,
    favorites:window.LXMusicLibrary.snapshot().favorites.length
  }));
  assert.ok(stored.queue>0&&stored.favorites>0,'UI controls did not save actual track');
  await capture('official-track-search-actions');
  return {song,singer,matches,stored};
 },false);
 await scenario('official-track-live-audio-native-timeline',async()=>{
  await go('search');
  const row=page.locator('#search-results .search-song-row')
    .filter({hasText:'孙燕姿'}).first();
  await row.locator('.song-action-play').click();
  await page.waitForFunction(()=>document.getElementById('player-title')?.textContent.includes('开始懂了'),
   null,{timeout:10000});
  let started=false;
  try{
   await page.waitForFunction(()=>{
    const a=document.getElementById('audio');
    return !!a&&a.readyState>=2&&!a.paused&&a.currentTime>0.7;
   },null,{timeout:35000});started=true;
  }catch{}
  const first=await page.evaluate(()=>{
   const a=document.getElementById('audio');
   return {title:document.getElementById('player-title')?.textContent,
    artist:document.getElementById('player-artist')?.textContent,
    status:document.getElementById('status')?.textContent?.slice(0,240),
    bottomStatus:document.getElementById('bottom-play-status')?.textContent,
    source:document.getElementById('top-source-label')?.textContent,
    currentTime:a?.currentTime,readyState:a?.readyState,
    paused:a?.paused,error:a?.error?.code??null,
    duration:a?.duration,seekEnabled:!document.getElementById('player-seek')?.disabled};
  });
  await capture('official-track-audio-attempt');
  if(!started){upstream.push({name:'official-track-live-audio-not-confirmed',first});
   return {started:false,first,classification:'Upstream/browser availability not established'};}
  const seek=page.locator('#player-seek');
  if(!(await seek.isEnabled()))findings.push({name:'player-seek-not-enabled-after-playing',first});
  else{
   await seek.evaluate(el=>{el.value='250';el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
   await page.waitForTimeout(1600);
  }
  const after=await page.evaluate(()=>{
   const a=document.getElementById('audio');
   return {currentTime:a.currentTime,paused:a.paused,seekDisabled:document.getElementById('player-seek').disabled,
    bottomStatus:document.getElementById('bottom-play-status')?.textContent};
  });
  await capture('official-track-after-seek');
  return {started:true,first,after};
 },false);
 await scenario('real-track-now-playing-lyrics-and-comments',async()=>{
  await page.locator('#player-cover-button').click();
  const title=await page.locator('#lyrics-title').innerText();
  const info=await page.locator('#lyrics-status').innerText();
  await capture('official-track-lyrics-overlay');
  await page.locator('#comments-tab').click();
  await page.waitForTimeout(2000);
  const comments=await page.locator('#comments-status').innerText();
  const count=await page.locator('#comments-list').locator(':scope > *').count();
  await capture('official-track-comments-overlay');
  await page.locator('#lyrics-close-btn').click();
  assert.ok(title.includes('开始懂了'),'Wrong detail song');
  return {title,lyricsStatus:info,commentsStatus:comments,visibleCommentNodes:count};
 },false);
 await scenario('real-playlist-detail-songs-save-and-return',async()=>{
  await go('playlist');
  await page.locator('#playlist-featured .playlist-card').first().waitFor({state:'visible',timeout:18000});
  const name=await page.locator('#playlist-featured .playlist-card .playlist-name').first().innerText();
  await page.locator('#playlist-featured .playlist-card .playlist-open-button').first().click();
  await page.locator('#playlist-detail-panel').waitFor({state:'visible',timeout:12000});
  await page.waitForTimeout(3500);
  const status=await page.locator('#playlist-detail-status').innerText();
  const songs=await page.locator('#playlist-detail-songs .playlist-song-row').count();
  await capture('real-playlist-detail');
  await page.locator('#playlist-favorite-btn').click();
  const fav=await page.locator('#playlist-favorite-btn').innerText();
  assert.ok(fav.includes('取消收藏'),'Playlist favorite did not toggle');
  await page.locator('#playlist-back-btn').click();
  await page.waitForTimeout(150);
  await go('mylist');
  await page.locator('.my-tab[data-my-tab="playlist-favorite"]').click();
  const present=await page.locator('#playlist-favorite-list .playlist-card').count();
  assert.ok(present>=1,'Playlist missing from favorites');
  await capture('real-playlist-favorites');
  return {name,status,songs,favorite:present};
 },false);
 await scenario('real-ranking-song-list-and-platform-switch',async()=>{
  await go('ranking');
  await page.locator('#ranking-list .ranking-item').first().waitFor({state:'visible',timeout:18000});
  const first=await page.locator('#ranking-list .ranking-item').first().innerText();
  await page.locator('#ranking-list .ranking-item').first().click();
  await page.waitForTimeout(1800);
  const wynum=await page.locator('#ranking-songs .chart-song-row').count();
  await capture('real-wy-ranking-songs');
  await page.locator('[data-ranking-source="tx"]').click();
  await page.locator('#ranking-list .ranking-item').first().waitFor({state:'visible',timeout:18000});
  await page.locator('#ranking-list .ranking-item').first().click();
  await page.waitForTimeout(1800);
  const qqnum=await page.locator('#ranking-songs .chart-song-row').count();
  await capture('real-qq-ranking-songs');
  if(!wynum||!qqnum)upstream.push({name:'live-ranking-track-count',wynum,qqnum});
  return {wyFirstChart:first,wySongs:wynum,qqSongs:qqnum};
 },false);
 await scenario('search-playlist-source-switch-and-live-catalog',async()=>{
  await go('search');
  await page.locator('.view-tab[data-search-kind="playlist"]').click();
  await page.locator('#search-playlist-view [data-catalog-source="wy"]').click();
  await page.locator('#global-search-input').fill('轻音乐');
  await page.locator('#global-search-btn').click();
  await page.waitForTimeout(3300);
  const wy=await page.locator('#playlist-results .playlist-card').count();
  await page.locator('#search-playlist-view [data-catalog-source="tx"]').click();
  await page.locator('#global-search-input').fill('民谣');
  await page.locator('#global-search-btn').click();
  await page.waitForTimeout(3300);
  const tx=await page.locator('#playlist-results .playlist-card').count();
  await capture('real-search-playlists-qq');
  if(!wy||!tx)upstream.push({name:'live-playlist-search-empty',wy,tx});
  return {wy,tx};
 },false);
}finally{
 await writeFile(out+'/live-depth.json',JSON.stringify({
  base:production,date:new Date().toISOString(),checked,findings,upstream,errors,api
 },null,2));
 await context.close();await browser.close();
}
console.log('FYMUSIC_PRODUCTION_UI_LIVE_DEPTH_COMPLETE',JSON.stringify({
 scenarios:checked.length,passed:checked.filter(x=>x.status==='PASS').length,
 inconclusive:checked.filter(x=>x.status==='UPSTREAM_INCONCLUSIVE').length,
 findings,upstream,errors,api:api.slice(-30)
}));
if(findings.length||errors.length)process.exitCode=1;
