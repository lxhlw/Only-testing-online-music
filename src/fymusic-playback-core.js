// FyMusic Phase 1 - evidence-based media playback observer.
// No URL/token storage, proxying, timers, or playback control.
const safeCode = value=>String(value||'unknown').replace(/[^a-z0-9_-]/gi,'_').slice(0,48);
const safeText = value=>String(value||'').slice(0,100);
export function createPlaybackVerifier({now=()=>performance.now(),maxEvents=24}={}){
 let generation=0,start=now(),checkpoint=null,playingSeen=false,seeking=false;
 const make=()=>({generation,phase:'idle',title:'',artist:'',source:'',quality:'',
   provider:'',transport:'',urlResolved:false,metadataLoaded:false,
   mediaReady:false,playingEvent:false,progressConfirmed:false,completed:false,
   failed:false,failureCode:null,mediaErrorCode:null,mediaSeconds:0,
   durationSeconds:null,events:[]});
 let state=make();
 function note(value){
   state.events.push({event:safeCode(value),elapsedMs:Math.max(0,Math.round(now()-start))});
   if(state.events.length>maxEvents)state.events.shift();
 }
 function snapshot(){return {...state,events:state.events.map(item=>({...item}))};}
 function begin(track={}){
   generation++;start=now();checkpoint=null;playingSeen=false;seeking=false;state=make();
   state.title=safeText(track.name);state.artist=safeText(track.singer);
   state.source=safeCode(track.source);state.phase='track_selected';
   note('track_selected');return snapshot();
 }
 function resolved(detail={}){
   if(state.phase==='idle')begin();
   checkpoint=null;playingSeen=false;seeking=false;
   Object.assign(state,{quality:safeCode(detail.quality),source:safeCode(detail.source||state.source),
     provider:safeCode(detail.provider),transport:safeCode(detail.transport),
     urlResolved:true,metadataLoaded:false,mediaReady:false,playingEvent:false,
     progressConfirmed:false,completed:false,failed:false,failureCode:null,
     mediaErrorCode:null,mediaSeconds:0,durationSeconds:null,phase:'url_resolved'});
   note('url_resolved');return snapshot();
 }
 function resolverError(code='resolver_error'){
   // A failed quality attempt may be followed by another working quality.
   note(code);return snapshot();
 }
 function fail(code='unknown',mediaErrorCode=null){
   state.phase='failed';state.failed=true;state.failureCode=safeCode(code);
   if(Number.isInteger(mediaErrorCode))state.mediaErrorCode=mediaErrorCode;
   checkpoint=null;note('failed_'+state.failureCode);return snapshot();
 }
 function media(event,evidence={}){
   const t=now(),time=Number(evidence.currentTime);
   const current=Number.isFinite(time)?Math.max(0,time):0;
   const duration=Number(evidence.duration),ready=Number(evidence.readyState)||0;
   const paused=evidence.paused===true;
   state.mediaSeconds=Math.round(current*10)/10;
   if(Number.isFinite(duration)&&duration>0)state.durationSeconds=Math.round(duration*10)/10;
   if(ready>=1)state.metadataLoaded=true;
   if(ready>=2)state.mediaReady=true;
   if(!state.urlResolved && event!=='error')return snapshot();
   if(event==='seeking'){
     seeking=true;checkpoint=null;note('seeking');return snapshot();
   }
   if(event==='seeked'){
     seeking=false;checkpoint=null;note('seeked');return snapshot();
   }
   if(event==='loadstart'){
     checkpoint=null;state.phase='loading';note('loadstart');
   }else if(event==='loadedmetadata'){
     state.phase='metadata_loaded';note(event);
   }else if(event==='loadeddata'||event==='canplay'){
     if(!state.progressConfirmed)state.phase='media_ready';note(event);
   }else if(event==='playing'){
     if(!paused && ready>=2)playingSeen=true;
     state.playingEvent=playingSeen;
     if(!state.progressConfirmed)state.phase='playing_unverified';
     checkpoint=null;note(event);
   }else if(event==='timeupdate'){
     // Two plausible positions from a decoded, advancing media clock.
     // Seek jumps and frozen clocks must never be counted as playback.
     if(playingSeen&&!paused&&!seeking&&!evidence.seeking&&ready>=2){
       if(checkpoint){
         const elapsed=Math.max(0,(t-checkpoint.at)/1000);
         const movement=current-checkpoint.time;
         if(elapsed>=0.12&&movement>=0.35&&
           movement<=Math.max(1.25,elapsed*2+0.3)){
           if(!state.progressConfirmed){
             state.progressConfirmed=true;state.phase='playback_confirmed';note('progress_confirmed');
           }
         }
       }
       checkpoint={at:t,time:current};
     }else checkpoint=null;
   }else if(event==='waiting'||event==='stalled'){
     checkpoint=null;state.phase=event==='waiting'?'buffering':'stalled';note(event);
   }else if(event==='pause'){
     checkpoint=null;playingSeen=false;state.phase='paused';note(event);
   }else if(event==='ended'){
     if(state.progressConfirmed){
       state.completed=true;state.phase='completed';note('completed');
     }else return fail('ended_without_progress');
   }else if(event==='error'){
     return fail('media_error',Number(evidence.errorCode)||null);
   }else if(event==='emptied'||event==='abort'){
     checkpoint=null;if(!state.progressConfirmed)state.phase='loading';note(event);
   }
   return snapshot();
 }
 return Object.freeze({begin,resolved,resolverError,fail,media,snapshot});
}
