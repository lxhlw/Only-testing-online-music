/* FyMusic UI3 Stage A: independent GPU-only cinematic scenes, no media/network ownership. */
(() => {
  'use strict';
  if(new URLSearchParams(location.search).get('ui2')==='0')return;
  const root=document.documentElement;
  if(!root.classList.contains('fy-ui2'))return;
  const container=document.querySelector('.view-container');
  const overlay=document.getElementById('lyrics-overlay');
  const album=overlay?.querySelector('.now-playing-album-column');
  if(!container||!overlay||!album)return;
  const scenes=Object.freeze({search:0,playlist:1,ranking:2,mylist:3,immersive:4});
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const highContrast=matchMedia('(forced-colors: active)');
  const vertex=['#version 300 es','in vec2 a_pos;',
    'void main(){gl_Position=vec4(a_pos,0.,1.);}'].join('\n');
  const fragment=[
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 u_res,u_mouse;',
    'uniform float u_time,u_scene,u_light,u_energy,u_impact,u_audio_live;',
    'uniform vec3 u_bands;',
    'out vec4 color;',
    'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float glow(float x,float w){return exp(-pow(x/max(w,.001),2.));}',
    'void main(){',
    ' vec2 q=(gl_FragCoord.xy-.5*u_res)/max(u_res.y,1.);',
    ' q-=u_mouse*.09;',
    ' float t=u_time,field=0.,flicker=0.,spark=0.;',
    ' int type=int(u_scene+.5);',
    ' vec3 base=vec3(.025,.075,.11),a=vec3(.1,.93,.78),b=vec3(.6,.32,1.);',
    ' if(type==0){',
    '  // Search: weightless aurora and illuminated ribbons.',
    '  base=vec3(.026,.076,.14);a=vec3(.09,.95,.79);b=vec3(.62,.34,.99);',
    '  float w=q.y-.2*sin(q.x*2.8+t*.3)-.1*sin(q.x*7.-t*.17);',
    '  field=glow(w,.22)+.56*glow(q.y+.23*cos(q.x*2.-t*.2),.18);',
    '  flicker=glow(w,.045);',
    '  spark=step(.994,h(floor(gl_FragCoord.xy/vec2(11.,8.))))*.32;',
    ' } else if(type==1){',
    '  // Playlists: intersecting electronic resonance rings.',
    '  base=vec3(.048,.059,.16);a=vec3(.09,.85,.96);b=vec3(.98,.25,.66);',
    '  float d=length((q-vec2(.42,.04))*vec2(1.1,.9));',
    '  field=pow(max(sin(d*22.-t*1.8),0.),4.)*.95;',
    '  flicker=glow(q.y-.12*sin(q.x*7.+t*.95),.058);',
    '  spark=glow(d-.55,.12)*.22;',
    ' } else if(type==2){',
    '  // Rankings: fast golden streaks and heat-grid energy.',
    '  base=vec3(.17,.055,.08);a=vec3(1.,.64,.2);b=vec3(.99,.29,.46);',
    '  float r=q.x*.76+q.y*1.62-t*.48;',
    '  field=pow(max(sin(r*11.),0.),9.);',
    '  flicker=glow(q.y-.15*sin(q.x*8.-t*.7),.09);',
    '  spark=pow(max(sin(r*27.),0.),24.)*.24;',
    ' } else if(type==3){',
    '  // Library: amber analog glow and softly floating vinyl-room bokeh.',
    '  base=vec3(.14,.068,.065);a=vec3(.96,.49,.27);b=vec3(.98,.75,.51);',
    '  field=glow(length(q-vec2(.27,.1)),.64)*.85;',
    '  flicker=glow(length(fract(q*vec2(4.4,2.5)+vec2(0.,t*.01))-.5)-.13,.07)*.62;',
    '  spark=(h(gl_FragCoord.xy*.25)-.5)*.08;',
    ' }else{',
    '  // Immersive: separate real bass/mid/treble controls for three optical layers.',
    '  // Without capturable samples, u_audio_live=0 keeps atmospheric motion independent.',
    '  base=vec3(.021,.07,.085);a=vec3(.21,.99,.76);b=vec3(.62,.39,1.);',
    '  float bass=u_bands.x*u_audio_live,mid=u_bands.y*u_audio_live,treble=u_bands.z*u_audio_live;',
    '  float hit=u_impact*u_audio_live;',
    '  float d=length(q*vec2(1.,1.12));',
    '  float angle=atan(q.y,q.x);',
    '  float shape=sin(angle*(8.+mid*3.)+t*.4)*(.014+.045*mid);',
    '  // Bass expands the principal halo and brightens the deep inner ring.',
    '  field=glow(d-.48-.15*bass-shape,.17+.035*bass);',
    '  field+=glow(d-.25-.09*bass,.047+.020*bass)*(.18+.88*bass);',
    '  // Mids increase wavelength and modulation of the filament comb.',
    '  flicker=pow(max(sin(d*(21.+11.*mid)-t*(.7+1.2*mid)-mid*2.6),0.),7.)*(.31+.57*mid);',
    '  // Highs illuminate fine star dust; onsets drive a short outer shock ring.',
    '  float dust=step(.997-treble*.002,h(floor(gl_FragCoord.xy/vec2(9.,9.))));',
    '  spark=glow(d-.83-.22*hit,.065+.028*hit)*(.19+.92*hit);',
    '  spark+=dust*glow(d-.72,.48)*(.05+.44*treble);',
    ' }',
    ' float breathe=.92+.08*sin(t*.66+q.x*1.1);',
    ' vec3 shade=base+a*(field*.59*breathe+flicker*.29)+b*(flicker*.4+field*.18)+spark*a;',
    ' if(u_light>.5){',
    '  vec3 paper=type==3?vec3(.99,.945,.901):type==2?vec3(.995,.949,.915):',
    '    type==1?vec3(.92,.945,.995):vec3(.928,.978,.968);',
    '  shade=mix(paper,clamp(shade*1.55+a*.22,0.,1.),clamp(field*.32+flicker*.2+spark*.16,.07,.45));',
    ' }',
    ' color=vec4(clamp(shade,0.,1.),1.);',
    '}'
  ].join('\n');
  let header=null,immersive=null,view='search',raf=0;
  let sceneTransitions=0,overlayTransitions=0;
  let mx=0,my=0,px=0,py=0;
  const disabled=()=>motion.matches||highContrast.matches;
  const active=()=>container.querySelector('.view-panel.active');
  const visible=()=>!overlay.classList.contains('hidden')&&overlay.getAttribute('aria-hidden')!=='true';
  function create(parent,kind){
    const canvas=document.createElement('canvas');
    canvas.className='fy3-scene fy3-scene-'+kind;
    canvas.setAttribute('aria-hidden','true');
    parent.prepend(canvas);
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,
      stencil:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
    if(!gl){canvas.remove();return null;}
    function compile(type,src){
      const shader=gl.createShader(type);
      gl.shaderSource(shader,src);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('GL shader compile failed');
      return shader;
    }
    try{
      const vs=compile(gl.VERTEX_SHADER,vertex);
      const fs=compile(gl.FRAGMENT_SHADER,fragment);
      const prog=gl.createProgram();
      gl.attachShader(prog,vs);gl.attachShader(prog,fs);gl.linkProgram(prog);
      gl.deleteShader(vs);gl.deleteShader(fs);
      if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error('GL link failed');
      const buf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buf);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const loc=gl.getAttribLocation(prog,'a_pos');gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
      const u={};
      for(const n of ['u_res','u_mouse','u_time','u_scene','u_light',
        'u_energy','u_bands','u_impact','u_audio_live'])
        u[n]=gl.getUniformLocation(prog,n);
      canvas.addEventListener('webglcontextlost',e=>{
        e.preventDefault();stop();root.classList.remove('fy3-gpu');
      });
      return {canvas,gl,prog,u};
    }catch{
      canvas.remove();return null;
    }
  }
  function syncStage(){
    const section=active();
    const next=section?.id?.slice(5)||'search';
    const parent=section?.querySelector('.view-header');
    if(!parent)return;
    const previous=view;
    view=Object.prototype.hasOwnProperty.call(scenes,next)?next:'search';
    // No navigation handler interception: animate only the existing active
    // section after the app has already switched it. No duplicated content.
    if(previous!==view&&!disabled()&&section.animate){
      sceneTransitions++;
      for(const [i,target] of [parent,
        section.querySelector(':scope > .sub-toolbar, :scope > .playlist-filter-stack, :scope > .ranking-source-switch, :scope > .music-library-workspace')].entries()){
        if(!target)continue;
        target.animate([{opacity:.54,transform:'translate3d(0,12px,0)'},
          {opacity:1,transform:'translate3d(0,0,0)'}],
          {duration:i?380:470,delay:i?65:0,easing:'cubic-bezier(.2,.78,.2,1)'});
      }
    }
    if(!header)header=create(parent,'header');
    else if(header.canvas.parentElement!==parent)parent.prepend(header.canvas);
    // Reuse one GPU context across all view changes. Repeated allocation
    // would otherwise cause browser context eviction during long sessions.
    root.dataset.fy3Scene=view;
    root.classList.toggle('fy3-gpu',Boolean(header));
  }
  const silent=Object.freeze({live:false,low:0,mid:0,high:0,rms:0,onset:0,count:0});
  let lastAudio=silent;
  const readEnvelope=()=>{
    if(!visible()||disabled())return silent;
    const value=window.FyMusicUI2AudioVisualizer?.envelope?.();
    if(!value||value.live!==true)return silent;
    const n=v=>Math.max(0,Math.min(1,Number.isFinite(v)?v:0));
    return {live:true,low:n(value.low),mid:n(value.mid),high:n(value.high),
      rms:n(value.rms),onset:n(value.onset),count:Math.max(0,Math.floor(value.count||0))};
  };
  function draw(info,type,t,audio){
    if(!info)return;
    const {canvas,gl,prog,u}=info;
    const r=canvas.getBoundingClientRect();
    if(r.width<4||r.height<4)return;
    const dpr=Math.min(2,devicePixelRatio||1);
    const w=Math.max(2,Math.floor(r.width*dpr)),h=Math.max(2,Math.floor(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){
      canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);
    }
    gl.useProgram(prog);gl.uniform2f(u.u_res,w,h);
    gl.uniform2f(u.u_mouse,px,py);gl.uniform1f(u.u_time,t);
    gl.uniform1f(u.u_scene,scenes[type]);
    gl.uniform1f(u.u_light,root.classList.contains('fy-ui2-light')?1:0);
    gl.uniform1f(u.u_energy,audio.live?audio.rms:0);
    gl.uniform3f(u.u_bands,audio.low,audio.mid,audio.high);
    gl.uniform1f(u.u_impact,audio.onset);
    gl.uniform1f(u.u_audio_live,audio.live?1:0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  function frame(now){
    raf=0;
    if(document.hidden||highContrast.matches)return;
    px+=(mx-px)*.048;py+=(my-py)*.048;
    const t=motion.matches?0:now*.001;
    draw(header,view,t,silent);
    lastAudio=readEnvelope();
    if(visible()){
      // These uniforms always come from a capture-only analyser snapshot.
      // No CSS recalc per GPU frame and no fake spectrum for opaque audio.
      draw(immersive,'immersive',t,lastAudio);
    }
    if(!motion.matches)raf=requestAnimationFrame(frame);
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
  function update(){
    syncStage();syncOverlayEntrance();stop();
    if(!document.hidden&&!highContrast.matches)raf=requestAnimationFrame(frame);
  }
  immersive=create(album,'immersive');
  // A subtle scene entrance can animate a music overlay only when opening.
  // The overlay and native transport handlers stay owned by the app.
  let wasVisible=visible();
  const syncOverlayEntrance=()=>{
    const nowVisible=visible();
    if(nowVisible&&!wasVisible&&!disabled()){
      const cover=album.querySelector('.now-playing-cover-box');
      if(cover?.animate){
        overlayTransitions++;
        cover.animate([{opacity:.66,transform:'translate3d(0,13px,0) scale(.974)'},
          {opacity:1,transform:'translate3d(0,0,0) scale(1)'}],
          {duration:540,easing:'cubic-bezier(.16,.82,.22,1)'});
      }
    }
    wasVisible=nowVisible;
  };
  const changed=new MutationObserver(update);
  changed.observe(container,{subtree:true,attributes:true,attributeFilter:['class']});
  changed.observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']});
  changed.observe(root,{attributes:true,attributeFilter:['class']});
  window.addEventListener('pointermove',e=>{
    mx=e.clientX/Math.max(1,innerWidth)-.5;
    my=e.clientY/Math.max(1,innerHeight)-.5;
  },{passive:true});
  for(const event of ['resize','pageshow'])window.addEventListener(event,update,{passive:true});
  window.addEventListener('pagehide',stop,{passive:true});
  document.addEventListener('visibilitychange',update,{passive:true});
  for(const q of [motion,highContrast]){
    if(q.addEventListener)q.addEventListener('change',update);
    else q.addListener?.(update);
  }
  update();
  // Public-safe diagnostic exposes only scene identity and GPU status.
  window.FyMusicCinematic=Object.freeze({
    enabled:()=>Boolean(header),scene:()=>view,
    gpu:()=>Boolean(header?.gl),reducedMotion:()=>disabled(),
    transitionCounts:()=>Object.freeze({scene:sceneTransitions,overlay:overlayTransitions}),
    // Introspection contains only normalized signal magnitudes.
    audioReactive:()=>visible()&&!disabled()?{...lastAudio}:{...silent}
  });
})();