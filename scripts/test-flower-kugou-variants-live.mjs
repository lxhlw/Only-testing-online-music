import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

// Real production-only observational test: enumerate every matching Kugou
// version of 赵雷《成都》 in the native search page. Each user-selected
// song stays separate. Try Flower-only 128k once per distinct base hash,
// without replacing the source or altering playback logic. Never print the
// 32-hex original file hashes, signed URLs, request headers or credentials.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true});
let report;
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,
    null,{timeout:20000});
  report=await page.evaluate(async()=>{
    const active=window.LXSourceManager.getActive();
    const flower=String(active?.url||'').includes('/flower/latest.js') &&
      String(active?.name||'').includes('野花');
    const qualityDeclared=!!active?.sources?.kg?.qualitys?.includes('128k');
    const result={flower,qualityDeclared,searchProvider:null,searchFound:false,
      searchCount:0,distinctAudioIds:0,distinctBaseHashes:0,versions:[]};
    if(!flower||!qualityDeclared)return result;
    async function fingerprint(source){
      try{
        const bytes=await crypto.subtle.digest('SHA-256',
          new TextEncoder().encode(source));
        return Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0'))
          .join('').slice(0,16);
      }catch{return 'UNAVAILABLE';}
    }
    const timed=(call,ms)=>new Promise(resolve=>{
      let completed=false;
      const timer=setTimeout(()=>{if(!completed){completed=true;resolve({timeout:true});}},ms);
      try{
        call((error,data)=>{if(completed)return;completed=true;clearTimeout(timer);
          resolve({error:!!error,data});});
      }catch{if(!completed){completed=true;clearTimeout(timer);resolve({error:true});}}
    });
    const found=await timed(cb=>window.LXMusicSearch.search('kg','成都',1,30,cb),13000);
    if(found.timeout){result.searchProvider='SEARCH_TIMEOUT';return result;}
    if(found.error){result.searchProvider='SEARCH_ERROR';return result;}
    result.searchProvider=String(found.data?.searchProvider||'UNSPECIFIED').slice(0,40);
    const songs=(Array.isArray(found.data?.list)?found.data.list:[])
      .filter(t=>String(t?.name||'').trim()==='成都' &&
        String(t?.singer||'').includes('赵雷') && t.source==='kg');
    result.searchFound=songs.length>0;result.searchCount=songs.length;
    result.distinctAudioIds=new Set(songs.map(t=>String(t.songmid||t.id||''))).size;
    result.distinctBaseHashes=new Set(songs.map(t=>String(t.hash||'').toUpperCase())).size;
    const dedup=new Set();
    for(let i=0;i<songs.length&&result.versions.length<10;i++){
      const track=songs[i]||{},hash=String(track.hash||'').toUpperCase();
      if(!/^[A-F0-9]{32}$/.test(hash)||dedup.has(hash))continue;
      dedup.add(hash);
      // The opaque label is stable for the same public catalog song record
      // and cannot accidentally reveal Flower's time-sensitive tag.
      const token=await fingerprint(String(track.songmid||track.id||'')+':'+hash);
      const info={...track,...(track.raw||{}),source:'kg',
        songmid:track.songmid||track.id};
      const row={
        rowIndex:i+1,recordFingerprint:token,
        audioIdShape:/^\d+$/.test(String(track.songmid||''))?'NUMERIC':'OTHER',
        album:String(track.albumName||'').replace(/[\r\n\t]/g,' ').slice(0,72),
        duration:String(track.interval||'').slice(0,12),
        durationSeconds:Number(track._interval)||null,
        albumAudioIdPresent:!!track.albumAudioId,
        qualityHashCount:track._types?Object.keys(track._types).length:0,
        flowerRequested:false,routeMatchedThisVersion:false,
        resolverOutcome:'NOT_RUN',returnedMediaCandidate:false
      };
      const before=active.runtime?.__debugRequests?.length||0;
      const response=await timed(done=>window.LXSourceManager.requestAction(
        'kg','musicUrl',{type:'128k',musicInfo:info},done),11200);
      row.resolverOutcome=response.timeout?'TIMEOUT':response.error?
        'RESOLVE_ERROR':'SOURCE_RETURNED';
      const newly=(active.runtime?.__debugRequests||[]).slice(before);
      for(const entry of newly){
        let u;try{u=new URL(entry.url)}catch{continue}
        if(u.protocol!=='http:'||u.hostname!=='97.64.37.235')continue;
        const parts=u.pathname.split('/').filter(Boolean);
        if(parts.length!==6||parts.slice(0,4).join('/')!=='flower/v1/url/kg')continue;
        row.flowerRequested=true;
        if(parts[4].toUpperCase()===hash&&parts[5]==='128k')
          row.routeMatchedThisVersion=true;
      }
      const returned=typeof response.data==='string'?response.data:
        typeof response.data?.url==='string'?response.data.url:
        typeof response.data?.result==='string'?response.data.result:'';
      row.returnedMediaCandidate=!response.timeout&&!response.error&&
        /^https?:\/\//.test(returned);
      result.versions.push(row);
    }
    return result;
  });
  await page.close();
}finally{await browser.close();}
console.log('FLOWER KUGOU CHENGDU VERSION MATRIX:',JSON.stringify(report));
assert.equal(report.flower,true,'Flower must be active');
assert.equal(report.qualityDeclared,true,'Flower KG 128k must be declared');
assert.equal(report.searchFound,true,'Real KG Chengdu candidates must be found');
assert.ok(report.versions.length>=1,'At least one distinct candidate must be tried');
// A successful callback or URL candidate alone does not certify audio bytes.
