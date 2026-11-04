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


/* FYMUSIC STAGE 5.2 — CAPTURE-ONLY AUDIO VISUALIZER
 * IMPORTANT: Never call createMediaElementSource(audio), set crossOrigin/src,
 * alter playback gain/volume, connect this graph to destination, or create
 * another audio element. Browser/CORS-protected music can lack capturable
 * samples; that case gets a truthful, nonreactive spectrum, not fake FFT.
 */
(() => {
  if(!document.documentElement.classList.contains('fy-ui2'))return;
  const audio=document.getElementById('audio');
  const metadata=document.querySelector('.player-song .player-meta');
  const album=document.querySelector('#lyrics-overlay .now-playing-album-column');
  const coverOverlay=document.getElementById('lyrics-overlay');
  if(!audio||!metadata||!album||!coverOverlay)return;
  const holder=document.createElement('span');
  holder.id='ui2-audio-spectrum';
  holder.className='ui2-audio-spectrum';
  holder.setAttribute('role','img');
  holder.setAttribute('aria-label','静态音频频谱装饰');
  const canvas=document.createElement('canvas');
  canvas.className='ui2-audio-spectrum-canvas';
  canvas.setAttribute('aria-hidden','true');
  holder.appendChild(canvas);
  metadata.appendChild(holder);
  const ctx2d=canvas.getContext('2d');
  if(!ctx2d)return;

  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const contrast=window.matchMedia('(forced-colors: active)');
  const desktop=window.matchMedia('(min-width: 1101px)');
  const BARS=28;
  const WIDTH=112,HEIGHT=15;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  canvas.width=Math.round(WIDTH*ratio);
  canvas.height=Math.round(HEIGHT*ratio);
  ctx2d.setTransform(ratio,0,0,ratio,0,0);
  const levels=new Float32Array(BARS);
  let stream=null,context=null,sourceNode=null,analyser=null,bins=null;
  let raf=0,lastFrame=0,lastEnergy=0,mode='idle',liveFrames=0;
  let captureAttempted=false,streamEventsBound=false,epoch=0;
  const isPlaying=()=>!audio.paused&&!audio.ended&&audio.readyState>1;
  const permitted=()=>desktop.matches&&!document.hidden&&!reduce.matches&&!contrast.matches;
  const supportsCapture=()=>Boolean(audio.captureStream||audio.mozCaptureStream);
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const syncMode=next=>{
    if(mode===next)return;
    mode=next;
    holder.dataset.mode=next;
    holder.setAttribute('aria-label',next==='live'?
      '实时音乐频谱':next==='ambient'?
      '当前音源未提供可读取的频谱，显示静态装饰':'静态音频频谱装饰');
    document.documentElement.classList.toggle('fy-ui2-audio-live',next==='live');
    if(next!=='live')album.style.removeProperty('--fy-audio-energy');
  };
  const draw=live=>{
    ctx2d.clearRect(0,0,WIDTH,HEIGHT);
    ctx2d.fillStyle=contrast.matches?'CanvasText':
      document.documentElement.classList.contains('fy-ui2-light')?'#268963':'#7ee5b2';
    for(let i=0;i<BARS;i++){
      // Real FFT amplitudes only. This calm baseline is static, not fake audio.
      const h=live?clamp(levels[i]*HEIGHT,2,HEIGHT):2+(i%5===0?1:0);
      ctx2d.globalAlpha=live?.47+.53*clamp(levels[i]*2,0,1):.48;
      ctx2d.fillRect(i*4,HEIGHT-h,2.6,h);
    }
    ctx2d.globalAlpha=1;
  };
  const stopFrame=()=>{if(raf){cancelAnimationFrame(raf);raf=0;}lastFrame=0;};
  const teardown=()=>{
    epoch++;
    stopFrame();
    if(sourceNode)try{sourceNode.disconnect();}catch{}
    if(analyser)try{analyser.disconnect();}catch{}
    if(context)try{const p=context.close();if(p?.catch)p.catch(()=>{});}catch{}
    stream=null;context=null;sourceNode=null;analyser=null;bins=null;
    captureAttempted=false;streamEventsBound=false;
    levels.fill(0);lastEnergy=0;
    syncMode('idle');draw(false);
  };
  const frame=now=>{
    raf=0;
    if(!permitted()||!isPlaying()||!analyser||!context)return;
    if(lastFrame&&now-lastFrame<33){raf=requestAnimationFrame(frame);return;}
    lastFrame=now;
    try{analyser.getByteFrequencyData(bins);}catch{teardown();return;}
    let max=0,total=0;
    for(let i=0;i<BARS;i++){
      const k=2+Math.floor(i*54/BARS);
      const value=(bins[k]||0)/255;
      max=Math.max(max,value);
      levels[i]=levels[i]*.72+Math.pow(value,.78)*.28;
      total+=levels[i];
    }
    const valid=max>.012&&!audio.muted&&audio.volume>0;
    syncMode(valid?'live':'ambient');
    if(valid){liveFrames++;draw(true);}else draw(false);
    if(valid&&coverOverlay.getAttribute('aria-hidden')!=='true'){
      // Update only the small album column, not the full-page background.
      if(now-lastEnergy>100){
        album.style.setProperty('--fy-audio-energy',clamp(total/BARS,0,1).toFixed(3));
        lastEnergy=now;
      }
    }
    raf=requestAnimationFrame(frame);
  };
  const startFrame=()=>{
    if(raf||!analyser||!permitted()||!isPlaying())return;
    if(context?.state==='suspended')try{context.resume()?.catch(()=>{});}catch{}
    raf=requestAnimationFrame(frame);
  };
  const connectStream=()=>{
    if(!stream||context||!permitted()||!isPlaying())return;
    const tracks=stream.getAudioTracks?.()||[];
    if(!tracks.some(t=>t.readyState==='live'))return;
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    if(!AudioContext)return;
    try{
      const ac=new AudioContext({latencyHint:'playback'});
      const node=ac.createMediaStreamSource(stream);
      const fft=ac.createAnalyser();
      fft.fftSize=256;fft.smoothingTimeConstant=.77;
      // Analysis-only graph. NO connection to ac.destination.
      node.connect(fft);
      context=ac;sourceNode=node;analyser=fft;
      bins=new Uint8Array(fft.frequencyBinCount);
      startFrame();
    }catch{
      if(context)try{context.close()?.catch(()=>{});}catch{}
      context=null;sourceNode=null;analyser=null;bins=null;
      syncMode('ambient');draw(false);
    }
  };
  const attemptCapture=()=>{
    if(captureAttempted||!permitted()||!isPlaying())return;
    captureAttempted=true;
    if(!supportsCapture())return;
    try{
      // captureStream is a tap. It never re-routes native media playback.
      stream=(audio.captureStream||audio.mozCaptureStream).call(audio);
      if(!stream)return;
      if(!streamEventsBound){
        streamEventsBound=true;
        stream.addEventListener?.('addtrack',connectStream);
      }
      connectStream();
    }catch{stream=null;}
  };
  const update=()=>{
    stopFrame();
    if(!isPlaying()||!permitted()){
      syncMode('idle');draw(false);
      if(context?.state==='running')try{context.suspend()?.catch(()=>{});}catch{}
      return;
    }
    syncMode('ambient');draw(false);
    attemptCapture();
    if(analyser)startFrame();
  };
  for(const name of ['play','playing','pause','ended','waiting'])
    audio.addEventListener(name,update,{passive:true});
  for(const name of ['loadstart','emptied'])
    audio.addEventListener(name,teardown,{passive:true});
  for(const name of ['canplay','loadedmetadata'])
    audio.addEventListener(name,update,{passive:true});
  document.addEventListener('visibilitychange',update,{passive:true});
  window.addEventListener('pagehide',teardown,{passive:true});
  window.addEventListener('pageshow',update,{passive:true});
  const listenMedia=query=>{
    if(query.addEventListener)query.addEventListener('change',update);
    else if(query.addListener)query.addListener(update);
  };
  listenMedia(reduce);listenMedia(contrast);listenMedia(desktop);
  document.addEventListener('pointerdown',()=>{
    if(context?.state==='suspended'&&permitted()&&isPlaying())
      try{context.resume()?.catch(()=>{});}catch{}
  },{passive:true});
  const art=new MutationObserver(()=>{if(!coverOverlay.classList.contains('hidden'))update();});
  art.observe(coverOverlay,{attributes:true,attributeFilter:['class','aria-hidden']});
  syncMode('idle');draw(false);update();
  // Public-safe diagnostics: state/integers only, no provider URLs or samples.
  window.FyMusicUI2AudioVisualizer=Object.freeze({
    mode:()=>mode,liveFrames:()=>liveFrames,
    captureAttempted:()=>captureAttempted,
    originalAudio:()=>document.querySelectorAll('audio').length===1,
    spectrumPresent:()=>Boolean(document.getElementById('ui2-audio-spectrum'))
  });
})();
