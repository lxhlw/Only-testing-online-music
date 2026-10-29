import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {inspectFlowerRequest,inspectFlowerPayload,flowerRequestHeaders,inspectFlowerTagShape}
  from './flower-protocol-parity.mjs';
import {probeCanonicalFlowerWithDesktopNeedle,LX_DESKTOP_NEEDLE_REF}
  from './flower-needle-parity.mjs';
import {probeFlowerCloudflareWireOnGithub} from './flower-raw-http1-parity.mjs';

// Real Flower-only Kugou Chengdu transport comparison, not a playback PASS.
// Replays the exact canonical URL and its current script-generated signed
// request headers. GitHub fetch, pinned LX Needle and Worker-like raw HTTP
// use the same per-attempt source request;
// Cloudflare response belongs to the preceding browser-side request.
// No signed URL, song hash, raw headers, media tokens, body or errors in logs.
const base=process.env.TEST_BASE_URL||'https://only-testing-online-music.pages.dev';
const browser=await chromium.launch({headless:true});
let captured=null;
try {
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,
    null,{timeout:20000});
  captured=await page.evaluate(async()=>{
    const active=window.LXSourceManager.getActive();
    const flower=String(active?.url||'').includes('/flower/latest.js') &&
      String(active?.name||'').includes('野花');
    const output={flower,qualityDeclared:!!active?.sources?.kg?.qualitys?.includes('128k'),
      searchFound:false,hashShape:'NOT_FOUND',hashMatches:false,
      flowerRequested:false,resolveState:'NOT_RUN',proxyStatus:null,
      origin:null};
    if(!flower||!output.qualityDeclared)return output;
    const bounded=(run,ms)=>new Promise(resolve=>{
      let settled=false;
      const timer=setTimeout(()=>{if(!settled){settled=true;resolve({timeout:true});}},ms);
      try {run((err,data)=>{if(settled)return;settled=true;
        clearTimeout(timer);resolve({error:!!err,data});});}
      catch {if(!settled){settled=true;clearTimeout(timer);resolve({error:true});}}
    });
    const response=await bounded(cb=>window.LXMusicSearch.search('kg','成都',1,25,cb),12000);
    if(response.timeout){output.resolveState='SEARCH_TIMEOUT';return output;}
    if(response.error){output.resolveState='SEARCH_ERROR';return output;}
    const matches=Array.isArray(response.data?.list)?response.data.list:[];
    const track=matches.find(x=>String(x?.name||'').trim()==='成都' &&
      String(x?.singer||'').includes('赵雷') && x.source==='kg');
    if(!track){output.resolveState='TRACK_MISSING';return output;}
    output.searchFound=true;
    const hash=String(track.hash||'');
    output.hashShape=/^[0-9a-f]{32}$/i.test(hash)
      ? 'KG_32_HEX':hash?'OTHER':'MISSING';
    const before=active.runtime?.__debugRequests?.length||0;
    const responseProbe=await bounded(cb=>window.LXSourceManager.requestAction(
      'kg','musicUrl',{type:'128k',
      musicInfo:{...track,...(track.raw||{}),source:'kg',
        songmid:track.songmid||track.id}},cb),14500);
    output.resolveState=responseProbe.timeout?'RESOLVE_TIMEOUT':
      responseProbe.error?'RESOLVE_ERROR':'RESOLVE_RETURNED';
    const reqs=(active.runtime?.__debugRequests||[]).slice(before);
    const entry=reqs.find(x=>{try{
      const u=new URL(x.url);
      return u.protocol==='http:'&&u.hostname==='97.64.37.235'&&
        u.pathname.startsWith('/flower/v1/url/kg/');
    }catch{return false;}});
    if(!entry)return output;
    output.flowerRequested=true;
    const u=new URL(entry.url);
    const parts=u.pathname.split('/').filter(Boolean);
    output.hashMatches=parts.length===6&&parts[4].toUpperCase()===hash.toUpperCase();
    // Guard before returning any sensitive request material to Node.
    if(!output.hashMatches||output.hashShape!=='KG_32_HEX')return output;
    output.origin={url:entry.url,headers:entry.headers||{},
      songmid:parts[4],quality:'128k',source:'kg'};
    return output;
  });
  await page.close();
}finally {await browser.close();}

const {origin,...safe}=captured||{};
const evidence={source:'Flower',track:'赵雷 / 成都',
  comparison:'same-signed-request-on-github-runner', ...safe,
  nodeFetch:{kind:'SKIPPED'},lxNeedle:{kind:'SKIPPED'},
  githubWorkerWire:{kind:'SKIPPED'}};
if(origin){
  const request=inspectFlowerRequest(origin.url,origin.songmid,origin.quality,'kg');
  const tag=inspectFlowerTagShape(origin.headers);
  evidence.canonicalRouteVerified=request.ok;
  evidence.tagShape={
    present:tag.present,type:tag.type,length:tag.length,
    hexOnly:tag.hexOnly,headerSafe:tag.headerSafe
  };
  evidence.tagPresentAndValid=tag.type==='string' &&
    tag.hexOnly && tag.length>=2 && tag.length<=512 &&
    tag.length%2===0 && tag.headerSafe;
  assert.ok(request.ok,'Safe canonical Kugou request expected');
  if(!evidence.tagPresentAndValid){
    evidence.nodeFetch={kind:'SKIPPED_SOURCE_SIGNATURE_SHAPE'};
    evidence.lxNeedle={kind:'SKIPPED_SOURCE_SIGNATURE_SHAPE'};
    evidence.githubWorkerWire={kind:'SKIPPED_SOURCE_SIGNATURE_SHAPE'};
  } else {
  const headers=flowerRequestHeaders(origin.headers);
  // Preserve this source's current, validated signature on the one approved
  // original IP. Do not send it to aliases, DNS resolvers or public relays.
  headers.tag=origin.headers.tag??origin.headers.Tag??origin.headers.TAG;
  async function fetchBounded(){
    let response;
    try{
      response=await fetch(origin.url,{
        method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(11000)
      });
      const status=response.status;
      let body='';
      if(response.body){
        const reader=response.body.getReader();
        try{
          while(body.length<16384){
            const next=await reader.read();
            if(next.done)break;
            body+=new TextDecoder().decode(next.value.slice(0,16384-body.length));
          }
        }finally{try{await reader.cancel();}catch{}}
      }
      return inspectFlowerPayload(status,body);
    }catch{return {status:null,valid:false,kind:'CONNECT_OR_TIMEOUT'};}
  }
  const meta={source:'kg',songmid:origin.songmid,quality:'128k'};
  const [f,n,w]=await Promise.all([
    fetchBounded(),
    probeCanonicalFlowerWithDesktopNeedle(origin.url,meta,origin.headers),
    probeFlowerCloudflareWireOnGithub(origin.url,meta,origin.headers)
  ]);
  evidence.nodeFetch=f;
  evidence.lxNeedle={status:n.status,valid:n.valid,kind:n.kind};
  evidence.githubWorkerWire=w;
  evidence.transportComparison={
    sameStatus:f.status!=null&&f.status===n.status,
    sameKind:f.kind===n.kind,
    workerWireMatchesNeedle:w.status!=null&&w.status===n.status,
    workerWireMatchesFetch:w.status!=null&&w.status===f.status,
    pinnedLXNeedleRevision:LX_DESKTOP_NEEDLE_REF,
    // This does not prove identical network egress to a Windows Desktop.
    egress:'GITHUB_RUNNER_ONLY'
  };
  }
}
console.log('FLOWER KUGOU CHENGDU DESKTOP-NEEDLE TRANSPORT:',JSON.stringify(evidence));
assert.equal(evidence.flower,true,'Flower-only active source required');
assert.equal(evidence.searchFound,true,'Genuine Kugou Chengdu search required');
assert.equal(evidence.hashMatches,true,'Flower route must use matched Kugou hash');
