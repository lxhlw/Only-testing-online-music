import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {summarizeKugouTrackInput,inspectKugouQualityRequest}
  from './flower-kugou-quality-parity.mjs';

// Observational ONLY: match the actual imported Flower script fingerprint to
// the public source file, and check distinct quality-song hashes and signed
// route shapes for ONE 赵雷《成都》 search result. No signed URL, hash, tag,
// raw Flower response or playback URL is logged. This is NOT a media PASS.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
let officialHash=null,officialSource='UNAVAILABLE';
try {
  const origin=await fetch('https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
    {signal:AbortSignal.timeout(11000),redirect:'error'});
  if(origin.ok){
    const code=await origin.text();
    if(code.startsWith('/**')&&code.includes('@name 野花')){
      officialHash=createHash('sha256').update(code,'utf8').digest('hex');
      officialSource='RAW_GITHUB_SOURCE';
    }
  }
}catch{}
const browser=await chromium.launch({headless:true});
let observation;
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,
    null,{timeout:20000});
  observation=await page.evaluate(async()=>{
    const active=window.LXSourceManager.getActive();
    const flowerActive=String(active?.url||'').includes('/flower/latest.js') &&
      String(active?.name||'').includes('野花');
    const sourceQualitys=Array.isArray(active?.sources?.kg?.qualitys)
      ?active.sources.kg.qualitys:[];
    const result={flowerActive,sourceScriptSha256:null,sourceScriptHashAvailable:false,
      sourceEnvironment:String(active?.runtime?.env||'NOT_REPORTED').slice(0,32),
      sourceVersion:String(active?.version||'').slice(0,32),
      sourceScriptLocation: String(active?.url||'').includes('raw.githubusercontent.com')
        ?'GITHUB_RAW':String(active?.url||'').includes('ghproxy')
        ?'GITHUB_MIRROR':'OTHER',
      searchProvider:null,matchingChoices:0,distinctBaseHashes:0,
      input:null,searchFound:false,qualityAttempts:[]};
    if(!flowerActive)return result;
    if(globalThis.crypto?.subtle && typeof active.code==='string'){
      const bytes=new TextEncoder().encode(active.code);
      const digest=await crypto.subtle.digest('SHA-256',bytes);
      result.sourceScriptSha256=Array.from(new Uint8Array(digest))
        .map(x=>x.toString(16).padStart(2,'0')).join('');
      result.sourceScriptHashAvailable=true;
    }
    const timed=(fn,ms)=>new Promise(resolve=>{
      let finished=false;
      const timer=setTimeout(()=>{if(!finished){finished=true;resolve({timeout:true});}},ms);
      try{
        fn((err,data)=>{if(finished)return;finished=true;clearTimeout(timer);
          resolve({error:!!err,data});});
      }catch{if(!finished){finished=true;clearTimeout(timer);resolve({error:true});}}
    });
    const search=await timed(cb=>window.LXMusicSearch.search('kg','成都',1,30,cb),13000);
    if(search.timeout){result.searchProvider='TIMEOUT';return result;}
    if(search.error){result.searchProvider='SEARCH_ERROR';return result;}
    result.searchProvider=String(search.data?.searchProvider||'UNKNOWN').slice(0,40);
    const matches=(Array.isArray(search.data?.list)?search.data.list:[])
      .filter(x=>String(x?.name||'').trim()==='成都' &&
        String(x?.singer||'').includes('赵雷') && x.source==='kg');
    result.matchingChoices=matches.length;
    result.distinctBaseHashes=new Set(matches.map(x=>String(x.hash||'').toUpperCase())).size;
    if(!matches.length)return result;
    const track=matches[0];result.searchFound=true;
    // Do not transmit track/source identifiers or signatures to Node.
    // Describe which quality-specific hashes the actual Web track retains.
    const info={...track,...(track.raw||{}),source:'kg',
      songmid:track.songmid||track.id};
    result.input={
      albumAudioIdPresent:!!info.albumAudioId,
      durationSeconds:Number(info._interval)||null,
      baseHashValid:/^[a-fA-F0-9]{32}$/.test(String(track.hash||'')),
      hasPerQualityMap:!!info._types,
      declaredSourceQualities:['128k','320k','flac']
        .filter(q=>sourceQualitys.includes(q)),
      qualityMetadata:['128k','320k','flac'].map(q=>({
        quality:q,hasHash:/^[a-fA-F0-9]{32}$/.test(String(info._types?.[q]?.hash||'')),
        differentFromBase:!!info._types?.[q]?.hash&&
          String(info._types[q].hash).toUpperCase()!==String(info.hash).toUpperCase()
      }))
    };
    for(const quality of ['128k','320k','flac']){
      const declared=sourceQualitys.includes(quality);
      const selectedHash=String(info._types?.[quality]?.hash ||
        (quality==='128k'?info.hash:''));
      const hasQualityHash=/^[a-fA-F0-9]{32}$/.test(selectedHash);
      const row={quality,declared,hasQualityHash,resolverState:'NOT_TRIED',
        flowerRequested:false,canonical:false,routeQualityMatched:false,
        routeMatchesBaseHash:false,routeMatchesSelectedQualityHash:false,
        candidateUrlReturned:false};
      if(!declared||!hasQualityHash){row.resolverState='QUALITY_UNAVAILABLE';result.qualityAttempts.push(row);continue;}
      const before=active.runtime?.__debugRequests?.length||0;
      const response=await timed(done=>window.LXSourceManager.requestAction(
        'kg','musicUrl',{type:quality,musicInfo:info},done),14500);
      row.resolverState=response.timeout?'RESOLVE_TIMEOUT':response.error?
        'RESOLVE_ERROR':'SOURCE_RETURNED';
      const reqs=(active.runtime?.__debugRequests||[]).slice(before);
      const request=reqs.find(x=>{
        try{const u=new URL(x.url);return u.protocol==='http:'&&
          u.hostname==='97.64.37.235'&&
          u.pathname.startsWith('/flower/v1/url/kg/');}catch{return false;}
      });
      if(request){
        const segments=new URL(request.url).pathname.split('/').filter(Boolean);
        const routeHash=String(segments[4]||'').toUpperCase();
        row.flowerRequested=true;
        row.canonical=segments.slice(0,4).join('/')==='flower/v1/url/kg'&&segments.length===6;
        row.routeQualityMatched=segments[5]===quality;
        row.routeMatchesBaseHash=/^[0-9A-F]{32}$/.test(routeHash)&&
          routeHash===String(info.hash||'').toUpperCase();
        row.routeMatchesSelectedQualityHash=/^[0-9A-F]{32}$/.test(routeHash)&&
          routeHash===selectedHash.toUpperCase();
      }
      const media=typeof response.data==='string'?response.data:
        typeof response.data?.url==='string'?response.data.url:
        typeof response.data?.result==='string'?response.data.result:'';
      row.candidateUrlReturned=!response.error&&!response.timeout&&/^https?:\/\//.test(media);
      result.qualityAttempts.push(row);
    }
    return result;
  });
  await page.close();
}finally{await browser.close();}
const output={
  test:'Flower Kugou Chengdu selected track and quality parity',
  ...observation,
  remoteScriptReference:officialSource,
  officialScriptFingerprintMatchesLoaded:!!officialHash&&
    !!observation?.sourceScriptSha256&&officialHash===observation.sourceScriptSha256,
  remoteReferenceAvailable:!!officialHash
};
// Output digests are public script fingerprints; no raw URLs, hashes, keys or
// signed request tokens are included in the final summary.
console.log('FLOWER KUGOU QUALITY AND SOURCE FINGERPRINT:',JSON.stringify(output));
assert.equal(output.flowerActive,true,'Genuine Flower script must be active');
assert.equal(output.searchFound,true,'Genuine Kugou Chengdu track must be found');
assert.ok(output.qualityAttempts.some(x=>x.flowerRequested),
  'At least one actual Flower quality request is required');
