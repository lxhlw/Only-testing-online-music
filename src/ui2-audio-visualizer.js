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
  // Use the SAME capture-only analyser for both presentation canvases.
  const stage=document.createElement('div');
  stage.id='fy3-immersive-spectrum';
  stage.className='fy3-immersive-spectrum';
  stage.setAttribute('role','img');
  stage.setAttribute('aria-label','静态音频频谱装饰');
  const stageCanvas=document.createElement('canvas');
  stageCanvas.setAttribute('aria-hidden','true');
  stage.append(stageCanvas);
  album.querySelector('.now-playing-cover-box')?.after(stage);
  const ctx2d=canvas.getContext('2d');
  const stageCtx=stageCanvas.getContext('2d');
  if(!ctx2d)return;

  const reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  const contrast=window.matchMedia('(forced-colors: active)');
  const desktop=window.matchMedia('(min-width: 1101px)');
  const BARS=28,BANDS=64;
  const WIDTH=112,HEIGHT=15,SW=440,SH=88;
  const ratio=Math.min(2,Math.max(1,window.devicePixelRatio||1));
  canvas.width=Math.round(WIDTH*ratio);
  canvas.height=Math.round(HEIGHT*ratio);
  ctx2d.setTransform(ratio,0,0,ratio,0,0);
  stageCanvas.width=Math.round(SW*ratio);
  stageCanvas.height=Math.round(SH*ratio);
  stageCtx?.setTransform(ratio,0,0,ratio,0,0);
  const levels=new Float32Array(BANDS),peaks=new Float32Array(BANDS);
  let stream=null,context=null,sourceNode=null,analyser=null,bins=null,wave=null,ranges=null;
  let rms=0,low=0,mid=0,high=0;
  let raf=0,lastFrame=0,lastEnergy=0,mode='idle',liveFrames=0;
  let captureAttempted=false,streamEventsBound=false,epoch=0;
  const isPlaying=()=>!audio.paused&&!audio.ended&&audio.readyState>1;
  const permitted=()=>!document.hidden&&!reduce.matches&&!contrast.matches&&
    (desktop.matches||coverOverlay.getAttribute('aria-hidden')!=='true');
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
    stage.dataset.mode=next;
    stage.setAttribute('aria-label',next==='live'?'实时 64 频段音频频谱与波形':'静态频谱装饰，当前未提供可读取的音频样本');
    if(next!=='live')for(const key of ['--fy-audio-energy','--fy-audio-low','--fy-audio-mid','--fy-audio-high'])
      album.style.removeProperty(key);
  };
  const draw=live=>{
    ctx2d.clearRect(0,0,WIDTH,HEIGHT);
    ctx2d.fillStyle=contrast.matches?'CanvasText':
      document.documentElement.classList.contains('fy-ui2-light')?'#268963':'#7ee5b2';
    for(let i=0;i<BARS;i++){
      // Real FFT amplitudes only. This calm baseline is static, not fake audio.
      const level=levels[Math.round(i*(BANDS-1)/(BARS-1))];
      const h=live?clamp(level*HEIGHT,2,HEIGHT):2+(i%5===0?1:0);
      ctx2d.globalAlpha=live?.47+.53*clamp(level*2,0,1):.48;
      ctx2d.fillRect(i*4,HEIGHT-h,2.6,h);
    }
    ctx2d.globalAlpha=1;
    if(!stageCtx)return;
    stageCtx.clearRect(0,0,SW,SH);
    const light=document.documentElement.classList.contains('fy-ui2-light');
    const grad=stageCtx.createLinearGradient(0,0,SW,0);
    grad.addColorStop(0,light?'#28899c':'#63e7ec');
    grad.addColorStop(.52,light?'#b9588e':'#e87cdb');
    grad.addColorStop(1,light?'#cb8841':'#ffb977');
    stageCtx.fillStyle=grad;
    for(let i=0;i<BANDS;i++){
      const x=3+i*6.76;
      const h=live?3+levels[i]*61:2.5;
      stageCtx.globalAlpha=live?.6+.4*levels[i]:.20;
      stageCtx.fillRect(x,SH-6-h,4,h);
      if(live){stageCtx.globalAlpha=.86;stageCtx.fillRect(x,SH-7-peaks[i]*61,4,1.6);}
    }
    stageCtx.globalAlpha=1;
    if(live&&wave){
      stageCtx.beginPath();
      stageCtx.strokeStyle=light?'rgba(33,105,115,.8)':'rgba(216,255,247,.88)';
      stageCtx.lineWidth=1.6;
      for(let i=0;i<110;i++){
        const n=Math.round(i*(wave.length-1)/109);
        const x=i*SW/109,y=17+(wave[n]-128)/128*(9+clamp(rms*32,0,16));
        if(i===0)stageCtx.moveTo(x,y);else stageCtx.lineTo(x,y);
      }
      stageCtx.stroke();
    }
  };
  const stopFrame=()=>{if(raf){cancelAnimationFrame(raf);raf=0;}lastFrame=0;};
  const teardown=()=>{
    epoch++;
    stopFrame();
    if(sourceNode)try{sourceNode.disconnect();}catch{}
    if(analyser)try{analyser.disconnect();}catch{}
    if(context)try{const p=context.close();if(p?.catch)p.catch(()=>{});}catch{}
    stream=null;context=null;sourceNode=null;analyser=null;bins=null;wave=null;ranges=null;
    captureAttempted=false;streamEventsBound=false;
    levels.fill(0);peaks.fill(0);rms=0;low=0;mid=0;high=0;lastEnergy=0;
    syncMode('idle');draw(false);
  };
  const frame=now=>{
    raf=0;
    const allowed=permitted(),playing=isPlaying();
    if(!allowed||!playing||!analyser||!context){
      // The RAF can observe reduced motion / visibility / pause before a
      // matchMedia or audio event reaches update(). Reconcile the UI mode
      // synchronously so an old live indicator never remains stuck on-screen.
      // This only suspends the independent analysis graph, not native audio.
      if(!allowed||!playing){
        syncMode('idle');draw(false);
        if(context?.state==='running')try{context.suspend()?.catch(()=>{});}catch{}
      }
      return;
    }
    if(lastFrame&&now-lastFrame<33){raf=requestAnimationFrame(frame);return;}
    lastFrame=now;
    try{
      analyser.getByteFrequencyData(bins);
      analyser.getByteTimeDomainData(wave);
    }catch{teardown();return;}
    let power=0;
    for(let i=0;i<wave.length;i+=4){const v=(wave[i]-128)/128;power+=v*v;}
    rms=Math.sqrt(power/Math.ceil(wave.length/4));
    const gain=clamp(.7/Math.max(.09,rms*2.3),1.15,5);
    let max=0,total=0;low=0;mid=0;high=0;
    for(let i=0;i<BANDS;i++){
      const [begin,end]=ranges[i];
      let peak=0;
      for(let k=begin;k<=end;k++)peak=Math.max(peak,bins[k]||0);
      const value=peak/255;max=Math.max(max,value);
      const target=clamp(Math.pow(value,.72)*gain,0,1);
      const attack=target>levels[i]?.53:.13;
      levels[i]+=attack*(target-levels[i]);
      peaks[i]=Math.max(levels[i],peaks[i]-.013);
      total+=levels[i];
      if(i<17)low+=levels[i]/17;
      else if(i<43)mid+=levels[i]/26;
      else high+=levels[i]/21;
    }
    const valid=max>.012&&!audio.muted&&audio.volume>0;
    syncMode(valid?'live':'ambient');
    if(valid){liveFrames++;draw(true);}else draw(false);
    if(valid&&coverOverlay.getAttribute('aria-hidden')!=='true'){
      // Update only the small album column, not the full-page background.
      if(now-lastEnergy>100){
        album.style.setProperty('--fy-audio-energy',clamp(rms*1.8+total/BANDS*.8,0,1).toFixed(3));
        album.style.setProperty('--fy-audio-low',clamp(low,0,1).toFixed(3));
        album.style.setProperty('--fy-audio-mid',clamp(mid,0,1).toFixed(3));
        album.style.setProperty('--fy-audio-high',clamp(high,0,1).toFixed(3));
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
    let pendingContext=null;
    try{
      const ac=new AudioContext({latencyHint:'playback'});
      pendingContext=ac;
      const node=ac.createMediaStreamSource(stream);
      const fft=ac.createAnalyser();
      fft.fftSize=2048;fft.smoothingTimeConstant=.65;
      // Analysis-only graph. NO connection to ac.destination.
      node.connect(fft);
      context=ac;sourceNode=node;analyser=fft;
      bins=new Uint8Array(fft.frequencyBinCount);
      wave=new Uint8Array(fft.fftSize);
      const nyquist=ac.sampleRate/2;
      ranges=Array.from({length:BANDS},(_,i)=>{
        const min=45,max=Math.min(14000,nyquist*.93);
        const left=min*Math.pow(max/min,i/BANDS);
        const right=min*Math.pow(max/min,(i+1)/BANDS);
        const a=clamp(Math.floor(left/nyquist*bins.length),1,bins.length-1);
        const b=clamp(Math.ceil(right/nyquist*bins.length),a,bins.length-1);
        return [a,b];
      });
      startFrame();
    }catch{
      // If source creation fails before assignment, the newly allocated context
      // must still be closed; otherwise uncapturable providers leak contexts.
      if(pendingContext)try{pendingContext.close()?.catch(()=>{});}catch{}
      context=null;sourceNode=null;analyser=null;bins=null;wave=null;ranges=null;
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
    spectrumPresent:()=>Boolean(document.getElementById('ui2-audio-spectrum')),
    immersivePresent:()=>Boolean(document.getElementById('fy3-immersive-spectrum')),
    bands:()=>BANDS,rms:()=>Number(rms.toFixed(3))
  });
})();
