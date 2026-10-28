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
let track=null,sequence=0,metaAbort=null,commentAbort=null,activeTab='lyrics',lastFocused=null;
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
function setCover(src){
  const url=safeArt(src,track?.source);
  for(const img of coverImages){
    img.hidden=!url;
    if(url&&img.src!==url)img.src=url;
    else if(!url){img.removeAttribute('src')}
  }
  for(const box of coverBoxes)box?.classList.toggle('has-album-art',Boolean(url));
}
for(const img of coverImages){
  img.addEventListener('error',()=>{
    if(!track)return;
    const failed=img.src;
    for(const other of coverImages){
      if(other.src===failed){other.hidden=true;other.removeAttribute('src')}
    }
    for(const box of coverBoxes)box?.classList.remove('has-album-art');
  });
}
function applyMetadata(data){
  if(!track)return;
  track={...track,...data};
  $('now-playing-artist').textContent=track.singer||'未知歌手';
  $('now-playing-album').textContent='专辑：'+(track.albumName||'未知专辑');
  $('now-playing-platform').textContent='来源：'+(sourceNames[track.source]||'当前平台');
  if(data.image)setCover(data.image);
  // Keep the OS/media keyboard display in step with the newly resolved art.
  try{
    if('mediaSession' in navigator&&'MediaMetadata' in window){
      const cover=safeArt(track.image,track.source);
      navigator.mediaSession.metadata=new MediaMetadata({
        title:track.name||'未知歌曲',artist:track.singer||'',
        album:track.albumName||'LX Music Web',
        artwork:cover?[{src:cover,sizes:'512x512',type:'image/jpeg'}]:[]
      });
    }
  }catch{}
}
async function resolveCover(current,key){
  const supplied=safeArt(current.image,current.source);
  if(supplied){setCover(supplied);return;}
  if(current.source!=='wy'||!/^\d{1,20}$/.test(current.id))return;
  if(artCache.has(key)){applyMetadata(artCache.get(key));return;}
  metaAbort?.abort();
  const controller=new AbortController();metaAbort=controller;
  try{
    const r=await fetch('/api/netease-song-meta?id='+encodeURIComponent(current.id),{signal:controller.signal});
    if(!r.ok)throw Error('metadata unavailable');
    const data=await r.json();
    if(!data||data.id!==current.id||!data.image)return;
    artCache.set(key,data);
    if(sequence!==current.sequence)return;
    applyMetadata(data);
  }catch(e){if(e.name!=='AbortError')console.info('Song artwork not available',current.id)}
}
let commentMode='hot',commentOffset=0,commentLoaded=0,commentMore=false;
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
  commentOffset=0;commentLoaded=0;commentMore=false;
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
  if(commentMoreButton){commentMoreButton.hidden=!commentMore;commentMoreButton.disabled=false;commentMoreButton.textContent='加载更多最新评论'}
  if(pageNote)pageNote.textContent=commentMode==='hot'
    ?'已显示 '+commentLoaded+' 条热门评论'
    :'已加载 '+commentLoaded+' 条'+(amount?' · 平台共 '+amount.toLocaleString('zh-CN')+' 条':'');
  const id=songId();
  if(id){
    $('comments-official-link').href='https://music.163.com/#/song?id='+encodeURIComponent(id);
    $('comments-link-wrap').hidden=false;
  }
}
async function loadComments(force=false,append=false){
  const id=songId();
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
  else{commentMoreButton.disabled=true;commentMoreButton.textContent='正在加载…'}
  if(!force&&commentCache.has(key)){renderComments(commentCache.get(key),append);return}
  const current=sequence,mode=commentMode,controller=new AbortController();commentAbort=controller;
  try{
    const r=await fetch('/api/netease-comments?source=wy&id='+encodeURIComponent(id)+
      '&mode='+mode+'&offset='+offset,{signal:controller.signal});
    if(!r.ok)throw new Error('Comments service unavailable');
    const data=await r.json();
    if(current!==sequence||!isOpen()||activeTab!=='comments'||commentMode!==mode)return;
    commentCache.set(key,data);
    renderComments(data,append);
  }catch(e){
    if(e.name==='AbortError'||current!==sequence||mode!==commentMode)return;
    if(append){
      commentStatus.textContent='加载下一页失败，可重试';
      commentMoreButton.disabled=false;commentMoreButton.textContent='重试加载更多';
    }else{
      hideComments('平台暂未返回'+(mode==='hot'?'热门':'最新')+'评论，可以刷新或前往原平台查看');
      $('comments-official-link').href='https://music.163.com/#/song?id='+encodeURIComponent(id);
      $('comments-link-wrap').hidden=false;
    }
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
  if(activeTab==='comments')loadComments();
  else requestAnimationFrame(()=>centerActiveLyric(true));
}
function setTrack(next){
  if(!next)return;
  const id=String(next.id||''),source=String(next.source||'wy');
  const key=source+':'+id;
  sequence++;
  const currentSequence=sequence;
  metaAbort?.abort();commentAbort?.abort();
  track={id,source,sequence:currentSequence,name:String(next.name||'未知歌曲'),
    singer:String(next.singer||''),albumName:String(next.albumName||''),image:String(next.image||'')};
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
  if(!audio)return;
  const valid=Number.isFinite(audio.duration)&&audio.duration>0;
  const progress=valid?Math.max(0,Math.min(1000,Math.round(audio.currentTime/audio.duration*1000))):0;
  if(!fullSeek.matches(':active')&&document.activeElement!==fullSeek)fullSeek.value=String(progress);
  fullSeek.disabled=Boolean(baseSeek?.disabled)||!valid;
  $('detail-current-time').textContent=formatSeconds(audio.currentTime);
  $('detail-duration').textContent=formatSeconds(valid?audio.duration:0);
  const playing=!audio.paused&&!audio.ended;
  $('detail-toggle-btn').setAttribute('aria-label',playing?'暂停':'播放');
  $('detail-toggle-btn').title=playing?'暂停':'播放';
  $('detail-toggle-btn').querySelector('.detail-play-icon').hidden=playing;
  $('detail-toggle-btn').querySelector('.detail-pause-icon').hidden=!playing;
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
if(lyricLines)new MutationObserver(()=>{
  const active=lyricLines.querySelector('.lyrics-line.active');
  if(active===lastActiveLyric)return;
  lastActiveLyric=active;
  if(active)requestAnimationFrame(()=>centerActiveLyric(false));
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
  requestAnimationFrame(()=>centerActiveLyric(true));
}
function closeScreen(){
  if(!isOpen())return;
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden','true');
  document.documentElement.classList.remove('lyrics-open');
  coverButton?.setAttribute('aria-expanded','false');
  lastFocused?.focus?.();
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
commentMoreButton?.addEventListener('click',()=>loadComments(false,true));
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

fullSeek?.addEventListener('input',()=>{
  if(!baseSeek||baseSeek.disabled)return;
  baseSeek.value=fullSeek.value;
  baseSeek.dispatchEvent(new Event('input',{bubbles:true}));
  const value=Number(fullSeek.value)/1000*(Number(audio?.duration)||0);
  $('detail-current-time').textContent=formatSeconds(value);
});
fullSeek?.addEventListener('change',()=>{
  if(!baseSeek||baseSeek.disabled)return;
  baseSeek.value=fullSeek.value;
  baseSeek.dispatchEvent(new Event('change',{bubbles:true}));
  fullSeek.blur();
});
for(const event of ['timeupdate','durationchange','loadedmetadata','play','playing','pause','ended','waiting','emptied'])
  audio?.addEventListener(event,updateTransport);
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
