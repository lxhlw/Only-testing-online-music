// Only opaque equality flags are returned; song hashes, signing tags, full
// URLs, media URLs, and script code must never leave the diagnostic harness.
const QUALITY=['128k','320k','flac'];
function hex32(value) {
  const text=String(value==null?'':value);
  return /^[a-fA-F0-9]{32}$/.test(text)?text.toUpperCase():'';
}
export function summarizeKugouTrackInput(track,sourceQualitys) {
  const info=track&&typeof track==='object'?track:{};
  const base=hex32(info.hash);
  const types=info._types&&typeof info._types==='object'?info._types:{};
  const declared=Array.isArray(sourceQualitys)?sourceQualitys:[];
  const qualities=QUALITY.map(quality=>{
    const candidate=hex32(types[quality]?.hash ||
      (quality==='128k'?base:''));
    return {quality,sourceDeclared:declared.includes(quality),
      hasQualityHash:!!candidate,qualityDiffersFromBase:!!candidate&&!!base&&candidate!==base,
      hasFileSize:!!types[quality]?.size};
  });
  return {
    baseHashShapeValid:!!base,
    hasAlbumAudioId:!!String(info.albumAudioId||''),
    hasDuration:Number.isFinite(Number(info._interval))&&Number(info._interval)>0,
    hasPerQualityMap:QUALITY.some(q=>!!types[q]?.hash),
    qualities
  };
}
export function inspectKugouQualityRequest(raw,track,quality) {
  let u;try{u=new URL(String(raw||''));}catch{}
  const parts=u?.pathname?.split('/').filter(Boolean)||[];
  const canonical=!!u&&u.protocol==='http:'&&u.hostname==='97.64.37.235'&&
    !u.username&&!u.password&&(!u.port||u.port==='80')&&parts.length===6&&
    parts.slice(0,4).join('/')==='flower/v1/url/kg';
  const base=hex32(track?.hash);
  const selected=hex32(track?._types?.[quality]?.hash ||
    (quality==='128k'?base:''));
  const routeHash=canonical?hex32(parts[4]):'';
  return {
    canonical,
    requestedQuality:quality,
    routeQualityMatched:canonical&&parts[5]===quality,
    routeIdShapeValid:!!routeHash,
    routeMatchesBaseHash:!!routeHash&&!!base&&routeHash===base,
    routeMatchesSelectedQualityHash:!!routeHash&&!!selected&&routeHash===selected
  };
}
