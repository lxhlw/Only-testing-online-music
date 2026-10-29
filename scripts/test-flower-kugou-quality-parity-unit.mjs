import assert from 'node:assert/strict';
import {summarizeKugouTrackInput,inspectKugouQualityRequest}
  from './flower-kugou-quality-parity.mjs';
const a='A'.repeat(32),b='B'.repeat(32),c='C'.repeat(32);
const song={hash:a,albumAudioId:'987',_interval:330,_types:{
  '128k':{hash:a,size:'4M'},'320k':{hash:b,size:'10M'},flac:{hash:c,size:'29M'}}};
const shape=summarizeKugouTrackInput(song,['128k','320k','flac']);
assert.equal(shape.baseHashShapeValid,true);
assert.equal(shape.hasPerQualityMap,true);
assert.equal(shape.hasAlbumAudioId,true);
assert.equal(shape.qualities[1].qualityDiffersFromBase,true);
assert.equal(shape.qualities[2].hasQualityHash,true);
const endpoint='http://97.64.37.235/flower/v1/url/kg/'+b+'/320k?tag=SENSITIVE';
assert.deepEqual(inspectKugouQualityRequest(endpoint,song,'320k'),{
  canonical:true,requestedQuality:'320k',routeQualityMatched:true,
  routeIdShapeValid:true,routeMatchesBaseHash:false,
  routeMatchesSelectedQualityHash:true
});
assert.equal(inspectKugouQualityRequest(
  endpoint.replace('97.64.37.235','127.0.0.1'),song,'320k').canonical,false);
assert.equal(inspectKugouQualityRequest(endpoint,song,'128k').routeQualityMatched,false);
assert.equal(JSON.stringify(shape).includes(a),false);
assert.equal(JSON.stringify(inspectKugouQualityRequest(endpoint,song,'320k'))
  .includes('SENSITIVE'),false);
console.log('PASS Kugou quality mappings and safe route comparison');
