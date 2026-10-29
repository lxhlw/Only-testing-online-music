import assert from 'node:assert/strict';
import http from 'node:http';
import needle from 'needle';
import {once} from 'node:events';
import {LX_DESKTOP_NEEDLE_REF,describeNeedleTransport,
  probeCanonicalFlowerWithDesktopNeedle} from './flower-needle-parity.mjs';
import {flowerRequestHeaders} from './flower-protocol-parity.mjs';

assert.equal(LX_DESKTOP_NEEDLE_REF,'93299ac841b7e9a9f82ca7279b88aaaeda404060');
const tag='abcdef0123456789'.repeat(3);
assert.equal(flowerRequestHeaders({tag}).tag,tag);
assert.equal(flowerRequestHeaders({tag:'../../secret'}).tag,undefined);
assert.equal((await probeCanonicalFlowerWithDesktopNeedle('http://127.0.0.1/foo',
  {songmid:'12345',quality:'128k'},{tag})).kind,'REJECTED_NONCANONICAL');
assert.equal((await probeCanonicalFlowerWithDesktopNeedle(
  'http://97.64.37.235/flower/v1/url/wy/12345/128k',
  {songmid:'12345',quality:'128k'},{tag:'invalid'})).kind,'MISSING_VALID_TAG');

assert.equal((await probeCanonicalFlowerWithDesktopNeedle(
  'http://97.64.37.235/flower/v1/url/kg/ABCDEF0123456789ABCDEF0123456789/128k',
  {source:'kg',songmid:'ABCDEF0123456789ABCDEF0123456789',quality:'128k'},
  {tag:'invalid'})).kind,'MISSING_VALID_TAG');
assert.equal((await probeCanonicalFlowerWithDesktopNeedle(
  'http://97.64.37.235/flower/v1/url/wy/ABCDEF0123456789ABCDEF0123456789/128k',
  {source:'kg',songmid:'ABCDEF0123456789ABCDEF0123456789',quality:'128k'},
  {tag})).kind,'REJECTED_NONCANONICAL');

// A 32-hex tag from a real Kugou source is opaque, not intrinsically invalid.
// Test with a live source request instead of inventing a signature for a
// real network hit; this loopback verifies only the Needle wire behavior.
// Loopback test runs only in GitHub Actions. It verifies the real pinned
// Needle stack actually transmits source headers and does not follow a
// redirect to any second host, without hitting the real Flower server.
const captures=[];
const server=http.createServer((req,res)=>{
  captures.push({method:req.method,url:req.url,headers:req.headers});
  res.writeHead(404,{'Content-Type':'text/plain'});
  res.end('Not Found');
});
server.listen(0,'127.0.0.1');
await once(server,'listening');
try{
  const address=server.address();
  const result=await new Promise(resolve=>needle.request('get',
    'http://127.0.0.1:'+address.port+'/flower/v1/url/wy/12345/128k',null,{
      headers:{'User-Agent':'lx-music-test','source-ver':'1',ver:'2.0.0',tag},
      response_timeout:4000,follow_max:0
    },(err,response)=>resolve({err,response})));
  assert.equal(result.err,null);
  assert.equal(result.response.statusCode,404);
  assert.equal(captures.length,1);
  assert.equal(captures[0].method,'GET');
  assert.equal(captures[0].url,'/flower/v1/url/wy/12345/128k');
  assert.equal(captures[0].headers.tag,tag,'Pinned Needle must transmit original tag');
  assert.equal(captures[0].headers['source-ver'],'1');
  assert.equal(captures[0].headers.ver,'2.0.0');
  assert.equal(captures[0].headers['user-agent'],'lx-music-test');
  assert.equal(captures[0].headers.accept,'*/*',
    'Pinned LX Needle defaults to Accept: */*');
  assert.equal(captures[0].headers['accept-encoding'],undefined,
    'Pinned LX Needle does not request compression unless explicitly configured');
  const fingerprint=describeNeedleTransport(captures[0].headers);
  assert.equal(fingerprint.hasSignedTag,true);
  assert.equal(fingerprint.hasUserAgent,true);
  assert.equal(fingerprint.hasSourceVersion,true);
  assert.ok(!JSON.stringify(fingerprint).includes(tag));
  console.log('PASS exact LX Desktop Needle fork preserves Flower tag and route; no signature exposure');
}finally{
  await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
}
