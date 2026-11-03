import assert from 'node:assert/strict';
const site='https://only-testing-online-music.pages.dev';
const paths=['version.json','README.md','package.json','scripts/test-modern-web-browser.mjs',
 'android-companion/README.md','.github/workflows/verify-and-deploy.yml','api/proxy'];
for(let round=0;round<3;round++){
 for(const path of paths){
  let response,raw='';
  try{
   response=await fetch(site+'/'+path+'?securityAudit='+round,{signal:AbortSignal.timeout(10000),
    headers:{'Cache-Control':'no-cache','Accept':'*/*'}});
   raw=(await response.text()).slice(0,4000);
   const finding={round,path,status:response.status,
    type:response.headers.get('content-type'),
    length:raw.length,html:/(?:<!doctype html|<html\b)/i.test(raw.slice(0,300)),
    realReadme:/^# FyMusic\s/m.test(raw),
    repoPackage:raw.includes('"name": "only-testing-online-music"'),
    generic404:raw.includes('404 · Not found'),
    pageVersion:raw.includes('0.4.30'),cache:response.headers.get('cf-cache-status')};
   console.log('FYMUSIC_0430_PUBLIC_FILE_AUDIT',JSON.stringify(finding));
  }catch(error){console.log('FYMUSIC_0430_PUBLIC_FILE_AUDIT',JSON.stringify({
   round,path,error:String(error.name||'error').slice(0,60)
  }));}
 }
 await new Promise(resolve=>setTimeout(resolve,2200));
}
