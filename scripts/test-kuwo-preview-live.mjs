import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL?.replace(/\/+$/,'')||'';
const target=new URL(base);
assert.equal(target.protocol,'https:');
const production=target.hostname==='only-testing-online-music.pages.dev';
assert.ok(production?process.env.FYMUSIC_ACCEPT_PRODUCTION==='1':
 /^[a-f0-9]{8}\.only-testing-online-music\.pages\.dev$/.test(target.hostname),
 'Only immutable Preview or explicit production acceptance is permitted');
const invalid=await fetch(base+'/api/kuwo-song-meta?id='+encodeURIComponent('http://127.0.0.1'),{
  signal:AbortSignal.timeout(11000)});
assert.equal(invalid.status,400);
let accepted=null,attempts=0,lastError='';
for(let i=0;i<3;i++){
 attempts++;
 try{
  const response=await fetch(base+'/api/kuwo-song-meta?id=440613',{
   signal:AbortSignal.timeout(14000)});
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new Error('metadata HTTP '+response.status+' reason='+String(body.reason||body.error||'unknown').slice(0,90)+' upstream='+String(body.upstreamStatus||'unknown'));}
  const data=await response.json();
  assert.equal(data.id,'440613');
  assert.equal(data.source,'kw');
  // Some official Kuwo lyric endpoints return only same-ID LRC, without
  // song title, artist or album. Never reject correct lyrics because these
  // optional metadata fields are omitted by the upstream response.
  assert.equal(typeof data.name,'string');
  assert.equal(typeof data.singer,'string');
  assert.equal(typeof data.albumName,'string');
  const lines=String(data.lyric||'').split('\n');
  assert.ok(lines.length>=20,'Kuwo track needs real timed LRC');
  assert.ok(lines.every(s=>/^\[\d{2,3}:\d{2}\.\d{2}\]/.test(s)),'Missing valid LRC timestamps');
  assert.equal(data.available,true);
  let cover={source:'lyric-only',present:false,loaded:false};
  if(data.image){
   const image=new URL(data.image);
   assert.equal(image.protocol,'https:');
   assert.match(image.hostname,/^img[0-9]*\.(?:kwcdn\.)?kuwo\.cn$/);
   cover={source:'Kuwo-metadata',present:true,loaded:false,hostname:image.hostname};
   try{
    const response=await fetch(image.href,{signal:AbortSignal.timeout(9000)});
    const type=response.headers.get('content-type')||'';
    if(response.ok&&/^image\//.test(type)){
     const bytes=new Uint8Array(await response.arrayBuffer());
     cover.loaded=bytes.byteLength>100;
     cover.bytes=bytes.byteLength;
    }
   }catch{cover.error='Cover CDN fetch not reachable from GitHub runner'}
  }
  accepted={source:data.source,lyricRows:lines.length,cover,
   albumPresent:!!data.albumName,artistPresent:!!data.singer,
   titlePresent:!!data.name,preview:target.hostname};
  break;
 }catch(e){
  lastError=String(e.message||e).slice(0,180);
  if(i<2)await new Promise(resolve=>setTimeout(resolve,1200*(i+1)));
 }
}
if(!accepted)throw new Error('Kuwo timed LRC was not available from immutable Preview after '+attempts+' attempts: '+lastError);
console.log('FYMUSIC_KUWO_REAL_PREVIEW_TIMED_LYRICS_PASS',JSON.stringify({attempts,...accepted}));
