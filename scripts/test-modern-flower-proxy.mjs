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
const target=new URL('http://97.64.37.235/flower/v1/url/wy/demo/128k');
const request=new Request('https://only-testing-online-music.pages.dev/api/proxy?url='+
  encodeURIComponent(target.href),{headers:{Origin:'https://only-testing-online-music.pages.dev'}});
let calls=[];
globalThis.fetch=async (url,options)=>{
  calls.push(String(url));
  if(String(url).startsWith('http://tm.tempmusic.tk/url/')){
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
  assert.ok(calls.some(v=>v.startsWith('http://ts.tempmusic.tk/url/')));
  assert.ok(calls.some(v=>v.startsWith('http://tm.tempmusic.tk/url/')));
  assert.ok(calls.length<=4);
  console.log('PASS: Flower fast host race wins in '+Math.round(elapsed)+'ms');
  calls=[];
  globalThis.fetch=async (url,options)=>{
    calls.push(String(url));
    return new Response('bad gateway',{status:502});
  };
  const failed=await module.fetchFlowerResolverFast(target,request);
  assert.equal(failed.status,502);
  const err=await failed.json();
  assert.equal(err.error,'Flower resolver unavailable');
  assert.equal(failed.headers.get('Access-Control-Allow-Origin'),
    'https://only-testing-online-music.pages.dev');
  assert.ok(calls.length<=4,'A failure must not enter the old serial/public-relay waterfall');
  console.log('PASS: Flower unavailable ends quickly with safe same-origin 502 and no unrelated providers');
}finally{
  globalThis.fetch=realFetch;
}
