// Security-first, media-agnostic audio acceptance predicates.
// This module NEVER needs a media URL or private header in logs.
// Synthetic tests do not prove live playback.
export const TRACK_EXPECTED_SECONDS=446;
export const ACCEPTED_MEDIA_DOMAINS=Object.freeze([
  'kuwo.cn','kuwo.com','migu.cn','miguvideo.com','cmvideo.cn',
  'migucloud.com','kugou.com','kugou.net','qq.com','qcloud.com',
  'myqcloud.com','qcloudcdn.com','music.126.net','netease.com',
  'ctyun.cn','bcebos.com','tencentmusic.com'
]);
export function isApprovedAudioUrl(value) {
  try{
    const u=new URL(String(value||''));
    if(!['http:','https:'].includes(u.protocol)||u.username||u.password||
       u.port||u.hash||u.href.length>4096)return false;
    const host=u.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||
       /^[0-9.]+$/.test(host)||host.startsWith('['))return false;
    return ACCEPTED_MEDIA_DOMAINS.some(domain=>
      host===domain||host.endsWith('.'+domain));
  }catch{return false;}
}
export function sniffAudioPrefix(data){
  const b=data instanceof Uint8Array?data:Uint8Array.from(Array.isArray(data)?data:[]);
  if(b.length<4)return 'INSUFFICIENT_BYTES';
  const first=String.fromCharCode(...b.slice(0,4));
  if(b[0]===0x49&&b[1]===0x44&&b[2]===0x33)return 'ID3_MP3_CONTAINER'; // metadata alone is NOT audio frames
  if(b[0]===0xff&&(b[1]&0xe0)===0xe0&&(b[1]&0x06)!==0)return 'MPEG_AUDIO_FRAME';
  if(b.length>=12&&first==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WAVE')
    return 'WAVE_CONTAINER';
  if(first==='OggS')return 'OGG_CONTAINER';
  if(first==='fLaC')return 'FLAC_CONTAINER';
  if(b.length>=8&&String.fromCharCode(...b.slice(4,8))==='ftyp')
    return 'MP4_AUDIO_CONTAINER';
  return 'NOT_RECOGNIZED_AS_AUDIO';
}
export function assessRealAudio(row, expectedSeconds=TRACK_EXPECTED_SECONDS){
  if(row?.kind!=='FLOWER_URL_RETURNED')return {verified:false,reason:row?.kind||'NO_URL'};
  if(row.approvedMediaHost!==true)return {verified:false,reason:'MEDIA_HOST_NOT_APPROVED'};
  if(!Number.isFinite(row.durationSeconds)||row.durationSeconds<Math.max(150,expectedSeconds*.55)||
     row.durationSeconds>expectedSeconds*1.5)
    return {verified:false,reason:'INVALID_OR_SHORT_DURATION'};
  if(row.started!==true||row.playProgressSeconds<.7)
    return {verified:false,reason:'NO_DECODABLE_PLAYBACK_PROGRESS'};
  if(row.seekConfirmed!==true||row.afterSeekProgressSeconds<.5)
    return {verified:false,reason:'NO_MIDTRACK_PLAYBACK_EVIDENCE'};
  const signature=sniffAudioPrefix(row.prefixBytes);
  if(!['ID3_MP3_CONTAINER','MPEG_AUDIO_FRAME','WAVE_CONTAINER','OGG_CONTAINER',
        'FLAC_CONTAINER','MP4_AUDIO_CONTAINER'].includes(signature))
    return {verified:false,reason:'AUDIO_BYTES_UNVERIFIED',signature};
  return {verified:true,reason:'DECODED_LONG_FORM_AUDIO',signature};
}
