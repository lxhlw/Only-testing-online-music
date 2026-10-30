import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';

// Unmocked original Flower source, exact Song "开始懂了" by 孙燕姿.
// Never print URLs, song IDs, track hashes, signatures, headers, or raw error bodies.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const flower='https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const routes=new Set(['ts-short','tm-short','ts-full','tm-full',
 'sslip-short','nip-short','sslip-full','nip-full','canonical-socket']);
const safeCode=/^(?:HTTP_[0-9]{3}|FLOWER_SOCKET_[A-Z0-9_]+|INVALID_PAYLOAD|BLOCKED_TARGET|TIMEOUT|NETWORK_ERROR)$/;
const validDiagnostic=new Set(['FLOWER_TIMEOUT','FLOWER_UPSTREAM_UNAVAILABLE']);
const summary={schema:'fymusic.flower-root-cause.v1',
 target:'Sun Yanzi - Kai Shi Dong Le',
 qualityPolicy:'source declared qualities only; no invented quality support',
 source:{scriptMatch:null,env:'unknown',initialized:false,declared:{}},
 results:[]};
let expectedSha=null;
try{
 const fetched=await fetch(flower,{signal:AbortSignal.timeout(12000)});
 if(fetched.ok)expectedSha=createHash('sha256').update(await fetched.text()).digest('hex');
}catch{}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 let runningRow=null;
 const pending=[];
 page.on('response',response=>{
  const row=runningRow;if(!row)return;
  const p=(async()=>{
   try{
    if(response.status()<400)return;
    const u=new URL(response.url());
    if(u.pathname!=='/api/proxy')return;
    const upstream=new URL(u.searchParams.get('url')||'');
    if(!upstream.pathname.startsWith('/flower/v1/url/'+row.platform+'/'))return;
    let data={};
    try{data=await response.json();}catch{}
    row.proxy.push({httpStatus:response.status(),
     diagnostic:validDiagnostic.has(data.diagnostic)?data.diagnostic:'unknown',
     routes:(Array.isArray(data.attempts)?data.attempts:[])
      .filter(a=>routes.has(a?.route)&&safeCode.test(String(a?.code||'')))
      .slice(0,9).map(a=>({route:a.route,code:a.code}))});
   }catch{}
  })();
  pending.push(p);
 });
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('.nav-item[data-view="settings"]').click();
 await page.locator('#source-url').fill(flower);
 await page.locator('#install-btn').click();
 try{
  await page.waitForFunction(url=>{
   const a=window.LXSourceManager?.getActive?.();
   return !!(a?.inited&&a?.runtime&&a?.url===url);
  },flower,{timeout:40000});
 }catch{}
 const source=await page.evaluate(async()=>{
  const a=window.LXSourceManager?.getActive?.();
  let sha=null;
  if(typeof a?.code==='string'&&crypto?.subtle){
   const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(a.code));
   sha=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  return {initialized:!!a?.inited,official:a?.url===
   'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
   env:a?.runtime?.env||'unknown',sha,
   declared:Object.fromEntries(['wy','tx','kg'].map(p=>[p,
    Array.isArray(a?.sources?.[p]?.qualitys)?a.sources[p].qualitys.slice(0,12):[]]))};
 });
 summary.source={initialized:source.initialized,scriptMatch:
  Boolean(source.official&&expectedSha&&source.sha===expectedSha),
  env:source.env==='desktop'?'desktop':'other',declared:source.declared};
 if(source.initialized&&source.official){
  for(const platform of ['kg','wy']){
   const search=await page.evaluate(async({platform})=>{
    const wait=(fn,ms)=>new Promise(resolve=>{
     let done=false;
     const timer=setTimeout(()=>{if(!done){done=true;resolve({status:'timeout'});}},ms);
     try{fn((err,data)=>{
      if(done)return;done=true;clearTimeout(timer);
      resolve(err?{status:'error'}:{status:'ok',data});
     });}catch{if(!done){done=true;clearTimeout(timer);resolve({status:'error'});}}
    });
    const norm=x=>String(x||'').normalize('NFKC').toLowerCase()
     .replace(/[\s_.·-]+/g,'');
    let status='not_run',provider='unknown',hits=[];
    for(const query of ['开始懂了','孙燕姿 开始懂了']){
     const res=await wait(done=>window.LXMusicSearch.search(platform,query,1,30,done),16000);
     status=res.status;
     if(res.status!=='ok')continue;
     provider=res.data?.searchProvider||'unknown';
     hits=(res.data?.list||[]).filter(x=>x.source===platform&&
      norm(x.name)===norm('开始懂了')&&norm(x.singer).includes(norm('孙燕姿')));
     if(hits.length)break;
    }
    window.__fyRootTracks=hits.slice(0,platform==='kg'?2:1);
    const shapes=window.__fyRootTracks.map(x=>({
     baseHash:/^[a-f0-9]{32}$/i.test(String(x.hash||'')),
     q128Hash:/^[a-f0-9]{32}$/i.test(String(x._types?.['128k']?.hash||'')),
     q320Hash:/^[a-f0-9]{32}$/i.test(String(x._types?.['320k']?.hash||'')),
     flacHash:/^[a-f0-9]{32}$/i.test(String(x._types?.flac?.hash||'')),
     songmidPresent:!!x.songmid,albumAudioIdPresent:!!x.albumAudioId
    }));
    return {status,provider,found:hits.length,shapes};
   },{platform});
   const row={platform,searchStatus:String(search.status).slice(0,22),
    searchProvider:['kugou-native','kugou-mobile-native','netease-native',
     'gdstudio-native','lx-native'].includes(search.provider)?search.provider:'other',
    matchingTracks:search.found,attempts:[]};
   summary.results.push(row);
   for(let i=0;i<search.shapes.length;i++){
    const attempt={candidate:i+1,quality:'128k',
     inputShape:search.shapes[i],status:'not_started',routeShape:null,proxy:[]};
    row.attempts.push(attempt);
    runningRow={platform,proxy:attempt.proxy};
    const result=await page.evaluate(async index=>{
     const a=window.LXSourceManager.getActive();
     const track=window.__fyRootTracks[index];
     const info={...track};
     if(track.raw&&typeof track.raw==='object')
      for(const [k,v] of Object.entries(track.raw))if(info[k]==null)info[k]=v;
     delete info.raw;
     info.source=track.source;
     info.songId=info.songId||track.id;
     if(!info.songmid&&!info.hash&&track.id!=null)info.songmid=String(track.id);
     const n=a.runtime?.__debugRequests?.length||0;
     const result=await new Promise(resolve=>{
      let done=false;
      const timer=setTimeout(()=>{if(!done){done=true;resolve('timeout');}},17000);
      window.LXSourceManager.requestAction('kg'===track.source?'kg':'wy','musicUrl',
       {type:'128k',musicInfo:info},(err,data)=>{
        if(done)return;done=true;clearTimeout(timer);
        if(err)return resolve('resolver_error');
        const url=typeof data==='string'?data:data?.url||data?.result||'';
        resolve(/^https?:\/\//i.test(String(url))?'url_returned':'no_url');
       });
     });
     const requests=(a.runtime?.__debugRequests||[]).slice(n);
     const request=requests.find(x=>{
      try{
       const u=new URL(x.url);
       return u.hostname==='97.64.37.235'&&
        u.pathname.startsWith('/flower/v1/url/'+track.source+'/');
      }catch{return false;}
     });
     let shape=null;
     if(request){
      const u=new URL(request.url),seg=u.pathname.split('/').filter(Boolean);
      const hs=request.headers||{};
      const header=name=>{
       const k=Object.keys(hs).find(x=>x.toLowerCase()===name.toLowerCase());
       return k?String(hs[k]):'';
      };
      const path=u.pathname.slice('/flower/v1'.length);
      const signing=JSON.stringify(path.match(/(?:\d\w)+/g),null,1);
      const generated=Array.from(new TextEncoder().encode(signing))
       .map(x=>x.toString(16).padStart(2,'0')).join('');
      const selected=String(info._types?.['128k']?.hash||info.hash||'').toUpperCase();
      shape={
       canonical:seg.length===6&&seg.slice(0,4).join('/')==='flower/v1/url/'+track.source,
       quality128:seg[5]==='128k',
       idFormat:/^[0-9a-f]{32}$/i.test(seg[4]||''),
       matchesSelectedHash:String(seg[4]||'').toUpperCase()===selected,
       tagPresent:!!header('tag'),
       tagMatchesIndependentEncoding:header('tag')===generated,
       desktopAgent:header('User-Agent')==='lx-music/desktop',
       sourceVersionPresent:!!header('source-ver')
      };
     }
     return {result,shape};
    },i);
    attempt.status=result.result;attempt.routeShape=result.shape;
    runningRow=null;
    await Promise.allSettled(pending.splice(0));
   }
  }
 }
 await page.close();
}finally{await browser.close();}
await mkdir('diagnostics',{recursive:true});
await writeFile('diagnostics/fymusic-flower-root-cause.json',JSON.stringify(summary,null,2)+'\n');
console.log('FYMUSIC_ROOT_CAUSE '+JSON.stringify(summary));
console.log('FYMUSIC_ROOT_CAUSE_FINISHED');
