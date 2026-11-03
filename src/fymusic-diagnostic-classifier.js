// FyMusic Phase 1.2: bounded diagnostics only; no network requests or URLs.
const MEDIA_TYPES = new Set([
 'audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/flac',
 'audio/x-flac','audio/wav','audio/x-wav','audio/ogg','audio/webm',
 'application/ogg','video/mp4','application/octet-stream',
 'text/html','application/xhtml+xml','application/json','text/plain'
]);
export function classifyMediaResponse({status,contentType,provenance}={}){
 const n=Number(status);
 const httpStatus=Number.isInteger(n)&&n>=100&&n<=599?n:null;
 const raw=String(contentType||'').split(';')[0].trim().toLowerCase();
 const mime=MEDIA_TYPES.has(raw)?raw:raw?'other':'unknown';
 const kind=mime.startsWith('audio/')||mime==='application/ogg'
  ?'audio':mime.startsWith('video/')?'video':mime==='application/octet-stream'
   ?'opaque_binary':mime==='unknown'?'unknown':'non_media';
 const exposed=['resource_timing','browser_test','server_observed'].includes(provenance)
  ?provenance:'unknown';
 let result='unavailable';
 if(httpStatus!==null){
  if(httpStatus<200||httpStatus>=300)result='http_error';
  else if(kind==='non_media')result='unexpected_content_type';
  else if(kind==='audio'||kind==='video')result='media_http_accepted';
  else result='status_only';
 }else if(kind==='non_media')result='unexpected_content_type';
 return Object.freeze({status:httpStatus,mime,kind,result,provenance:exposed});
}
export function classifyResolverFailure(error){
 // Read a response status only when the source actually reported it.
 // Do not infer media HTTP status from a resolver error string.
 const status=Number(error&&typeof error==='object'?error.status:NaN);
 const message=String(typeof error==='string'?error:
  (error?.message||error?.code||'')).slice(0,2048);
 const m=message.match(/(?:^|\b)HTTP[\s:_-]*(4\d\d|5\d\d)\b/i);
 const n=Number.isInteger(status)&&status>=400&&status<=599
  ?status:(m?Number(m[1]):null);
 if(n!==null)return n===401||n===403?'resolver_forbidden':
   n===404?'resolver_http_404':n===429?'resolver_rate_limited':
   n>=500?'resolver_upstream_5xx':'resolver_http_4xx';
 if(/timeout|timed out|超时/i.test(message))return 'resolver_timeout';
 if(/network|socket|connect|econn|dns|failed to fetch|网络/i.test(message))
  return 'resolver_network';
 if(/invalid|undefined|unexpected|json|format|无效|缺少/i.test(message))
  return 'resolver_invalid_response';
 return 'resolver_unknown';
}
const fold=value=>String(value||'').normalize('NFKC').toLowerCase()
 .replace(/[\s\u00a0\u3000_.·-]+/g,'').trim();
export function compareCatalogIdentity(expected={},candidate={}){
 const fields=[
  ['title',expected.name||expected.title,candidate.name||candidate.title],
  ['artist',expected.singer||expected.artist,candidate.singer||candidate.artist],
  ['source',expected.source,candidate.source]
 ];
 let unknown=false;
 for(const [field,a,b] of fields){
  if(!String(a||'').trim()||!String(b||'').trim()){
   unknown=true;continue;
  }
  if(fold(a)!==fold(b))return Object.freeze({
   status:'mismatch',reason:field+'_mismatch'
  });
 }
 return Object.freeze({
  status:unknown?'unverified':'matched',
  reason:unknown?'metadata_missing':'metadata_consistent'
 });
}
