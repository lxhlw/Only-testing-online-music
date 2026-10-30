// Full official packaged Windows LX Music v2.12.6 exe, untouched release.
// Only user-visible accessibility/DOM metadata is reported. No credentials,
// signed URLs, song IDs or other private data are logged.
import {readdirSync,statSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const root=process.env.LX_RELEASE_DIR;
function walk(dir,depth=0) {
 if(depth>5)return [];
 let files=[];
 for(const n of readdirSync(dir)){
  const p=join(dir,n),st=statSync(p);
  if(st.isDirectory())files.push(...walk(p,depth+1));
  else if(/\.exe$/i.test(n))files.push(p);
 }
 return files;
}
const exes=walk(root);
console.log('OFFICIAL_WINDOWS_RELEASE_EXES '+JSON.stringify(
 exes.map(x=>x.slice(root.length+1)).filter(x=>!/unins|update|crash|elevate/i.test(x)).slice(0,12)));
const exe=exes.find(p=>/lx-music-desktop\.exe$/i.test(p))||
 exes.find(p=>/lx.*music.*\.exe$/i.test(p));
if(!exe)throw Error('OFFICIAL_EXECUTABLE_NOT_FOUND');
const proc=spawn(exe,['--remote-debugging-port=9368','--no-sandbox','--disable-gpu'],{
 cwd:dirname(exe),env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},
 stdio:['ignore','pipe','pipe'],windowsHide:false
});
let closed=false;
proc.on('exit',()=>closed=true);
async function cdpReady(){
 for(let i=0;i<55;i++){
  if(closed)return false;
  try{const res=await fetch('http://127.0.0.1:9368/json/version',{signal:AbortSignal.timeout(1400)});
   if(res.ok)return true;}catch{}
  await new Promise(r=>setTimeout(r,1000));
 }
 return false;
}
let connected=false;
try{
 connected=await cdpReady();
 console.log('OFFICIAL_WINDOWS_GUI_BOOT '+JSON.stringify({
  officialBinaryStarted:!closed,cdpReady:connected,
  officialSource:'LX Music Desktop v2.12.6 Windows x64 green release'}));
 if(!connected)throw Error('FULL_GUI_CDP_NOT_AVAILABLE');
 const pw=await chromium.connectOverCDP('http://127.0.0.1:9368');
 let pages=[];
 for(let i=0;i<40;i++){
  pages=pw.contexts().flatMap(c=>c.pages());
  if(pages.length)break;
  await new Promise(r=>setTimeout(r,1000));
 }
 console.log('OFFICIAL_GUI_PAGE_COUNT '+pages.length);
 const targets=await fetch('http://127.0.0.1:9368/json/list')
  .then(x=>x.json()).catch(()=>[]);
 console.log('OFFICIAL_CDP_TARGET_TYPES '+JSON.stringify(
  targets.map(t=>({type:t.type,title:String(t.title||'').slice(0,55),
    urlScheme:String(t.url||'').split(':')[0]})).slice(0,12)));
 if(!pages.length)throw Error('ORIGINAL_GUI_NO_RENDERER_TARGET');
 for(const page of pages.slice(0,4)){
  const info=await page.evaluate(()=>{
   const texts=Array.from(document.querySelectorAll('button,[role="button"],a'))
    .filter(e=>e.getBoundingClientRect().width>0)
    .map(e=>(e.innerText||e.title||e.getAttribute('aria-label')||'').trim())
    .filter(Boolean).map(s=>s.slice(0,45)).slice(0,65);
   return {title:document.title,bodyText:document.body?.innerText?.slice(0,1000)||'',buttons:texts};
  }).catch(()=>({title:'INACCESSIBLE'}));
  console.log('OFFICIAL_GUI_PAGE '+JSON.stringify(info));
 }
 const appPage=pages.find(p=>!p.isClosed()&&(p.url().startsWith('file:')||p.url().startsWith('http:')));
 if(!appPage)throw Error('NO_APP_PAGE');
 let accepted=false;
 try{
  const accept=appPage.getByRole('button',{name:/Accept/i});
  if(await accept.count()){
   await accept.first().click({timeout:40000});
   accepted=true;
   await appPage.waitForTimeout(2200);
  }
 }catch{console.log('OFFICIAL_LICENSE_SCREEN_UNRESOLVED');}
 console.log('OFFICIAL_GUI_LICENSE '+JSON.stringify({screenAdvanced:accepted}));
 const snapshot=async(stage)=>{
  const data=await appPage.evaluate(()=>{
   const texts=[...document.querySelectorAll('button,[role="button"],a')]
    .filter(e=>e.getBoundingClientRect().width>0)
    .map(e=>(e.innerText||e.title||e.getAttribute('aria-label')||'').trim())
    .filter(Boolean).map(s=>s.slice(0,50)).slice(0,80);
   return {text:document.body?.innerText?.slice(0,1300)||'',controls:texts};
  }).catch(()=>({unavailable:true}));
  console.log('OFFICIAL_GUI_'+stage+' '+JSON.stringify(data));
 };
 await snapshot('AFTER_LICENSE');
 try{
  await appPage.getByRole('button',{name:/^Settings$/i}).first().click({timeout:12000});
  await appPage.waitForTimeout(1700);
  await snapshot('SETTINGS');
 }catch{console.log('OFFICIAL_GUI_SETTINGS_NOT_REACHED');}
 await pw.close();
}finally{
 try{proc.kill()}catch{}
}
