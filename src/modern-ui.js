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
                     updateNowPlaying,syncMiniTransport])schedule(work);
};
document.addEventListener('visibilitychange',reconcileForeground);
window.addEventListener('pageshow',reconcileForeground);
if(audio){
  for(const event of ['playing','pause','ended','waiting','canplay','error','emptied']){
    audio.addEventListener(event,()=>schedule(updateNowPlaying),{passive:true});
  }
}
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
const animateAdded=(container,entries)=>{
  if(!container)return;
  let count=0;
  for(const el of entries){
    if(count>=12)break;
    if(el.nodeType!==1||el.parentElement!==container||
      el.dataset.motionSeen==='1')continue;
    el.dataset.motionSeen='1';
    el.classList.add('reveal-item');
    el.style.animationDelay=(count*20)+'ms';
    el.addEventListener('animationend',()=>{
      el.classList.remove('reveal-item');
      el.style.animationDelay='';
    },{once:true});
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
    for(const record of records){
      for(const item of record.addedNodes){
        if(item.nodeType===1&&item.parentElement===node)
          newlyAdded.add(item);
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
if('mediaSession' in navigator){
  navigator.mediaSession.setActionHandler?.('play',()=>audio?.play().catch(()=>{}));
  navigator.mediaSession.setActionHandler?.('pause',()=>audio?.pause());
  navigator.mediaSession.setActionHandler?.('seekto',e=>{
    if(audio&&Number.isFinite(audio.duration)&&e.seekTime!=null)
      audio.currentTime=Math.max(0,Math.min(e.seekTime,audio.duration));
  });
  const updateMetadata=()=>{
    const name=(title?.textContent||'').trim();
    if(name&&!['未播放',''].includes(name)){
      try{
        navigator.mediaSession.metadata=new MediaMetadata({
          title:name,
          artist:($('player-artist')?.textContent||'').trim(),
          album:'LX Music Web'
        });
      }catch{}
    }
  };
  if(title)new MutationObserver(()=>schedule(updateMetadata))
    .observe(title,{childList:true,characterData:true,subtree:true});
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
