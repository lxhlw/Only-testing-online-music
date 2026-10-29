import assert from 'node:assert/strict';
import {chromium} from 'playwright';

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
    try{
      const url=await new Promise((resolve,reject)=>window.LXSourceManager.requestAction(
        'wy','musicUrl',{type:'128k',musicInfo},(err,data)=>
          err?reject(err):resolve(typeof data==='string'?data:data?.url||data?.result)
      ));
      return {phase:'resolve',success:/^https?:\/\//.test(String(url||'')),
        title:song.name,artist:song.singer,seconds:song.interval,
        idType:typeof song.songmid,source:'Flower',qualityRequested:'128k'};
    }catch(err){
      // Parse only the safe proxy diagnostics; signed request URLs are never
      // printed by this production smoke.
      let details={};
      const message=String(err?.message||err);
      try{details=JSON.parse(message.slice(message.indexOf('{')))}catch(e){}
      return {phase:'resolve',success:false,
        diagnostic:details.diagnostic||'UNKNOWN',
        attempts:Array.isArray(details.attempts)?details.attempts:[],
        title:song.name,artist:song.singer,seconds:song.interval};
    }
  });
  if(result.reason)result.reason=result.reason.replace(/https?:\/\/[^\s"]+/g,'[redacted]');
  console.log('FLOWER LIVE PRODUCTION DIAGNOSTIC:',JSON.stringify({
    ...result,proxyFailures:upstream
  }));
  assert.equal(result.phase,'resolve','Real search metadata must be complete before Flower resolution');
  assert.equal(result.success,true,'Flower must return an actual media URL; mocked fixtures do not count');
}finally{await browser.close();}
