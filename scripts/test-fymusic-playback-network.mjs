import test from 'node:test';
import assert from 'node:assert/strict';
import {
 classifyMediaResponse,classifyResolverFailure,compareCatalogIdentity
} from '../src/fymusic-diagnostic-classifier.js';
import {createPlaybackVerifier} from '../src/fymusic-playback-core.js';

test('HTTP 200 and HTTP 206 audio responses are evidence, not playback proof',()=>{
 for(const status of [200,206]){
  const c=classifyMediaResponse({
   status,contentType:'audio/mpeg; charset=utf-8',provenance:'browser_test'
  });
  assert.equal(c.status,status);
  assert.equal(c.kind,'audio');
  assert.equal(c.mime,'audio/mpeg');
  assert.equal(c.result,'media_http_accepted');
 }
 const v=createPlaybackVerifier();
 v.begin({name:'开始懂了',singer:'孙燕姿',source:'wy'});
 v.resolved({source:'wy',quality:'flac24bit'});
 v.httpResponse({status:206,contentType:'audio/mpeg',provenance:'server_observed'});
 assert.equal(v.snapshot().mediaHttp.status,206);
 assert.equal(v.snapshot().progressConfirmed,false);
});
test('HTTP failure, HTML disguise, unavailable headers stay distinct',()=>{
 assert.equal(classifyMediaResponse({status:404,contentType:'text/html'}).result,'http_error');
 assert.equal(classifyMediaResponse({status:502,contentType:'application/json'}).result,'http_error');
 assert.equal(classifyMediaResponse({status:200,contentType:'text/html'}).result,'unexpected_content_type');
 assert.equal(classifyMediaResponse({status:200,contentType:'application/json'}).kind,'non_media');
 assert.equal(classifyMediaResponse({status:0,contentType:''}).result,'unavailable');
 assert.equal(classifyMediaResponse({status:null,contentType:''}).status,null);
});
test('resolver failure categories do not infer media HTTP response',()=>{
 assert.equal(classifyResolverFailure({message:'HTTP 404: not found'}),'resolver_http_404');
 assert.equal(classifyResolverFailure({status:502}),'resolver_upstream_5xx');
 assert.equal(classifyResolverFailure({message:'connection timed out'}),'resolver_timeout');
 assert.equal(classifyResolverFailure({message:'Network request failed'}),'resolver_network');
 const v=createPlaybackVerifier();
 v.begin({source:'kg'});
 v.resolverError({message:'HTTP 404 https://private.invalid/?auth=secret'});
 assert.equal(v.snapshot().resolverFailure,'resolver_http_404');
 assert.equal(v.snapshot().mediaHttp,null);
 assert.ok(!JSON.stringify(v.snapshot()).includes('private.invalid'));
});
test('exact catalog-to-resolver identity rejects artist and version mismatch',()=>{
 const expected={name:'开始懂了',singer:'孙燕姿',source:'wy'};
 assert.deepEqual(compareCatalogIdentity(expected,{
  name:' 开始懂了 ',singer:'孙燕姿',source:'wy'
 }),{status:'matched',reason:'metadata_consistent'});
 assert.equal(compareCatalogIdentity(expected,{
  name:'开始懂了 (Live)',singer:'孙燕姿',source:'wy'
 }).reason,'title_mismatch');
 assert.equal(compareCatalogIdentity(expected,{
  name:'开始懂了',singer:'其他歌手',source:'wy'
 }).reason,'artist_mismatch');
 assert.equal(compareCatalogIdentity(expected,{
  name:'开始懂了',singer:'孙燕姿',source:'tx'
 }).reason,'source_mismatch');
 assert.equal(compareCatalogIdentity(expected,{
  name:'开始懂了',singer:'',source:'wy'
 }).status,'unverified');
});
test('track change resets observed HTTP, metadata identity, and resolver error',()=>{
 const v=createPlaybackVerifier();
 v.begin({source:'wy'});
 v.resolved({source:'wy',quality:'320k'});
 v.httpResponse({status:404,contentType:'text/html',provenance:'browser_test'});
 v.catalogIdentity({name:'开始懂了',singer:'孙燕姿',source:'wy'},{
  name:'开始懂了',singer:'孙燕姿',source:'wy'});
 v.resolverError({message:'HTTP 502'});
 assert.equal(v.snapshot().mediaHttp.status,404);
 assert.equal(v.snapshot().identity.status,'matched');
 v.begin({name:'new',singer:'new',source:'tx'});
 assert.equal(v.snapshot().mediaHttp,null);
 assert.equal(v.snapshot().identity.status,'unverified');
 assert.equal(v.snapshot().resolverFailure,null);
});
test('diagnostic metadata cannot retain raw URLs or arbitrary HTTP content type',()=>{
 const v=createPlaybackVerifier();
 v.begin({source:'wy'});
 v.resolved({source:'wy',quality:'flac'});
 v.httpResponse({status:206,contentType:'audio/mpeg;token=very-secret',
  provenance:'browser_test',url:'https://secret.invalid/key=very-secret'});
 assert.equal(v.snapshot().mediaHttp.mime,'audio/mpeg');
 // A low-trust observer must not overwrite a trusted header.
 v.httpResponse({status:200,contentType:'x-private/auth=SECRET',provenance:'mystery'});
 assert.equal(v.snapshot().mediaHttp.mime,'audio/mpeg');
 assert.equal(v.snapshot().mediaHttp.provenance,'browser_test');
 // A fresh attempt may nevertheless report an unknown, sanitized type.
 v.resolved({source:'wy',quality:'flac'});
 v.httpResponse({status:200,contentType:'x-private/auth=SECRET',provenance:'mystery'});
 assert.equal(v.snapshot().mediaHttp.mime,'other');
 assert.equal(v.snapshot().mediaHttp.provenance,'unknown');
 assert.ok(!JSON.stringify(v.snapshot()).includes('SECRET'));
 assert.ok(!JSON.stringify(v.snapshot()).includes('secret.invalid'));
});
