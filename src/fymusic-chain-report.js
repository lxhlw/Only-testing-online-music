// FyMusic Phase 1.3 - bounded end-to-end evidence correlation.
// Only catalog identity keys are stored in memory; never media URLs or raw errors.
import {compareCatalogIdentity} from './fymusic-diagnostic-classifier.js';

const SOURCE=new Set(['wy','tx','kg','kw','mg','test','local']);
const QUALITY=new Set(['128k','192k','256k','320k','flac','flac24bit','flac32bit',
 'wav','ape','hires','24bit','master','atmos','atmos_plus']);
const PROVIDER=new Set(['lx-native','netease-native','kugou-native','kugou-mobile-native',
 'qqmusic-native','kuwo-native','migu-native','gdstudio-native','selftest','unknown']);
const clean=(value,set)=>set.has(String(value||'').toLowerCase())
 ?String(value).toLowerCase():'unknown';
const norm=value=>String(value||'').normalize('NFKC').trim().toLowerCase()
 .replace(/[\s\u00a0\u3000_.·-]+/g,'');
const key=track=>[norm(track?.name||track?.title),norm(track?.singer||track?.artist),
 clean(track?.source,SOURCE)].join('|');
const SUMMARY_STATES=new Set(['not_applicable','pending','found','empty','failed','selected','selection_missing']);
export function createPlaybackChain({maxCandidates=160,maxAttempts=10}={}){
 let search=null,selection=null,active=null,serial=0;
 const capped=(n,min,max)=>Math.max(min,Math.min(max,Math.round(Number(n)||0)));
 function searchStart(event={}){
  const id=Number(event.id);
  if(!Number.isSafeInteger(id)||id<0)return false;
  search={id,source:clean(event.source,SOURCE),status:'pending',provider:'unknown',
   resultCount:0,pages:0,keys:new Set(),error:null};
  selection=null;
  return true;
 }
 function searchPage(event={}){
  if(!search||event.id!==search.id||clean(event.source,SOURCE)!==search.source)return false;
  const items=Array.isArray(event.items)?event.items:[];
  for(const item of items){
   if(search.keys.size>=maxCandidates)break;
   search.keys.add(key(item));
  }
  search.resultCount+=capped(items.length,0,maxCandidates);
  search.pages=Math.max(search.pages,capped(event.page,1,50));
  search.provider=clean(event.provider,PROVIDER);
  search.status=search.resultCount?'found':'empty';
  search.error=null;
  return true;
 }
 function searchError(event={}){
  if(!search||event.id!==search.id)return false;
  search.status='failed';
  search.error=['timeout','network','http_error','format_error','unknown'].includes(event.code)
   ?event.code:'unknown';
  return true;
 }
 function selectFromSearch(track={}){
  selection={key:key(track),searchId:search?.id??null};
 }
 function begin(track={}){
  serial++;
  const selectedKey=key(track);
  let link={status:'not_applicable',provider:'unknown',resultCount:null,pages:null,error:null};
  if(selection&&search&&selection.searchId===search.id&&selection.key===selectedKey){
   link={status:search.keys.has(selectedKey)?'selected':'selection_missing',
    provider:search.provider,resultCount:search.resultCount,pages:search.pages,error:search.error};
  }
  selection=null;
  active={serial,source:clean(track.source,SOURCE),search:link,
   resolver:{attemptCount:0,quality:'unknown',phase:'not_started',
    failure:null},attempts:[]};
 }
 function resolverAttempt(event={}){
  if(!active)return;
  const quality=clean(event.quality,QUALITY);
  active.resolver.attemptCount++;
  active.resolver.quality=quality;
  active.resolver.phase='pending';
  active.resolver.failure=null;
  active.attempts.push({index:active.resolver.attemptCount,quality,outcome:'pending'});
  if(active.attempts.length>maxAttempts)active.attempts.shift();
 }
 function resolverError(code='resolver_unknown'){
  if(!active)return;
  const known=['resolver_http_404','resolver_http_4xx','resolver_upstream_5xx',
   'resolver_forbidden','resolver_rate_limited','resolver_timeout',
   'resolver_network','resolver_invalid_response','resolver_unknown'];
  const category=known.includes(code)?code:'resolver_unknown';
  active.resolver.phase='failed';
  active.resolver.failure=category;
  const last=active.attempts.at(-1);
  if(last&&last.outcome==='pending')last.outcome='failed';
 }
 function urlResolved(event={}){
  if(!active)return;
  if(!active.resolver.attemptCount)resolverAttempt({quality:event.quality});
  active.resolver.quality=clean(event.quality,QUALITY);
  active.resolver.phase='url_resolved';
  active.resolver.failure=null;
  const last=active.attempts.at(-1);
  if(last)last.outcome='url_resolved';
 }
 const onlySafeSearch=s=>({
  status:SUMMARY_STATES.has(s.status)?s.status:'not_applicable',
  provider:clean(s.provider,PROVIDER),
  resultCount:s.resultCount,pages:s.pages,error:s.error
 });
 function report(media={}){
  const isPlaying=Boolean(media.progressConfirmed);
  const failed=Boolean(media.failed);
  const http=media.mediaHttp||null;
  const matching=media.identity?.status||'unverified';
  const res=active?.resolver||{attemptCount:0,quality:'unknown',phase:'not_started',failure:null};
  const selectionLink=active?onlySafeSearch(active.search):search?{
   status:search.status,provider:search.provider,
   resultCount:search.resultCount,pages:search.pages,error:search.error
  }:{status:'not_applicable',provider:'unknown',resultCount:null,pages:null,error:null};
  const stages={
   search:selectionLink.status,
   selection:active?(selectionLink.status==='selection_missing'?'mismatch':'selected'):'not_selected',
   catalog:matching,
   resolver:res.phase,
   mediaHttp:http?.result||'unknown',
   decode:media.mediaReady?'ready':media.failed?'failed':'unknown',
   progress:isPlaying?(failed?'interrupted':'confirmed'):failed?'failed':'unverified'
  };
  let outcome='pending',blockedAt=null;
  if(!active){
   outcome=selectionLink.status==='failed'?'search_failed':
    selectionLink.status==='empty'?'search_empty':'not_started';
   if(outcome==='search_failed'||outcome==='search_empty')blockedAt='search';
  }else if(matching==='mismatch'||selectionLink.status==='selection_missing'){
   outcome='catalog_mismatch';blockedAt='catalog';
  }else if(isPlaying&&failed){outcome='playback_interrupted';blockedAt='media';}
  else if(isPlaying){outcome='playback_progress_confirmed';}
  else if(http?.result==='http_error'||http?.result==='unexpected_content_type'){
   outcome='media_http_failed';blockedAt='mediaHttp';
  }else if(failed){outcome='media_failed';blockedAt='media';}
  else if(res.phase==='failed'&&!media.urlResolved){
   outcome='resolver_failed';blockedAt='resolver';
  }
  return {
   schema:'fymusic.playback-diagnostic.v1',
   serial:active?.serial??null,source:active?.source||search?.source||'unknown',
   stages,search:selectionLink,
   resolver:{...res,attempts:active?active.attempts.map(a=>({...a})):[]},
   media:{urlResolved:Boolean(media.urlResolved),metadataLoaded:Boolean(media.metadataLoaded),
    mediaReady:Boolean(media.mediaReady),progressConfirmed:isPlaying,failed,
    failureCode:media.failureCode||null,mediaErrorCode:media.mediaErrorCode||null,
    quality:media.quality||'unknown',http:media.mediaHttp||null,
    mediaSeconds:Number(media.mediaSeconds)||0},
   outcome,blockedAt,
   disclaimer:'Playback clock progress is not proof of song identity, audibility, ownership or full-track completion'
  };
 }
 return Object.freeze({searchStart,searchPage,searchError,selectFromSearch,
  begin,resolverAttempt,resolverError,urlResolved,report});
}
