// Diagnostics for the ONE approved Flower origin. No URLs, credentials,
// signed query values, or raw upstream responses are ever logged.
const CANONICAL = '97.64.37.235';
const VALID_QUALITY = new Set(['128k','320k','flac','flac24bit']);
export function inspectFlowerRequest(input, songmid, quality) {
  let target;
  try { target = new URL(String(input||'')); } catch {return {ok:false,reason:'INVALID_URL'};}
  if(target.protocol!=='http:'||target.hostname!==CANONICAL||
    (target.port&&target.port!=='80')||target.username||target.password)
    return {ok:false,reason:'NOT_CANONICAL_ORIGIN'};
  const parts=target.pathname.split('/').filter(Boolean);
  const route=parts.slice(0,4).join('/');
  if(route!=='flower/v1/url/wy'||parts.length!==6)
    return {ok:false,reason:'INVALID_ROUTE',shape:{route,segmentCount:parts.length}};
  let id;
  try{id=decodeURIComponent(parts[4]);}catch{return {ok:false,reason:'INVALID_SONG_ID'};}
  const expectedId=String(songmid??'');
  const matched=id===expectedId;
  const qualityMatched=parts[5]===String(quality||'');
  const safeId=/^[A-Za-z0-9_-]{1,80}$/.test(id);
  return {
    ok:matched&&qualityMatched&&safeId&&VALID_QUALITY.has(parts[5])&&target.search.length<=1024,
    reason:!matched?'SONG_ID_MISMATCH':!qualityMatched?'QUALITY_MISMATCH':
      !safeId?'INVALID_SONG_ID':!VALID_QUALITY.has(parts[5])?'INVALID_QUALITY':
      target.search.length>1024?'QUERY_TOO_LONG':'OK',
    shape:{route,segmentCount:parts.length,idMatches:matched,
      qualityMatches:qualityMatched,numericId:/^\d+$/.test(id),
      hasQuery:!!target.search,queryLength:target.search.length}
  };
}
export function inspectFlowerPayload(status,text) {
  let data;
  try { data=JSON.parse(String(text||''));}
  catch {return {valid:false,status,kind:'NON_JSON'};}
  const code=data?.code;
  if(String(code)!=='0')return {valid:false,status,kind:code==null?'MISSING_CODE':'NONZERO_CODE'};
  const value=typeof data?.data==='string'?data.data:'';
  let playable=false;
  try{const u=new URL(value);playable=/^https?:$/.test(u.protocol) && !!u.hostname;}catch{}
  return {valid:status>=200&&status<300&&playable,status,
    kind:playable?'MEDIA_URL':'INVALID_MEDIA_URL'};
}
export function flowerRequestHeaders(input) {
  const result={};
  for(const key of ['User-Agent','ver','source-ver']){
    const value=input && (input[key]??input[key.toLowerCase()]??input[key.toUpperCase()]);
    if(typeof value==='string'&&value.length<=200&&/^[\x20-\x7e]+$/.test(value))
      result[key]=value;
  }
  // Original LX Desktop crypto.md5() returns a 32-char hex string, then
  // buffer.bufToString(md5Text,'hex') encodes those ASCII bytes once more.
  // Its real Flower signature is 64 hex chars, NOT 32.
  // Only replay to the canonical approved origin, never arbitrary aliases.
  const tag=input && (input.tag??input.Tag??input.TAG);
  if(typeof tag==='string' && /^[0-9a-f]{64}$/i.test(tag))
    result.tag=tag;
  return result;
}
