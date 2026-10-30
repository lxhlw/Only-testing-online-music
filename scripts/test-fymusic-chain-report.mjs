import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlaybackChain} from '../src/fymusic-chain-report.js';
import {createPlaybackVerifier} from '../src/fymusic-playback-core.js';

const track={name:'开始懂了',singer:'孙燕姿',source:'wy'};
const chosen={name:'开始懂了',singer:'孙燕姿',source:'wy'};
function matched(){
 const chain=createPlaybackChain();
 chain.searchStart({id:7,source:'wy'});
 chain.searchPage({id:7,source:'wy',page:1,provider:'netease-native',items:[
  {name:'别的歌',singer:'别的歌手',source:'wy'},chosen
 ]});
 chain.selectFromSearch(chosen);
 chain.begin(chosen);
 return chain;
}
test('search -> selection -> catalog -> resolver -> HTTP -> media clock, one report',()=>{
 const chain=matched(),v=createPlaybackVerifier();
 v.begin(track);
 v.catalogIdentity(track,chosen);
 chain.resolverAttempt({quality:'flac24bit'});
 chain.urlResolved({quality:'flac24bit'});
 v.resolved({source:'wy',quality:'flac24bit',provider:'lx-source'});
 v.httpResponse({status:206,contentType:'audio/flac',provenance:'browser_test'});
 const first=chain.report(v.snapshot());
 assert.equal(first.search.status,'selected');
 assert.equal(first.stages.catalog,'matched');
 assert.equal(first.resolver.attemptCount,1);
 assert.equal(first.media.http.status,206);
 assert.equal(first.media.progressConfirmed,false);
 assert.equal(first.outcome,'pending');
 // Actual media progression is tested separately in Chromium.
 assert.equal(first.media.quality,'flac24bit');
});
test('no results and search failure have distinct blocked stages',()=>{
 const chain=createPlaybackChain();
 chain.searchStart({id:3,source:'kg'});
 chain.searchPage({id:3,source:'kg',page:1,items:[],provider:'kugou-native'});
 let report=chain.report();
 assert.equal(report.outcome,'search_empty');
 assert.equal(report.blockedAt,'search');
 chain.searchStart({id:4,source:'tx'});
 chain.searchError({id:4,code:'network'});
 report=chain.report();
 assert.equal(report.outcome,'search_failed');
 assert.equal(report.search.error,'network');
 assert.equal(report.blockedAt,'search');
});
test('stale search callbacks cannot overwrite newer search or selected playback',()=>{
 const chain=createPlaybackChain();
 chain.searchStart({id:11,source:'wy'});
 chain.searchStart({id:12,source:'tx'});
 assert.equal(chain.searchPage({id:11,source:'wy',page:1,items:[track]}),false);
 assert.equal(chain.searchError({id:11,code:'timeout'}),false);
 chain.searchPage({id:12,source:'tx',page:1,items:[{
  name:'开始懂了',singer:'孙燕姿',source:'tx'
 }]});
 chain.selectFromSearch({name:'开始懂了',singer:'孙燕姿',source:'tx'});
 chain.begin({name:'开始懂了',singer:'孙燕姿',source:'tx'});
 chain.searchStart({id:13,source:'wy'});
 assert.equal(chain.report().search.status,'selected');
 assert.equal(chain.report().source,'tx');
});
test('explicit queue selection does not claim provenance from old search',()=>{
 const chain=matched();
 chain.begin(chosen);
 const report=chain.report();
 assert.equal(report.search.status,'not_applicable');
 assert.equal(report.stages.selection,'selected');
});
test('only selected row can be associated; wrong singer and source are rejected',()=>{
 const chain=createPlaybackChain();
 chain.searchStart({id:1,source:'wy'});
 chain.searchPage({id:1,source:'wy',page:1,provider:'netease-native',items:[chosen]});
 chain.selectFromSearch({name:'开始懂了',singer:'错误歌手',source:'wy'});
 chain.begin({name:'开始懂了',singer:'错误歌手',source:'wy'});
 const report=chain.report();
 assert.equal(report.search.status,'selection_missing');
 assert.equal(report.outcome,'catalog_mismatch');
 assert.equal(report.blockedAt,'catalog');
});
test('a failed high quality and successful next quality cannot leak false confirmation',()=>{
 const chain=matched(),v=createPlaybackVerifier();
 v.begin(track);
 v.catalogIdentity(track,chosen);
 chain.resolverAttempt({quality:'flac24bit'});
 chain.resolverError('resolver_timeout');
 v.resolverError({code:'timeout'});
 assert.equal(chain.report(v.snapshot()).outcome,'resolver_failed');
 chain.resolverAttempt({quality:'flac'});
 chain.urlResolved({quality:'flac'});
 v.resolved({source:'wy',quality:'flac'});
 const r=chain.report(v.snapshot());
 assert.equal(r.outcome,'pending');
 assert.equal(r.resolver.attemptCount,2);
 assert.deepEqual(r.resolver.attempts.map(a=>a.outcome),['failed','url_resolved']);
 assert.equal(r.media.progressConfirmed,false);
 assert.equal(r.media.quality,'flac');
});
test('media HTTP errors are not rewritten as successful decoded progress',()=>{
 const chain=matched(),v=createPlaybackVerifier();
 v.begin(track);v.catalogIdentity(track,chosen);
 chain.resolverAttempt({quality:'320k'});chain.urlResolved({quality:'320k'});
 v.resolved({source:'wy',quality:'320k'});
 v.httpResponse({status:404,contentType:'text/html',provenance:'browser_test'});
 const r=chain.report(v.snapshot());
 assert.equal(r.outcome,'media_http_failed');
 assert.equal(r.blockedAt,'mediaHttp');
 assert.equal(r.media.progressConfirmed,false);
});
test('report excludes URLs, API credentials and raw resolver errors',()=>{
 const chain=matched(),v=createPlaybackVerifier();
 v.begin(track);v.catalogIdentity(track,chosen);
 chain.resolverAttempt({quality:'url=https://secret.invalid/sig=ABC'});
 chain.resolverError('HTTP 404 https://private.invalid?key=SECRET');
 v.resolverError({message:'HTTP 404 https://private.invalid/?key=SECRET'});
 const report=chain.report(v.snapshot());
 assert.equal(report.resolver.quality,'unknown');
 assert.equal(report.outcome,'resolver_failed');
 assert.ok(!JSON.stringify(report).includes('https://'));
 assert.ok(!JSON.stringify(report).includes('SECRET'));
 assert.ok(JSON.stringify(report).length<7000);
});
