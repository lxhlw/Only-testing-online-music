import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {FLOWER_PLATFORMS,sameArtistSong,classifyFlowerResolutionFailure,
  classifyFlowerRequestRoute} from './flower-cross-platform-diagnostic.mjs';

// Real production acceptance diagnostic. Same imported Flower LX script for
// every catalog platform; never use native/Huibq/GD musicUrl fallbacks.
// This test contains NO mocked requests and cannot certify audio merely
// because a source returned a URL.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:20000});
  const cases=await page.evaluate(async()=>{
    const sources=['wy','tx','kg','kw','mg'];
    const active=window.LXSourceManager.getActive();
    const withDeadline=(run,ms)=>new Promise(resolve=>{
      let finished=false;
      const deadline=setTimeout(()=>{
        if(finished)return;
        finished=true;resolve({timeout:true});
      },ms);
      run((...args)=>{
        if(finished)return;
        finished=true;clearTimeout(deadline);
        resolve({args});
      });
    });
    const searches=await Promise.all(sources.map(async source=>{
      const declared=active?.sources?.[source]||null;
      const qualitys=Array.isArray(declared?.qualitys)?declared.qualitys:[];
      if(!declared)return {source,kind:'FLOWER_PLATFORM_NOT_DECLARED',qualitys};
      const reply=await withDeadline(done=>{
        window.LXMusicSearch.search(source,'宋冬野',1,25,done);
      },12500);
      if(reply.timeout)return {source,kind:'SEARCH_DEADLINE',qualitys};
      const [err,data]=reply.args;
      if(err)return {source,kind:'SEARCH_UNAVAILABLE',qualitys};
      const list=Array.isArray(data?.list)?data.list:[];
      const track=list.find(item=>String(item?.name||'').trim()==='郭源潮'&&
        String(item?.singer||'').includes('宋冬野'))||null;
      return {source,kind:track?'SEARCH_FOUND':'NO_MATCHING_TRACK',
        count:list.length,qualitys,track};
    }));
    const rows=[];
    for(const s of searches){
      const {track,...safe}=s;
      if(!track){rows.push(safe);continue;}
      if(!s.qualitys.includes('128k')){
        rows.push({...safe,kind:'FLOWER_128K_NOT_DECLARED'});continue;
      }
      const requestStart=active.runtime?.__debugRequests?.length||0;
      const musicInfo={...track,...(track.raw||{}),source:s.source,
        songmid:track.songmid||track.id};
      const response=await withDeadline(done=>{
        window.LXSourceManager.requestAction(s.source,'musicUrl',
          {type:'128k',musicInfo},done);
      },13500);
      const reqs=(active.runtime?.__debugRequests||[]).slice(requestStart);
      const canonical=reqs.find(req=>{
        try{return new URL(req.url).hostname==='97.64.37.235';}
        catch{return false;}
      });
      const route=canonical?new URL(canonical.url).pathname.split('/').filter(Boolean).slice(0,4).join('/'):'';
      if(response.timeout){
        rows.push({...safe,kind:'FLOWER_RESOLVE_DEADLINE',
          flowerRequested:!!canonical,routeMatchesSource:route==='flower/v1/url/'+s.source});
        continue;
      }
      const [error,data]=response.args;
      let media=typeof data==='string'?data:
        (typeof data?.url==='string'?data.url:data?.result||'');
      if(typeof media!=='string')media='';
      rows.push({...safe,kind:error?'FLOWER_RESOLVE_ERROR':media.startsWith('http')?
        'FLOWER_URL_RETURNED':'FLOWER_RESPONSE_NOT_URL',
        urlReturned:media.startsWith('https://')||media.startsWith('http://'),
        flowerRequested:!!canonical,
        routeMatchesSource:route==='flower/v1/url/'+s.source,
        // Never expose raw errors; a sanitized server summary is sufficient.
        failureText:error?String(error?.message||error).slice(0,1600):''
      });
    }
    return rows;
  });
  const safeRows=cases.map(row=>{
    const {failureText,...safe}=row;
    const diagnosis=failureText?classifyFlowerResolutionFailure(failureText):null;
    return {...safe,...(diagnosis?{diagnosis}:{})};
  });
  console.log('FLOWER CROSS-PLATFORM LIVE RESULT:',JSON.stringify({
    source:'Flower-only',track:'宋冬野 / 郭源潮',quality:'128k',
    candidates:FLOWER_PLATFORMS.length,results:safeRows,
    resolvedPlatforms:safeRows.filter(x=>x.urlReturned).map(x=>x.source)
  }));
  assert.deepEqual(safeRows.map(x=>x.source),FLOWER_PLATFORMS);
  assert.ok(safeRows.some(x=>x.kind==='FLOWER_RESOLVE_ERROR'||
    x.kind==='FLOWER_URL_RETURNED'||x.kind==='FLOWER_RESOLVE_DEADLINE'),
    'Expected at least one real Flower musicUrl attempt');
}finally{
  await browser.close();
}
