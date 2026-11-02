import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';

// Phase32: real native media, real UI selection, OS handler routing and
// delayed browser range "change". Only the catalog/URL resolver and OS API
// are controlled; no fake media clock, synthetic audio event or third-party URL.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const ENGINE=process.env.BROWSER_ENGINE||'firefox';
assert.ok(['firefox','webkit','chromium'].includes(ENGINE),'browser engine');
const browser=await ({chromium,firefox,webkit})[ENGINE].launch({
  headless:true,
  ...(ENGINE==='chromium'?{args:['--autoplay-policy=no-user-gesture-required']}:{})
});
const report={engine:ENGINE};
try{
  const page=await browser.newPage({viewport:{width:1200,height:850},
    reducedMotion:'reduce'});
  const errors=[],network=[];
  page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,150)));
  page.on('response',response=>{
    if(response.url().includes('/api/fymusic-codec-selftest?'))
      network.push({status:response.status(),
        id:new URL(response.url()).searchParams.get('phase32')});
  });
  await page.addInitScript(()=>{
    const os={handlers:{},metadata:null,positions:[],states:[],
      setActionHandler(key,fn){this.handlers[key]=fn},
      setPositionState(value){this.positions.push(value)},
      get playbackState(){return this.states.at(-1)||'none'},
      set playbackState(value){this.states.push(value)}
    };
    Object.defineProperty(navigator,'mediaSession',
      {configurable:true,value:os});
    window.MediaMetadata=class{constructor(x){Object.assign(this,x)}};
    window.__phase32OS=os;
    const rawFetch=window.fetch.bind(window);
    window.fetch=(url,options)=>{
      const target=String(url instanceof Request?url.url:url);
      if(target.startsWith('/api/netease-song-meta?'))
        return Promise.resolve(new Response('{}',
          {status:200,headers:{'content-type':'application/json'}}));
      return rawFetch(url,options);
    };
  });
  await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForFunction(()=>Boolean(
    window.LXPlaySettings?.save&&window.LXSourceManager?.getActive&&
    window.LXMusicSearch?.search&&window.LXPlayerControls?.refresh&&
    window.__phase32OS.handlers.seekto&&
    document.querySelector('#detail-seek')),null,{timeout:22000});
  await page.evaluate(()=>{
    window.LXPlaySettings.save({qualityMode:'fixed',
      fixedQuality:'320k',autoFallback:false});
    const tracks=[
      {id:'3201',source:'wy',name:'Phase32 Original A',
        singer:'Fixture A',albumName:'Original A',interval:'00:12'},
      {id:'3202',source:'wy',name:'Phase32 Original B',
        singer:'Fixture B',albumName:'Original B',interval:'00:12'}
    ];
    const active={id:'phase32-controlled',name:'Original Playback QA',
      inited:true,runtime:{},sources:{wy:{name:'网易云音乐',
      actions:['musicUrl'],qualitys:['320k','128k']}}};
    window.LXSourceManager.getActive=()=>active;
    window.__phase32={resolvers:[],baseChanges:0,tracks:[],seeked:0};
    document.querySelector('#player-seek').addEventListener('change',
      ()=>window.__phase32.baseChanges++);
    document.querySelector('#audio').addEventListener('seeked',
      ()=>window.__phase32.seeked++);
    window.addEventListener('lx:trackchange',e=>
      window.__phase32.tracks.push(e.detail?.name));
    window.LXSourceManager.requestAction=(source,action,info,cb)=>{
      const id=String(info?.musicInfo?.id||'');
      window.__phase32.resolvers.push({source,action,id,quality:info.type});
      if(source!=='wy'||action!=='musicUrl')throw Error('Unexpected resolver');
      cb(null,{url:location.origin+
        '/api/fymusic-codec-selftest?format=mp3&mode=normal&phase32='+id});
    };
    window.LXMusicSearch.search=(source,term,p,n,cb)=>
      cb(null,{list:tracks,searchProvider:'netease-native'});
    window.LXMusicSearch.isPlayableUrlForSource=(source,url)=>
      source==='wy'&&new URL(url).pathname==='/api/fymusic-codec-selftest';
  });
  // The channel sidebar is off-canvas on a 390px mobile viewport.
  // Invoke its real existing click handler without Playwright visibility gating.
  await page.evaluate(()=>{
    document.querySelector('#audio').muted=true;
    document.querySelector('#channel-list .channel-button[title="WY"]').click();
    document.querySelector('#global-search-input').value='Phase32 Original';
    document.querySelector('#global-search-btn').click();
    const row=document.querySelector('.search-song-row .search-song-main');
    if(!row)throw Error('Expected actual search row');
    row.click();
  });
  const ready=id=>page.waitForFunction(id=>{
    const a=document.querySelector('#audio');
    return a.currentSrc.includes('phase32='+id)&&a.readyState>=2&&
      a.currentTime>.55&&!a.paused&&
      !document.querySelector('#player-seek').disabled;
  },id,{timeout:17000});
  await ready('3201');
  assert.equal(await page.locator('#audio').evaluate(a=>a.error?.code||0),0);


  await page.locator('#player-cover-button').click();
  assert.equal(await page.locator('#lyrics-overlay').getAttribute('aria-hidden'),'false');
  await page.locator('#detail-toggle-btn').click();
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  await page.evaluate(()=>{
    const a=document.querySelector('#audio'),range=document.querySelector('#detail-seek');
    const native=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'currentTime');
    window.__phase36={writes:[],events:[],baseChanges:0};
    Object.defineProperty(a,'currentTime',{
      configurable:true,
      get(){return native.get.call(this)},
      set(value){
        window.__phase36.writes.push(Number(value));
        return native.set.call(this,value);
      }
    });
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel',
      'touchstart','touchmove','touchend','input','change']){
      range.addEventListener(type,e=>{
        window.__phase36.events.push({
          type, trusted:e.isTrusted,value:range.value,
          time:Math.round(performance.now())
        });
        if(window.__phase36.events.length>90)window.__phase36.events.shift();
      });
    }
    document.querySelector('#player-seek').addEventListener('change',
      ()=>window.__phase36.baseChanges++);
  });

  const slider=page.locator('#detail-seek');
  const mouse=page.mouse;
  const geometry=async()=>{
    const rect=await slider.boundingBox();
    assert.ok(rect&&rect.width>120&&rect.height>=25,
      ENGINE+' must expose real immersive seek range');
    return {x:rect.x,y:rect.y,w:rect.width,h:rect.height};
  };
  const snapshot=()=>page.evaluate(()=>{
    const a=document.querySelector('#audio'),z=window.__phase36;
    return {seconds:a.currentTime,writes:z.writes.slice(),
      changes:z.baseChanges,paused:a.paused,
      title:window.__LXNowPlayingTrack?.name,
      osTitle:window.__phase32OS?.metadata?.title,
      previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),
      totalAudio:document.querySelectorAll('audio').length,
      trace:z.events.slice(-12)};
  });
  const held=async(fraction=.85)=>{
    const g=await geometry(),y=g.y+g.h/2;
    const start=g.x+g.w*.19,end=g.x+g.w*fraction;
    await mouse.move(start,y);
    await mouse.down();
    for(let i=1;i<=8;i++)await mouse.move(start+(end-start)*i/8,y);
    const s=await snapshot();
    assert.equal(s.previewHidden,false,
      ENGINE+' native pointer drag must show real slider preview');
    assert.ok(s.trace.some(e=>e.type==='input'&&e.trusted),
      ENGINE+' browser range must emit trusted input');
    return {...g,y};
  };
  const finish=async(g)=>{
    await mouse.move(g.x+g.w*.94,g.y);
    await mouse.up();
  };
  const initial=await snapshot();
  const first=await held();
  await page.evaluate(()=>window.__phase32OS.handlers.seekto({seekTime:3}));
  const os=await snapshot();
  assert.ok(Math.abs(os.seconds-3)<.2);
  assert.equal(os.writes.length,initial.writes.length+1);
  await finish(first);
  const after=await snapshot();
  console.log('FYMUSIC_PHASE38_OS_MOUSE_'+ENGINE+' '+
    JSON.stringify({initial,os,after}));
  assert.equal(after.writes.length,os.writes.length,
    ENGINE+' old mouse release must not override OS seek');
  assert.ok(Math.abs(after.seconds-3)<.2);
  report.osSeekPrecedence=true;

  await slider.focus();
  const keyBefore=await snapshot();
  await page.keyboard.press('ArrowRight');
  const keyAfter=await snapshot();
  console.log('FYMUSIC_PHASE38_KEYBOARD_'+ENGINE+' '+
    JSON.stringify({keyBefore,keyAfter}));
  assert.equal(keyAfter.writes.length,keyBefore.writes.length+1,
    ENGINE+' fresh keyboard command must write exactly once');
  assert.ok(keyAfter.seconds>keyBefore.seconds);
  report.keyboardRecovery=true;

  const oldA=await held(.84);
  await page.evaluate(()=>
    document.querySelectorAll('.search-song-row .search-song-main')[1].click());
  await ready('3202');
  await page.evaluate(()=>window.__phase32OS.handlers.pause());
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  const newTrack=await snapshot();
  await finish(oldA);
  const oldFinished=await snapshot();
  console.log('FYMUSIC_PHASE38_TRACK_MOUSE_'+ENGINE+' '+
    JSON.stringify({newTrack,oldFinished}));
  assert.equal(oldFinished.title,'Phase32 Original B');
  assert.equal(oldFinished.osTitle,'Phase32 Original B');
  assert.equal(oldFinished.totalAudio,1);
  assert.equal(oldFinished.writes.length,newTrack.writes.length,
    ENGINE+' old A pointer must not overwrite B');
  assert.ok(Math.abs(oldFinished.seconds-newTrack.seconds)<.18);
  report.trackOwnerPrecedence=true;

  const valid=await held(.46);
  await mouse.up();
  const newValid=await snapshot();
  console.log('FYMUSIC_PHASE38_FRESH_POINTER_'+ENGINE+' '+
    JSON.stringify(newValid));
  assert.equal(newValid.writes.length,oldFinished.writes.length+1);
  assert.ok(newValid.seconds>3.5);
  report.freshPointerRecovery=true;

  const chosen=await page.evaluate(()=>window.__phase32.resolvers.map(x=>
    ({id:x.id,quality:x.quality})));
  assert.deepEqual(chosen,[{id:'3201',quality:'320k'},
    {id:'3202',quality:'320k'}]);
  // Media engines may request an MP3 differently: Firefox commonly sends
  // Range and gets 206; WebKit can request the full resource and get 200.
  // Verify each *actual* request was successful, and independently verify
  // the same server's byte-range contract instead of forcing both engines
  // to choose the same transport strategy.
  console.log('FYMUSIC_PHASE38_MEDIA_HTTP_'+ENGINE+' '+
    JSON.stringify(network));
  for(const id of ['3201','3202']){
    const matches=network.filter(x=>x.id===id);
    assert.ok(matches.length>0,
      ENGINE+' must request real original media for '+id);
    assert.ok(matches.some(x=>x.status===200||x.status===206),
      ENGINE+' must load successful real media for '+id);
    const probe=await page.request.get(BASE+
      '/api/fymusic-codec-selftest?format=mp3&mode=normal&phase32='+id,
      {headers:{Range:'bytes=0-31'}});
    assert.equal(probe.status(),206,
      'fixture server must independently support RFC7233 HTTP 206');
    assert.equal((await probe.body()).byteLength,32);
  }
  assert.deepEqual(errors,[]);
  report.nativeMedia=true;
  report.originalMP3Fixture=true;
  report.range206ServerVerified=true;
  report.nativeMediaStatus=network.map(({id,status})=>({id,status}));
  report.oneAudio=true;
  console.log('FYMUSIC_PHASE38_CROSS_BROWSER_PASS_'+ENGINE+' '+
    JSON.stringify(report));
} finally {await browser.close()}
