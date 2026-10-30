// Cloud-only Windows parity test. Real LX Desktop v2.12.6 preload,
// unmodified Flower script, and same exact FyMusic catalogue musicInfo.
// Preload comparison is NOT full packaged LX GUI; never call it GUI proof.
// Never print or upload raw IDs, signed URLs, headers, tags or request bodies.
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import electronBinary from 'electron';
import {chromium} from 'playwright';

const ROOT='https://raw.githubusercontent.com/lyswhut/lx-music-desktop/';
const COMMIT='ad95d5091c9ed689fa72b5e5c849df65f5a679ce';
const FLOWER='https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const dir=mkdtempSync(join(tmpdir(),'fymusic-parity-'));
const sha=s=>createHash('sha256').update(s).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const safeError=e=>/timeout/i.test(String(e||''))?'TIMEOUT':
 /404/.test(String(e||''))?'HTTP_404':
 /400/.test(String(e||''))?'HTTP_400':
 /403/.test(String(e||''))?'HTTP_403':
 /failed/i.test(String(e||''))?'FAILED':'OTHER';
async function download(url){
 for(let i=0;i<3;i++){
  try{
   const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
   if(response.ok)return response.text();
  }catch{}
 }
 throw Error('OFFICIAL_SOURCE_FETCH_FAILED');
}
const preload=await download(ROOT+COMMIT+'/src/main/modules/userApi/renderer/preload.js');
const eventNames=await download(ROOT+COMMIT+'/src/main/modules/userApi/rendererEvent/name.js');
if(!preload.includes("import needle from 'needle'")||
 !preload.includes("webFrame.executeJavaScript(userApi.script)"))
 throw Error('OFFICIAL_PRELOAD_UNEXPECTED_FORMAT');
const flower=await download(FLOWER);
mkdirSync(join(dir,'renderer'));
mkdirSync(join(dir,'rendererEvent'));
writeFileSync(join(dir,'renderer','preload.js'),preload);
writeFileSync(join(dir,'rendererEvent','name.js'),eventNames);
const flowerFile=join(dir,'flower.js');
writeFileSync(flowerFile,flower);
// Resolve the original preload's external needle/tunnel modules from the
// checked-out workspace, where CI installs them; source stays unmodified.
const preloadBuild=resolve('.fymusic-original-preload.cjs');
await build({entryPoints:[join(dir,'renderer','preload.js')],outfile:preloadBuild,
 bundle:true,platform:'node',format:'cjs',
 external:['electron','needle','tunnel'],logLevel:'silent'});
const provenance={
 version:'v2.12.6',upstreamCommit:COMMIT,
 preloadSha256:sha(preload),flowerSha256:sha(flower),
 originalComponent:'official_unmodified_native_preload',
 runner:'windows-latest',
 sourceSearch:'real FyMusic catalogue, no fixture',
 sameMusicInfoBothClients:true
};
const rows=[];
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
let page;
async function electronAttempt(spec){
 const meta=join(dir,'case-'+spec.caseIndex+'.json');
 writeFileSync(meta,JSON.stringify({platform:spec.platform,testCase:'sun-yanzi-kaishidongle',
  musicInfo:spec.musicInfo,quality:spec.quality}));
 return new Promise(done=>{
  let finished=false,buffer='',received=null,timeout;
  const child=spawn(electronBinary,['--no-sandbox',
   resolve('scripts/diagnostics/fymusic-original-electron-main.cjs')],{
   env:{...process.env,LX_DIAG_META:meta,LX_DIAG_PRELOAD:preloadBuild,
    LX_DIAG_FLOWER:flowerFile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},
   stdio:['ignore','pipe','pipe'],windowsHide:true});
  const finish=out=>{
   if(finished)return;
   finished=true;clearTimeout(timeout);
   if(child.exitCode===null)child.kill();
   done(out);
  };
  timeout=setTimeout(()=>finish({phase:'RUNNER_TIMEOUT',urlReturned:false}),41000);
  child.stdout.on('data',chunk=>{
   buffer+=String(chunk);
   const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
   for(const line of lines){
    if(!line.includes('ORIGINAL_NATIVE_RESULT '))continue;
    try{
     const parsed=JSON.parse(line.slice(line.indexOf('ORIGINAL_NATIVE_RESULT ')+23));
     received={
      phase:parsed.phase||'UNKNOWN',urlReturned:!!parsed.urlReturned,
      audioStarted:!!parsed.audioStarted,progress:Number(parsed.progress)||0,
      duration:Number.isFinite(parsed.duration)?parsed.duration:null,
      reason:parsed.reason||null,
      errorMessageLength:Number(parsed.errorMessageLength)||0
     };
    }catch{}
   }
   if(received)finish(received);
  });
  child.on('close',code=>finish(received||{phase:'EXIT_WITHOUT_RESULT',
   exitCode:Number.isInteger(code)?code:null,urlReturned:false}));
  child.on('error',()=>finish({phase:'SPAWN_ERROR',urlReturned:false}));
 });
}
async function webAttempt(platform,musicInfo,quality){
 return page.evaluate(({platform,musicInfo,quality})=>new Promise(done=>{
  let called=false;
  const timer=setTimeout(()=>{if(!called){called=true;done({
   phase:'TIMEOUT',urlReturned:false});}},16000);
  try{
   window.LXSourceManager.requestAction(platform,'musicUrl',{type:quality,musicInfo},
    (err,data)=>{
     if(called)return;
     called=true;clearTimeout(timer);
     const url=typeof data==='string'?data:
      typeof data?.url==='string'?data.url:
      typeof data?.result==='string'?data.result:'';
     const text=String(err?.message||err||'');
     done({phase:err?'URL_FAILED':/^https?:\/\//.test(url)?'URL_RETURNED':'INVALID_URL',
      urlReturned:!err&&/^https?:\/\//.test(url),
      failureClass:err?(/timeout/i.test(text)?'TIMEOUT':
       /404/.test(text)?'HTTP_404':/400/.test(text)?'HTTP_400':
       /403/.test(text)?'HTTP_403':'OTHER'):null});
    });
  }catch{clearTimeout(timer);done({phase:'CALL_FAILED',urlReturned:false});}
 }),{platform,musicInfo,quality});
}
try{
 page=await browser.newPage({viewport:{width:1280,height:900}});
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:30000});
 await page.locator('.nav-item[data-view="settings"]').click();
 await page.locator('#source-url').fill(FLOWER);
 await page.locator('#install-btn').click();
 await page.waitForFunction(url=>{
  const a=window.LXSourceManager?.getActive?.();
  return Boolean(a?.inited&&a?.url===url&&a?.runtime);
 },FLOWER,{timeout:42000});
 const source=await page.evaluate(()=>{
  const a=window.LXSourceManager.getActive();
  return {name:String(a.name||'').slice(0,32),sourceUrlMatched:a.url===
   'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js',
   declared:Object.fromEntries(['kg','wy'].map(p=>[p,
    Array.isArray(a?.sources?.[p]?.qualitys)?a.sources[p].qualitys:[]]))};
 });
 if(!source.sourceUrlMatched)throw Error('FLOWER_SELECTION_INCONSISTENT');
 provenance.webSourceDeclared=source.declared;
 let index=0;
 for(const platform of ['kg','wy']){
  const found=await page.evaluate(async platform=>{
   const norm=s=>String(s||'').normalize('NFKC').toLowerCase()
    .replace(/[\s_.·-]+/g,'');
   const get=query=>new Promise(done=>{
    let finished=false;
    const t=setTimeout(()=>{if(!finished){finished=true;done({
     status:'timeout',list:[]});}},15000);
    window.LXMusicSearch.search(platform,query,1,30,(err,data)=>{
     if(finished)return;
     finished=true;clearTimeout(t);
     done(err?{status:'error',list:[]}:
      {status:'ok',list:Array.isArray(data?.list)?data.list:[],
       provider:String(data?.searchProvider||'unknown').slice(0,32)});
    });
   });
   let selected=[],provider='unknown',searchStatus='not_run';
   for(const query of ['开始懂了','孙燕姿 开始懂了']){
    const resp=await get(query);
    searchStatus=resp.status;
    if(resp.status!=='ok')continue;
    provider=resp.provider;
    selected=resp.list.filter(x=>x?.source===platform&&
      norm(x?.name)===norm('开始懂了')&&
      norm(x?.singer).includes(norm('孙燕姿')));
    if(selected.length)break;
   }
   return {searchStatus,provider,count:selected.length,
    tracks:selected.slice(0,platform==='kg'?2:1)};
  },platform);
  if(!found.tracks.length){
   rows.push({platform,searchStatus:found.searchStatus,
    provider:found.provider,found:false,comparison:'NOT_RUN'});
   continue;
  }
  for(const track of found.tracks){
   index++;
   const musicInfo={...track,...(track.raw||{}),source:platform,
    songmid:track.songmid||track.id};
   delete musicInfo.raw;
   const quality=source.declared[platform].includes('128k')?'128k':null;
   if(!quality){
    rows.push({platform,searchStatus:found.searchStatus,
     provider:found.provider,found:true,
     result:'QUALITY_NOT_DECLARED',comparison:'NOT_RUN'});
    continue;
   }
   const args={caseIndex:index,platform,musicInfo,quality};
   const web=await webAttempt(platform,musicInfo,quality);
   const original=await electronAttempt(args);
   const flags={
    samePlatform:true,sameMusicInfo:true,sameFlowerSha256:true,
    sameRequestedQuality:true,
    originalReturnedUrl:!!original.urlReturned,
    webReturnedUrl:!!web.urlReturned,
    resultsMatch:!!original.urlReturned===!!web.urlReturned
   };
   rows.push({platform,candidateIndex:platform==='kg'?index:index,
    found:true,provider:found.provider,quality,flags,
    web,original});
   console.log('FYMUSIC_NATIVE_PARITY_ROW '+JSON.stringify(rows.at(-1)));
  }
 }
}finally{await browser.close();}
const report={schema:'fymusic.original-preload-parity.v1',
 provenance,
 comparisonCaveats:[
  'Official LX native preload (not full packaged GUI)',
  'Same song metadata and unmodified Flower script; Web via Cloudflare proxy and native Needle have different egress',
  'Music URL and media time progress do not certify song identity or audible output'
 ],rows};
console.log('FYMUSIC_NATIVE_PARITY_SUMMARY '+JSON.stringify(report));
