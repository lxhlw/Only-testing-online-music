import assert from 'node:assert/strict';
import {onRequestGet as getComments} from '../functions/api/netease-comments.js';
import {onRequestGet as getMeta} from '../functions/api/netease-song-meta.js';
const request=(path)=>new Request('https://music.example.test'+path);
assert.equal((await getComments({request:request('/api/netease-comments?id=1&source=tx')})).status,400);
assert.equal((await getComments({request:request('/api/netease-comments?id=http://169.254.0.1')})).status,400);
assert.equal((await getMeta({request:request('/api/netease-song-meta?id=../foo')})).status,400);
const initialFetch=globalThis.fetch;
try{
  let last='';
  globalThis.fetch=async url=>{
    last=String(url);
    return new Response(JSON.stringify({code:200,total:120,hotComments:[{
      commentId:123,content:'真实平台评论',user:{nickname:'真实听友'},likedCount:40,time:1700000000000
    }]}));
  };
  const comments=await getComments({request:request('/api/netease-comments?id=123456&source=wy')});
  assert.equal(comments.status,200);
  const payload=await comments.json();
  assert.equal(payload.comments[0].content,'真实平台评论');
  assert.equal(payload.comments[0].user,'真实听友');
  assert.equal(payload.total,120);
  assert.equal(new URL(last).hostname,'music.163.com');
  assert.ok(last.includes('/R_SO_4_123456'));
  globalThis.fetch=async url=>{
    last=String(url);
    return new Response(JSON.stringify({songs:[{
      id:123456,name:'歌曲',al:{name:'真实专辑',picUrl:'https://p1.music.126.net/abc.jpg'},
      ar:[{name:'歌手'}]
    }]}));
  };
  const meta=await getMeta({request:request('/api/netease-song-meta?id=123456')});
  assert.equal(meta.status,200);
  const details=await meta.json();
  assert.equal(details.image,'https://p1.music.126.net/abc.jpg');
  assert.equal(details.albumName,'真实专辑');
  assert.equal(new URL(last).hostname,'music.163.com');
  globalThis.fetch=async()=>new Response(JSON.stringify({songs:[{
    id:123456,al:{name:'专辑',picUrl:'http://localhost/private'},ar:[]
  }]}));
  const badArt=await getMeta({request:request('/api/netease-song-meta?id=123456')});
  assert.equal((await badArt.json()).image,'','Unsafe cover URL must not be exposed');
  globalThis.fetch=async()=>new Response('Not JSON');
  assert.equal((await getComments({request:request('/api/netease-comments?id=123456')})).status,502);
}finally{globalThis.fetch=initialFetch}
console.log('PASS: fixed-host NetEase metadata and real platform comments; no spoofed images or cross-platform IDs');
