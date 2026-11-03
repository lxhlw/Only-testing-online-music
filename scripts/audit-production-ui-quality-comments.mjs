import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';

const origin='https://only-testing-online-music.pages.dev';
const out='audit-ui-quality-comments';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:1366,height:900}});
const page=await context.newPage();
const results={},errors=[],net=[];
page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,250)));
page.on('response',async r=>{
 try{
  const u=new URL(r.url()),h=r.headers();
  if(u.origin!==origin||!u.pathname.startsWith('/api/'))return;
  const type=h['content-type']||'';
  const item={route:u.pathname,status:r.status(),type:type.slice(0,80)};
  if(/^audio\//.test(type)||h['content-range']){
   item.contentRange=h['content-range']||null;
   item.contentLength=h['content-length']||null;
  }
  net.push(item);
 }catch{}
});
const scrape=()=>page.evaluate(()=>{
 const audio=document.getElementById('audio');
 return {title:document.getElementById('player-title')?.textContent,
  artist:document.getElementById('player-artist')?.textContent,
  status:document.getElementById('status')?.textContent?.slice(0,450),
  qualitySummary:document.getElementById('inline-current-quality')?.textContent?.slice(0,280),
  source:document.getElementById('top-source-label')?.textContent?.slice(0,120),
  time:audio?.currentTime??null,duration:audio?.duration??null,
  paused:audio?.paused??null,readyState:audio?.readyState??null,
  errorCode:audio?.error?.code??null,seekDisabled:document.getElementById('player-seek')?.disabled};
});
try{
 await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>Boolean(window.LXSourceManager?.getActive),null,{timeout:15000});
 await page.locator('.nav-item[data-view="settings"]').click();
 await page.locator('#inline-quality').selectOption('320k');
 await page.locator('#inline-fallback').uncheck();
 await page.locator('#inline-save-settings').click();
 results.selectedQuality=await page.locator('#inline-quality').inputValue();
 results.fallbackAllowed=await page.locator('#inline-fallback').isChecked();
 results.settingsText=await page.locator('#inline-settings-status').innerText();
 await page.screenshot({path:out+'/fixed320-settings.png'});
 await page.locator('.nav-item[data-view="search"]').click();
 await page.locator('#global-search-input').fill('开始懂了');
 await page.locator('#global-search-btn').click();
 const row=page.locator('#search-results .search-song-row').filter({hasText:'孙燕姿'}).first();
 await row.waitFor({state:'visible',timeout:30000});
 await row.locator('.song-action-play').click();
 await page.waitForFunction(()=>document.getElementById('player-title')?.textContent.includes('开始懂了'),null,{timeout:12000});
 try{await page.waitForFunction(()=>{
  const a=document.getElementById('audio');
  const s=document.getElementById('status')?.textContent||'';
  return (a?.currentTime>1&&!a.paused)||/失败|无法|不支持|播放错误/.test(s);
 },null,{timeout:30000});}catch{}
 results.fixed320=await scrape();
 await page.screenshot({path:out+'/fixed320-live-song.png'});
 if(results.fixed320.time>1&&!results.fixed320.paused){
  results.fixed320.playable=true;
  results.fixed320.correctRequestedQuality=/请求\s*320k/.test(results.fixed320.status);
 }else {
  results.fixed320.playable=false;
  results.fixed320.rejectedWithoutSilentDowngrade=
    !/请求\s*128k/.test(results.fixed320.status);
 }
 await page.locator('#player-cover-button').click();
 await page.locator('#comments-tab').click();
 await page.waitForTimeout(4000);
 results.commentsAttempt1={
  status:await page.locator('#comments-status').innerText(),
  count:await page.locator('#comments-list').locator(':scope > *').count(),
  externalLinkVisible:await page.locator('#comments-link-wrap').isVisible()
 };
 await page.screenshot({path:out+'/comments-real-first.png'});
 await page.locator('#comments-refresh-btn').click();
 await page.waitForTimeout(4500);
 results.commentsAttempt2={
  status:await page.locator('#comments-status').innerText(),
  count:await page.locator('#comments-list').locator(':scope > *').count(),
  externalLinkVisible:await page.locator('#comments-link-wrap').isVisible()
 };
 await page.screenshot({path:out+'/comments-real-retry.png'});
 results.api=net.slice(-32);
 results.errors=errors;
 results.estimatedMediaBitrateKbps=null;
 const range=net.filter(x=>x.contentRange).slice(-1)[0];
 const total=range?.contentRange?.match(/\/(\d+)$/);
 if(total&&Number.isFinite(results.fixed320.duration)&&results.fixed320.duration>0)
  results.estimatedMediaBitrateKbps=Math.round(Number(total[1])*8/results.fixed320.duration/1000);
}finally{
 await writeFile(out+'/quality-comments.json',JSON.stringify(results,null,2));
 await context.close();await browser.close();
}
console.log('FYMUSIC_UI_QUALITY_COMMENTS_CHECK',JSON.stringify(results));
if(errors.length)process.exitCode=1;
