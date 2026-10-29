import assert from 'node:assert/strict';
import {inspectFlowerRequest,inspectFlowerPayload,flowerRequestHeaders}
  from './flower-protocol-parity.mjs';
const target='http://97.64.37.235/flower/v1/url/wy/12345/128k?tag=private';
assert.equal(inspectFlowerRequest(target,'12345','128k').ok,true);
assert.equal(inspectFlowerRequest(target,'other','128k').reason,'SONG_ID_MISMATCH');
assert.equal(inspectFlowerRequest(target,'12345','320k').reason,'QUALITY_MISMATCH');
assert.equal(inspectFlowerRequest(target.replace('97.64.37.235','127.0.0.1'),'12345','128k').ok,false);
assert.equal(inspectFlowerRequest('http://example.com/flower/v1/url/wy/12345/128k','12345','128k').ok,false);
assert.equal(inspectFlowerRequest('http://97.64.37.235/admin/wy/12345/128k','12345','128k').ok,false);
assert.deepEqual(inspectFlowerPayload(404,'Not Found'),{valid:false,status:404,kind:'NON_JSON'});
assert.equal(inspectFlowerPayload(200,JSON.stringify({code:0,data:'https://example.com/audio.mp3?token=private'})).valid,true);
assert.equal(inspectFlowerPayload(200,JSON.stringify({code:404,data:'invalid'})).kind,'NONZERO_CODE');
assert.deepEqual(flowerRequestHeaders({Authorization:'secret',Cookie:'private',ver:'2.0.0',
  'source-ver':'1','User-Agent':'lx-music/desktop'}),{
    'User-Agent':'lx-music/desktop',ver:'2.0.0','source-ver':'1'
  });
console.log('PASS: canonical Flower route, songmid/quality parity and sanitized response classification');
