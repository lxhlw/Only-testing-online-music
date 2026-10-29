// A single row represents ONE Flower request and the audio inspected from
// THAT response. Never aggregate separate resolver and media attempts.
export const PLATFORMS=Object.freeze(['wy','tx','kg','kw','mg']);
export const AUDIO_SIGNATURES=Object.freeze([
  'ID3_MP3_CONTAINER','MPEG_AUDIO_FRAME','WAVE_CONTAINER',
  'OGG_CONTAINER','FLAC_CONTAINER','MP4_AUDIO_CONTAINER'
]);
export function classifyAttempt(row) {
  if(!row||!PLATFORMS.includes(row.source))return 'INVALID_PLATFORM';
  if(!row.flowerActive)return 'WRONG_ACTIVE_RESOLVER';
  if(!row.qualityDeclared)return 'QUALITY_UNDECLARED';
  if(!row.searchFound)return row.searchState||'TRACK_NOT_FOUND';
  if(!row.flowerRequested||!row.routeMatchesSource)return 'FLOWER_REQUEST_MISSING_OR_WRONG_ROUTE';
  if(!row.urlReturned)return row.resolverState||'NO_MEDIA_URL';
  if(!row.approvedMediaHost)return 'UNTRUSTED_MEDIA_HOST';
  if(row.rangeHttpStatus!==200&&row.rangeHttpStatus!==206)
    return row.rangeFailure||'MEDIA_HTTP_UNAVAILABLE';
  if(!AUDIO_SIGNATURES.includes(row.signature))return 'MEDIA_BYTES_NOT_AUDIO';
  if(!Number.isFinite(row.audioDurationSeconds)||
     row.audioDurationSeconds<250||row.audioDurationSeconds>670)
    return 'SHORT_OR_INVALID_MEDIA';
  if(!row.started||row.playProgressSeconds<.7)return 'MEDIA_NOT_PLAYING';
  if(!row.seekConfirmed||row.afterSeekProgressSeconds<.5)
    return 'MIDTRACK_PLAYBACK_NOT_VERIFIED';
  return 'DECODED_LONG_FORM_AUDIO';
}
export function summarizeAttempts(rows) {
  return PLATFORMS.map(source=>{
    const attempts=rows.filter(x=>x.source===source);
    return {source,attempts:attempts.length,
      resolved:attempts.filter(x=>x.urlReturned).length,
      mediaVerified:attempts.filter(x=>classifyAttempt(x)==='DECODED_LONG_FORM_AUDIO').length,
      outcomes:attempts.map(classifyAttempt)};
  });
}
