/* LX Music Web — immersive Now Playing v0.4.3.
   One event-driven layer, no persistent timer or second audio element. */
const $=id=>document.getElementById(id);
const overlay=$('lyrics-overlay');
const audio=$('audio');
const coverButton=$('player-cover-button');
const coverImages=[$('player-cover-image'),$('lyrics-cover-image')].filter(Boolean);
const coverBoxes=[document.querySelector('.player-art'),document.querySelector('.now-playing-cover-box')];
const lyricScroll=$('lyrics-scroll'),lyricLines=$('lyrics-lines');
const lyricView=$('lyrics-view'),commentView=$('comments-view');
const commentList=$('comments-list'),commentStatus=$('comments-status');
const fullSeek=$('detail-seek'),baseSeek=$('player-seek');
const artCache=new Map(),commentCache=new Map();
// Keep per-track artwork and comment page caches bounded during long listening.
// Only lightweight metadata is retained; evict oldest entries once full.
const cachePut=(cache,key,value,maxEntries)=>{
  cache.delete(key);
  cache.set(key,value);
  if(cache.size>maxEntries)cache.delete(cache.keys().next().value);
};
let track=null,sequence=0,metaAbort=null,commentAbort=null,activeTab='lyrics',lastFocused=null;
let seekPreview=false,ignoreCancelledSeekChange=false;
// Keep keyboard ownership after a committed range change so repeated keys
// can continue; pointer commits still return focus as before.
let seekInputFromKeyboard=false;
// A held finger can outlive a native tab hide: Chrome may deliver new
// trusted touchmove/input/change after foreground with NO new pointerdown.
// Only a newly started pointer (or deliberate keyboard action) can rearm it.
let abandonedTouchGesture=false;
// WebKit can temporarily expose a previous media position while an OS seek
// is still settling. Only a superseded native drag needs an explicit OS
// target for its next trusted keyboard action.
let supersedingOsSeek=null;
// Keep the last explicitly committed target until native seeked confirms it.
// WebKit's currentTime getter can lag a rapid sequence of real setter writes.
let pendingNativeSeek=null;
const isOpen=()=>overlay&&!overlay.classList.contains('hidden');
const sourceNames={wy:'网易云音乐',kw:'酷我音乐',tx:'QQ音乐',kg:'酷狗音乐',mg:'咪咕音乐'};
const formatSeconds=value=>{
  const n=Math.max(0,Math.floor(Number(value)||0));
  return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');
};
const safeArt=(value,source='wy')=>{
  try{
    const u=new URL(String(value||''));
    if(u.protocol!=='https:')return '';
    const host=u.hostname.toLowerCase();
    if(source==='wy')return /^p[0-9]+\.music\.126\.net$/.test(host)?u.href:'';
    if(/(^|\.)(music\.126\.net|qq\.com|kugou\.com|kuwo\.cn|migu\.cn)$/.test(host))return u.href;
    return '';
  }catch{return ''}
};
let currentCoverUrl='';
function setCover(src){
  const url=safeArt(src,track?.source);
  currentCoverUrl=url;
  for(const img of coverImages){
    img.hidden=!url;
    if(url&&img.getAttribute('src')!==url)img.src=url;
    else if(!url&&img.hasAttribute('src'))img.removeAttribute('src');
  }
  for(const box of coverBoxes)box?.classList.toggle('has-album-art',Boolean(url));
}
for(const img of coverImages){
  img.addEventListener('error',()=>{
    // An old request can fail after src has already changed for the new
    // track. Only a completed, *currently selected* failed image may clear
    // the shared cover; never let an old error hide the incoming artwork.
    const url=img.getAttribute('src')||'';
    if(!track||!url||url!==currentCoverUrl||
       !img.complete||img.naturalWidth!==0)return;
    const failedTrack=track;
    const failedUrl=currentCoverUrl;
    // Older images can fire their error after the new song was chosen.
    // Recheck before altering either cover or OS Media Session metadata.
    if(track!==failedTrack||currentCoverUrl!==failedUrl)return;
    artCache.delete(track.source+':'+track.id);
    track={...track,image:''};
    setCover('');
    applyMetadata({},track.sequence);
  });
}
function applyMetadata(data,expectedSequence=sequence){
  // The network response is metadata, never the authority for the playback
  // identity. A delayed response must not overwrite a newer selected track.
  if(!track||track.sequence!==expectedSequence)return;
  const singer=typeof data?.singer==='string'?data.singer.slice(0,180):'';
  const albumName=typeof data?.albumName==='string'?data.albumName.slice(0,180):'';
  const image=safeArt(data?.image,track.source);
  track={...track,
    singer:singer||track.singer,
    albumName:albumName||track.albumName,
    image:image||track.image};
  $('now-playing-artist').textContent=track.singer||'未知歌手';
  $('now-playing-album').textContent='专辑：'+(track.albumName||'未知专辑');
  $('now-playing-platform').textContent='来源：'+(sourceNames[track.source]||'当前平台');
  if(image)setCover(image);
  // Keep the OS/media keyboard display in step with the newly resolved art.
  try{
    if('mediaSession' in navigator&&'MediaMetadata' in window){
      const cover=safeArt(track.image,track.source);
      navigator.mediaSession.metadata=new MediaMetadata({
        title:track.name||'未知歌曲',artist:track.singer||'',
        album:track.albumName||'FyMusic',
        artwork:cover?[{src:cover,sizes:'512x512',type:'image/jpeg'}]:[]
      });
    }
  }catch{}
}
async function resolveCover(current,key){
  const supplied=safeArt(current.image,current.source);
  if(supplied){setCover(supplied);return;}
  if(!['wy','kw'].includes(current.source)||!/^\d{1,20}$/.test(current.id))return;
  if(artCache.has(key)){applyMetadata(artCache.get(key),current.sequence);return;}
  metaAbort?.abort();
  const controller=new AbortController();metaAbort=controller;
  try{
    const api=current.source==='kw'?'/api/kuwo-song-meta?id=':
      '/api/netease-song-meta?id=';
    const r=await fetch(api+encodeURIComponent(current.id),{signal:controller.signal});
    if(!r.ok)throw Error('metadata unavailable');
    const data=await r.json();
    if(!data||String(data.id)!==current.id||
       (current.source==='kw'&&data.source!=='kw')||
       !safeArt(data.image,current.source))return;
    if(sequence!==current.sequence)return;
    // Only the allowlisted metadata below is cached or applied. Discard any
    // source, ID or sequence fields from the server response.
    const details={
      image:safeArt(data.image,current.source),
      singer:typeof data.singer==='string'?data.singer.slice(0,180):'',
      albumName:typeof data.albumName==='string'?data.albumName.slice(0,180):''
    };
    cachePut(artCache,key,details,96);
    applyMetadata(details,current.sequence);
  }catch(e){if(e.name!=='AbortError'&&sequence===current.sequence)
    console.info('Song artwork not available',current.id);
  }finally{
    if(metaAbort===controller)metaAbort=null;
  }
}
let commentMode='hot',commentOffset=0,commentLoaded=0,commentMore=false,commentLoading=false;
const commentMoreButton=$('comments-load-more'),pageNote=$('comments-page-note');
function updateCommentMode(){
  for(const mode of ['hot','recent']){
    const node=$('comments-'+mode+'-btn');
    const active=commentMode===mode;
    node?.classList.toggle('active',active);
    node?.setAttribute('aria-pressed',String(active));
  }
}
function hideComments(status='点击「歌曲评论」查看公开评论'){
  commentList?.replaceChildren();
  if(commentStatus)commentStatus.textContent=status;
  $('comments-count').textContent='';
  $('comments-link-wrap').hidden=true;
  if(pageNote)pageNote.textContent='';
  if(commentMoreButton)commentMoreButton.hidden=true;
  commentOffset=0;commentLoaded=0;commentMore=false;commentLoading=false;
}
function songId(){return track?.source==='wy'&&/^\d{1,20}$/.test(track.id||'')?track.id:''}
function renderComments(payload,append=false){
  if(!append)commentList.replaceChildren();
  const list=Array.isArray(payload?.comments)?payload.comments:[];
  const amount=Number(payload?.total)||0;
  $('comments-count').textContent=amount?'· '+amount.toLocaleString('zh-CN'):'';
  commentStatus.textContent=commentMode==='hot'
    ?'网易云音乐精选热门评论（平台可能仅返回部分热门评论）'
    :'网易云音乐最新评论 · 按平台返回顺序分页';
  if(!list.length&&!append)commentStatus.textContent='当前分类暂未返回评论';
  const seen=new Set(Array.from(commentList.querySelectorAll('[data-comment-id]'),
    node=>node.dataset.commentId));
  let newlyAdded=0;
  for(const item of list){
    const id=String(item.id||'');
    if(id&&seen.has(id))continue;
    if(id)seen.add(id);
    const card=document.createElement('article');card.className='now-comment-card';
    if(id)card.dataset.commentId=id;
    const head=document.createElement('div');head.className='now-comment-head';
    const name=document.createElement('strong');name.textContent=String(item.user||'网易云听友');
    const liked=document.createElement('span');liked.textContent=(Number(item.likedCount)||0)>0?'♥ '+Number(item.likedCount).toLocaleString('zh-CN'):'';
    head.append(name,liked);
    const body=document.createElement('p');body.textContent=String(item.content||'');
    card.append(head,body);commentList.append(card);newlyAdded++;
  }
  commentLoaded=commentList.children.length;
  commentMore=commentMode==='recent'&&Boolean(payload.hasMore)&&newlyAdded>0;
  commentOffset=Number(payload.offset)||0;
  if(commentMoreButton)commentMoreButton.hidden=true;
  if(pageNote)pageNote.textContent=commentMode==='hot'
    ?'热门评论 · 已显示 '+commentLoaded+' 条 · 平台未提供更多热门页'
    :commentMore
      ?'已加载 '+commentLoaded+' 条'+(amount?' / '+amount.toLocaleString('zh-CN'):'')+' · 向下滚动继续加载'
      :'已全部加载 · 共 '+commentLoaded+' 条';
  const id=songId();
  if(id){
    $('comments-official-link').href='https://music.163.com/#/song?id='+encodeURIComponent(id);
    $('comments-link-wrap').hidden=false;
  }
}
async function loadComments(force=false,append=false){
  const id=songId();
  if(append&&commentLoading)return;
  commentAbort?.abort();
  if(!id){
    hideComments(track?.source==='wy'?'当前歌曲没有有效网易云 ID，无法匹配评论':
      '暂未接入'+(sourceNames[track?.source]||'当前平台')+'的评论服务，不能混用其他平台评论');
    return;
  }
  const offset=append&&commentMore?commentOffset+20:0;
  if(append&&!commentMore)return;
  const key=track?.source+':'+id+':'+commentMode+':'+offset;
  if(!append)hideComments('正在获取'+(commentMode==='hot'?'热门':'最新')+'评论…');
  commentLoading=true;
  if(append&&pageNote)pageNote.textContent='正在加载下一页评论…';
  if(!force&&commentCache.has(key)){
    renderComments(commentCache.get(key),append);
    commentLoading=false;
    return;
  }
  const current=sequence,mode=commentMode,controller=new AbortController();commentAbort=controller;
  try{
    const endpoint='/api/netease-comments?source=wy&id='+encodeURIComponent(id)+
      '&mode='+mode+'&offset='+offset;
    let r=await fetch(endpoint,{signal:controller.signal});
    // Retry a transient 502/503/504 exactly once; do not retry client errors
    // or let stale, aborted requests overwrite a newer track.
    if([502,503,504].includes(r.status)&&current===sequence&&
       !controller.signal.aborted&&isOpen()&&activeTab==='comments'&&mode===commentMode){
      if(append){
        if(pageNote)pageNote.textContent='评论暂时不可用，正在重试一次…';
      }else{
        commentStatus.textContent='评论服务暂时不可用，正在重试一次…';
      }
      await new Promise((resolve,reject)=>{
        const onAbort=()=>{
          clearTimeout(timer);
          reject(new DOMException('Cancelled','AbortError'));
        };
        const timer=setTimeout(()=>{
          controller.signal.removeEventListener('abort',onAbort);
          resolve();
        },450);
        controller.signal.addEventListener('abort',onAbort,{once:true});
        if(controller.signal.aborted)onAbort();
      });
      if(current!==sequence||!isOpen()||mode!==commentMode)return;
      r=await fetch(endpoint,{signal:controller.signal});
    }
    if(!r.ok)throw new Error('Comments service unavailable');
    const data=await r.json();
    if(current!==sequence||!isOpen()||activeTab!=='comments'||commentMode!==mode)return;
    cachePut(commentCache,key,data,48);
    renderComments(data,append);
  }catch(e){
    if(e.name==='AbortError'||current!==sequence||mode!==commentMode)return;
    if(append){
      if(pageNote)pageNote.textContent='加载失败 · 稍后继续向下滑动重试';
      commentStatus.textContent='评论下一页暂时不可用';
    }else{
      hideComments('评论服务暂时不可用，已重试一次；可点击刷新或前往原平台查看');
      $('comments-official-link').href='https://music.163.com/#/song?id='+encodeURIComponent(id);
      $('comments-link-wrap').hidden=false;
    }
  }finally{
    if(commentAbort===controller)commentAbort=null;
    if(current===sequence&&mode===commentMode)commentLoading=false;
  }
}
function setTab(tab){
  activeTab=tab==='comments'?'comments':'lyrics';
  for(const button of overlay.querySelectorAll('[data-detail-tab]')){
    const active=button.dataset.detailTab===activeTab;
    button.classList.toggle('active',active);
    button.setAttribute('aria-selected',String(active));
    button.tabIndex=active?0:-1;
  }
  lyricView.hidden=activeTab!=='lyrics';
  commentView.hidden=activeTab!=='comments';
  lyricView.classList.toggle('hidden',activeTab!=='lyrics');
  commentView.classList.toggle('hidden',activeTab!=='comments');
  if(activeTab==='comments'){
    cancelLyricCenter();
    loadComments();
  }else scheduleLyricCenter(true);
}
function setTrack(next){
  if(!next)return;
  const id=String(next.id||''),source=String(next.source||'wy');
  const key=source+':'+id;
  sequence++;
  supersedingOsSeek=null;
  pendingNativeSeek=null;
  // A track change invalidates old lyric scroll and uncommitted seek preview.
  cancelLyricCenter();
  invalidateSeekPreview();
  const currentSequence=sequence;
  metaAbort?.abort();commentAbort?.abort();
  track={id,source,sequence:currentSequence,name:String(next.name||'未知歌曲'),
    singer:String(next.singer||''),albumName:String(next.albumName||''),
    image:safeArt(next.image,source)};
  $('lyrics-title').textContent=track.name;
  applyMetadata(track);
  setCover(track.image);
  if(!track.image)resolveCover(track,key);
  commentMode='hot';updateCommentMode();
  hideComments();
  if(isOpen()&&activeTab==='comments')loadComments();
  lastActiveLyric=null;
}
function updateTransport(){
  // Closed immersive controls do not need DOM writes on every audio
  // timeupdate. openScreen() refreshes them synchronously before display.
  if(!audio||!isOpen())return;
  const valid=Number.isFinite(audio.duration)&&audio.duration>0;
  const pending=pendingNativeSeek&&pendingNativeSeek.source===audio.currentSrc&&
    pendingNativeSeek.trackSequence===sequence?pendingNativeSeek:null;
  const shownPosition=pending?pending.seconds:audio.currentTime;
  const progress=valid?Math.max(0,Math.min(1000,Math.round(shownPosition/audio.duration*1000))):0;
  fullSeek.disabled=Boolean(baseSeek?.disabled)||!valid;
  if(fullSeek.disabled&&seekPreview)cancelSeekPreview();
  if(!seekPreview)fullSeek.value=String(progress);
  const shownSeconds=seekPreview&&valid?Number(fullSeek.value)/1000*audio.duration:shownPosition;
  fullSeek.setAttribute('aria-valuetext',formatSeconds(shownSeconds)+' / '+formatSeconds(valid?audio.duration:0));
  $('detail-current-time').textContent=formatSeconds(shownSeconds);
  $('detail-duration').textContent=formatSeconds(valid?audio.duration:0);
  const playing=!audio.paused&&!audio.ended;
  const toggle=$('detail-toggle-btn');
  // Keep native state, button state and both icons synchronized in the same
  // media event. Class-driven display is explicit even for SVG in WebKit.
  toggle.classList.toggle('is-playing',playing);
  toggle.dataset.playbackState=playing?'playing':'paused';
  toggle.setAttribute('aria-label',playing?'暂停':'播放');
  toggle.title=playing?'暂停':'播放';
  // SVGSVGElement.hidden is not a reliably reflected DOM property:
  // assigning false can leave the literal HTML "hidden" attribute intact.
  // Toggle the attribute itself so CSS and the rendered icon agree.
  toggle.querySelector('.detail-play-icon').toggleAttribute('hidden',playing);
  toggle.querySelector('.detail-pause-icon').toggleAttribute('hidden',!playing);
}
function centerActiveLyric(instant=false){
  if(!isOpen()||activeTab!=='lyrics'||!lyricScroll)return;
  const active=lyricLines.querySelector('.lyrics-line.active');
  if(!active)return;
  const container=lyricScroll.getBoundingClientRect();
  const rect=active.getBoundingClientRect();
  const target=lyricScroll.scrollTop+rect.top-container.top-(container.height-rect.height)/2;
  if(Math.abs(target-lyricScroll.scrollTop)<2)return;
  lyricScroll.scrollTo({top:Math.max(0,target),behavior:instant||window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
let lastActiveLyric=null;
let pendingLyricCenter=0;
function cancelLyricCenter(){
  if(pendingLyricCenter)cancelAnimationFrame(pendingLyricCenter);
  pendingLyricCenter=0;
}
function scheduleLyricCenter(instant=false){
  // Rapid lyric changes/seeks may happen before paint. Center only the final
  // active line, at most once per animation frame, never a stale prior track.
  cancelLyricCenter();
  pendingLyricCenter=requestAnimationFrame(()=>{
    pendingLyricCenter=0;
    centerActiveLyric(instant);
  });
}
if(lyricLines)new MutationObserver(()=>{
  // The small player lyric summary is maintained independently by modern-ui.
  // Avoid querying/centering a hidden immersive screen on each lyric change.
  if(!isOpen()||activeTab!=='lyrics')return;
  const active=lyricLines.querySelector('.lyrics-line.active');
  if(active===lastActiveLyric)return;
  lastActiveLyric=active;
  if(active)scheduleLyricCenter(false);
}).observe(lyricLines,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
function openScreen(){
  if(!overlay)return;
  lastFocused=document.activeElement;
  overlay.classList.remove('hidden');
  overlay.setAttribute('aria-hidden','false');
  coverButton?.setAttribute('aria-expanded','true');
  document.documentElement.classList.add('lyrics-open');
  setTab('lyrics');
  updateTransport();
  syncMode();syncVolume();
  $('lyrics-close-btn').focus();
  scheduleLyricCenter(true);
}
function closeScreen(){
  if(!isOpen())return;
  cancelLyricCenter();
  cancelSeekPreview();
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden','true');
  document.documentElement.classList.remove('lyrics-open');
  coverButton?.setAttribute('aria-expanded','false');
  const target=lastFocused?.isConnected?lastFocused:coverButton;
  // A removed playlist/search row must not be retained for the entire next
  // listening session just because it opened this modal once.
  lastFocused=null;
  target?.focus?.({preventScroll:true});
}
coverButton?.addEventListener('click',()=>isOpen()?closeScreen():openScreen());
$('lyrics-close-btn')?.addEventListener('click',closeScreen);
for(const button of overlay.querySelectorAll('[data-detail-tab]')){
  button.addEventListener('click',()=>setTab(button.dataset.detailTab));
  button.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight'].includes(event.key))return;
    event.preventDefault();
    const next=button.dataset.detailTab==='lyrics'?'comments':'lyrics';
    setTab(next);$(''+next+'-tab').focus();
  });
}
$('comments-refresh-btn')?.addEventListener('click',()=>loadComments(true));
$('comments-hot-btn')?.addEventListener('click',()=>{
  if(commentMode==='hot')return;
  commentMode='hot';updateCommentMode();loadComments();
});
$('comments-recent-btn')?.addEventListener('click',()=>{
  if(commentMode==='recent')return;
  commentMode='recent';updateCommentMode();loadComments();
});
// The comments list itself scrolls; observe its scroll position rather than
// requiring a small "load more" button at the bottom of a phone screen.
commentList?.addEventListener('scroll',()=>{
  if(!isOpen()||activeTab!=='comments'||commentLoading||!commentMore)return;
  if(commentList.scrollTop+commentList.clientHeight>=commentList.scrollHeight-170)
    loadComments(false,true);
},{passive:true});
updateCommentMode();
$('detail-prev-btn')?.addEventListener('click',()=>$('prev-track-btn')?.click());
$('detail-next-btn')?.addEventListener('click',()=>$('next-track-btn')?.click());
$('detail-toggle-btn')?.addEventListener('click',()=>$('player-toggle-btn')?.click());
const playbackModes=['sequence','list-loop','single-loop','shuffle'];
const modeLabels={sequence:'顺序', 'list-loop':'列表循环','single-loop':'单曲循环',shuffle:'随机'};
const modeButton=$('detail-mode-btn');
const syncMode=()=>{
  const mode=window.LXPlayerControls?.getMode?.()||'sequence';
  modeButton.textContent=modeLabels[mode]||'播放模式';
  modeButton.title='切换播放模式，当前：'+modeButton.textContent;
};
modeButton?.addEventListener('click',()=>{
  const player=window.LXPlayerControls;
  if(!player?.setMode)return;
  const current=player.getMode(),index=playbackModes.indexOf(current);
  player.setMode(playbackModes[(index+1)%playbackModes.length]);
  syncMode();
});
syncMode();
const detailVolume=$('detail-volume'),baseVolume=$('player-volume');
const syncVolume=()=>{
  if(detailVolume&&baseVolume&&document.activeElement!==detailVolume)
    detailVolume.value=String(baseVolume.value||80);
};
detailVolume?.addEventListener('input',()=>{
  if(!baseVolume)return;
  baseVolume.value=detailVolume.value;
  baseVolume.dispatchEvent(new Event('input',{bubbles:true}));
});
baseVolume?.addEventListener('input',syncVolume);
syncVolume();

function cancelSeekPreview(){
  if(!seekPreview)return;
  seekPreview=false;
  window.LXPlayerControls?.cancelSeek?.();
  // This only restores presentation: it never writes audio.currentTime.
  updateTransport();
}
function invalidateSeekPreview(event){
  if(event?.type==='fymusic:external-seek'){
    const seconds=event.detail?.seconds;
    const duration=Number(audio?.duration);
    if(Number.isFinite(seconds)&&Number.isFinite(duration)&&duration>0&&audio?.currentSrc)
      pendingNativeSeek={seconds:Math.max(0,Math.min(duration,seconds)),
        source:audio.currentSrc,trackSequence:sequence};
    if((seekPreview||abandonedTouchGesture)&&Number.isFinite(seconds)&&
       Number.isFinite(duration)&&duration>0&&audio?.currentSrc){
      supersedingOsSeek={seconds:Math.max(0,Math.min(duration,seconds)),
        source:audio.currentSrc,trackSequence:sequence};
    }
  }else supersedingOsSeek=null;
  if(!seekPreview)return;
  // OS seek and track replacement also invalidate an already held finger.
  // Chrome can continue emitting trusted touchmove/input after this event;
  // do not let that old input rearm a commit on the new media owner.
  abandonedTouchGesture=true;
  ignoreCancelledSeekChange=true;
  cancelSeekPreview();
}
function abandonNativeTouchGesture(){
  if(!seekPreview)return;
  abandonedTouchGesture=true;
  invalidateSeekPreview();
}
function rejectStaleNativeSeek(event){
  if(event?.isTrusted && (!document.hasFocus()||abandonedTouchGesture)){
    abandonedTouchGesture=true;
    ignoreCancelledSeekChange=true;
    cancelSeekPreview();
    return true;
  }
  return false;
}
window.addEventListener('fymusic:external-seek',invalidateSeekPreview);
fullSeek?.addEventListener('pointerdown',()=>{
  pendingNativeSeek=null;
  supersedingOsSeek=null;
  // Chrome dispatches pointermove, but not pointerdown, for an old finger
  // after tab restoration. A genuine new pointerdown starts a new gesture.
  abandonedTouchGesture=false;
  ignoreCancelledSeekChange=false;
  seekInputFromKeyboard=false;
});
fullSeek?.addEventListener('input',event=>{
  if(rejectStaleNativeSeek(event))return;
  if(!isOpen()||!baseSeek||baseSeek.disabled)return;
  ignoreCancelledSeekChange=false;
  seekPreview=true;
  baseSeek.value=fullSeek.value;
  baseSeek.dispatchEvent(new Event('input',{bubbles:true}));
  const value=Number(fullSeek.value)/1000*(Number(audio?.duration)||0);
  $('detail-current-time').textContent=formatSeconds(value);
  fullSeek.setAttribute('aria-valuetext',formatSeconds(value)+' / '+formatSeconds(audio?.duration));
});
fullSeek?.addEventListener('change',event=>{
  if(rejectStaleNativeSeek(event))return;
  if(ignoreCancelledSeekChange){
    ignoreCancelledSeekChange=false;
    cancelSeekPreview();
    return;
  }
  if(!isOpen()||!baseSeek||baseSeek.disabled){
    cancelSeekPreview();return;
  }
  seekPreview=false;
  supersedingOsSeek=null;
  const duration=Number(audio?.duration);
  if(Number.isFinite(duration)&&duration>0&&audio?.currentSrc)
    pendingNativeSeek={seconds:Number(fullSeek.value)/1000*duration,
      source:audio.currentSrc,trackSequence:sequence};
  baseSeek.value=fullSeek.value;
  baseSeek.dispatchEvent(new Event('change',{bubbles:true}));
  // Native range change fires for both pointer and keyboard. Blurring after
  // a keyboard step steals focus and drops the remaining held/repeated keys.
  if(!seekInputFromKeyboard)fullSeek.blur();
  updateTransport();
});
fullSeek?.addEventListener('pointercancel',()=>{
  supersedingOsSeek=null;
  seekInputFromKeyboard=false;
  abandonedTouchGesture=true;
  ignoreCancelledSeekChange=true;
  cancelSeekPreview();
});
fullSeek?.addEventListener('keydown',event=>{
  if(event.isTrusted&&event.key!=='Escape'&&document.hasFocus()){
    seekInputFromKeyboard=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
      'PageUp','PageDown','Home','End'].includes(event.key);
    // A cancelled physical drag may have changed the native range thumb
    // without committing the audio. Restore the *real* currentTime before
    // the browser applies this new keyboard step, or ArrowRight would jump
    // from the abandoned thumb instead of the OS's latest seek position.
    if(abandonedTouchGesture){
      const intent=supersedingOsSeek;
      const duration=Number(audio?.duration);
      if(seekInputFromKeyboard&&intent&&intent.trackSequence===sequence&&
         intent.source===audio?.currentSrc&&Number.isFinite(duration)&&duration>0){
        // No audio.currentTime assignment: only the native trusted range
        // change and existing base player may commit the resulting seek.
        fullSeek.value=String(Math.round(intent.seconds/duration*1000));
      }else updateTransport();
    }
    supersedingOsSeek=null;
    abandonedTouchGesture=false;
    ignoreCancelledSeekChange=false;
  }
  if(event.key==='Escape'&&seekPreview){
    supersedingOsSeek=null;
    seekInputFromKeyboard=false;
    event.preventDefault();event.stopPropagation();
    abandonedTouchGesture=true;
    ignoreCancelledSeekChange=true;
    cancelSeekPreview();
    // The base player may disable the seek control after cancellation.
    // Move focus to a stable button within the dialog so a second Escape
    // still closes the immersive screen instead of landing on <body>.
    $('lyrics-close-btn')?.focus({preventScroll:true});
  }
});
window.addEventListener('resize',()=>{
  if(isOpen()&&activeTab==='lyrics')scheduleLyricCenter(true);
},{passive:true});
window.visualViewport?.addEventListener('resize',()=>{
  if(isOpen()&&activeTab==='lyrics')scheduleLyricCenter(true);
},{passive:true});
// A mobile browser may suspend the page in the middle of a touch seek.
// Cancel only the UI preview; never pause, play, reload, or overwrite media
// currentTime when the OS sends the tab to the background.
const suspendImmersive=()=>{
  cancelLyricCenter();
  abandonNativeTouchGesture();
};
window.addEventListener('blur',suspendImmersive);
const resumeImmersive=()=>{
  if(document.hidden||!isOpen())return;
  updateTransport();
  if(activeTab==='lyrics')scheduleLyricCenter(true);
  if(!overlay.contains(document.activeElement))
    $('lyrics-close-btn')?.focus({preventScroll:true});
};
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)suspendImmersive();
  else resumeImmersive();
});
window.addEventListener('pagehide',suspendImmersive);
window.addEventListener('pageshow',resumeImmersive);
// A completed native seek can retire OS intent once the target is actually
// reached. Do not use timeupdate here: WebKit may report the old position.
audio?.addEventListener('seeked',()=>{
  const committed=pendingNativeSeek;
  if(committed){
    if(committed.source!==audio.currentSrc||committed.trackSequence!==sequence)
      pendingNativeSeek=null;
    else if(!audio.seeking&&Math.abs(audio.currentTime-committed.seconds)<Math.max(.009,Number(audio.duration||0)/2000))
      pendingNativeSeek=null;
  }
  const intent=supersedingOsSeek;
  if(!intent)return;
  if(intent.source!==audio.currentSrc||intent.trackSequence!==sequence){
    supersedingOsSeek=null;return;
  }
  if(!audio.seeking&&Math.abs(audio.currentTime-intent.seconds)<Math.max(.009,Number(audio.duration||0)/2000))
    supersedingOsSeek=null;
});
for(const event of ['timeupdate','durationchange','loadedmetadata','play','playing','pause','ended','waiting','emptied'])
  audio?.addEventListener(event,updateTransport);
// Keep programmatic keyboard focus inside the modal while it is visible.
document.addEventListener('focusin',event=>{
  if(isOpen()&&!overlay.contains(event.target))
    $('lyrics-close-btn')?.focus({preventScroll:true});
});
overlay?.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeScreen();return;}
  if(event.key!=='Tab')return;
  const controls=Array.from(overlay.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]'))
    .filter(node=>node.getClientRects().length>0&&getComputedStyle(node).visibility!=='hidden');
  if(!controls.length)return;
  const i=controls.indexOf(document.activeElement);
  if(event.shiftKey&&(i<=0)){event.preventDefault();controls[controls.length-1].focus()}
  else if(!event.shiftKey&&i===controls.length-1){event.preventDefault();controls[0].focus()}
});
window.addEventListener('lx:trackchange',event=>setTrack(event.detail));
if(window.__LXNowPlayingTrack)setTrack(window.__LXNowPlayingTrack);
updateTransport();
