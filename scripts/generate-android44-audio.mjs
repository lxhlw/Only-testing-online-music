// Generate actual encoded media for old Android browser compatibility checks.
// Unlike repeating a single MP3 frame, ffmpeg writes a complete, time-valid
// CBR MPEG-1 Layer III stream. Both files are static Cloudflare Pages assets.
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'

const out=join(process.cwd(),'diagnostics')
mkdirSync(out,{recursive:true})
const mp3=join(out,'android44-tone-v3.mp3')
const cmd=[
  '-hide_banner','-loglevel','error','-y',
  '-f','lavfi','-i','sine=frequency=659:sample_rate=44100:duration=4',
  '-af','volume=0.55','-ac','1','-ar','44100',
  '-c:a','libmp3lame','-b:a','96k','-write_xing','1',
  '-id3v2_version','0',mp3
]
let proc=spawnSync('ffmpeg',cmd,{encoding:'utf8'})
if (proc.error && proc.error.code==='ENOENT') {
  // GitHub runner images no longer guarantee system FFmpeg. Use pinned npm
  // binary instead of apt-get (which may hang on unavailable package mirrors).
  const require=createRequire(import.meta.url)
  const bundled=require('@ffmpeg-installer/ffmpeg')
  proc=spawnSync(bundled.path,cmd,{encoding:'utf8'})
}
if(proc.error||proc.status!==0){
  throw new Error('FFmpeg failed to generate real MPEG-1 Layer III tone: '+(proc.error?.message||proc.stderr))
}
if(statSync(mp3).size<20000)throw new Error('Generated MP3 is unexpectedly small')
const wav=join(out,'android44-tone-v3.wav')
const sampleRate=22050,seconds=4,count=sampleRate*seconds
const pcm=Buffer.alloc(44+count*2)
pcm.write('RIFF',0)
pcm.writeUInt32LE(pcm.length-8,4)
pcm.write('WAVE',8)
pcm.write('fmt ',12)
pcm.writeUInt32LE(16,16)
pcm.writeUInt16LE(1,20) // PCM
pcm.writeUInt16LE(1,22) // mono
pcm.writeUInt32LE(sampleRate,24)
pcm.writeUInt32LE(sampleRate*2,28)
pcm.writeUInt16LE(2,32)
pcm.writeUInt16LE(16,34)
pcm.write('data',36)
pcm.writeUInt32LE(count*2,40)
for(let i=0;i<count;i++){
  const time=i/sampleRate
  const envelope=Math.min(1,time/0.06,(seconds-time)/0.09)
  const v=Math.round(32767*0.20*Math.max(0,envelope)*Math.sin(2*Math.PI*659*time))
  pcm.writeInt16LE(v,44+i*2)
}
writeFileSync(wav,pcm)
console.log('Generated valid MP3 and PCM WAV calibration assets: '+statSync(mp3).size+' and '+statSync(wav).size+' bytes')
