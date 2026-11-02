import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';

// RAW DevTools Protocol, not Playwright-managed pages: Playwright forces
// pages focused and can suppress real hidden/visible transitions.
// Requires headed Chromium under Xvfb (not a real phone lockscreen).
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class CDP{
  constructor(ws){
    this.ws=ws;this.id=0;this.pending=new Map();this.listeners=new Map();
    ws.addEventListener('message',event=>{
      let msg;try{msg=JSON.parse(String(event.data))}catch{return}
      if(msg.id){
        const p=this.pending.get(msg.id);if(!p)return;
        clearTimeout(p.timer);this.pending.delete(msg.id);
        if(msg.error)p.reject(Error(msg.error.message));
        else p.resolve(msg.result||{});
      }else if(msg.method)for(const fn of this.listeners.get(msg.method)||[])fn(msg.params||{});
    });
  }
  static async open(url){
    const ws=new WebSocket(url);
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('CDP websocket connect timeout')),7000);
      ws.addEventListener('open',()=>{clearTimeout(timer);resolve()},{once:true});
      ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('CDP websocket error'))},{once:true});
    });
    return new CDP(ws);
  }
  send(method,params={},ms=12000){
    const id=++this.id;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);
        reject(Error('CDP timeout '+method))},ms);
      this.pending.set(id,{resolve,reject,timer});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  on(method,fn){
    const list=this.listeners.get(method)||[];
    list.push(fn);this.listeners.set(method,list);
  }
  close(){try{this.ws.close()}catch{}}
}
async function waitFor(fn,label,ms=12000){
  const start=Date.now();let last;
  while(Date.now()-start<ms){
    try{const result=await fn();if(result)return result}
    catch(e){last=e}
    await delay(100);
  }
  throw Error('Timed out waiting for '+label+(last?' : '+last.message:''));
}
assert.ok(process.env.DISPLAY,'Headed Xvfb is mandatory for genuine visibility test');
const profile=await mkdtemp(path.join(os.tmpdir(),'fymusic-phase35-'));
let processChrome,browser,page;
const http=[],errors=[];
try{
  processChrome=spawn(chromium.executablePath(),[
    '--no-sandbox','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check',
    '--remote-allow-origins=*','--remote-debugging-port=0',
    '--user-data-dir='+profile,
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1366,900','about:blank'
  ],{stdio:'ignore'});
  processChrome.on('error',error=>errors.push(error.message));
  const port=await waitFor(async()=>{
    const raw=await readFile(path.join(profile,'DevToolsActivePort'),'utf8');
    return Number(raw.split('\n')[0])||null;
  },'Chrome DevToolsActivePort',16000);
  const version=await (await fetch('http://127.0.0.1:'+port+'/json/version')).json();
  browser=await CDP.open(version.webSocketDebuggerUrl);
  const id=(await browser.send('Target.createTarget',{url:'about:blank'})).targetId;
  assert.ok(id);
  page=await CDP.open('ws://127.0.0.1:'+port+'/devtools/page/'+id);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Network.enable');
  page.on('Runtime.exceptionThrown',ev=>{
    if(errors.length<8)errors.push(String(ev.exceptionDetails?.text||'exception'));
  });
  page.on('Network.responseReceived',ev=>{
    if(!ev.response?.url?.includes('/api/fymusic-codec-selftest?'))return;
    const url=new URL(ev.response.url);
    http.push({format:url.searchParams.get('format'),status:ev.response.status});
  });
  await page.send('Page.addScriptToEvaluateOnNewDocument',{source:String.raw`
    (() => {
      window.__phase30={visibility:[],resolver:[],tracks:[]};
      document.addEventListener('visibilitychange',()=>{
        window.__phase30.visibility.push(document.visibilityState);
      });
      const os={handlers:{},metadata:null,states:[],
        setActionHandler(n,f){this.handlers[n]=f},
        setPositionState(){},
        set playbackState(s){this.states.push(s)},
        get playbackState(){return this.states.at(-1)||'none'}
      };
      Object.defineProperty(navigator,'mediaSession',{configurable:true,value:os});
      window.MediaMetadata=class{constructor(v){Object.assign(this,v)}};
      window.__phase30OS=os;
      const originalFetch=window.fetch.bind(window);
      window.fetch=(url,options)=>{
        const value=String(url instanceof Request?url.url:url);
        if(value.startsWith('/api/netease-song-meta?')){
          const id=new URL(value,location.href).searchParams.get('id');
          return Promise.resolve(new Response(JSON.stringify({id}),
            {status:200,headers:{'content-type':'application/json'}}));
        }
        return originalFetch(url,options);
      };
    })();
  `});
  await page.send('Emulation.setDeviceMetricsOverride',{
    width:390,height:844,deviceScaleFactor:1,mobile:true
  });
  await page.send('Emulation.setTouchEmulationEnabled',{
    enabled:true,maxTouchPoints:1
  });
  await page.send('Page.navigate',{url:BASE});
  async function evaluate(expr){
    const response=await page.send('Runtime.evaluate',{
      expression:expr,returnByValue:true,awaitPromise:true
    });
    if(response.exceptionDetails)throw Error('Page JS '+(response.exceptionDetails.exception?.description||response.exceptionDetails.text));
    return response.result?.value;
  }
  const snapshot=()=>evaluate(String.raw`(()=>{
    const a=document.querySelector('#audio'),q=window.__phase30||{};
    return {visibility:document.visibilityState,hidden:document.hidden,
      events:q.visibility||[],seconds:Number(a?.currentTime||0),
      paused:Boolean(a?.paused),src:a?.currentSrc||'',ready:a?.readyState||0,
      mediaError:a?.error?.code||0,
      title:window.__LXNowPlayingTrack?.name||'',
      osTitle:window.__phase30OS?.metadata?.title||'',
      audioElements:document.querySelectorAll('audio').length,
      overlay:document.querySelector('#lyrics-overlay')?.getAttribute('aria-hidden'),
      seekHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden')
    }
  })()`);
  await waitFor(()=>evaluate(String.raw`Boolean(
    window.LXSourceManager?.getActive&&window.LXPlaySettings?.save&&
    window.LXMusicSearch?.search&&window.LXPlayerControls?.refresh&&
    window.__phase30OS?.handlers?.pause&&document.querySelector('#audio')
  )`),'live FyMusic application',22000);
  const selected=await evaluate(String.raw`(()=>{
    window.LXPlaySettings.save({
      qualityMode:'fixed',fixedQuality:'flac24bit',autoFallback:false
    });
    const active={id:'phase30-original',name:'Phase30 Controlled',
      inited:true,runtime:{},
      sources:{wy:{name:'网易云音乐',actions:['musicUrl'],
        qualitys:['flac24bit','320k','128k']}}
    };
    window.LXSourceManager.getActive=()=>active;
    window.LXSourceManager.requestAction=(source,action,info,cb)=>{
      window.__phase30.resolver.push({
        source,quality:info.type,id:String(info.musicInfo?.id||'')
      });
      if(source!=='wy'||action!=='musicUrl')throw Error('wrong provider');
      cb(null,{url:location.origin+
        '/api/fymusic-codec-selftest?format=flac24&mode=normal'});
    };
    window.LXMusicSearch.search=(source,keyword,pg,limit,cb)=>cb(null,{
      list:[{id:'930',source:'wy',name:'Original Real Hidden FLAC',
        singer:'FyMusic QA',albumName:'Original Album',interval:'00:12'}],
      searchProvider:'netease-native'
    });
    window.LXMusicSearch.isPlayableUrlForSource=(source,url)=>
      source==='wy'&&new URL(url).pathname==='/api/fymusic-codec-selftest';
    const channel=document.querySelector('#channel-list .channel-button[title="WY"]');
    if(!channel)throw Error('WY channel button unavailable');
    channel.click();
    document.querySelector('#global-search-input').value='Original Real Hidden FLAC';
    document.querySelector('#global-search-btn').click();
    const row=document.querySelector('.search-song-row .search-song-main');
    if(!row)throw Error('search row not rendered');
    row.click();
    return window.__phase30.resolver;
  })()`);
  assert.deepEqual(selected,[{source:'wy',quality:'flac24bit',id:'930'}]);
  const started=await waitFor(async()=>{
    const s=await snapshot();
    return s.seconds>.6&&s.src.includes('format=flac24')&&
      s.ready>=2&&!s.paused?s:null;
  },'real FLAC audio playback',15000);
  assert.equal(started.visibility,'visible');
  assert.equal(started.title,'Original Real Hidden FLAC');
  assert.equal(started.osTitle,'Original Real Hidden FLAC');
  assert.equal(started.audioElements,1);
  assert.equal(started.mediaError,0);
  assert.ok(http.some(x=>x.format==='flac24'&&x.status===206));
  // A decoded, confirmed track must make its real seek UI available.
  // Do not silently skip the cancellation assertion on a slow CI run.
  await waitFor(()=>evaluate(String.raw`(()=>{
    const a=document.querySelector('#audio');
    return Boolean(a&&a.duration>0&&!a.paused&&
      !document.querySelector('#player-seek')?.disabled);
  })()`),'real seek enabled after playing confirmation',4000);


  // Real background tab with Chromium touch emulation, not a real phone.
  await evaluate('document.querySelector("#player-cover-button").click();true');
  await waitFor(()=>evaluate('document.querySelector("#lyrics-overlay")?.getAttribute("aria-hidden")==="false" && !document.querySelector("#detail-seek")?.disabled'),'immersive screen ready',4000);
  await evaluate('window.__phase30OS.handlers.pause();true');
  await waitFor(async()=>{const s=await snapshot();return s.paused?s:null},
    'paused real FLAC before touch drag',4000);
  await evaluate("(()=>{\n  const slider=document.querySelector('#detail-seek');\n  const native=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');\n  const audio=document.querySelector('#audio');\n  window.__phase35={events:[],writes:[]};\n  Object.defineProperty(audio,'currentTime',{configurable:true,\n    get(){return native.get.call(this)},\n    set(v){window.__phase35.writes.push(Number(v));return native.set.call(this,v)}\n  });\n  const log=(type,e)=>{window.__phase35.events.push({\n    type,trusted:e?.isTrusted??null,value:slider.value,\n    hidden:document.hidden,focused:document.hasFocus(),\n    time:Math.round(performance.now()*10)/10\n  });if(window.__phase35.events.length>120)window.__phase35.events.shift()};\n  for(const type of ['pointerdown','pointermove','pointerup','pointercancel',\n     'touchstart','touchmove','touchend','touchcancel','input','change'])\n    slider.addEventListener(type,e=>log(type,e));\n  for(const type of ['blur','focus'])\n    window.addEventListener(type,e=>log('window:'+type,e),true);\n  document.addEventListener('visibilitychange',e=>log('visibility:'+document.visibilityState,e));\n  return true;\n})()");
  const rect=await evaluate("(()=>{\n  const s=document.querySelector('#detail-seek'),r=s.getBoundingClientRect();\n  return {x:r.x,y:r.y,w:r.width,h:r.height,disabled:s.disabled,\n    overlay:document.querySelector('#lyrics-overlay').getAttribute('aria-hidden')};\n})()");
  assert.ok(rect.w>80&&rect.h>=20&&!rect.disabled&&rect.overlay==='false',
    'real immersive mobile range bounds');
  const x=rect.x+rect.w*.17,y=rect.y+rect.h/2;
  const touch=(type,points)=>page.send('Input.dispatchTouchEvent',
     {type,touchPoints:points});
  await touch('touchStart',[{x,y,id:11}]);
  for(let i=1;i<=7;i++){
    await touch('touchMove',[{x:x+(rect.x+rect.w*.90-x)*i/7,y,id:11}]);
  }
  const held=await evaluate("(()=>{\n const a=document.querySelector('#audio'),s=document.querySelector('#detail-seek');\n const z=window.__phase35;\n return {hidden:document.hidden,focused:document.hasFocus(),\n  visibility:document.visibilityState,seconds:a.currentTime,paused:a.paused,\n  writes:z.writes.slice(),value:s.value,trace:z.events.slice(-34),\n  previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),\n  overlay:document.querySelector('#lyrics-overlay')?.getAttribute('aria-hidden'),\n  audioCount:document.querySelectorAll('audio').length,\n  title:window.__LXNowPlayingTrack?.name,\n  osTitle:window.__phase30OS?.metadata?.title};\n})()");
  console.log('FYMUSIC_PHASE35_TOUCH_HELD '+JSON.stringify(held));
  assert.ok(held.trace.some(e=>e.type==='touchstart'&&e.trusted));
  assert.ok(held.trace.some(e=>e.type==='input'&&e.trusted));
  assert.equal(held.previewHidden,false);
  assert.deepEqual(held.writes,[]);
  const spare=(await browser.send('Target.createTarget',{url:'about:blank'})).targetId;
  await waitFor(async()=>{const s=await snapshot();
    return s.hidden&&s.visibility==='hidden'&&s.events.includes('hidden')?s:null;},
    'native browser hidden during real touched range',7000);
  const background=await evaluate("(()=>{\n const a=document.querySelector('#audio'),s=document.querySelector('#detail-seek');\n const z=window.__phase35;\n return {hidden:document.hidden,focused:document.hasFocus(),\n  visibility:document.visibilityState,seconds:a.currentTime,paused:a.paused,\n  writes:z.writes.slice(),value:s.value,trace:z.events.slice(-34),\n  previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),\n  overlay:document.querySelector('#lyrics-overlay')?.getAttribute('aria-hidden'),\n  audioCount:document.querySelectorAll('audio').length,\n  title:window.__LXNowPlayingTrack?.name,\n  osTitle:window.__phase30OS?.metadata?.title};\n})()");
  console.log('FYMUSIC_PHASE35_TRUE_HIDDEN_TOUCH '+JSON.stringify(background));
  assert.equal(background.previewHidden,true,'native hidden cancels immersive preview');
  assert.deepEqual(background.writes,[],
    'unfinished touch must not seek during native background transition');
  assert.ok(Math.abs(background.seconds-held.seconds)<.2);
  await browser.send('Target.activateTarget',{targetId:id});
  await waitFor(async()=>{const s=await snapshot();
    return !s.hidden&&s.visibility==='visible'&&s.events.includes('visible')?s:null;},
    'native foreground after touch interruption',7000);
  await touch('touchEnd',[]);
  const after=await evaluate("(()=>{\n const a=document.querySelector('#audio'),s=document.querySelector('#detail-seek');\n const z=window.__phase35;\n return {hidden:document.hidden,focused:document.hasFocus(),\n  visibility:document.visibilityState,seconds:a.currentTime,paused:a.paused,\n  writes:z.writes.slice(),value:s.value,trace:z.events.slice(-34),\n  previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),\n  overlay:document.querySelector('#lyrics-overlay')?.getAttribute('aria-hidden'),\n  audioCount:document.querySelectorAll('audio').length,\n  title:window.__LXNowPlayingTrack?.name,\n  osTitle:window.__phase30OS?.metadata?.title};\n})()");
  console.log('FYMUSIC_PHASE35_RETURN_AND_TOUCH_END '+JSON.stringify(after));
  assert.deepEqual(after.writes,[],
    'old touch release after true background cannot write audio.currentTime');
  assert.ok(Math.abs(after.seconds-background.seconds)<.2);
  assert.equal(after.audioCount,1);
  assert.equal(after.title,'Original Real Hidden FLAC');
  assert.equal(after.osTitle,'Original Real Hidden FLAC');
  assert.equal(after.paused,true);
  assert.equal(http.filter(q=>q.format==='flac24').length,1);
  // A genuinely new physical touch should still be able to commit.
  const fresh=await evaluate("(()=>{\n  const s=document.querySelector('#detail-seek'),r=s.getBoundingClientRect();\n  return {x:r.x,y:r.y,w:r.width,h:r.height,disabled:s.disabled,\n    overlay:document.querySelector('#lyrics-overlay').getAttribute('aria-hidden')};\n})()");
  assert.ok(!fresh.disabled,'new touch seek enabled after foreground');
  const nx=fresh.x+fresh.w*.25,ny=fresh.y+fresh.h/2;
  await touch('touchStart',[{x:nx,y:ny,id:12}]);
  for(let i=1;i<=5;i++)await touch('touchMove',
    [{x:nx+(fresh.x+fresh.w*.45-nx)*i/5,y:ny,id:12}]);
  await touch('touchEnd',[]);
  const valid=await evaluate("(()=>{\n const a=document.querySelector('#audio'),s=document.querySelector('#detail-seek');\n const z=window.__phase35;\n return {hidden:document.hidden,focused:document.hasFocus(),\n  visibility:document.visibilityState,seconds:a.currentTime,paused:a.paused,\n  writes:z.writes.slice(),value:s.value,trace:z.events.slice(-34),\n  previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),\n  overlay:document.querySelector('#lyrics-overlay')?.getAttribute('aria-hidden'),\n  audioCount:document.querySelectorAll('audio').length,\n  title:window.__LXNowPlayingTrack?.name,\n  osTitle:window.__phase30OS?.metadata?.title};\n})()");
  console.log('FYMUSIC_PHASE35_NEW_TOUCH_SEEK '+JSON.stringify(valid));
  assert.equal(valid.writes.length,1,
    'new real touch must retain its valid native seek commit');
  assert.ok(valid.seconds>after.seconds+2,'new touch seeks true native media');
  assert.deepEqual(errors,[]);
  console.log('FYMUSIC_PHASE35_TRUE_MOBILE_HIDDEN_TOUCH_PASS '+JSON.stringify({
    actualHidden:true,actualForeground:true,trustedTouch:true,
    oldDragCancelled:true,newTouchWorked:true,noDuplicatedMedia:true,
    originalFlacHttp206:true,singleAudio:true,
    noPhysicalPhoneLockscreenClaim:true
  }));
}finally{
  page?.close();browser?.close();
  if(processChrome){
    processChrome.kill('SIGTERM');
    await Promise.race([new Promise(ok=>processChrome.once('exit',ok)),delay(900)]);
    if(processChrome.exitCode===null)processChrome.kill('SIGKILL');
  }
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}