import assert from 'node:assert/strict';
const base=process.env.TEST_BASE_URL?.replace(/\/+$/,'')||'';
const target=new URL(base);
assert.equal(target.protocol,'https:');
assert.ok(/^[a-f0-9]{8}\.only-testing-online-music\.pages\.dev$/.test(target.hostname));
assert.notEqual(target.hostname,'only-testing-online-music.pages.dev');
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
  assert.ok(data.name.includes('稻香'));
  assert.ok(typeof data.singer==='string'&&data.singer.length>0,
   'Kuwo metadata must include an artist for this song ID');
  assert.ok(data.albumName.length>0);
  const lines=String(data.lyric||'').split('\n');
  assert.ok(lines.length>=20,'Kuwo track needs real timed LRC');
  assert.ok(lines.every(s=>/^\[\d{2,3}:\d{2}\.\d{2}\]/.test(s)),'Missing valid LRC timestamps');
  assert.equal(data.available,true);
  const image=new URL(data.image);
  assert.equal(image.protocol,'https:');
  assert.match(image.hostname,/^img[0-9]*\.(?:kwcdn\.)?kuwo\.cn$/);
  const request=await fetch(image.href,{signal:AbortSignal.timeout(12000)});
  if(!request.ok)throw new Error('Kuwo cover status '+request.status);
  const type=request.headers.get('content-type')||'';
  assert.ok(/^image\//.test(type),'Kuwo cover is not an image: '+type);
  const bytes=new Uint8Array(await request.arrayBuffer());
  assert.ok(bytes.byteLength>100,'Kuwo album cover is empty');
  accepted={source:data.source,lyricRows:lines.length,
   coverImageHost:image.hostname,coverBytes:bytes.byteLength,coverMime:type,
   albumPresent:!!data.albumName,artistPresent:!!data.singer,
   preview:target.hostname};
  break;
 }catch(e){
  lastError=String(e.message||e).slice(0,180);
  if(i<2)await new Promise(resolve=>setTimeout(resolve,1200*(i+1)));
 }
}
if(!accepted)throw new Error('Kuwo real preview metadata, cover and lyrics were not all available after '+attempts+' attempts: '+lastError);
console.log('FYMUSIC_KUWO_REAL_PREVIEW_COVER_LYRIC_PASS',JSON.stringify({attempts,...accepted}));
