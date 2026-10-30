// GitHub-hosted Linux+Windows original LX diagnostic; does not affect main.
// This executes official unmodified Electron preload, not a home-PC test or
// the complete packaged GUI. Search metadata supplied by current Web catalog.
// Never report song IDs, source signatures, raw upstream bodies or media URLs.
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import electronBinary from 'electron';
import {chromium} from 'playwright';
const tagCommit='ad95d5091c9ed689fa72b5e5c849df65f5a679ce';
const temp=mkdtempSync(join(tmpdir(),'original-lx-'));
const upstream='https://raw.githubusercontent.com/lyswhut/lx-music-desktop/'+tagCommit+'/src/main/modules/userApi/';
async function download(url){
 for(let i=0;i<3;i++){
  try{const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
   if(response.ok)return response.text();}catch{}
 }
 throw Error('OFFICIAL_SOURCE_UNAVAILABLE');
}
const preload=await download(upstream+'renderer/preload.js');
const names=await download(upstream+'rendererEvent/name.js');
if(!preload.includes("import needle from 'needle'")||
   !preload.includes("webFrame.executeJavaScript(userApi.script)"))
  throw Error('OFFICIAL_PRELOAD_MISMATCH');
const flower=await download('https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js');
const sourceFolder=join(temp,'renderer');
mkdirSync(sourceFolder);mkdirSync(join(temp,'rendererEvent'));
const entry=join(sourceFolder,'preload.js');
writeFileSync(entry,preload);
writeFileSync(join(temp,'rendererEvent','name.js'),names);
const flowerFile=join(temp,'flower.js');writeFileSync(flowerFile,flower);
const output=resolve('original-lx-preload.cjs');
await build({entryPoints:[entry],outfile:output,bundle:true,platform:'node',
 format:'cjs',external:['electron','needle','tunnel'],logLevel:'silent'});
console.log('ORIGINAL_LX_PROVENANCE '+JSON.stringify({
 version:'v2.12.6',commit:tagCommit,
 preloadHash:createHash('sha256').update(preload).digest('hex'),
 flowerHash:createHash('sha256').update(flower).digest('hex'),
 execution:'unmodified original preload inside native Electron; not packaged GUI'
}));
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const cases=[
 {platform:'wy',keyword:'宋冬野',title:'郭源潮',artist:'宋冬野',testCase:'guoyuanchao'},
 {platform:'tx',keyword:'宋冬野',title:'郭源潮',artist:'宋冬野',testCase:'guoyuanchao'},
 {platform:'kg',keyword:'宋冬野',title:'郭源潮',artist:'宋冬野',testCase:'guoyuanchao'},
 {platform:'kg',keyword:'成都',title:'成都',artist:'赵雷',testCase:'chengdu'}
];
try{
 await page.goto('https://only-testing-online-music.pages.dev',{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>window.LXMusicSearch&&window.LXSourceManager?.getActive()?.inited,
  null,{timeout:23000});
 for(const c of cases){
  const track=await page.evaluate(({platform,keyword,title,artist})=>new Promise(done=>{
   let called=false;
   const timer=setTimeout(()=>{if(!called){called=true;done(null)}},14000);
   window.LXMusicSearch.search(platform,keyword,1,35,(err,data)=>{
    if(called)return;called=true;clearTimeout(timer);
    done(err?null:(data?.list||[]).find(x=>x.source===platform&&
     String(x.name||'').trim()===title&&String(x.singer||'').includes(artist))||null);
   });
  }),c);
  if(!track){
   console.log('ORIGINAL_WEB_COMPARISON '+JSON.stringify({
    platform:c.platform,testCase:c.testCase,searchFound:false,original:'NOT_RUN'}));
   continue;
  }
  const musicInfo={...track,...(track.raw||{}),source:c.platform,
    songmid:track.songmid||track.id};
  const web=await page.evaluate(({platform,musicInfo})=>new Promise(done=>{
   let called=false;const timer=setTimeout(()=>{if(!called){called=true;done({phase:'TIMEOUT',urlReturned:false})}},14500);
   window.LXSourceManager.requestAction(platform,'musicUrl',{type:'128k',musicInfo},(err,val)=>{
    if(called)return;called=true;clearTimeout(timer);
    const url=typeof val==='string'?val:typeof val?.url==='string'?val.url:'';
    done({phase:err?'URL_FAILED':/^https?:\/\//.test(url)?'URL_RETURNED':'NO_URL',
      urlReturned:!err&&/^https?:\/\//.test(url)});
   });
  }),{platform:c.platform,musicInfo});
  const meta=join(temp,c.platform+'-'+c.testCase+'.json');
  writeFileSync(meta,JSON.stringify({...c,musicInfo}));
  const original=await new Promise(resolveResult=>{
   let completed=false,received=null,buffer='';
   const process=spawn(electronBinary,['--no-sandbox',resolve('scripts/diagnostics/original-lx-electron-main.cjs')],{
    env:{...globalThis.process.env,LX_DIAG_META:meta,LX_DIAG_PRELOAD:output,
      LX_DIAG_FLOWER:flowerFile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},
    stdio:['ignore','pipe','pipe']});
   const limit=setTimeout(()=>{process.kill();if(!completed){completed=true;resolveResult({phase:'RUNNER_TIMEOUT',urlReturned:false})}},45000);
   process.stdout.on('data',chunk=>{
    buffer+=String(chunk);const lines=buffer.split(/\r?\n/);buffer=lines.pop()||'';
    for(const line of lines)if(line.includes('ORIGINAL_NATIVE_RESULT ')){
     try{received=JSON.parse(line.slice(line.indexOf('ORIGINAL_NATIVE_RESULT ')+23));}catch{}
    }
   });
   process.on('close',(code,signal)=>{
    if(completed)return;completed=true;clearTimeout(limit);
    resolveResult(received||{phase:'EXIT_WITHOUT_RESULT',exitCode:code,signal:String(signal||'NONE'),urlReturned:false});
   });
   process.on('error',()=>{
    if(completed)return;completed=true;clearTimeout(limit);
    resolveResult({phase:'SPAWN_ERROR',urlReturned:false});
   });
  });
  console.log('ORIGINAL_WEB_COMPARISON '+JSON.stringify({platform:c.platform,
   testCase:c.testCase,searchFound:true,web,original}));
 }
}finally{await browser.close();}
