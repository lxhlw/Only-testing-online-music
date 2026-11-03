import assert from 'node:assert/strict';
import {onRequestGet,validateMiguLyricUrl,sanitizeMiguLyric} from '../functions/api/migu-lyrics.js';
const cdn='https://d.musicapp.migu.cn/prod/file-service/file-down01/aaaa/bbbb/song.lrc';
assert.equal(validateMiguLyricUrl(cdn),cdn);
const rejected=[
 'http://d.musicapp.migu.cn/prod/file-service/file-down01/aaaa/bbbb/song.lrc',
 'https://evil.example/prod/file-service/file-down01/aaaa/bbbb/song.lrc',
 'https://d.musicapp.migu.cn:8443/prod/file-service/file-down01/aaaa/bbbb/song.lrc',
 'https://x:d@d.musicapp.migu.cn/prod/file-service/file-down01/aaaa/bbbb/song.lrc',
 'https://d.musicapp.migu.cn/admin',
 'https://d.musicapp.migu.cn/prod/file-service/file-down01/aaaa/bbbb/song.mp3',
 'https://d.musicapp.migu.cn/prod/file-service/file-down01/aaaa/bbbb/song.lrc?auth=secret',
 'https://d.musicapp.migu.cn/prod/file-service/file-down01/aaaa/bbbb/%2e%2e',
 'https://d.musicapp.migu.cn/prod/file-service/file-down01/aaaa/bbbb/song.lrc#fragment'
];
for(const url of rejected)assert.equal(validateMiguLyricUrl(url),'',url);
const sample='[00:00.00]第一行\n[00:01.00]第二行\n[00:02.20]第三行';
assert.equal(sanitizeMiguLyric(sample),sample);
assert.equal(sanitizeMiguLyric('<script>alert(1)</script>'),'');
assert.equal(sanitizeMiguLyric('[00:00.00]一行'),'');
const originalFetch=globalThis.fetch;
let calls=0;let upstream=()=>new Response(sample,{status:200,headers:{'Content-Type':'application/octet-stream'}});
globalThis.fetch=async(url,options)=>{
 calls++;
 assert.equal(url,cdn);
 assert.equal(options.redirect,'manual');
 assert.equal(new Headers(options.headers||{}).get('Authorization'),null);
 return upstream();
};
const hit=(id,url)=>onRequestGet({request:new Request('https://example.test/api/migu-lyrics?id='+
 encodeURIComponent(id)+'&url='+encodeURIComponent(url))});
try{
 for(const url of rejected){
  const r=await hit('6005751FFGS',url);
  assert.equal(r.status,400);
 }
 assert.equal(calls,0,'Unsafe URLs must never trigger an upstream fetch');
 for(const id of ['https://127.0.0.1','a/b','?']){
  assert.equal((await hit(id,cdn)).status,400);
 }
 assert.equal(calls,0);
 let r=await hit('6005751FFGS',cdn);
 assert.equal(r.status,200);
 const json=await r.json();
 assert.equal(json.source,'mg');
 assert.equal(json.id,'6005751FFGS');
 assert.equal(json.available,true);
 assert.equal(json.lyric,sample);
 assert.equal(r.headers.get('X-Content-Type-Options'),'nosniff');
 upstream=()=>new Response(null,{status:302,headers:{Location:'http://127.0.0.1'}});
 assert.equal((await hit('6005751FFGS',cdn)).status,502);
 upstream=()=>new Response('<html>bad</html>',{status:200});
 assert.equal((await hit('6005751FFGS',cdn)).status,502);
 upstream=()=>new Response(sample,{status:200,headers:{'Content-Length':'250000'}});
 assert.equal((await hit('6005751FFGS',cdn)).status,502);
 upstream=()=>new Response(new Uint8Array(190000),{status:200});
 assert.equal((await hit('6005751FFGS',cdn)).status,502);
 console.log('FYMUSIC_MIGU_LRC_SECURITY_UNIT_PASS',JSON.stringify({
  hostLocked:true,copyrightBound:true,timedLrc:true,redirectDenied:true,
  oversizedDenied:true,invalidTargetsRejected:rejected.length,calls
 }));
}finally{globalThis.fetch=originalFetch}
