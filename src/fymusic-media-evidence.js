// FyMusic Phase 22 QA-only event-driven evidence; not imported by the player.
// No media URL, song identity, network requests, timers, or mutable audio writes.
// Fixed-size ring + a bounded number of native event listeners; dispose() cleans up.
export function observeAudioEvents(audio,{limit=48,clock=()=>performance.now()}={}){
  if(!audio||typeof audio.addEventListener!=='function'||typeof audio.removeEventListener!=='function')
    throw new TypeError('An existing HTMLAudioElement is required');
  if(!Number.isSafeInteger(limit)||limit<8||limit>128)
    throw new RangeError('Evidence event limit must be 8..128');
  const events=new Array(limit),origin=clock(),handlers=[];
  let size=0,index=0,disposed=false,playing=false,progress=false;
  let firstPlayingMs=null,firstProgressMs=null,startWait=null,waits=0,
    recovered=0,stallEvents=0,rebufferMs=0,errorCount=0,
    lastWaitPosition=null;
  const now=()=>Math.max(0,Math.round(clock()-origin));
  const bufferAhead=()=>{
    try{
      const time=audio.currentTime;
      for(let i=0;i<audio.buffered.length;i++){
        const start=audio.buffered.start(i),end=audio.buffered.end(i);
        if(time>=start&&time<=end)return Math.max(0,Math.round((end-time)*100)/100);
      }
    }catch{}
    return null;
  };
  const onEvent=type=>{
    if(disposed)return;
    const ms=now(),position=Number.isFinite(audio.currentTime)?
      Math.round(audio.currentTime*100)/100:0;
    const event={type,ms,position,ready:audio.readyState,ahead:bufferAhead()};
    events[index]=event;index=(index+1)%limit;size=Math.min(size+1,limit);
    if(type==='playing'){
      if(firstPlayingMs===null)firstPlayingMs=ms;
      playing=true;
      if(startWait!==null){recovered++;rebufferMs+=Math.max(0,ms-startWait);startWait=null}
    }
    if(type==='timeupdate'&&position>.35){
      progress=true;
      if(firstProgressMs===null)firstProgressMs=ms;
    }
    if(type==='waiting'&&playing&&progress&&position>.35&&startWait===null){
      waits++;startWait=ms;lastWaitPosition=position;
    }
    if(type==='stalled'&&playing&&progress&&position>.35)stallEvents++;
    if(type==='error')errorCount++;
  };
  for(const type of ['loadedmetadata','playing','waiting','stalled',
    'timeupdate','canplay','error','ended','pause']){
    const listener=()=>onEvent(type);
    audio.addEventListener(type,listener,{passive:true});
    handlers.push([type,listener]);
  }
  const snapshot=()=>{
    const records=[];
    for(let n=0;n<size;n++){
      const at=(index-size+n+limit)%limit;
      records.push({...events[at]});
    }
    return {eventCount:size,eventLimit:limit,firstPlayingMs,firstProgressMs,
      waits,recovered,stallEvents,rebufferMs,errorCount,lastWaitPosition,
      pendingWait:startWait!==null,disposed,events:records};
  };
  const dispose=()=>{
    if(!disposed){
      disposed=true;
      for(const [type,listener] of handlers)audio.removeEventListener(type,listener);
      handlers.length=0;
    }
    return snapshot();
  };
  return {snapshot,dispose};
}
