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
const profile=await mkdtemp(path.join(os.tmpdir(),'fymusic-phase31-'));
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
      // Phase31 observes the actual application state through the real controls'
      // existing getState callback; never mutates the underlying state.
      let playerControls;
      Object.defineProperty(window,'LXPlayerControls',{
        configurable:true,
        get(){return playerControls},
        set(value){
          playerControls=value;
          const originalInit=value.init;
          value.init=function(element,options){
            window.__phase31GetState=options.getState;
            return originalInit.apply(this,arguments);
          };
        }
      });
      window.__phase31Trace=[];
      window.__phase31Record=(event)=>{
        const state=window.__phase31GetState?.();
        const a=document.querySelector('#audio');
        const base=document.querySelector('#player-seek');
        const entry={event,t:Math.round(performance.now()),
          seconds:Number(a?.currentTime||0),ready:a?.readyState||0,
          duration:Number(a?.duration||0),paused:Boolean(a?.paused),
          stateToken:state?.token??null,statePresent:Boolean(state),
          stateWaiting:state?.waitingForAudio??null,
          statePlaying:state?.playing??null,stateUrlPresent:Boolean(state?.url),
          stateSource:state?.source||'',baseDisabled:base?.disabled??null};
        window.__phase31Trace.push(entry);
        if(window.__phase31Trace.length>75)window.__phase31Trace.shift();
        return entry;
      };
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
      seekHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),
      phase31:window.__phase31Record?.('snapshot'),
      detailDisabled:document.querySelector('#detail-seek')?.disabled
    }
  })()`);
  await waitFor(()=>evaluate(String.raw`Boolean(
    window.LXSourceManager?.getActive&&window.LXPlaySettings?.save&&
    window.LXMusicSearch?.search&&window.LXPlayerControls?.refresh&&
    window.__phase30OS?.handlers?.pause&&document.querySelector('#audio')
  )`),'live FyMusic application',22000);
  await evaluate(String.raw`(()=>{
    const a=document.querySelector('#audio');
    for(const kind of ['loadstart','loadedmetadata','durationchange','playing',
      'timeupdate','waiting','pause','emptied','error']){
      a.addEventListener(kind,()=>window.__phase31Record('media:'+kind));
    }
    window.__phase31Record('before-selection');
    return true;
  })()`);
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
  const immediate=await snapshot();
  console.log('FYMUSIC_PHASE31_EARLY_STATE '+JSON.stringify(immediate.phase31));
  // A real decoded, advancing audio element should not leave both seek
  // sliders disabled indefinitely. Record bounded, event-driven evidence.
  let readyToSeek=null;
  try{
    readyToSeek=await waitFor(async()=>{
      const s=await snapshot();
      return s.phase31&&s.phase31.stateWaiting===false&&
        s.phase31.stateUrlPresent===true&&
        s.phase31.baseDisabled===false ? s : null;
    },'confirmed playing state and enabled base seek',4200);
  }catch(error){
    const result=await snapshot();
    const evidence=await evaluate(String.raw`window.__phase31Trace||[]`);
    console.error('FYMUSIC_PHASE31_SEEK_STUCK '+JSON.stringify({
      final:result.phase31,detailDisabled:result.detailDisabled,
      timeline:evidence,error:error.message
    }));
    throw error;
  }
  console.log('FYMUSIC_PHASE31_SEEK_READY '+JSON.stringify(readyToSeek.phase31));
  // Start a real UI seek preview, do not commit it.
  const preview=await evaluate(String.raw`(()=>{
    document.querySelector('#player-cover-button').click();
    const slider=document.querySelector('#detail-seek');
    if(!slider)throw Error('seek slider missing');
    const available=!slider.disabled;
    if(available){
      slider.value='870';
      slider.dispatchEvent(new Event('input',{bubbles:true}));
    }
    return {overlay:document.querySelector('#lyrics-overlay')?.getAttribute('aria-hidden'),
      seekHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),
      available,reason:available?null:'live player seek currently disabled',
      mediaDuration:document.querySelector('#audio')?.duration,
      baseDisabled:document.querySelector('#player-seek')?.disabled
    };
  })()`);
  assert.equal(preview.overlay,'false');
  assert.equal(preview.available,true,'decoded confirmed media must support seek preview');
  assert.equal(preview.seekHidden,false);
  console.log('FYMUSIC_PHASE31_TRACE '+JSON.stringify(
    await evaluate(String.raw`window.__phase31Trace||[]`)));
  console.log('FYMUSIC_PHASE30_PREVIEW_CAPABILITY '+JSON.stringify(preview));
  // Opening another Chrome native target, not a Playwright page, delivers
  // genuine browser-origin visibilitychange and document.hidden=true.
  const spare=(await browser.send('Target.createTarget',{url:'about:blank'})).targetId;
  const hidden=await waitFor(async()=>{
    const s=await snapshot();
    return s.hidden&&s.visibility==='hidden'&&
      s.events.includes('hidden')?s:null;
  },'actual hidden state and native visibilitychange event',6000);
  if(preview.available)assert.equal(hidden.seekHidden,true,
    'the real visibility event must discard an unfinished seek preview');
  assert.ok(hidden.src.includes('format=flac24'));
  await delay(800);
  const held=await snapshot();
  assert.equal(held.visibility,'hidden');
  assert.ok(held.seconds>=hidden.seconds);
  assert.ok(held.seconds<8,'uncommitted seek was incorrectly applied');
  await browser.send('Target.activateTarget',{targetId:id});
  await waitFor(async()=>{
    const s=await snapshot();return s.visibility==='visible'&&
      s.events.includes('visible')?s:null;
  },'native visible state restored',6000);
  const resumed=await waitFor(async()=>{
    const s=await snapshot();
    return !s.paused&&s.seconds>held.seconds+.13?s:null;
  },'original FLAC advances again on foreground return',6500);
  assert.equal(resumed.title,'Original Real Hidden FLAC');
  assert.equal(resumed.osTitle,'Original Real Hidden FLAC');
  assert.equal(resumed.audioElements,1);
  assert.equal(resumed.mediaError,0);
  assert.equal(http.filter(x=>x.format==='flac24').length,1);
  // Explicit Media Session pause and a second real visibility cycle.
  await evaluate('window.__phase30OS.handlers.pause();true');
  const paused=await waitFor(async()=>{
    const s=await snapshot();return s.paused?s:null;
  },'OS Pause API',4000);
  await browser.send('Target.activateTarget',{targetId:spare});
  const hiddenPaused=await waitFor(async()=>{
    const s=await snapshot();return s.hidden?s:null;
  },'second actual hidden state',5000);
  await delay(200);
  await browser.send('Target.activateTarget',{targetId:id});
  const visiblePaused=await waitFor(async()=>{
    const s=await snapshot();return s.visibility==='visible'?s:null;
  },'second actual visible state',5000);
  assert.equal(hiddenPaused.paused,true);
  assert.equal(visiblePaused.paused,true,
    'background recovery must never override user explicit pause');
  assert.equal(http.filter(x=>x.format==='flac24').length,1);
  await evaluate('window.__phase30OS.handlers.play();true');
  const playing=await waitFor(async()=>{
    const s=await snapshot();
    return !s.paused&&s.seconds>paused.seconds+.13?s:null;
  },'user-initiated OS Play after real hidden recovery',6000);
  assert.equal(playing.audioElements,1);
  assert.equal(playing.title,'Original Real Hidden FLAC');
  assert.equal(playing.mediaError,0);
  assert.deepEqual(errors,[]);
  console.log('FYMUSIC_PHASE30_RAW_CDP_REAL_HIDDEN '+JSON.stringify({
    browser:version.Browser,transport:'standalone-headed-Chromium-raw-CDP',
    actualHiddenDocument:true,visibilityEvents:playing.events,
    nativeHiddenMediaTime:+held.seconds.toFixed(3),
    foregroundProgress:true,seekPreviewAvailable:preview.available,
    uncommittedSeekCancelled:preview.available?hidden.seekHidden===true:null,
    oldSeekNotCommitted:true,
    explicitOSPausePreservedThroughBackground:true,
    explicitOSResumeContinues:true,
    actualMediaStatus:http.map(x=>x.status),
    originalCodec:'FLAC 24bit/96kHz',
    duplicateOriginalMediaRequests:0,
    singleAudioElement:true,
    noSyntheticVisibilityEvent:true,
    noOSLockscreenOrMobileDeviceClaim:true
  }));
  console.log('FYMUSIC_PHASE30_REAL_VISIBILITY_PASS');
  console.log('FYMUSIC_PHASE31_NATIVE_SEEK_STATE_PASS');
}finally{
  page?.close();browser?.close();
  if(processChrome){
    processChrome.kill('SIGTERM');
    await Promise.race([new Promise(ok=>processChrome.once('exit',ok)),delay(900)]);
    if(processChrome.exitCode===null)processChrome.kill('SIGKILL');
  }
  await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}