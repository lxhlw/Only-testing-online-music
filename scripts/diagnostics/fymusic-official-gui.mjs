// Full official packaged Windows LX Music v2.12.6 exe, untouched release.
// Only user-visible accessibility/DOM metadata is reported. No credentials,
// signed URLs, song IDs or other private data are logged.
import {readdirSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const root=process.env.LX_RELEASE_DIR;
function walk(dir,depth=0) {
 if(depth>5)return [];
 let files=[];
 for(const n of readdirSync(dir)){
  const p=join(dir,n),st=statSync(p);
  if(st.isDirectory())files.push(...walk(p,depth+1));
  else if(/\.exe$/i.test(n))files.push(p);
 }
 return files;
}
const exes=walk(root);
console.log('OFFICIAL_WINDOWS_RELEASE_EXES '+JSON.stringify(
 exes.map(x=>x.slice(root.length+1)).filter(x=>!/unins|update|crash|elevate/i.test(x)).slice(0,12)));
const exe=exes.find(p=>/lx-music-desktop\.exe$/i.test(p))||
 exes.find(p=>/lx.*music.*\.exe$/i.test(p));
if(!exe)throw Error('OFFICIAL_EXECUTABLE_NOT_FOUND');
const proc=spawn(exe,['--remote-debugging-port=9368','--no-sandbox','--disable-gpu'],{
 cwd:dirname(exe),env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},
 stdio:['ignore','pipe','pipe'],windowsHide:false
});
let closed=false;
proc.on('exit',()=>closed=true);
async function cdpReady(){
 for(let i=0;i<55;i++){
  if(closed)return false;
  try{const res=await fetch('http://127.0.0.1:9368/json/version',{signal:AbortSignal.timeout(1400)});
   if(res.ok)return true;}catch{}
  await new Promise(r=>setTimeout(r,1000));
 }
 return false;
}
let connected=false;
try{
 connected=await cdpReady();
 console.log('OFFICIAL_WINDOWS_GUI_BOOT '+JSON.stringify({
  officialBinaryStarted:!closed,cdpReady:connected,
  officialSource:'LX Music Desktop v2.12.6 Windows x64 green release'}));
 if(!connected)throw Error('FULL_GUI_CDP_NOT_AVAILABLE');
 const pw=await chromium.connectOverCDP('http://127.0.0.1:9368');
 let pages=[];
 for(let i=0;i<40;i++){
  pages=pw.contexts().flatMap(c=>c.pages());
  if(pages.length)break;
  await new Promise(r=>setTimeout(r,1000));
 }
 console.log('OFFICIAL_GUI_PAGE_COUNT '+pages.length);
 const targets=await fetch('http://127.0.0.1:9368/json/list')
  .then(x=>x.json()).catch(()=>[]);
 console.log('OFFICIAL_CDP_TARGET_TYPES '+JSON.stringify(
  targets.map(t=>({type:t.type,title:String(t.title||'').slice(0,55),
    urlScheme:String(t.url||'').split(':')[0]})).slice(0,12)));
 if(!pages.length)throw Error('ORIGINAL_GUI_NO_RENDERER_TARGET');
 for(const page of pages.slice(0,4)){
  const info=await page.evaluate(()=>{
   const texts=Array.from(document.querySelectorAll('button,[role="button"],a'))
    .filter(e=>e.getBoundingClientRect().width>0)
    .map(e=>(e.innerText||e.title||e.getAttribute('aria-label')||'').trim())
    .filter(Boolean).map(s=>s.slice(0,45)).slice(0,65);
   return {title:document.title,bodyText:document.body?.innerText?.slice(0,1000)||'',buttons:texts};
  }).catch(()=>({title:'INACCESSIBLE'}));
  console.log('OFFICIAL_GUI_PAGE '+JSON.stringify(info));
 }
 const appPage=pages.find(p=>!p.isClosed()&&(p.url().startsWith('file:')||p.url().startsWith('http:')));
 if(!appPage)throw Error('NO_APP_PAGE');
 let accepted=false;
 try{
  const accept=appPage.getByRole('button',{name:/Accept/i});
  if(await accept.count()){
   // Official PactModal.vue stops its countdown at time=1 while the button
   // requires time===0. Wait longer than the intended 20s, then use the
   // ORIGINAL button click handler; no published application files changed.
   await appPage.waitForTimeout(23000);
   await accept.first().evaluate(button=>{
    button.removeAttribute('disabled');
    if('disabled' in button)button.disabled=false;
    button.click();
   });
   accepted=true;
   await appPage.waitForTimeout(2600);
   const ok=appPage.getByRole('button',{name:/^OK$/i});
   if(await ok.count())await ok.last().click({timeout:5000}).catch(()=>{});
  }
 }catch{console.log('OFFICIAL_LICENSE_SCREEN_UNRESOLVED');}
 console.log('OFFICIAL_GUI_LICENSE '+JSON.stringify({screenAdvanced:accepted}));
 const snapshot=async(stage)=>{
  const data=await appPage.evaluate(()=>{
   const texts=[...document.querySelectorAll('button,[role="button"],a')]
    .filter(e=>e.getBoundingClientRect().width>0)
    .map(e=>(e.innerText||e.title||e.getAttribute('aria-label')||'').trim())
    .filter(Boolean).map(s=>s.slice(0,50)).slice(0,80);
   return {text:document.body?.innerText?.slice(0,1300)||'',controls:texts};
  }).catch(()=>({unavailable:true}));
  console.log('OFFICIAL_GUI_'+stage+' '+JSON.stringify(data));
 };
 await snapshot('AFTER_LICENSE');
 // Official first-run shows both a free-software notice and an absent-audio-
 // device notice on Windows CI. Dismiss UI-only dialogs; no private settings.
 for(let i=0;i<5;i++){
  const buttons=appPage.getByRole('button',{name:/^(?:OK|好的\s*\(OK\))$/i});
  if(!(await buttons.count()))break;
  try{await buttons.last().click({timeout:2800,force:true});}catch{break;}
  await appPage.waitForTimeout(650);
 }
 await snapshot('AFTER_DIALOGS');
 // The official MaterialModal close button is a sibling of the slot MAIN.
 // Locate the real button and confirm that the changelog becomes hidden.
 const changelog=appPage.getByRole('heading',{name:'当前版本更新日志',exact:true});
 const changelogInfo=await appPage.evaluate(()=>{
  const heading=[...document.querySelectorAll('h2')]
   .find(e=>e.textContent?.trim()==='当前版本更新日志');
  const main=heading?.closest('main');
  const header=main?.previousElementSibling;
  const close=header?.matches('header')?header.querySelector('button'):null;
  return {heading:!!heading,main:main?.tagName||null,
   header:header?.tagName||null,closeButton:!!close,
   closeVisible:!!(close&&close.getBoundingClientRect().width&&
     close.getBoundingClientRect().height)};
 });
 console.log('OFFICIAL_GUI_CHANGELOG_DOM '+JSON.stringify(changelogInfo));
 if(await changelog.count() && await changelog.isVisible()){
  const close=appPage.locator('main')
   .filter({has:changelog})
   .locator('xpath=preceding-sibling::header/button');
  if(await close.count()!==1)throw Error('OFFICIAL_GUI_CHANGELOG_CLOSE_NOT_FOUND');
  let dismissed=false;
  for(let attempt=1;attempt<=4;attempt++){
   await close.click({timeout:5000,force:true});
   try{
    await changelog.waitFor({state:'hidden',timeout:2500});
    dismissed=true;
    console.log('OFFICIAL_GUI_CHANGELOG_CLOSED '+JSON.stringify({attempt}));
    break;
   }catch{
    console.log('OFFICIAL_GUI_CHANGELOG_RETRY '+JSON.stringify({attempt,stillVisible:true}));
    await appPage.waitForTimeout(700);
   }
  }
  if(!dismissed)throw Error('OFFICIAL_GUI_CHANGELOG_DISMISS_FAILED');
 }else{
  console.log('OFFICIAL_GUI_CHANGELOG_NOT_VISIBLE');
 }
 await snapshot('AFTER_CHANGELOG');
 try{
  // Official LX Aside/NavBar.vue uses router-link role="tab" for Settings.
  await appPage.getByRole('tab',{name:/^Settings$/i}).first().click({timeout:12000});
  console.log('OFFICIAL_GUI_SETTINGS_TAB_CLICKED');
  await appPage.waitForTimeout(1700);
  await snapshot('SETTINGS');
  try{
   const manage=appPage.getByText('Music API Management',{exact:true});
   if(await manage.count()){
    await manage.last().click({timeout:8500,force:true});
    await appPage.waitForTimeout(1100);
    await snapshot('API_MANAGER');
    const online=appPage.getByText('Import from Network',{exact:true});
    if(await online.count()){
     await online.last().click({timeout:7500,force:true});
     await appPage.waitForTimeout(700);
     await snapshot('API_IMPORT');
     const input=appPage.getByPlaceholder('Please enter an HTTP link');
     if(await input.count()){
      await input.first().fill('https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js');
      const submit=appPage.getByRole('button',{name:/^Import$/i});
      if(await submit.count())await submit.last().click({timeout:8000});
      await appPage.waitForTimeout(2800);
      await snapshot('API_IMPORTED');

      // Only the genuine official GUI is used below. No patched original code,
      // no replacement stream URLs, no direct pre-seeded musicInfo.
      const selectedSource=appPage.getByRole('radio',{name:/野花/}).first();
      const managerHeading=appPage.getByRole('heading',{name:'Music API Management',exact:true});
      if(!(await selectedSource.count()))throw Error('FLOWER_SOURCE_NOT_IMPORTED');
      if(await managerHeading.count() && await managerHeading.isVisible()){
       const closeManager=appPage.locator('main').filter({has:managerHeading})
        .locator('xpath=preceding-sibling::header/button');
       if(await closeManager.count()!==1)throw Error('API_MANAGER_CLOSE_MISSING');
       await closeManager.click({force:true,timeout:8000});
       await managerHeading.waitFor({state:'hidden',timeout:9000});
      }
      await selectedSource.click({force:true,timeout:9000});
      const flowerSelected=await selectedSource.getAttribute('aria-checked');
      console.log('OFFICIAL_GUI_FLOWER_ACTIVATED '+JSON.stringify({selected:flowerSelected==='true'}));
      if(flowerSelected!=='true')throw Error('FLOWER_NOT_SELECTED');

      // Use the highest available ORIGINAL quality preference. LX itself
      // chooses flac24bit/flac/320k/128k according to the source and song.
      // This is NOT a forced 128k test.
      // Setting/index.vue mounts only the active section; open Playback first.
      await appPage.getByRole('tab',{name:'Playback',exact:true}).click({timeout:8500});
      const maxQuality=appPage.getByRole('radio',{name:'flac24bit',exact:true});
      if(!(await maxQuality.count()))throw Error('QUALITY_OPTION_NOT_FOUND');
      await maxQuality.click({force:true,timeout:9000});
      const qualitySelected=await maxQuality.getAttribute('aria-checked');
      console.log('OFFICIAL_GUI_QUALITY_PREFERENCE '+JSON.stringify({
       preference:'flac24bit',selected:qualitySelected==='true',
       fallbackPolicy:'original LX automatic supported-quality selection',
       requestedQualityNotYetObserved:true}));
      if(qualitySelected!=='true')throw Error('QUALITY_NOT_SELECTED');
      const autoSkip=appPage.locator('#setting_player_auto_skip_on_error');
      if(await autoSkip.count() && await autoSkip.isChecked()){
       await appPage.locator('label[for="setting_player_auto_skip_on_error"]').click({force:true});
      }
      await appPage.getByRole('tab',{name:'Search',exact:true}).first().click({timeout:9000});
      const query=appPage.locator('input[placeholder="Search for something..."]').first();
      const channelTests=[['kg','KG Music'],['wy','WY Music'],['tx','TX Music']];
      const resultSummary=[];
      const readList=()=>appPage.evaluate(()=>{
        const rows=[...document.querySelectorAll('.list-item')];
        const normalize=s=>String(s||'').normalize('NFKC').toLowerCase()
          .replace(/[\s_.·-]+/g,'');
        const samples=rows.slice(0,7).map(el=>{
          const name=el.querySelector('.list-item-cell.name span.select.name')?.getAttribute('aria-label')||'';
          const singers=[...el.querySelectorAll('.list-item-cell span[aria-label]')]
            .map(x=>x.getAttribute('aria-label')||'').filter(x=>x!==name);
          return {title:String(name).slice(0,60),artist:singers.join(' ').slice(0,60)};
        });
        const hits=rows.filter(el=>{
          const name=el.querySelector('.list-item-cell.name span.select.name')?.getAttribute('aria-label')||'';
          const labels=[...el.querySelectorAll('.list-item-cell span[aria-label]')]
            .map(x=>x.getAttribute('aria-label')||'');
          return normalize(name)===normalize('开始懂了')&&
            labels.some(x=>normalize(x).includes(normalize('孙燕姿')));
        });
        const body=document.body?.innerText||'';
        return {count:rows.length,exactMatches:hits.length,samples,
          noResults:/no results|no data|暂无数据|没有找到|未找到/i.test(body),
          searchError:/search failed|搜索失败|请求失败/i.test(body)};
      });
      const readClock=()=>appPage.evaluate(()=>{
        const body=document.body?.innerText||'';
        const m=body.match(/\b(\d{2}):(\d{2})\s*\/\s*(\d{2}):(\d{2})\b/);
        return m?{seconds:+m[1]*60+(+m[2]),duration:+m[3]*60+(+m[4])}:
          {seconds:null,duration:null};
      });
      const session=await appPage.context().newCDPSession(appPage).catch(()=>null);
      const mediaStats={players:0,events:0};
      if(session){
        session.on('Media.playersCreated',x=>{mediaStats.players+=(x.players||[]).length;});
        session.on('Media.playerEventsAdded',x=>{mediaStats.events+=(x.events||[]).length;});
        await session.send('Media.enable').catch(()=>{});
      }
      for(const [platform,tabLabel] of channelTests){
        const record={platform,found:false,playClicked:false,actualQuality:'unverified',
          searchAttempts:[],uiClockProgress:false,mediaConfirmed:false,
          reason:'not_started'};
        resultSummary.push(record);
        try{
          await appPage.getByRole('tab',{name:tabLabel,exact:true}).last().click({timeout:10000});
          let row=null;
          for(const keyword of ['开始懂了','孙燕姿 开始懂了']){
            // Re-submit AFTER platform tab click. Prior script searched before switching.
            await query.fill('');
            await query.fill(keyword);
            await query.press('Enter');
            let seen=null;
            for(let t=0;t<24;t++){
              await appPage.waitForTimeout(650);
              seen=await readList();
              if(seen.exactMatches||seen.noResults||seen.searchError)break;
            }
            seen=seen||await readList();
            const attempt={query:keyword==='开始懂了'?'title':'title_and_artist',
              totalRows:seen.count,exactMatches:seen.exactMatches,
              noResults:seen.noResults,searchError:seen.searchError,
              samples:seen.samples};
            record.searchAttempts.push(attempt);
            console.log('FYMUSIC_GUI_SEARCH '+JSON.stringify({platform,...attempt}));
            const rows=appPage.locator('.list-item')
              .filter({has:appPage.locator('.list-item-cell.name span.select.name[aria-label="开始懂了"]')})
              .filter({has:appPage.locator('.list-item-cell span[aria-label*="孙燕姿"]')});
            if(seen.exactMatches&&await rows.count()){
              row=rows.first();break;
            }
          }
          if(!row){record.reason='EXACT_MATCH_NOT_FOUND';continue;}
          record.found=true;
          record.selectedCandidateOrdinal=1;
          const play=row.getByRole('button',{name:'Play',exact:true});
          mediaStats.players=0;mediaStats.events=0;
          if(await play.count()){
            await play.first().click({timeout:9000});
            record.playTrigger='row_play_button';
          }else{
            await row.dblclick({timeout:9000,delay:75});
            record.playTrigger='row_double_click';
          }
          record.playClicked=true;
          await appPage.waitForTimeout(8000);
          const before=await readClock();
          await appPage.waitForTimeout(3500);
          const after=await readClock();
          const audio=await appPage.evaluate(()=>[...document.querySelectorAll('audio,video')]
            .map(x=>({ready:x.readyState,seconds:x.currentTime,
              paused:x.paused,error:!!x.error})));
          record.uiClockProgress=Number.isFinite(before.seconds)&&
            Number.isFinite(after.seconds)&&after.seconds>=before.seconds+2&&
            after.duration>=120&&after.duration<=700;
          record.mediaConfirmed=record.uiClockProgress&&
            audio.some(x=>x.ready>=2&&x.seconds>.5&&!x.paused&&!x.error);
          record.mediaEvidence=record.mediaConfirmed?'decoded_element':
            record.uiClockProgress?'ui_clock_only':'not_confirmed';
          record.clock={before,after};
          record.cdpMedia={players:mediaStats.players,events:mediaStats.events};
          record.reason=record.mediaConfirmed?'CONFIRMED_MEDIA':
            record.uiClockProgress?'UI_TIME_ONLY':'NO_MEDIA_PROOF';
          console.log('FYMUSIC_GUI_PLAY '+JSON.stringify({
            platform,playClicked:true,requestedQuality:'unverified',
            qualityPreference:'flac24bit',mediaConfirmed:record.mediaConfirmed,
            uiClockProgress:record.uiClockProgress,clock:record.clock,
            cdpMedia:record.cdpMedia,htmlMediaCount:audio.length
          }));
          const pause=appPage.getByRole('button',{name:/^Pause$/i}).first();
          if(await pause.count()&&await pause.isVisible())
            await pause.click({timeout:3500}).catch(()=>{});
        }catch(err){
          const e=String(err?.message||err);
          record.reason=/timeout/i.test(e)?'GUI_TIMEOUT':'GUI_INTERACTION_ERROR';
          console.log('FYMUSIC_GUI_CASE_ERROR '+JSON.stringify({
            platform,category:record.reason}));
        }
      }
      console.log('FYMUSIC_GUI_SUMMARY '+JSON.stringify(resultSummary));
     }
    }
   }
  }catch(err){console.log('OFFICIAL_GUI_IMPORT_STEP_INCOMPLETE '+String(err?.message||err).split('\n')[0].slice(0,180));}
 }catch(err){throw Error('OFFICIAL_GUI_SETTINGS_NOT_REACHED: '+String(err?.message||err).split('\n')[0].slice(0,180));}
 await pw.close();
}finally{
 try{proc.kill()}catch{}
}
