import assert from 'node:assert/strict';
import {desktopSearchBody,DESKTOP_SEARCH_PATH,EAPI_BATCH,
  encodeDesktopEapi,decodeDiagnosticOnly,pickSong}
  from './netease-desktop-eapi.mjs';

// Deterministic protocol checks (no network needed).
const search=desktopSearchBody('宋冬野',0,30);
assert.deepEqual(Object.keys(search),[
  'keyword','needCorrect','channel','offset','scene','total','limit'
]);
const form=encodeDesktopEapi(DESKTOP_SEARCH_PATH,search);
const decrypted=decodeDiagnosticOnly(form);
assert.ok(decrypted.startsWith(DESKTOP_SEARCH_PATH+'-36cd479b6b5-'));
assert.ok(decrypted.includes(JSON.stringify(search)));
assert.ok(/-36cd479b6b5-[a-f0-9]{32}$/.test(decrypted));
assert.deepEqual(pickSong([
  {baseInfo:{simpleSongData:{id:123,name:'郭源潮',dt:445000,ar:[{name:'宋冬野'}],al:{name:'郭源潮'}}}}
],'郭源潮','宋冬野'),{id:'123',seconds:445,album:'郭源潮'});
console.log('PASS desktop EAPI request encoding and response-shape unit checks');

const summary={desktop:{status:'NOT_CHECKED'},web:{status:'NOT_CHECKED'}};
const timeout=7000;
const desktopHeaders={
  'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
  'Origin':'https://music.163.com',
  'Content-Type':'application/x-www-form-urlencoded',
  'Accept':'application/json, text/plain, */*'
};
for(const target of [EAPI_BATCH,EAPI_BATCH.replace('http:','https:')]){
  try{
    const response=await fetch(target,{
      method:'POST',headers:desktopHeaders,body:form,redirect:'manual',
      signal:AbortSignal.timeout(timeout)
    });
    let json={};
    try{json=await response.json();}catch{}
    const resources=json?.data?.resources||json?.data?.data?.resources||[];
    summary.desktop={
      transport:target.startsWith('https:')?'HTTPS':'HTTP',
      status:response.status,code:json.code??null,
      resultCount:resources.length,
      match:pickSong(resources,'郭源潮','宋冬野'),
      schemaValid:Array.isArray(resources)
    };
    if(response.ok&&Number(json.code)===200&&resources.length)break;
  }catch(error){
    summary.desktop={
      transport:target.startsWith('https:')?'HTTPS':'HTTP',
      status:'NETWORK_ERROR',failure:error?.name==='TimeoutError'?'TIMEOUT':'CONNECT'
    };
  }
}
try{
  const address='https://only-testing-online-music.pages.dev/api/netease-search?s='+encodeURIComponent('宋冬野')+
    '&offset=0&limit=30';
  const response=await fetch(address,{signal:AbortSignal.timeout(timeout)});
  const json=await response.json();
  const songs=json?.result?.songs||[];
  summary.web={
    status:response.status,resultCount:songs.length,
    match:pickSong(songs,'郭源潮','宋冬野')
  };
}catch(error){summary.web={status:'NETWORK_ERROR',failure:error?.name==='TimeoutError'?'TIMEOUT':'CONNECT'};}
if(summary.desktop.match&&summary.web.match){
  summary.comparison={
    sameSongmid:summary.desktop.match.id===summary.web.match.id,
    sameDuration:summary.desktop.match.seconds===summary.web.match.seconds,
    desktopSongmid:summary.desktop.match.id,
    webSongmid:summary.web.match.id,
    desktopDuration:summary.desktop.match.seconds,
    webDuration:summary.web.match.seconds
  };
}
console.log('LX_DESKTOP_NETEASE_SEARCH_PARITY',JSON.stringify(summary));
if(!summary.desktop.match)throw Error('Desktop EAPI real search did not return a comparable track');
if(!summary.web.match)throw Error('Current Web search did not return a comparable track');
