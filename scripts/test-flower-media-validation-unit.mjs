import assert from 'node:assert/strict';
import {isApprovedAudioUrl,sniffAudioPrefix,assessRealAudio}
  from './flower-media-validation.mjs';
assert.equal(isApprovedAudioUrl('https://kwcdn.kuwo.cn/a.mp3?private=token'),true);
assert.equal(isApprovedAudioUrl('https://abc.nf.migu.cn/secure?id=1'),true);
for(const value of ['http://127.0.0.1/private','http://localhost:8788/foo',
  'https://kuwo.cn.evil.invalid/foo','http://[::1]/','file:///etc/passwd',
  'https://migu.cn@evil.example/private','http://169.254.169.254/meta',
  'https://bad.example/mp3']){
  assert.equal(isApprovedAudioUrl(value),false, 'Untrusted media destination');
}
assert.equal(sniffAudioPrefix([0x49,0x44,0x33,4]),'ID3_MP3_CONTAINER');
assert.equal(sniffAudioPrefix([0xff,0xfb,0x90,0x00]),'MPEG_AUDIO_FRAME');
assert.equal(sniffAudioPrefix([0x3c,0x68,0x74,0x6d,0x6c]),'NOT_RECOGNIZED_AS_AUDIO');
const good={kind:'FLOWER_URL_RETURNED',approvedMediaHost:true,durationSeconds:446,
  started:true,playProgressSeconds:1.9,seekConfirmed:true,
  afterSeekProgressSeconds:1.1,prefixBytes:[0xff,0xfb,0x90,0x00]};
assert.equal(assessRealAudio(good).verified,true);
assert.equal(assessRealAudio({...good,durationSeconds:9}).reason,'INVALID_OR_SHORT_DURATION');
assert.equal(assessRealAudio({...good,durationSeconds:45}).verified,false);
assert.equal(assessRealAudio({...good,prefixBytes:[60,104,116,109]}).reason,'AUDIO_BYTES_UNVERIFIED');
assert.equal(assessRealAudio({...good,afterSeekProgressSeconds:0}).verified,false);
assert.equal(assessRealAudio({...good,playProgressSeconds:0}).verified,false);
assert.ok(!JSON.stringify(assessRealAudio(good)).includes('token'));
console.log('PASS Flower media URL host restrictions, real audio signatures, 9s fake-audio rejection and playback gate');
