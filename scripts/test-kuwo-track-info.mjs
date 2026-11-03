import assert from 'node:assert/strict';
import {onRequestGet} from '../functions/api/kuwo-song-meta.js';
const request=id=>new Request('https://fymusic.example/api/kuwo-song-meta?id='+encodeURIComponent(id));
assert.equal((await onRequestGet({request:request('http://169.254.1.1')})).status,400);
assert.equal((await onRequestGet({request:request('123?url=https://localhost')})).status,400);
const originalFetch=globalThis.fetch;
let called='';
try{
 globalThis.fetch=async (url,init)=>{
  called=String(url);
  assert.equal(init.redirect,'manual');
  return new Response(JSON.stringify({data:{
   songinfo:{musicId:'440613',songName:'稻香',artist:'周杰伦',
    album:'魔杰座',pic:'http://img1.kuwo.cn/star/albumcover/500/test.jpg'},
   lrclist:[{time:'0',lineLyric:'第一行测试'},
    {time:'12.35',lineLyric:'第二行测试'},{time:'17',lineLyric:'第三行测试'}]
  }}),{status:200,headers:{'Content-Type':'text/html;charset=UTF-8'}});
 };
 const res=await onRequestGet({request:request('440613')});
 assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(new URL(called).hostname,'m.kuwo.cn');
 assert.equal(new URL(called).searchParams.get('musicId'),'440613');
 assert.equal(data.source,'kw');
 assert.equal(data.id,'440613');
 assert.equal(data.name,'稻香');
 assert.equal(data.albumName,'魔杰座');
 assert.equal(data.image,'https://img1.kuwo.cn/star/albumcover/500/test.jpg');
 assert.equal(data.lyric.split('\n').length,3);
 assert.match(data.lyric,/\[00:12\.35\]第二行测试/);
 assert.equal(data.available,true);
 globalThis.fetch=async()=>new Response(JSON.stringify({data:{
  songinfo:{musicId:'440613',pic:'https://localhost/secret',album:'黑盒'},
  lrclist:[{time:'5',lineLyric:'安全歌词'}]
 }}));
 const invalidArt=await (await onRequestGet({request:request('440613')})).json();
 assert.equal(invalidArt.image,'');
 globalThis.fetch=async()=>new Response(JSON.stringify({data:{
  songinfo:{musicId:'440613',pic:'http://img1.kwcdn.kuwo.cn/album.jpg'},
  lrclist:[{time:1,lineLyric:'版权安全测试'}]
 }}));
 const cdn=await (await onRequestGet({request:request('440613')})).json();
 assert.equal(cdn.image,'https://img1.kwcdn.kuwo.cn/album.jpg');
 globalThis.fetch=async()=>new Response(JSON.stringify({data:{
  songinfo:{musicId:'1',pic:'https://img1.kuwo.cn/safe.jpg'},
  lrclist:[{time:0,lineLyric:'不能混合'}]
 }}));
 assert.equal((await onRequestGet({request:request('440613')})).status,502);
 globalThis.fetch=async()=>new Response('<!doctype html><title>Cloudflare challenge</title>',{
  status:200,headers:{'Content-Type':'text/html'}
 });
 assert.equal((await onRequestGet({request:request('440613')})).status,502);
 globalThis.fetch=async()=>new Response(JSON.stringify({data:{songinfo:{musicId:'440613'},lrclist:[]}}));
 const empty=await onRequestGet({request:request('440613')});
 assert.equal(empty.status,502,'Empty source response must not appear as fetched lyrics');
 console.log('FYMUSIC_KUWO_ENRICHMENT_UNIT_PASS',JSON.stringify({strictId:true,hostLocked:true,
  validImage:true,threeLines:true,mismatchedIdRejected:true,invalidImageRejected:true}));
}finally{globalThis.fetch=originalFetch}
