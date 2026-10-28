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

let animationFrame=0;
const schedule=work=>{
  if(animationFrame)return;
  animationFrame=requestAnimationFrame(()=>{
    animationFrame=0;
    if(!document.hidden)work();
  });
};
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
if(source)new MutationObserver(()=>schedule(()=>{
  const active=window.LXSourceManager?.getActive?.();
  const name=active?.name||'正在准备';
  const label='当前音源：'+name;
  if(source.textContent!==label)source.textContent=label;
})).observe(source,{childList:true,characterData:true});
const lyrics=$('lyrics-lines');
if(lyrics)new MutationObserver(()=>schedule(syncLyric))
  .observe(lyrics,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
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
const animateAdded=container=>{
  if(!container)return;
  // Cap animated entries to protect mid-range devices and long playlists.
  const entries=Array.from(container.children).slice(0,12);
  for(let i=0;i<entries.length;i++){
    const el=entries[i];
    if(el.dataset.motionSeen==='1')continue;
    el.dataset.motionSeen='1';
    el.classList.add('reveal-item');
    el.style.animationDelay=(i*20)+'ms';
    el.addEventListener('animationend',()=>{
      el.classList.remove('reveal-item');
      el.style.animationDelay='';
    },{once:true});
  }
};
for(const id of ['search-results','playlist-results','playlist-featured','ranking-songs','playlist-detail-songs']){
  const node=$(id);
  if(node)new MutationObserver(()=>schedule(()=>animateAdded(node)))
    .observe(node,{childList:true});
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


/* Accessible, event-driven lyrics sheet. It works regardless of current page.
   No frame loop: only reposition when the active LRC line changes. */
const lyricsOverlay=$('lyrics-overlay');
const lyricsScroll=$('lyrics-scroll');
const lyricsToggle=$('open-lyrics-btn');
const closeLyricsButton=$('lyrics-close-btn');
const lyricTriggers=[lyricsToggle,lyric].filter(Boolean);
let lastLyricsTrigger=null;
let userLyricsScrollUntil=0;
const lyricsIsOpen=()=>Boolean(lyricsOverlay&&!lyricsOverlay.classList.contains('hidden'));
const openLyrics=trigger=>{
  if(!lyricsOverlay)return;
  lastLyricsTrigger=trigger||lyricsToggle;
  lyricsOverlay.classList.remove('hidden');
  lyricsOverlay.setAttribute('aria-hidden','false');
  document.documentElement.classList.add('lyrics-open');
  lyricsToggle?.setAttribute('aria-expanded','true');
  closeLyricsButton?.focus();
  const activeLine=lyricsOverlay.querySelector('.lyrics-line.active');
  activeLine?.scrollIntoView({block:'center',behavior:'instant'});
};
const closeLyrics=()=>{
  if(!lyricsIsOpen())return;
  lyricsOverlay.classList.add('hidden');
  lyricsOverlay.setAttribute('aria-hidden','true');
  document.documentElement.classList.remove('lyrics-open');
  lyricsToggle?.setAttribute('aria-expanded','false');
  lastLyricsTrigger?.focus();
};
for(const trigger of lyricTriggers)
  trigger.addEventListener('click',()=>lyricsIsOpen()?closeLyrics():openLyrics(trigger));
$('lyrics-backdrop')?.addEventListener('click',closeLyrics);
closeLyricsButton?.addEventListener('click',closeLyrics);
lyricsOverlay?.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeLyrics();return;}
  if(event.key!=='Tab')return;
  const controls=[...lyricsOverlay.querySelectorAll('button:not([disabled]),[tabindex="0"]')];
  if(!controls.length)return;
  const i=controls.indexOf(document.activeElement);
  if(event.shiftKey&&(i===0||i<0)){event.preventDefault();controls[controls.length-1].focus();}
  else if(!event.shiftKey&&i===controls.length-1){event.preventDefault();controls[0].focus();}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&lyricsIsOpen()){event.preventDefault();closeLyrics();}
});
lyricsScroll?.addEventListener('wheel',()=>{userLyricsScrollUntil=Date.now()+5000;},{passive:true});
lyricsScroll?.addEventListener('touchmove',()=>{userLyricsScrollUntil=Date.now()+5000;},{passive:true});
let previousActiveLine=null;
const followLyrics=()=>{
  if(!lyricsIsOpen()||Date.now()<userLyricsScrollUntil)return;
  const active=lyricsOverlay.querySelector('.lyrics-line.active');
  if(!active||active===previousActiveLine)return;
  previousActiveLine=active;
  active.scrollIntoView({block:'center',behavior:'smooth'});
};
if(lyrics&&lyricsOverlay)
  new MutationObserver(()=>schedule(followLyrics)).observe(lyrics,{
    subtree:true,childList:true,attributes:true,attributeFilter:['class']
  });

syncStatus();
updateNowPlaying();
