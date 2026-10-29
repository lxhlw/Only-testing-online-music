import assert from 'node:assert/strict';
import {PLATFORMS,classifyAttempt,summarizeAttempts} from './flower-correlated-validation.mjs';
const verified={source:'kw',flowerActive:true,qualityDeclared:true,searchFound:true,
  flowerRequested:true,routeMatchesSource:true,urlReturned:true,
  approvedMediaHost:true,rangeHttpStatus:206,signature:'ID3_MP3_CONTAINER',
  audioDurationSeconds:446,started:true,playProgressSeconds:1.7,
  seekConfirmed:true,afterSeekProgressSeconds:1.4};
assert.equal(classifyAttempt(verified),'DECODED_LONG_FORM_AUDIO');
assert.equal(classifyAttempt({...verified,audioDurationSeconds:9}),'SHORT_OR_INVALID_MEDIA');
assert.equal(classifyAttempt({...verified,signature:'NOT_AUDIO'}),'MEDIA_BYTES_NOT_AUDIO');
assert.equal(classifyAttempt({...verified,rangeHttpStatus:null,rangeFailure:'RANGE_NETWORK_FAILURE'}),'RANGE_NETWORK_FAILURE');
assert.equal(classifyAttempt({...verified,urlReturned:false,resolverState:'FLOWER_RESOLVE_ERROR'}),'FLOWER_RESOLVE_ERROR');
assert.equal(classifyAttempt({...verified,flowerRequested:false}),'FLOWER_REQUEST_MISSING_OR_WRONG_ROUTE');
assert.equal(classifyAttempt({...verified,routeMatchesSource:false}),'FLOWER_REQUEST_MISSING_OR_WRONG_ROUTE');
assert.equal(classifyAttempt({...verified,started:false}),'MEDIA_NOT_PLAYING');
assert.equal(classifyAttempt({...verified,seekConfirmed:false}),'MIDTRACK_PLAYBACK_NOT_VERIFIED');
assert.equal(classifyAttempt({...verified,source:'unknown'}),'INVALID_PLATFORM');
assert.equal(classifyAttempt({...verified,source:'kg',trackHashShape:'KG_HASH_32_HEX',
  requestIdMatchesTrackKey:false}),'KG_FLOWER_TRACK_HASH_MISMATCH');
assert.equal(classifyAttempt({...verified,source:'kg',trackHashShape:'KG_HASH_MISSING',
  requestIdMatchesTrackKey:null}),'KG_SEARCH_HASH_MISSING');
assert.equal(classifyAttempt({...verified,source:'kg',trackHashShape:'KG_HASH_32_HEX',
  requestIdMatchesTrackKey:true}),'DECODED_LONG_FORM_AUDIO');
const rows=[verified,{...verified,source:'mg',rangeHttpStatus:403,
  rangeFailure:'HTTP_403'},{...verified,source:'kw',
  urlReturned:false,resolverState:'FLOWER_RESOLVE_ERROR'}];
const result=summarizeAttempts(rows);
assert.deepEqual(result.map(x=>x.source),PLATFORMS);
assert.deepEqual(result.find(x=>x.source==='kw'),{source:'kw',attempts:2,
  resolved:1,mediaVerified:1,outcomes:['DECODED_LONG_FORM_AUDIO','FLOWER_RESOLVE_ERROR']});
assert.deepEqual(result.find(x=>x.source==='mg'),{source:'mg',attempts:1,
  resolved:1,mediaVerified:0,outcomes:['HTTP_403']});
assert.equal(JSON.stringify(result).includes('https://'),false);
console.log('PASS correlated Flower one-request resolver→range→decoder→seek classifier');
