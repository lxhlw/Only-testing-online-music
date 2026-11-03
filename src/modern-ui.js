// Modern, framework-free interaction layer.
// Progressive enhancement only: all music, library and playlist logic remains
// in the existing app modules. No intervals or heavy visual libraries.
const root=document.documentElement;
const $=id=>document.getElementById(id);
const status=$('status'), audio=$('audio');
const input=$('global-search-input');
const searchBtn=$('global-search-btn');
const nav=document.querySelector('.main-nav');
const syncActiveView=()=>{
  const active=nav?.querySelector('.nav-item.active');
  root.dataset.activeView=active?.dataset.view||'search';
};
syncActiveView();
if(nav)new MutationObserver(()=>schedule(syncActiveView))
  .observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
const moveToSearch=()=>{
  if(root.dataset.activeView!=='search'){
    nav?.querySelector('[data-view="search"]')?.click();
    syncActiveView();
  }
  input?.focus();
};
const title=$('player-title');
const source=$('top-source-label');
const results=$('search-results');
const lyric=$('player-lyric');

// Coalesce repeated work by identity, but never discard *different* updates
// arriving in the same frame (status, source, lyric, navigation, media art).
// The previous one-slot frame guard silently lost all but the first task.
const pendingUpdates=new Set();
let animationFrame=0;
const flushUpdates=()=>{
  animationFrame=0;
  if(document.hidden)return;
  const batch=[...pendingUpdates];
  pendingUpdates.clear();
  let firstError=null;
  for(const work of batch){
    try{work()}catch(error){if(!firstError)firstError=error;}
  }
  // A work callback may schedule more work; keep it for the following frame
  // instead of re-entering DOM changes in this same paint.
  if(pendingUpdates.size)animationFrame=requestAnimationFrame(flushUpdates);
  if(firstError)throw firstError;
};
const schedule=work=>{
  pendingUpdates.add(work);
  if(!document.hidden&&!animationFrame)
    animationFrame=requestAnimationFrame(flushUpdates);
};
// A BFCache pagehide can suspend a previously scheduled animation frame.
 // Keep its pending work, but make the next foreground frame schedulable.
window.addEventListener('pagehide',()=>{
  if(animationFrame)cancelAnimationFrame(animationFrame);
  animationFrame=0;
});
const syncStatus=()=>{
  if(!status)return;
  const value=(status.textContent||'').toLowerCase();
  const fetching=/正在|连接|请求|解析|等待|下载|准备/.test(value)&&
    !/已开始播放|搜索完成|已经播放/.test(value);
  root.classList.toggle('is-resolving',fetching);
  root.classList.toggle('has-error',status.classList.contains('fail'));
  const footer=$('bottom-play-status');
  if(footer)footer.textContent=(status.textContent||'就绪').slice(0,44);
};
const updateNowPlaying=()=>{
  if(!audio)return;
  root.classList.toggle('is-playing',!audio.paused&&!audio.ended&&audio.readyState>1);
};
// Network events only update presentation. The source verifier, media error
// fallback and user playback intent remain owned by app.js/player-controls.js.
// In particular an offline->online or BFCache restore NEVER calls play/load,
// changes audio.currentTime, repeats signed URLs or selects another provider.
const networkHint=$('player-network-hint');
let networkBuffering=false,bufferingSource='';
const renderNetworkPresence=()=>{
  if(!audio)return;
  const source=audio.currentSrc||'';
  if(bufferingSource!==source){
    bufferingSource=source;
    networkBuffering=false;
  }
  const active=Boolean(source&&!audio.paused&&!audio.ended&&!audio.error);
  const offline=active&&navigator.onLine===false;
  const buffering=active&&!offline&&networkBuffering;
  root.classList.toggle('is-offline',offline);
  root.classList.toggle('is-buffering',buffering);
  if(!networkHint)return;
  const message=offline?'浏览器报告离线 · 等待网络恢复':
    buffering?'音频缓冲中 · 保持当前播放位置':'';
  if(networkHint.textContent!==message)networkHint.textContent=message;
  networkHint.hidden=!message;
};
const observeNetworkEvent=event=>{
  const type=event.type;
  if(type==='waiting'||type==='stalled'){
    // Ignore loadstart/metadata waits and paused seeks; do not claim an
    // upstream outage based on a single low-level media event.
    if(audio.currentSrc&&!audio.paused&&!audio.ended&&!audio.error){
      bufferingSource=audio.currentSrc;networkBuffering=true;
    }
  }else if(type==='playing'||type==='canplay'||type==='canplaythrough'||
           type==='seeked'||type==='pause'||type==='ended'||
           type==='error'||type==='emptied'||type==='abort'){
    networkBuffering=false;
  }else if(type==='timeupdate'&&Number(audio.readyState)>=3){
    networkBuffering=false;
  }
  schedule(renderNetworkPresence);
};
const syncLyric=()=>{
  if(!lyric)return;
  const active=document.querySelector('.lyrics-line.active');
  const text=active?.textContent?.trim();
  const next=text?'歌词：'+text:'歌词：—';
  if(lyric.textContent!==next)lyric.textContent=next;
};
if(status)new MutationObserver(()=>schedule(syncStatus))
  .observe(status,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
const syncSource=()=>{
  const active=window.LXSourceManager?.getActive?.();
  const name=active?.name||'正在准备';
  const label='当前音源：'+name;
  if(source.textContent!==label)source.textContent=label;
};
if(source)new MutationObserver(()=>schedule(syncSource))
  .observe(source,{childList:true,characterData:true});
const lyrics=$('lyrics-lines');
if(lyrics)new MutationObserver(()=>schedule(syncLyric))
  .observe(lyrics,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
// Visibility and BFCache restore can happen without a new audio event or
// MutationObserver callback. Reconcile presentation from the existing audio
// element and user state only: do NOT start playback, re-resolve a source, seek,
// or issue a network request. Work remains batched into one paint.
const syncMiniTransport=()=>window.LXPlayerControls?.refresh?.();
const reconcileForeground=()=>{
  if(document.hidden)return;
  for(const work of [syncActiveView,syncStatus,syncSource,syncLyric,
                     updateNowPlaying,syncMiniTransport,renderNetworkPresence])schedule(work);
};
document.addEventListener('visibilitychange',reconcileForeground);
window.addEventListener('pageshow',reconcileForeground);
if(audio){
  for(const event of ['playing','pause','ended','waiting','canplay','error','emptied']){
    audio.addEventListener(event,()=>schedule(updateNowPlaying),{passive:true});
  }
  for(const event of ['waiting','stalled','playing','canplay',
                       'canplaythrough','seeked','pause','ended','error',
                       'emptied','abort','timeupdate']){
    audio.addEventListener(event,observeNetworkEvent,{passive:true});
  }
}
window.addEventListener('offline',()=>schedule(renderNetworkPresence));
window.addEventListener('online',()=>schedule(renderNetworkPresence));
if(input&&searchBtn){
  input.addEventListener('keydown',ev=>{
    // The existing app navigation already handles Enter once. Do not
    // duplicate its request and waste two API calls per search.
    if(ev.key==='Escape'){input.blur()}
  });
}
document.addEventListener('keydown',ev=>{
  const editing=ev.target instanceof HTMLElement &&
    (ev.target.matches('input,textarea,select')||ev.target.isContentEditable);
  if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='k'){
    ev.preventDefault();moveToSearch();input?.select();return;
  }
  if(!editing&&ev.key==='/'){
    ev.preventDefault();moveToSearch();return;
  }
  if(!editing&&ev.code==='Space'&&!ev.repeat){
    const current=window.OnlyTestingMusicApp;
    if(current&&audio&&audio.currentSrc){
      ev.preventDefault();$('player-toggle-btn')?.click();
    }
  }
});
// Animate only the newly appended rows, not a scan of the first rows in
// an ever-growing list. Each mutation burst is capped at twelve entries.
const reduceMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const animateAdded=(container,entries)=>{
  if(!container)return;
  let count=0;
  for(const el of entries){
    if(count>=12)break;
    if(el.nodeType!==1||el.parentElement!==container||
      el.dataset.motionSeen==='1')continue;
    el.dataset.motionSeen='1';
    // Browsers can skip animationend when motion is reduced. Do not
    // accumulate inert listener closures or stale inline animation styles.
    if(!reduceMotion.matches){
      el.classList.add('reveal-item');
      el.style.animationDelay=(count*20)+'ms';
      const cleanup=()=>{
        el.classList.remove('reveal-item');
        el.style.animationDelay='';
        el.removeEventListener('animationend',cleanup);
        el.removeEventListener('animationcancel',cleanup);
      };
      el.addEventListener('animationend',cleanup);
      el.addEventListener('animationcancel',cleanup);
    }
    count++;
  }
};
for(const id of ['search-results','playlist-results','playlist-featured','ranking-songs','playlist-detail-songs']){
  const node=$(id);
  if(!node)continue;
  const newlyAdded=new Set();
  const updateListMotion=()=>{
    const batch=[...newlyAdded];
    newlyAdded.clear();
    animateAdded(node,batch);
  };
  new MutationObserver(records=>{
    // A hidden tab may replace a whole list before frames resume. Release
    // detached nodes held from earlier batches before collecting new ones.
    for(const pending of newlyAdded){
      if(pending.parentElement!==node)newlyAdded.delete(pending);
    }
    // The visible animation budget is twelve, but the previous buffer could
    // retain every appended DOM element while requestAnimationFrame was
    // suspended in a background tab. Bound the *buffer* too, including a
    // single huge DocumentFragment append, without walking a 20k-row batch.
    for(const record of records){
      if(newlyAdded.size>=12)break;
      for(const item of record.addedNodes){
        if(newlyAdded.size>=12)break;
        if(item.nodeType===1&&item.parentElement===node&&
           item.dataset.motionSeen!=='1')newlyAdded.add(item);
      }
    }
    if(newlyAdded.size)schedule(updateListMotion);
  }).observe(node,{childList:true});
}
const modernClick=ev=>{
  if(ev.target.closest('.search-actions button:first-child,.playlist-song-play,.playlist-card-actions button')){
    root.classList.add('is-resolving');
  }
};
document.addEventListener('click',modernClick,{passive:true});
// System media controls must go through the SAME app transport and verified
// seek controls as clicks. Direct audio.play/currentTime bypasses resolver state,
// queue rules, pending-source checks, and the existing error reporting.
if('mediaSession' in navigator){
  const mediaSession=navigator.mediaSession;
  const hasMedia=()=>Boolean(audio?.currentSrc);
  const runTransport=(type)=>{
    const button=$('player-toggle-btn');
    if(!button||!hasMedia())return;
    if(type==='play'&&audio.paused)button.click();
    else if(type==='pause'&&!audio.paused)button.click();
  };
  const runSeek=(seconds)=>{
    const seek=$('player-seek');
    const duration=Number(audio?.duration);
    if(!hasMedia()||!seek||seek.disabled||!Number.isFinite(duration)||
       duration<=0||!Number.isFinite(seconds))return;
    const position=Math.max(0,Math.min(duration,seconds));
    // An OS seek supersedes any unfinished immersive touch drag. Without
    // invalidation its delayed "change" can overwrite this new seek target.
    window.dispatchEvent(new CustomEvent('fymusic:external-seek',{detail:{seconds:position}}));
    seek.value=String(Math.round(position/duration*1000));
    // Let the existing transport perform preview, validation and commit.
    seek.dispatchEvent(new Event('input',{bubbles:true}));
    seek.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const runQueue=(name)=>{
    if(!window.__LXNowPlayingTrack)return;
    $(name)?.click();
  };
  const actions={
    play:()=>runTransport('play'),
    pause:()=>runTransport('pause'),
    seekto:event=>runSeek(Number(event?.seekTime)),
    seekbackward:event=>runSeek(Number(audio?.currentTime)-
      (Number.isFinite(Number(event?.seekOffset))?Number(event.seekOffset):10)),
    seekforward:event=>runSeek(Number(audio?.currentTime)+
      (Number.isFinite(Number(event?.seekOffset))?Number(event.seekOffset):10)),
    previoustrack:()=>runQueue('prev-track-btn'),
    nexttrack:()=>runQueue('next-track-btn')
  };
  // Action support differs by browser. One unsupported optional action must
  // never prevent the others from registering.
  for(const [name,handler] of Object.entries(actions)){
    try{mediaSession.setActionHandler?.(name,handler)}catch{}
  }
  let lastPositionKey='';
  const syncMediaSession=()=>{
    try{
      mediaSession.playbackState=!hasMedia()?'none':
        audio.paused||audio.ended?'paused':'playing';
      const seek=$('player-seek'),duration=Number(audio?.duration);
      const current=Number(audio?.currentTime);
      if(!hasMedia()||seek?.disabled||!Number.isFinite(duration)||
         duration<=0||!Number.isFinite(current)) {
        lastPositionKey='';return;
      }
      const position=Math.max(0,Math.min(duration,current));
      const rate=Number(audio.playbackRate);
      const playbackRate=Number.isFinite(rate)&&rate>0?rate:1;
      // Avoid flooding media/OS IPC with repeated sub-second timeupdates.
      const positionKey=audio.currentSrc+'|'+duration+'|'+
        Math.floor(position)+'|'+playbackRate;
      if(lastPositionKey===positionKey)return;
      mediaSession.setPositionState?.({duration,position,playbackRate});
      lastPositionKey=positionKey;
    }catch{}
  };
  for(const event of ['timeupdate','loadedmetadata','durationchange',
                      'playing','pause','ended','emptied','ratechange'])
    audio?.addEventListener(event,()=>schedule(syncMediaSession),{passive:true});
  const updateMetadata=()=>{
    // now-playing-experience owns rich metadata (actual track/album/artwork).
    // Never overwrite it with a generic old project album after a track
    // event arrives, including when a title mutation settles a frame later.
    if(window.__LXNowPlayingTrack)return;
    const name=(title?.textContent||'').trim();
    if(name&&!['未播放',''].includes(name)&&'MediaMetadata' in window){
      try{
        mediaSession.metadata=new MediaMetadata({
          title:name,artist:($('player-artist')?.textContent||'').trim(),
          album:'FyMusic'
        });
      }catch{}
    }
  };
  if(title)new MutationObserver(()=>schedule(updateMetadata))
    .observe(title,{childList:true,characterData:true,subtree:true});
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)schedule(syncMediaSession);
  });
  window.addEventListener('pageshow',()=>schedule(syncMediaSession));
  schedule(syncMediaSession);
}
/* Popular search prompts are user-triggered shortcuts, not speculative
   search results. They reuse the same app search event and network request. */
document.querySelectorAll('[data-suggest-query]').forEach(button=>{
  button.addEventListener('click',()=>{
    if(!input||!searchBtn)return;
    moveToSearch();
    input.value=button.dataset.suggestQuery||'';
    searchBtn.click();
  });
});


/* The immersive screen is owned by now-playing-experience.js.
   Avoid attaching a second modal/backdrop handler here. */

syncStatus();
updateNowPlaying();
renderNetworkPresence();
