import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const base='https://only-testing-online-music.pages.dev';
assert.equal(process.env.TEST_BASE_URL,base);
const out='audit-ui-features',results=[],issues=[],providerWarnings=[];
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:1280,height:850},deviceScaleFactor:1});
const page=await context.newPage();
const pageErrors=[],apiResponses=[];
page.on('pageerror',e=>pageErrors.push(String(e.message||e).slice(0,250)));
page.on('response',r=>{
 try{const u=new URL(r.url());if(u.origin===base&&u.pathname.startsWith('/api/'))
 apiResponses.push({endpoint:u.pathname,status:r.status()})}catch{}
});
await page.addInitScript(()=>{
 localStorage.setItem('only-testing-online-music.default-source-disabled','1');
});
async function record(name,fn){
 try{
  const data=await fn();
  results.push({name,status:'PASS',data});
  console.log('FYMUSIC_FUNCTIONAL_PASS',JSON.stringify({name,data}));
 }catch(e){
  const error=String(e.message||e).slice(0,700);
  issues.push({name,error});
  results.push({name,status:'FAIL',error});
  console.log('FYMUSIC_FUNCTIONAL_FAIL',JSON.stringify({name,error}));
  try{await page.screenshot({path:out+'/fail-'+name.replace(/[^a-z0-9-]/gi,'_')+'.png',animations:'disabled'})}catch{}
 }
}
const nav=async v=>{
 await page.locator('.nav-item[data-view="'+v+'"]').click();
 await page.waitForFunction(v=>document.getElementById('view-'+v)?.classList.contains('active'),v,{timeout:10000});
};
const snap=async name=>{
 await page.screenshot({path:out+'/'+name+'.png',animations:'disabled',timeout:25000});
};
try{
 await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>Boolean(window.LXMusicLibrary)&&Boolean(window.LXPlayerControls)&&
  Boolean(window.OnlyTestingNavigate),null,{timeout:20000});
 await record('five-view-navigation-and-menus',async()=>{
  const visited=[];
  for(const view of ['search','playlist','ranking','mylist','settings']){
   await nav(view);
   visited.push({view,title:await page.locator('#view-'+view+' h1').first().innerText()});
  }
  assert.equal(visited.length,5);
  await snap('five-views-final-settings');
  return visited;
 });
 await record('quality-settings-save-and-persist',async()=>{
  await nav('settings');
  const settings=page.locator('#inline-quality');
  const choices=await settings.locator('option').evaluateAll(ns=>ns.map(n=>n.value));
  for(const quality of ['highest','128k','192k','256k','320k','flac','flac24bit','flac32bit'])
   assert.ok(choices.includes(quality),'missing quality '+quality);
  await settings.selectOption('320k');
  assert.equal(await page.locator('#inline-fallback').isChecked(),false);
  await page.locator('#inline-save-settings').click();
  const saved=await page.locator('#inline-settings-status').innerText();
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.LXMusicLibrary)&&Boolean(window.LXPlayerControls));
  await nav('settings');
  assert.equal(await page.locator('#inline-quality').inputValue(),'320k');
  assert.equal(await page.locator('#inline-fallback').isChecked(),false);
  await snap('saved-320k-settings');
  await page.locator('#inline-reset-settings').click();
  const restored=await page.locator('#inline-quality').inputValue();
  assert.equal(restored,'highest');
  return {choices,saved,restored};
 });
 await record('playback-modes-radio-accessibility',async()=>{
  const mode=page.locator('#player-mode-btn');
  const tested=[];
  for(const value of ['sequence','list-loop','single-loop','shuffle']){
   await mode.click();
   const item=page.locator('#player-mode-menu [data-mode="'+value+'"]');
   await item.waitFor({state:'visible',timeout:5000});
   await item.click();
   const state=await item.getAttribute('aria-checked');
   tested.push({value,checked:state});
   assert.equal(state,'true','mode selection '+value);
  }
  await mode.click();
  await page.locator('#player-mode-menu [data-mode="sequence"]').click();
  return tested;
 });
 await record('player-volume-and-mute',async()=>{
  const before=await page.locator('#audio').evaluate(e=>({volume:e.volume,muted:e.muted}));
  await page.locator('#player-volume').evaluate(e=>{e.value='35';e.dispatchEvent(new Event('input',{bubbles:true}));});
  const after=await page.locator('#audio').evaluate(e=>({volume:e.volume,muted:e.muted}));
  assert.ok(Math.abs(after.volume-0.35)<.02,'volume not reflected on HTMLAudioElement');
  await page.locator('#player-volume-btn').click();
  const muted=await page.locator('#audio').evaluate(e=>e.muted);
  assert.equal(muted,true,'mute button ineffective');
  await page.locator('#player-volume-btn').click();
  const restored=await page.locator('#audio').evaluate(e=>e.muted);
  assert.equal(restored,false,'unmute button ineffective');
  return {before,after,muted,restored};
 });
 await record('isolated-library-queue-history-favorites-persistence',async()=>{
  await page.evaluate(()=>{
   const m={source:'wy',id:'audit-only-song-01',name:'FyMusic UI 审计样本',
    singer:'UI QA',albumName:'Test Fixture',interval:225000};
   window.LXMusicLibrary.addQueue(m);
   window.LXMusicLibrary.addHistory(m);
   window.LXMusicLibrary.toggleFavorite(m);
  });
  await nav('mylist');
  const checked={};
  for(const [tab,list] of [['history','#history-list'],['favorite','#favorite-list'],['queue','#queue-list']]){
   await page.locator('.my-tab[data-my-tab="'+tab+'"]').click();
   await page.waitForFunction(id=>document.querySelector(id)?.textContent.includes('FyMusic UI 审计样本'),list,{timeout:5000});
   checked[tab]=await page.locator(list).innerText();
  }
  await snap('isolated-library-all-sample');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.LXMusicLibrary)&&Boolean(window.LXPlayerControls));
  await nav('mylist');
  const restored=await page.evaluate(()=>window.LXMusicLibrary.snapshot());
  assert.ok(restored.queue.length>0&&restored.history.length>0&&restored.favorites.length>0);
  await page.locator('.my-tab[data-my-tab="queue"]').click();
  await page.locator('#clear-queue-btn').click();
  assert.equal((await page.evaluate(()=>window.LXMusicLibrary.snapshot())).queue.length,0);
  await page.locator('.my-tab[data-my-tab="history"]').click();
  await page.locator('#clear-history-btn').click();
  await page.locator('.my-tab[data-my-tab="favorite"]').click();
  await page.locator('#clear-favorites-btn').click();
  const cleared=await page.evaluate(()=>window.LXMusicLibrary.snapshot());
  assert.deepEqual([cleared.queue.length,cleared.history.length,cleared.favorites.length],[0,0,0]);
  return {visibleLists:Object.keys(checked),persisted:{
   queue:restored.queue.length,history:restored.history.length,
   favorites:restored.favorites.length},cleared:true};
 });
 await record('overlay-lyrics-comments-keyboard-and-dismiss',async()=>{
  await page.locator('#player-cover-button').click();
  const overlay=page.locator('#lyrics-overlay');
  assert.ok(await overlay.isVisible(),'overlay did not open');
  assert.equal(await overlay.getAttribute('aria-hidden'),'false');
  await page.locator('#comments-tab').click();
  assert.ok(await page.locator('#comments-view').isVisible(),'comments panel hidden');
  assert.equal(await page.locator('#comments-tab').getAttribute('aria-selected'),'true');
  await snap('comments-no-song');
  await page.locator('#lyrics-tab').click();
  assert.ok(await page.locator('#lyrics-view').isVisible(),'lyrics panel hidden');
  await snap('lyrics-no-song');
  await page.keyboard.press('Escape');
  const afterEscape=await overlay.isVisible();
  if(afterEscape)await page.locator('#lyrics-close-btn').click();
  assert.equal(await overlay.isVisible(),false);
  return {afterEscape,afterClose:false};
 });
 await record('semantic-controls-and-a11y-inventory',async()=>{
  const inv=await page.evaluate(()=>{
   const nodes=[...document.querySelectorAll('[id]')];
   const ids=nodes.map(x=>x.id),duplicates=ids.filter((id,i)=>ids.indexOf(id)!==i);
   const visible=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';};
   const controls=[...document.querySelectorAll('button,a,input,select')].filter(visible);
   const unnamed=controls.filter(el=>{
    if(el.tagName==='INPUT'&&el.type==='hidden')return false;
    return !(el.getAttribute('aria-label')||el.getAttribute('title')||
     el.textContent?.trim()||(el.tagName==='INPUT'&&el.labels?.length)||
     (el.tagName==='INPUT'&&el.getAttribute('placeholder')));
   }).map(el=>({tag:el.tagName,id:el.id||'',outer:el.outerHTML.slice(0,150)})).slice(0,25);
   const undersized=controls.filter(el=>{
    const r=el.getBoundingClientRect();
    return r.width<32||r.height<32;
   }).map(el=>({id:el.id||'',text:el.textContent?.trim().slice(0,22)||'',
    rect:{width:Math.round(el.getBoundingClientRect().width),
     height:Math.round(el.getBoundingClientRect().height)}})).slice(0,20);
   return {idCount:ids.length,duplicateIDs:[...new Set(duplicates)],controlCount:controls.length,
    unnamed,undersized,
    dialogs:[...document.querySelectorAll('[role="dialog"]')].map(e=>({id:e.id,ariaModal:e.getAttribute('aria-modal')}))};
  });
  assert.equal(inv.duplicateIDs.length,0,'duplicate IDs can break browser controls');
  return inv;
 });
 await record('song-search-real-upstream-observation',async()=>{
  await nav('search');
  await page.locator('.view-tab[data-search-kind="song"]').click();
  await page.locator('#global-search-input').fill('开始懂了');
  await page.locator('#global-search-btn').click();
  await page.waitForTimeout(5500);
  const observation=await page.evaluate(()=>({
    searchStatus:document.getElementById('status')?.textContent?.slice(0,240),
    resultText:document.getElementById('search-results')?.innerText?.slice(0,340),
    resultChildren:document.getElementById('search-results')?.children.length,
    sourceLabel:document.getElementById('top-source-label')?.textContent?.slice(0,130)
  }));
  if(!observation.resultChildren)
   providerWarnings.push({name:'song-search-real-upstream',observation});
  await snap('live-search-kaishidongle');
  return observation;
 });
 await record('playlist-catalog-and-ranking-real-upstream-observation',async()=>{
  await nav('playlist');
  await page.waitForTimeout(3200);
  const wy=await page.locator('#playlist-featured .playlist-card').count();
  await page.locator('#view-playlist [data-catalog-source="tx"]').click();
  await page.waitForTimeout(3200);
  const qq=await page.locator('#playlist-featured .playlist-card').count();
  await snap('live-qq-playlists');
  await nav('ranking');
  await page.waitForTimeout(2800);
  const rankingWY=await page.locator('#ranking-list').innerText();
  await page.locator('[data-ranking-source="tx"]').click();
  await page.waitForTimeout(2800);
  const rankingQQ=await page.locator('#ranking-list').innerText();
  await snap('live-qq-ranking');
  if(!wy||!qq||!rankingWY.trim()||!rankingQQ.trim())
   providerWarnings.push({name:'catalog-or-ranking-empty-on-CI',wy,qq,
    rankingWY:rankingWY.slice(0,90),rankingQQ:rankingQQ.slice(0,90)});
  return {wyPlaylists:wy,qqPlaylists:qq,wyRanking:rankingWY.slice(0,240),
   qqRanking:rankingQQ.slice(0,240)};
 });
 await record('offline-indicator-after-established-ui',async()=>{
  await context.setOffline(true);
  await page.waitForTimeout(400);
  const state=await page.evaluate(()=>({
   online:navigator.onLine,
   networkHint:document.getElementById('player-network-hint')?.textContent||'',
   status:document.getElementById('status')?.textContent?.slice(0,160)||''
  }));
  assert.equal(state.online,false,'browser is not offline');
  await snap('offline-state');
  await context.setOffline(false);
  return state;
 });
}finally{
 await writeFile(out+'/functional.json',JSON.stringify({at:new Date().toISOString(),
  production:base,results,issues,pageErrors,providerWarnings,apiResponses},null,2));
 await context.close();
 await browser.close();
}
console.log('FYMUSIC_PRODUCTION_FUNCTIONAL_AUDIT_COMPLETE',JSON.stringify({
 checks:results.length,passed:results.filter(x=>x.status==='PASS').length,
 failures:issues.length,issues,pageErrors:pageErrors.length,
 providerWarnings,realApiStatuses:apiResponses.slice(-35)
}));
if(issues.length||pageErrors.length)process.exitCode=1;
