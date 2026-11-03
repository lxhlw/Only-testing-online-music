/*
 * FyMusic UI 2.0 — presentation-only, opt-in via ?ui2=1.
 * Reuse the validated player, metadata and lyric controllers; no timers,
 * network requests, URL re-resolution or additional HTMLMediaElement.
 */
(() => {
  const params=new URLSearchParams(location.search);
  if(params.get('ui2')!=='1')return;
  document.documentElement.classList.add('fy-ui2');
  const overlay=document.getElementById('lyrics-overlay');
  const sheet=overlay?.querySelector('.lyrics-sheet.now-playing-screen');
  const image=document.getElementById('lyrics-cover-image');
  const audio=document.getElementById('audio');
  if(!overlay||!sheet||!image||!audio)return;
  const ambient=document.createElement('div');
  ambient.className='ui2-artwork-ambient';
  ambient.setAttribute('aria-hidden','true');
  sheet.insertBefore(ambient,sheet.firstChild);
  const isOpen=()=>!overlay.classList.contains('hidden') && overlay.getAttribute('aria-hidden')!=='true';
  let applied='';
  const syncArtwork=()=>{
    // Existing controller already validated the artwork URL and owns image loading.
    // Reuse exactly the loaded artwork. Never inspect pixels from cross-origin images.
    // Clearing the CSS layer while hidden avoids unnecessary offscreen GPU work.
    const loaded=isOpen()&&!document.hidden&&!image.hidden&&image.complete&&image.naturalWidth>0;
    const src=loaded?(image.currentSrc||image.getAttribute('src')||''):'';
    if(src===applied)return;
    applied=src;
    ambient.classList.toggle('has-art',Boolean(src));
    // CSS escaping through JSON string quoting avoids arbitrary declarations
    // from untrusted provider URLs. No fetched bytes or URL gets logged.
    ambient.style.backgroundImage=src?'url('+JSON.stringify(src)+')':'none';
  };
  const syncAudioState=()=>{
    document.documentElement.classList.toggle('fy-ui2-playing',
      !audio.paused&&!audio.ended&&audio.readyState>1);
  };
  const changes=new MutationObserver(syncArtwork);
  changes.observe(image,{attributes:true,attributeFilter:['src','hidden']});
  const visibility=new MutationObserver(syncArtwork);
  visibility.observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']});
  image.addEventListener('load',syncArtwork,{passive:true});
  image.addEventListener('error',syncArtwork,{passive:true});
  document.addEventListener('visibilitychange',syncArtwork,{passive:true});
  window.addEventListener('pageshow',syncArtwork,{passive:true});
  window.addEventListener('pagehide',()=>{ambient.style.backgroundImage='none';ambient.classList.remove('has-art');applied='';},{passive:true});
  for(const name of ['play','playing','pause','ended','emptied','waiting','loadedmetadata'])
    audio.addEventListener(name,syncAudioState,{passive:true});
  syncArtwork();syncAudioState();
  // Public-safe testing hook returns only booleans, never provider URL or tokens.
  window.FyMusicUI2Preview=Object.freeze({
    enabled:true, artworkActive:()=>ambient.classList.contains('has-art'),
    immersiveOpen:isOpen
  });
})();
