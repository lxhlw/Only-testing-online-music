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
    'uniform float u_time,u_scene,u_light,u_energy;',
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
    '  // Immersive: album-centered energy nebula, sourced from available audio envelope.',
    '  base=vec3(.021,.07,.085);a=vec3(.21,.99,.76);b=vec3(.62,.39,1.);',
    '  float d=length(q*vec2(1.,1.12));',
    '  field=glow(d-.48-.10*u_energy,.18);',
    '  flicker=pow(max(sin(d*21.-t*.7-u_energy*2.8),0.),7.)*.48;',
    '  spark=glow(d-.86,.055)*.32;',
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
      for(const n of ['u_res','u_mouse','u_time','u_scene','u_light','u_energy'])
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
    view=Object.prototype.hasOwnProperty.call(scenes,next)?next:'search';
    if(!header||header.canvas.parentElement!==parent){
      header?.canvas.remove();header=create(parent,'header');
    }
    root.dataset.fy3Scene=view;
    root.classList.toggle('fy3-gpu',Boolean(header));
  }
  function draw(info,type,t,energy){
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
    gl.uniform1f(u.u_energy,energy);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  function frame(now){
    raf=0;
    if(document.hidden||highContrast.matches)return;
    px+=(mx-px)*.048;py+=(my-py)*.048;
    const t=motion.matches?0:now*.001;
    draw(header,view,t,0);
    if(visible()){
      // The existing analyser sets this value only for real capturable energy.
      const raw=getComputedStyle(album).getPropertyValue('--fy-audio-energy');
      const energy=Math.max(0,Math.min(1,parseFloat(raw)||0));
      draw(immersive,'immersive',t,energy);
    }
    if(!motion.matches)raf=requestAnimationFrame(frame);
  }
  function stop(){if(raf)cancelAnimationFrame(raf);raf=0;}
  function update(){
    syncStage();stop();
    if(!document.hidden&&!highContrast.matches)raf=requestAnimationFrame(frame);
  }
  immersive=create(album,'immersive');
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
    gpu:()=>Boolean(header?.gl),reducedMotion:()=>disabled()
  });
})();