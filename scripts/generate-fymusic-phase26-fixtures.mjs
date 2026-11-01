import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Isolated Phase 26 original media. No third-party songs or remote assets.
// This runs only in the non-production CI/Cloudflare Preview branch.
const out=path.resolve('qa-fixtures');
fs.mkdirSync(out,{recursive:true});
const run=(exe,args)=>execFileSync(exe,args,{encoding:'utf8',timeout:90000,
  maxBuffer:5*1024*1024});
const cover=path.join(out,'phase26-original-art.png');
run('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
  '-f','lavfi','-i','color=c=blue:s=64x64:d=1','-frames:v','1',
  '-update','1',cover]);
const assets=[
  {id:'mp3-cover',file:'phase26-cover.mp3',mime:'audio/mpeg',
   frequency:440,rate:44100,title:'FyMusic Original Cover Test',
   codec:['-c:a','libmp3lame','-b:a','192k','-id3v2_version','3']},
  {id:'aac-tail',file:'phase26-tail.m4a',mime:'audio/mp4',
   frequency:660,rate:48000,title:'FyMusic Original Tail Test',
   codec:['-c:a','aac','-b:a','192k']},
  {id:'flac24',file:'phase26-hires.flac',mime:'audio/flac',
   frequency:880,rate:96000,title:'FyMusic Original HiRes Test',
   codec:['-c:a','flac','-sample_fmt','s32','-bits_per_raw_sample','24',
     '-compression_level','5']}
];
const manifest={generator:'phase26-original-signal-metadata',
  nominalDurationSeconds:12,assets:{}};
for(const a of assets){
  const filepath=path.join(out,a.file);
  const input=['-hide_banner','-loglevel','error','-nostdin','-y',
    '-f','lavfi','-i','sine=frequency='+a.frequency+
       ':sample_rate='+a.rate+':duration=12'];
  if(a.id==='mp3-cover')input.push('-i',cover,'-map','0:a:0',
     '-map','1:v:0');
  input.push('-af','volume=0.2','-ac','1','-ar',String(a.rate),
    ...a.codec);
  if(a.id==='mp3-cover')input.push('-c:v','png',
    '-disposition:v:0','attached_pic');
  input.push('-metadata','title='+a.title,
    '-metadata','artist=FyMusic Isolated Original','-metadata',
    'album=FyMusic QA Encoding Matrix',filepath);
  run('ffmpeg',input);
  const bytes=fs.readFileSync(filepath);
  assert.ok(bytes.length>15000&&bytes.length<2500000,a.id+' size');
  const probe=JSON.parse(run('ffprobe',['-v','error','-show_entries',
    'format=duration:format_tags=title,artist,album:stream=codec_name,codec_type,sample_rate,channels,bits_per_raw_sample:stream_disposition=attached_pic',
    '-of','json',filepath]));
  const audio=probe.streams.find(s=>s.codec_type==='audio');
  assert.ok(audio,'audio stream required');
  assert.ok(Math.abs(Number(probe.format.duration)-12)<.25);
  assert.equal(probe.format.tags.title,a.title);
  assert.equal(probe.format.tags.artist,'FyMusic Isolated Original');
  assert.equal(Number(audio.sample_rate),a.rate);
  if(a.id==='mp3-cover'){
    assert.equal(bytes.subarray(0,3).toString('ascii'),'ID3');
    assert.ok(probe.streams.some(s=>s.disposition?.attached_pic===1),
      'ID3 must contain a real attached picture');
  }
  if(a.id==='aac-tail'){
    assert.equal(bytes.subarray(4,8).toString('ascii'),'ftyp');
    const mdat=bytes.indexOf(Buffer.from('mdat'));
    const moov=bytes.indexOf(Buffer.from('moov'));
    assert.ok(mdat>=0&&moov>mdat,
      'AAC M4A must truly place moov after media data');
  }
  if(a.id==='flac24'){
    assert.equal(bytes.subarray(0,4).toString('ascii'),'fLaC');
    assert.equal(Number(audio.bits_per_raw_sample),24);
    assert.equal(Number(audio.sample_rate),96000);
    assert.equal(audio.codec_name,'flac');
  }
  manifest.assets[a.id]={
    file:a.file,mime:a.mime,bytes:bytes.length,
    durationSeconds:Number(probe.format.duration),
    title:a.title,artist:probe.format.tags.artist,
    sampleRate:Number(audio.sample_rate),
    bitDepth:a.id==='flac24'?Number(audio.bits_per_raw_sample):null,
    embeddedCover:a.id==='mp3-cover',
    moovAfterMdat:a.id==='aac-tail',
    sha256:createHash('sha256').update(bytes).digest('hex')
  };
}
fs.writeFileSync(path.join(out,'phase26-manifest.json'),
  JSON.stringify(manifest,null,2)+'\n');
console.log('FYMUSIC_PHASE26_ORIGINAL_METADATA_FIXTURES '+JSON.stringify(manifest));
