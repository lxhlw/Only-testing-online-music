import assert from 'node:assert/strict';
import {FLOWER_PLATFORMS,sameArtistSong,classifyFlowerResolutionFailure,
  classifyFlowerRequestRoute} from './flower-cross-platform-diagnostic.mjs';

assert.deepEqual(FLOWER_PLATFORMS,['wy','tx','kg','kw','mg']);
assert.equal(sameArtistSong([{name:'郭源潮',singer:'其他歌手'}]),null);
assert.equal(sameArtistSong([{name:'郭源潮',singer:'宋冬野'}]).name,'郭源潮');

const malicious={message:'HTTP 502: '+JSON.stringify({
  diagnostic:'FLOWER_UPSTREAM_UNAVAILABLE',
  attempts:[
    {route:'canonical-socket',code:'FLOWER_SOCKET_HTTP_404',url:'https://private.example/secret'},
    {route:'arbitrary-target',code:'HTTP_403',cookie:'SECRET'},
    {route:'ts-short',code:'HTTP_530'}
  ],
  signedUrl:'https://private.example/token'
})};
const failure=classifyFlowerResolutionFailure(malicious);
assert.equal(failure.category,'FLOWER_UPSTREAM_UNAVAILABLE');
assert.deepEqual(failure.attempts,[
  {route:'canonical-socket',code:'FLOWER_SOCKET_HTTP_404'},
  {route:'ts-short',code:'HTTP_530'}
]);
assert.ok(!JSON.stringify(failure).includes('private.example'));
assert.ok(!JSON.stringify(failure).includes('SECRET'));
assert.equal(classifyFlowerResolutionFailure(Error('PROBE_DEADLINE')).category,'PROBE_DEADLINE');
assert.equal(classifyFlowerResolutionFailure(Error('HTTP 404: unsupported')).category,'UPSTREAM_HTTP_404');

assert.deepEqual(classifyFlowerRequestRoute(
  [{url:'http://97.64.37.235/flower/v1/url/tx/hidden-song/128k?token=secret'}],'tx'
),{flowerRequested:true,platformMatched:true});
assert.deepEqual(classifyFlowerRequestRoute(
  [{url:'http://97.64.37.235/flower/v1/url/wy/hidden-song/128k'}],'tx'
),{flowerRequested:true,platformMatched:false});
assert.deepEqual(classifyFlowerRequestRoute(
  [{url:'http://private.example/flower/v1/url/tx/hidden-song/128k'}],'tx'
),{flowerRequested:false,platformMatched:false});
console.log('PASS Flower cross-platform selection, route attribution and secret-free diagnostics');
