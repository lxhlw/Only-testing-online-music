import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const original=readFileSync('functions/api/proxy.js','utf8');
const code=original.replace(
  "import { connect } from 'cloudflare:sockets';",
  "const connect = () => {throw new Error('canonical socket temporarily down')};"
).replaceAll('export async function ','async function ')+
  '\nexport {fetchFlowerResolverFast};';
const module=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const realFetch=globalThis.fetch;
// Synthetic hex fixture only: no real song hashes, credentials or tags.
const referenceTag='0123456789abcdef'.repeat(4);
const target=new URL('http://97.64.37.235/flower/v1/url/wy/demo/128k');
const request=new Request('https://only-testing-online-music.pages.dev/api/proxy?url='+
  encodeURIComponent(target.href),{headers:{
    Origin:'https://only-testing-online-music.pages.dev',
    'X-LX-Headers':JSON.stringify({
      'User-Agent':'lx-music/desktop',
      ver:'2.0.0',
      'source-ver':'1',
      tag:referenceTag,
      Authorization:'do-not-forward-unrelated-credential'
    })
  }});
let calls=[];
globalThis.fetch=async (url,options)=>{
  calls.push({url:String(url),headers:Object.fromEntries(new Headers(options?.headers).entries())});
  if(String(url).startsWith('http://tm.tempmusic.tk/url/') &&
     new Headers(options?.headers).get('source-ver')==='1' &&
     new Headers(options?.headers).get('ver')==='2.0.0' &&
     new Headers(options?.headers).get('tag')===referenceTag){
    await new Promise(r=>setTimeout(r,65));
    return new Response(JSON.stringify({
      code:0,data:'https://media.example.test/allowed-song.mp3'
    }),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return new Response('503 temporarily unavailable',{status:503});
};
try{
  const start=performance.now();
  const ok=await module.fetchFlowerResolverFast(target,request);
  const elapsed=performance.now()-start;
  assert.equal(ok.status,200);
  assert.ok(elapsed<700,'Parallel Flower host must win without waiting for other hosts or socket');
  const data=await ok.json();
  assert.equal(data.data,'https://media.example.test/allowed-song.mp3');
  assert.ok(calls.some(v=>v.url.startsWith('http://ts.tempmusic.tk/url/')));
  assert.ok(calls.some(v=>v.url.startsWith('http://tm.tempmusic.tk/url/')));
  assert.ok(calls.filter(v=>v.url.includes('tempmusic.tk')).every(v=>
    v.headers.ver==='2.0.0' && v.headers['source-ver']==='1' &&
    v.headers['user-agent']==='lx-music/desktop'),
    'Flower aliases must receive the source script request headers');
  assert.equal(calls.length,8,'All eight Flower HTTP aliases must be checked');
  assert.ok(calls.every(v=>v.headers.tag===referenceTag),
    'Every HTTP Flower alias must forward the exact source-generated tag');
  assert.ok(calls.every(v=>!('authorization' in v.headers)),
    'Fast resolver must not forward unrelated credentials');
  assert.ok(calls.length<=8);
  console.log('PASS: Flower fast host race wins in '+Math.round(elapsed)+'ms');
  calls=[];
  globalThis.fetch=async (url,options)=>{
    calls.push({url:String(url),headers:Object.fromEntries(new Headers(options?.headers).entries())});
    // All registered host aliases are offline; the original Flower IP
    // is reachable by DNS via sslip.io without leaking to a new provider.
    if(String(url).startsWith('http://97-64-37-235.sslip.io/flower/v1/url/'))
      return new Response(JSON.stringify({code:0,data:'https://media.example.test/flower-wildcard.mp3'}),{status:200});
    return new Response('bad gateway',{status:502});
  };
  const wildcard=await module.fetchFlowerResolverFast(target,request);
  assert.equal(wildcard.status,200);
  assert.equal((await wildcard.json()).data,'https://media.example.test/flower-wildcard.mp3');
  assert.ok(calls.some(c=>c.url.includes('sslip.io/flower/v1/url/')),'DNS alias must be included in the same-provider race');
  assert.ok(calls.every(v=>v.headers.tag===referenceTag),
    'DNS fallback must retain exact signed tag');
  calls=[];
  globalThis.fetch=async (url,options)=>{
    calls.push({url:String(url),headers:Object.fromEntries(new Headers(options?.headers).entries())});
    return new Response('bad gateway',{status:502});
  };
  const failed=await module.fetchFlowerResolverFast(target,request);
  assert.equal(failed.status,502);
  const err=await failed.json();
  assert.equal(err.error,'Flower resolver unavailable');
  assert.equal(err.diagnostic,'FLOWER_UPSTREAM_UNAVAILABLE');
  assert.equal(failed.headers.get('Cache-Control'),'no-store');
  assert.equal(failed.headers.get('Access-Control-Allow-Origin'),
    'https://only-testing-online-music.pages.dev');
  assert.equal(err.attempts.length,9,'Must record each allowed Flower route without leaking secrets');
  assert.ok(err.attempts.every(x=>/^(HTTP_502|NETWORK_ERROR|FLOWER_SOCKET_CONNECT)$/.test(x.code)),
    'Failures must use safe reason categories: '+JSON.stringify(err.attempts));
  assert.ok(calls.length<=8,'A failure must not enter the old serial/public-relay waterfall');
  assert.ok(calls.every(v=>v.headers.tag===referenceTag),
    'Failure path must send signed tag to every Flower HTTP alias');
  assert.ok(!JSON.stringify(err).includes(referenceTag),
    'Failure diagnostic must not expose the signed tag');
  console.log('PASS: Flower unavailable ends quickly with safe same-origin 502 and no unrelated providers');
}finally{
  globalThis.fetch=realFetch;
}
