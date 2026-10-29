import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {inspectFlowerRequest,inspectFlowerPayload,flowerRequestHeaders} from './flower-protocol-parity.mjs';

// Non-blocking production diagnostic: unlike mocked playback tests, this
// calls the actual Flower source script via the deployed Cloudflare proxy.
// Never print media URLs, tokens, source request headers, or signed endpoints.
const base=process.env.TEST_BASE_URL || 'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const upstream=[];
  page.on('response',response=>{
    if(response.url().includes('/api/proxy?url=') && response.status()>=400)
      upstream.push({status:response.status()});
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:18000});
  const result=await page.evaluate(async()=>{
    const songSearch=await new Promise(resolve=>window.LXMusicSearch.search(
      'wy','宋冬野',1,20,(err,data)=>resolve({error:err?.message||'',data})
    ));
    if(songSearch.error) return {phase:'search',error:songSearch.error.slice(0,160)};
    const songs=songSearch.data?.list||[];
    const song=songs.find(s=>s.name==='郭源潮'&&s.singer?.includes('宋冬野'));
    if(!song)return {phase:'metadata',error:'Track or artist not found',total:songs.length,
      first:songs[0]&&{title:songs[0].name,artistPresent:!!songs[0].singer}};
    const state=window.LXSourceManager.getActive();
    if(!state.sources?.wy?.qualitys?.includes('128k'))return {
      phase:'quality',error:'Flower did not declare WY 128k'};
    const musicInfo={...song,...song.raw,source:'wy',songmid:song.songmid};
    // Keep raw request material private to this CI process. The public
    // diagnostic contains only the route shape and comparison outcomes.
    const privateOrigin=()=>{
      const calls=state.runtime?.__debugRequests||[];
      const entry=[...calls].reverse().find(x=>{
        try {
          const u=new URL(x.url);
          return u.hostname==='97.64.37.235' && u.pathname.startsWith('/flower/v1/url/');
        }catch{return false;}
      });
      return {url:entry?.url||'',headers:entry?.headers||{},
        songmid:song.songmid,quality:'128k',script:state.code||''};
    };
    try{
      const url=await new Promise((resolve,reject)=>window.LXSourceManager.requestAction(
        'wy','musicUrl',{type:'128k',musicInfo},(err,data)=>
          err?reject(err):resolve(typeof data==='string'?data:data?.url||data?.result)
      ));
      return {phase:'resolve',success:/^https?:\/\//.test(String(url||'')),
        title:song.name,artist:song.singer,seconds:song.interval,
        idType:typeof song.songmid,source:'Flower',qualityRequested:'128k',
        privateOrigin:privateOrigin()};
    }catch(err){
      // Parse only the safe proxy diagnostics; signed request URLs are never
      // printed by this production smoke.
      let details={};
      const message=String(err?.message||err);
      try{details=JSON.parse(message.slice(message.indexOf('{')))}catch(e){}
      return {phase:'resolve',success:false,
        diagnostic:details.diagnostic||'UNKNOWN',
        attempts:Array.isArray(details.attempts)?details.attempts:[],
        title:song.name,artist:song.singer,seconds:song.interval,
        privateOrigin:privateOrigin()};
    }
  });
  // A real same-request comparison isolates Cloudflare egress from
  // protocol/ID mismatch. The signed URL and source script never enter logs.
  const {privateOrigin,...safeResult}=result;
  const evidence={};
  if(privateOrigin){
    const raw=String(privateOrigin.url||'');
    const inspected=inspectFlowerRequest(raw,privateOrigin.songmid,privateOrigin.quality);
    evidence.request=inspected;
    const localScript=String(privateOrigin.script||'');
    try{
      const latest=await fetch('https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
        {signal:AbortSignal.timeout(9000),redirect:'error'});
      if(!latest.ok)throw Error('latest fetch failed');
      const published=await latest.text();
      evidence.sourceScript={
        matchesPublished:createHash('sha256').update(localScript).digest('hex')===
          createHash('sha256').update(published).digest('hex'),
        loadedBytes:Buffer.byteLength(localScript),
        publishedBytes:Buffer.byteLength(published)
      };
    }catch{evidence.sourceScript={status:'PUBLISHED_UNAVAILABLE'};}
    if(inspected.ok){
      const headers=flowerRequestHeaders(privateOrigin.headers);
      evidence.sourceHeaders={
        hasUserAgent:!!headers['User-Agent'],
        hasVersion:!!headers.ver,
        hasSourceVersion:!!headers['source-ver']
      };
      try{
        const upstream=await fetch(raw,{method:'GET',headers,
          redirect:'manual',signal:AbortSignal.timeout(10000)});
        const status=upstream.status;
        let data='',reader=upstream.body?.getReader(),count=0;
        if(reader){
          try{
            while(count<16384){
              const chunk=await reader.read();
              if(chunk.done)break;
              const bytes=chunk.value||new Uint8Array();
              data+=new TextDecoder().decode(bytes.slice(0,16384-count));
              count+=bytes.length;
              if(count>=16384)break;
            }
          }finally{try{await reader.cancel();}catch{}}
        }
        evidence.githubRunnerOrigin=inspectFlowerPayload(status,data);
      }catch{evidence.githubRunnerOrigin={kind:'CONNECT_OR_TIMEOUT',valid:false};}
    }else evidence.githubRunnerOrigin={kind:'SKIPPED_UNSAFE_OR_MISMATCHED'};
  }
  console.log('FLOWER LIVE PRODUCTION DIAGNOSTIC:',JSON.stringify({
    ...safeResult,proxyFailures:upstream,protocolComparison:evidence
  }));
  assert.equal(result.phase,'resolve','Real search metadata must be complete before Flower resolution');
  assert.equal(result.success,true,'Flower must return an actual media URL; mocked fixtures do not count');
}finally{await browser.close();}
