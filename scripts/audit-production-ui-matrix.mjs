import {chromium,firefox,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base='https://only-testing-online-music.pages.dev';
const out='audit-ui-evidence';
const versions={chromium:[320,390,768,1440,1920],firefox:[390,1440],webkit:[390,768,1440]};
const titles={search:'搜索',playlist:'歌单',ranking:'排行榜',mylist:'我的音乐库',settings:'设置'};
const engines={chromium,firefox,webkit};
const reports=[],issues=[];
await mkdir(out,{recursive:true});
for(const [engine,widths] of Object.entries(versions)){
 const browser=await engines[engine].launch({headless:true});
 try{
  for(const width of widths){
   const mobile=width<=740;
   const context=await browser.newContext({viewport:{width,height:width===320?690:width>=1200?900:844},
    deviceScaleFactor:1,hasTouch:mobile,isMobile:false});
   const page=await context.newPage();
   const errors=[],network=[];
   page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,350)));
   page.on('response',res=>{
    if(res.url().startsWith(base+'/')&&res.status()>=400&&
      /^\/(?:src\/|styles\.css|modern\.css|vendor\/)/.test(new URL(res.url()).pathname))
     network.push({status:res.status(),url:new URL(res.url()).pathname});
   });
   await page.addInitScript(()=>{
    localStorage.setItem('only-testing-online-music.default-source-disabled','1');
   });
   try{
    await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:45000});
    await page.waitForFunction(()=>Boolean(window.OnlyTestingNavigate)&&
      Boolean(window.LXMusicLibrary)&&Boolean(window.LXSourceManager)&&
      Boolean(window.LXPlayerControls),null,{timeout:20000});
    await page.waitForTimeout(250);
    const nav=page.locator('.nav-item[data-view]');
    assert.equal(await nav.count(),5);
    for(const view of Object.keys(titles)){
     if(mobile){
      const toggle=page.locator('.mobile-menu-button');
      await toggle.waitFor({state:'visible',timeout:10000});
      await toggle.click();
      await nav.filter({has:page.locator('[data-never-matches]')}).count().catch(()=>0);
     }
     await page.locator('.nav-item[data-view="'+view+'"]').click({timeout:15000});
     await page.waitForFunction(v=>
       document.getElementById('view-'+v)?.classList.contains('active'),view,{timeout:10000});
     await page.waitForTimeout(180);
     const d=await page.evaluate((v)=>{
      const rect=(s)=>{
       const e=document.querySelector(s);
       if(!e)return null;
       const r=e.getBoundingClientRect();
       return {x:Math.round(r.x),y:Math.round(r.y),right:Math.round(r.right),
        bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)};
      };
      const vis=e=>{const style=getComputedStyle(e),r=e.getBoundingClientRect();
       return style.display!=='none'&&style.visibility!=='hidden'&&r.width>0&&r.height>0;};
      const panel=document.getElementById('view-'+v);
      const head=panel?.querySelector('h1')?.textContent?.trim()||'';
      const active=[...document.querySelectorAll('.view-panel.active')].map(x=>x.id);
      const visibleControls=[...(panel?.querySelectorAll('button,select,input')||[])].filter(vis)
       .map(x=>({tag:x.tagName,id:x.id||'',text:x.textContent?.trim().slice(0,35)||'',
        aria:x.getAttribute('aria-label')||''})).slice(0,80);
      return {
       url:location.href,head,active,
       viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
       bodyWidth:document.body.scrollWidth,
       topbar:rect('.topbar'),player:rect('.player-bar'),
       searchBar:rect('#persistent-top-stack'),activePanel:rect('#view-'+v),
       visibleControls,
       bodyTextLength:panel?.innerText?.length||0,
       scrollHeight:document.documentElement.scrollHeight
      };
     },view);
     const test={engine,width,view,heading:d.head,
      active:d.active,viewport:d.viewport,documentWidth:d.documentWidth,
      bodyWidth:d.bodyWidth,player:d.player,topbar:d.topbar,
      visibleControls:d.visibleControls.length,controlNames:d.visibleControls,
      bodyTextLength:d.bodyTextLength,scrollHeight:d.scrollHeight,
      errors:[...errors],assetErrors:[...network]};
     reports.push(test);
     if(d.active.length!==1||d.active[0]!=='view-'+view)issues.push({type:'active-view',...test});
     if(d.documentWidth>width+2||d.bodyWidth>width+2)issues.push({type:'horizontal-overflow',...test});
     if(d.player&&(d.player.width<width-4||d.player.x>3||
       d.player.bottom>page.viewportSize().height+3))issues.push({type:'player-placement',...test});
     if(d.head!==titles[view])issues.push({type:'missing-heading',...test});
     const screenshot=out+'/'+engine+'-'+width+'-'+view+'.png';
     await page.screenshot({path:screenshot,animations:'disabled',timeout:20000});
     if(view==='search'){
      await page.locator('.view-tab[data-search-kind="playlist"]').click();
      const playlistVisible=await page.locator('#search-playlist-view').isVisible();
      if(!playlistVisible)issues.push({type:'search-playlist-tab-failure',engine,width});
      await page.screenshot({path:out+'/'+engine+'-'+width+'-search-playlists.png',animations:'disabled'});
      await page.locator('.view-tab[data-search-kind="song"]').click();
     }
     if(view==='mylist'){
      for(const name of ['favorite','playlist-favorite','queue','history']){
       await page.locator('.my-tab[data-my-tab="'+name+'"]').click();
       await page.screenshot({path:out+'/'+engine+'-'+width+'-my-'+name+'.png',animations:'disabled'});
       const activeTabs=await page.locator('.my-tab.active').count();
       if(activeTabs!==1)issues.push({type:'my-tab-active-count',engine,width,name,count:activeTabs});
      }
     }
     if(view==='settings'){
      const select=page.locator('#inline-quality');
      if(!(await select.isVisible()))issues.push({type:'quality-select-invisible',engine,width});
     }
     console.log('FYMUSIC_UI_VIEW',JSON.stringify({engine,width,view,heading:d.head,
      active:d.active,overflow:d.documentWidth-width,controls:d.visibleControls.length,
      pageErrors:errors.length,assetErrors:network.length}));
    }
    await page.locator('#player-cover-button').click();
    await page.waitForTimeout(120);
    const overlay=page.locator('#lyrics-overlay');
    const open=await overlay.getAttribute('aria-hidden');
    if(open!=='false'||!(await overlay.isVisible()))issues.push({type:'overlay-open-failed',engine,width,ariaHidden:open});
    else{
     await page.screenshot({path:out+'/'+engine+'-'+width+'-lyrics-overlay.png',animations:'disabled'});
     await page.locator('#comments-tab').click();
     const comments=await page.locator('#comments-view').isVisible();
     if(!comments)issues.push({type:'comments-tab-failed',engine,width});
     await page.screenshot({path:out+'/'+engine+'-'+width+'-comments.png',animations:'disabled'});
     await page.locator('#lyrics-tab').click();
     await page.locator('#lyrics-close-btn').click();
     if(await overlay.isVisible())issues.push({type:'overlay-close-failed',engine,width});
    }
    if(errors.length)issues.push({type:'pageerror',engine,width,errors});
    if(network.length)issues.push({type:'asset-error',engine,width,network});
   }catch(e){
    issues.push({type:'test-execution',engine,width,error:String(e.stack||e).slice(0,1400)});
    try{await page.screenshot({path:out+'/'+engine+'-'+width+'-failure.png',timeout:10000})}catch{}
   }finally{await context.close();}
  }
 }finally{await browser.close();}
}
await writeFile(out+'/matrix.json',JSON.stringify({base,recordedAt:new Date().toISOString(),reports,issues},null,2));
const aggregate={profiles:Object.values(versions).reduce((a,b)=>a+b.length,0),
 views:reports.length,screenshots:reports.length*3,
 engines:Object.keys(versions),failures:issues.length,issues};
console.log('FYMUSIC_UI_MATRIX_COMPLETE',JSON.stringify(aggregate));
if(issues.length)process.exitCode=1;
