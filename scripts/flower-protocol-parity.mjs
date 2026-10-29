// Diagnostics for the ONE approved Flower origin. No URLs, credentials,
// signed query values, or raw upstream responses are ever logged.
const CANONICAL = '97.64.37.235';
const VALID_QUALITY = new Set(['128k','320k','flac','flac24bit']);
export function inspectFlowerRequest(input, songmid, quality, source='wy') {
  let target;
  try { target = new URL(String(input||'')); } catch {return {ok:false,reason:'INVALID_URL'};}
  if(target.protocol!=='http:'||target.hostname!==CANONICAL||
    (target.port&&target.port!=='80')||target.username||target.password)
    return {ok:false,reason:'NOT_CANONICAL_ORIGIN'};
  const parts=target.pathname.split('/').filter(Boolean);
  const route=parts.slice(0,4).join('/');
  if(!['wy','tx','kg','kw','mg'].includes(source)||
    route!=='flower/v1/url/'+source||parts.length!==6)
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
  // The production Flower source's real tag was measured as a 48-character
  // hexadecimal string. This shape is authoritative; do not infer its
  // generation algorithm from the runtime's independent MD5 utility.
  // The caller MUST first inspectFlowerRequest() for the canonical IP/path.
  // Never replay the tag to third-party DNS aliases or another provider.
  const tag=input && (input.tag??input.Tag??input.TAG);
  if(typeof tag==='string' && /^[0-9a-f]{48}$/i.test(tag))
    result.tag=tag;
  return result;
}

// Report only non-reversible metadata about the *actual* script-produced
// signature. A tag can be a string, binary value or other LX-runtime object.
// Never stringify the value itself in a report or emit prefixes/suffixes.
export function inspectFlowerTagShape(headers) {
  const raw=headers?.tag??headers?.Tag??headers?.TAG;
  const present=raw!==undefined&&raw!==null;
  const type=present?typeof raw:'missing';
  const text=type==='string'?raw:null;
  return {
    present,
    type,
    isArray:Array.isArray(raw),
    isUint8Array:typeof Uint8Array!=='undefined'&&raw instanceof Uint8Array,
    length:text===null?null:text.length,
    asciiOnly:text===null?null:/^[\x00-\x7f]*$/.test(text),
    printableAscii:text===null?null:/^[\x20-\x7e]*$/.test(text),
    hexOnly:text===null?null:/^[0-9a-f]+$/i.test(text),
    base64Shape:text===null?null:/^[A-Za-z0-9+/]+={0,2}$/.test(text),
    whitespacePresent:text===null?null:/\s/.test(text),
    headerSafe:text===null?false: text.length>=1 &&
      text.length<=512 && /^[\x20-\x7e]+$/.test(text)
  };
}
