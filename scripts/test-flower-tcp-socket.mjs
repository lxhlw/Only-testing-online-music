import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// The mock deliberately closes the response on writable.close(). An HTTP
// client must keep its write half available while awaiting a server response.
// This catches the regression that an all-mocked musicUrl test cannot see.
const raw=readFileSync(new URL('../functions/api/proxy.js',import.meta.url),'utf8');
const source=raw.replace(
  "import { connect } from 'cloudflare:sockets';",
  'const connect = (...args) => globalThis.__testFlowerConnect(...args);'
).replaceAll('export async function ','async function ')+
  '\nexport {fetchFlowerResolverViaSocket};';
const {fetchFlowerResolverViaSocket}=await import(
  'data:text/javascript;base64,'+Buffer.from(source).toString('base64')
);
const origin='https://only-testing-online-music.pages.dev';
const target=new URL('http://97.64.37.235/flower/v1/url/wy/test-song/128k');
const request=new Request(origin+'/api/proxy?url='+encodeURIComponent(target.href),{
  headers:{Origin:origin,'X-LX-Headers':JSON.stringify({
    'User-Agent':'lx-music/desktop',ver:'2.0.0','source-ver':'1',
    tag:'abcdef0123456789abcdef0123456789abcdef0123456789'
  })}
});
let writes=[],earlyCloseCount=0,closeCount=0;
function simulatedHttpSocket(responseText,options={}){
  let controller,closed=false;
  function finish(){if(closed)return;closed=true;controller.close();}
  const readable=new ReadableStream({start(c){controller=c;}});
  const writable=new WritableStream({
    write(chunk){
      const req=new TextDecoder().decode(chunk);writes.push(req);
      assert.match(req,/^GET \/flower\/v1\/url\/wy\/test-song\/128k HTTP\/1\.1\r\n/);
      assert.match(req,/Host: 97\.64\.37\.235/i);
      assert.match(req,/source-ver: 1/i);
      assert.match(req,/ver: 2\.0\.0/i);
      assert.match(req,/tag: abcdef0123456789abcdef0123456789abcdef0123456789/i);
      if(options.noResponse){finish();return;}
      queueMicrotask(()=>{
        if(!closed)controller.enqueue(new TextEncoder().encode(responseText));
        finish();
      });
    },
    close(){earlyCloseCount++;finish();}
  });
  return {
    opened:options.rejectConnect?Promise.reject(new Error('TCP address denied')):Promise.resolve({}),
    readable,writable,async close(){closeCount++;finish();}
  };
}
const body=JSON.stringify({code:0,data:'https://media.example.test/flower-song.mp3'});
const http='HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: '+
  Buffer.byteLength(body)+'\r\nConnection: close\r\n\r\n'+body;
globalThis.__testFlowerConnect=()=>simulatedHttpSocket(http);
let response=await fetchFlowerResolverViaSocket(target,request);
assert.equal(response.status,200);
assert.equal((await response.json()).data,'https://media.example.test/flower-song.mp3');
const firstHeaders=writes[0].split('\r\n');
assert.deepEqual(firstHeaders.filter(x=>/^Accept:/i.test(x)),['Accept: */*'],
  'Only one Needle-compatible default Accept header is allowed');
assert.equal(firstHeaders.filter(x=>/^Accept-Encoding:/i.test(x)).length,0,
  'Needle default compressed=false sends no Accept-Encoding header');
assert.equal(firstHeaders.filter(x=>/^Host:/i.test(x)).length,1);
assert.equal(firstHeaders.filter(x=>/^tag:/i.test(x)).length,1);
assert.equal(earlyCloseCount,0,'Must not prematurely close writable before reading HTTP response');
assert.equal(closeCount,1,'Connection must be fully closed after response');
console.log('PASS: real Flower HTTP/1.1 socket request retains write half until response');

const withSourceAccept=new Request(origin+'/api/proxy?url='+encodeURIComponent(target.href),{
  headers:{Origin:origin,Accept:'text/html',
    'X-LX-Headers':JSON.stringify({
      'User-Agent':'lx-music/desktop',ver:'2.0.0','source-ver':'1',
      tag:'abcdef0123456789abcdef0123456789abcdef0123456789',
      Accept:'application/vnd.flower+json',
      'Accept-Encoding':'gzip'
    })
  }
});
globalThis.__testFlowerConnect=()=>simulatedHttpSocket(http);
response=await fetchFlowerResolverViaSocket(target,withSourceAccept);
assert.equal(response.status,200);
const overrideHeaders=writes[writes.length-1].split('\r\n');
assert.deepEqual(overrideHeaders.filter(x=>/^Accept:/i.test(x)),
  ['Accept: application/vnd.flower+json'],
  'Script Accept must supersede browser Accept without duplicate fields');
assert.deepEqual(overrideHeaders.filter(x=>/^Accept-Encoding:/i.test(x)),
  ['accept-encoding: gzip'],
  'Only an explicit source Accept-Encoding may be forwarded');
console.log('PASS: exact Needle-compatible Accept/encoding headers and source precedence');

const chunks=['{"code":0,"data":"https://media.example.test/song.mp3"}'];
const chunkBody=chunks.map(x=>Buffer.byteLength(x).toString(16)+'\r\n'+x+'\r\n').join('')+'0\r\n\r\n';
globalThis.__testFlowerConnect=()=>simulatedHttpSocket(
  'HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n'+chunkBody
);
response=await fetchFlowerResolverViaSocket(target,request);
assert.equal(response.status,200);
assert.equal((await response.json()).data,'https://media.example.test/song.mp3');
console.log('PASS: HTTP/1.1 chunked Flower response');

globalThis.__testFlowerConnect=()=>simulatedHttpSocket('NOT A VALID HTTP RESPONSE');
response=await fetchFlowerResolverViaSocket(target,request);
assert.equal(response.status,502);
assert.equal((await response.json()).diagnostic,'FLOWER_SOCKET_MISSING_HTTP');
console.log('PASS: invalid HTTP headers are reported separately');

globalThis.__testFlowerConnect=()=>simulatedHttpSocket(
  'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'
);
response=await fetchFlowerResolverViaSocket(target,request);
assert.equal(response.status,502);
assert.equal((await response.json()).diagnostic,'FLOWER_SOCKET_HTTP_403');
console.log('PASS: TCP HTTP 403 is not mislabeled as malformed response');

globalThis.__testFlowerConnect=()=>simulatedHttpSocket('',{rejectConnect:true});
response=await fetchFlowerResolverViaSocket(target,request);
assert.equal(response.status,502);
const failure=await response.json();
assert.equal(failure.diagnostic,'FLOWER_SOCKET_CONNECT');
assert.ok(!JSON.stringify(failure).includes('TCP address denied'),
  'Do not leak raw connector errors into public responses');
console.log('PASS: connect refused classified safely without exposing upstream details');
delete globalThis.__testFlowerConnect;
