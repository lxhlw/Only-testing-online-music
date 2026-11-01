import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Deterministic synthetic Flower TCP protocol test. No song IDs, signatures,
// real media or outside API calls. Never print socket request contents.
const original=readFileSync('functions/api/proxy.js','utf8');
const code=original.replace(
  "import { connect } from 'cloudflare:sockets';",
  "const connect = (...args) => globalThis.__fymusicMockConnect(...args);"
).replaceAll('export async function ','async function ')+
  '\nexport {fetchFlowerResolverFast};';
const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const originalFetch=globalThis.fetch;
const originalConnect=globalThis.__fymusicMockConnect;
const target=new URL('http://97.64.37.235/flower/v1/url/kw/synthetic/128k');
const host='https://only-testing-online-music.pages.dev';
const tag='0123456789abcdef'.repeat(4);
const request=new Request(host+'/api/proxy?url='+encodeURIComponent(target.href),{
  headers:{Origin:host,'X-LX-Headers':JSON.stringify({
    'User-Agent':'lx-music/desktop',ver:'2.0.0','source-ver':'1',tag,
    Authorization:'MUST_NOT_LEAK'
  })}
});
const encoder=new TextEncoder();
const decoder=new TextDecoder();
let scenario='short-ok';
let captured=[];
globalThis.fetch=async url=>{
  if(scenario==='alias-fast' && String(url).startsWith('http://tm.tempmusic.tk/url/'))
    return new Response(JSON.stringify({
      code:0,data:'https://media.example.test/synthetic.mp3'
    }),{status:200,headers:{'Content-Type':'application/json'}});
  return new Response('Origin unavailable',{status:503});
};
globalThis.__fymusicMockConnect=({hostname,port})=>{
  assert.equal(hostname,'97.64.37.235');
  assert.equal(port,80);
  let requestText='';
  let readOnce=false;
  return {
    opened:Promise.resolve(),
    writable:{getWriter:()=>({
      write:async bytes=>{requestText=decoder.decode(bytes);captured.push(requestText);},
      releaseLock(){}
    })},
    readable:{getReader:()=>({
      async read(){
        if(readOnce)return {done:true};
        readOnce=true;
        if(scenario==='alias-fast') await new Promise(r=>setTimeout(r,40));
        const isShort=requestText.startsWith('GET /url/kw/');
        const status=!isShort?(scenario==='full-400'?400:404):
          scenario==='short-ok'?200:404;
        const body=status===200?
          JSON.stringify({code:0,data:'https://media.example.test/synthetic.mp3'}):
          'Not Found';
        const statusText=status===200?'OK':status===400?'Bad Request':'Not Found';
        return {done:false,value:encoder.encode(
          'HTTP/1.1 '+status+' '+statusText+'\r\n'+
          'Content-Type: application/json\r\n'+
          'Content-Length: '+encoder.encode(body).length+'\r\n\r\n'+body
        )};
      },
      releaseLock(){}
    })},
    async close(){}
  };
};
try {
  const ok=await module.fetchFlowerResolverFast(target,request);
  assert.equal(ok.status,200);
  assert.equal(ok.headers.get('X-FyMusic-Flower-Route'),'canonical-short-socket');
  assert.equal((await ok.json()).data,'https://media.example.test/synthetic.mp3');
  assert.equal(captured.length,2,'404 on original must try short path once');
  assert.match(captured[0],/^GET \/flower\/v1\/url\/kw\/synthetic\/128k HTTP\/1\.1/);
  assert.match(captured[1],/^GET \/url\/kw\/synthetic\/128k HTTP\/1\.1/);
  assert.ok(captured.every(x=>x.includes('Host: 97.64.37.235')),
    'Short fallback must stay on same Flower server');
  assert.ok(captured.every(x=>x.includes('tag: '+tag)),
    'Short fallback must preserve source-generated tag');
  assert.ok(captured.every(x=>x.includes('MUST_NOT_LEAK')),
    'Both canonical TCP paths must preserve the original LX request protocol');
  // HTTP DNS aliases use the separate filtered header allowlist; only this
  // original-IP socket carries the source-specified original header set.

  scenario='full-400';captured=[];
  const wrongSignature=await module.fetchFlowerResolverFast(target,request);
  assert.equal(wrongSignature.status,502);
  assert.equal(captured.length,1,'HTTP 400 must not fan out to short TCP');
  assert.equal(wrongSignature.headers.get('X-FyMusic-Flower-Route'),null);

  scenario='short-failed';captured=[];
  const stillDown=await module.fetchFlowerResolverFast(target,request);
  assert.equal(stillDown.status,502);
  const failure=await stillDown.json();
  assert.equal(captured.length,2);
  assert.ok(failure.attempts.some(x=>
    x.route==='canonical-short-socket'&&x.code==='FLOWER_SOCKET_HTTP_404'),
    'Both failed TCP paths must be diagnosable without request URLs');
  assert.ok(!JSON.stringify(failure).includes(tag),
    'Failure summaries must never echo signed headers');
  // The HTTP alias may win while the original TCP request is pending. A
  // belated original 404 must not start unnecessary short-path traffic.
  scenario='alias-fast';captured=[];
  const aliasWinner=await module.fetchFlowerResolverFast(target,request);
  assert.equal(aliasWinner.status,200);
  assert.equal(aliasWinner.headers.get('X-FyMusic-Flower-Route'),'tm-short');
  await new Promise(r=>setTimeout(r,90));
  assert.equal(captured.length,1,'Cancelled race must not launch short TCP');
  console.log('FYMUSIC_CANONICAL_SHORT_SOCKET_UNIT_PASS '+
    JSON.stringify({shortOn404:true,noShortOn400:true,sameProvider:true,
      preserveTag:true,canonicalHeaderParity:true,boundedFailure:true,
      noObsoleteSocketAfterWinner:true}));
} finally {
  globalThis.fetch=originalFetch;
  if(originalConnect===undefined)delete globalThis.__fymusicMockConnect;
  else globalThis.__fymusicMockConnect=originalConnect;
}
