/*
 * FyMusic UI 2.0 — presentation-only, default UI2, opt-out via ?ui2=0.
 * Reuse the validated player, metadata and lyric controllers; no timers,
 * network requests, URL re-resolution or additional HTMLMediaElement.
 */
(() => {
  const params=new URLSearchParams(location.search);
  if(params.get('ui2')==='0')return;
  document.documentElement.classList.add('fy-ui2');
  const themeKey='fymusic-ui2-theme';
  const themeParam=params.get('theme');
  const savedTheme=(()=>{
    try{return localStorage.getItem(themeKey)}catch{return null}
  })();
  let currentTheme=themeParam==='light'||themeParam==='dark'
    ?themeParam:(savedTheme==='light'?'light':'dark');
  const header=document.querySelector('.topbar-inner');
  const settings=document.querySelector('#view-settings .settings-section');
  const themeButtons=[];
  const createThemeButton=(id,cls)=>{
    const button=document.createElement('button');
    button.type='button';button.id=id;button.className=cls;
    button.setAttribute('aria-label','切换音乐界面主题');
    button.setAttribute('aria-pressed','false');
    button.setAttribute('data-ui2-theme-control','true');
    themeButtons.push(button);
    return button;
  };
  const headerButton=createThemeButton('ui2-theme-toggle','ui2-theme-toggle');
  header?.appendChild(headerButton);
  if(settings){
    const row=document.createElement('div');
    row.className='ui2-theme-settings';
    const explanation=document.createElement('div');
    const heading=document.createElement('strong');
    heading.textContent='界面外观';
    const paragraph=document.createElement('p');
    paragraph.textContent='深色沉浸或柔和浅色。切换外观不会中断正在播放的音乐。';
    explanation.append(heading,paragraph);
    const button=createThemeButton('ui2-theme-settings-toggle','ui2-theme-settings-toggle');
    row.append(explanation,button);
    settings.prepend(row);
  }
  const syncTheme=(persist=false)=>{
    document.documentElement.classList.toggle('fy-ui2-light',currentTheme==='light');
    document.documentElement.dataset.ui2Theme=currentTheme;
    const light=currentTheme==='light';
    for(const button of themeButtons){
      button.setAttribute('aria-pressed',String(light));
      button.setAttribute('aria-label',light?'当前浅色主题，切换为深色主题':'当前深色主题，切换为浅色主题');
      button.textContent=light?'☀ 浅色':'☾ 深色';
      button.title=light?'切换为深色主题':'切换为浅色主题';
    }
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',light?'#f4faf6':'#091218');
    if(persist){
      try{localStorage.setItem(themeKey,currentTheme)}catch{}
      const url=new URL(location.href);
      url.searchParams.set('theme',currentTheme);
      history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    }
  };
  for(const button of themeButtons){
    button.addEventListener('click',()=>{
      currentTheme=currentTheme==='light'?'dark':'light';
      syncTheme(true);
    });
  }
  syncTheme();
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
    immersiveOpen:isOpen,
    theme:()=>currentTheme
  });
})();
