import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
// QA-only original 440 Hz tone; not bundled in production branch.
const OUT=path.resolve('qa-fixtures'),DURATION=30;
const specs=[
 {format:'mp3',file:'phase25-tone.mp3',mime:'audio/mpeg',
  args:['-c:a','libmp3lame','-b:a','128k','-id3v2_version','3']},
 {format:'aac',file:'phase25-tone.m4a',mime:'audio/mp4',
  args:['-c:a','aac','-b:a','96k','-movflags','+faststart']},
 {format:'flac',file:'phase25-tone.flac',mime:'audio/flac',
  args:['-c:a','flac','-compression_level','5']}
];
fs.mkdirSync(OUT,{recursive:true});
const manifest={generator:'original-440hz-ffmpeg',durationSeconds:DURATION,
 sampleRate:44100,channels:1,codecs:{}};
for(const s of specs){
 const file=path.join(OUT,s.file);
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-nostdin','-y',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=44100:duration=30',
  '-af','volume=0.2','-ac','1','-ar','44100',...s.args,
  '-metadata','title=FyMusic Original QA Tone',
  '-metadata','artist=FyMusic Isolated Test',file],
  {timeout:90000,stdio:'pipe'});
 const content=fs.readFileSync(file);
 assert.ok(content.length>10000&&content.length<2_500_000);
 if(s.format==='flac')assert.equal(content.subarray(0,4).toString('ascii'),'fLaC');
 if(s.format==='aac')assert.equal(content.subarray(4,8).toString('ascii'),'ftyp');
 if(s.format==='mp3')assert.equal(content.subarray(0,3).toString('ascii'),'ID3');
 const duration=Number(execFileSync('ffprobe',['-v','error',
  '-show_entries','format=duration','-of',
  'default=noprint_wrappers=1:nokey=1',file],{encoding:'utf8'}).trim());
 assert.ok(Math.abs(duration-DURATION)<.2);
 manifest.codecs[s.format]={file:s.file,mime:s.mime,bytes:content.length,
  durationSeconds:duration,
  sha256:createHash('sha256').update(content).digest('hex')};
}
fs.writeFileSync(path.join(OUT,'phase25-manifest.json'),
 JSON.stringify(manifest,null,2)+'\n');
console.log('FYMUSIC_PHASE25_ORIGINAL_CODEC_FIXTURES '+JSON.stringify(manifest));
