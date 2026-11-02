import assert from 'node:assert/strict';
import {chromium,firefox,webkit} from 'playwright';

// Phase40: real native media, real UI selection, OS handler routing and
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

  // Phase40 calibrates each keyboard key against a separate real HTML range
  // in this *same browser engine*. The isolated input is appended to the
  // modal, where the existing focus trap permits native keyboard behavior.
  // This avoids wrongly assuming Firefox/WebKit use identical PageUp steps.
  const calibrate=async(key,startValue)=>{
    await page.evaluate(value=>{
      const input=document.createElement('input');
      input.type='range';input.min='0';input.max='1000';input.step='1';
      input.value=String(value);
      input.id='phase40-browser-native-range';
      input.style.cssText='position:fixed;bottom:15px;left:15px;width:180px;z-index:999999';
      document.querySelector('#lyrics-overlay').append(input);
      input.focus();
    },startValue);
    const before=Number(await page.locator('#phase40-browser-native-range').inputValue());
    await page.keyboard.press(key);
    const after=Number(await page.locator('#phase40-browser-native-range').inputValue());
    await page.locator('#phase40-browser-native-range').evaluate(input=>input.remove());
    return {before,after,supported:before!==after};
  };
  const duration=await page.locator('#audio').evaluate(a=>a.duration);
  assert.ok(Number.isFinite(duration)&&duration>8,
    ENGINE+' should decode original MP3 with valid measured duration');
  const caseSpecs=[
    {key:'ArrowLeft',os:5.25},
    {key:'ArrowRight',os:3.25},
    {key:'Home',os:5.15},
    {key:'End',os:2.2},
    {key:'PageUp',os:3.75},
    {key:'PageDown',os:6.1},
    {key:'ArrowRight',os:1.85},
    {key:'ArrowLeft',os:7.4}
  ];
  const results=[],unsupported=[];
  const resourceBefore=await page.evaluate(()=>({
    nodes:document.querySelectorAll('#lyrics-overlay *').length,
    audio:document.querySelectorAll('audio').length,
    resolverCount:window.__phase32.resolvers.length
  }));
  for(const [i,spec] of caseSpecs.entries()){
    const drag=await held(.85-(i%3)*.025);
    const beforeOS=await snapshot();
    await page.evaluate(target=>
      window.__phase32OS.handlers.seekto({seekTime:target}),spec.os);
    const atOS=await snapshot();
    assert.equal(atOS.writes.length,beforeOS.writes.length+1,
      ENGINE+' OS seek must produce exactly one real currentTime write');
    assert.ok(Math.abs(atOS.seconds-spec.os)<.3,
      ENGINE+' OS position must be real before keyboard '+spec.key);
    await finish(drag);
    const oldFinished=await snapshot();
    assert.equal(oldFinished.writes.length,atOS.writes.length,
      ENGINE+' stale pointer cannot commit after OS '+spec.key);
    assert.ok(Math.abs(oldFinished.seconds-spec.os)<.3);

    // Calibrate *after* the pointer has ended; use the current native
    // audio time and browser's actual range key semantics.
    const value=Math.round(Math.max(0,Math.min(1000,
      oldFinished.seconds/duration*1000)));
    const native=await calibrate(spec.key,value);
    await slider.focus();
    const beforeKey=await snapshot();
    await page.keyboard.press(spec.key);
    const afterKey=await snapshot();
    const expected=native.after/1000*duration;
    if(native.supported){
      assert.equal(afterKey.writes.length,beforeKey.writes.length+1,
        ENGINE+' supported key must commit exactly once '+spec.key);
      assert.ok(Math.abs(afterKey.seconds-expected)<.36,
        ENGINE+' '+spec.key+' must act on real OS position, not abandoned thumb: '+
        JSON.stringify({expected,actual:afterKey.seconds,native}));
    } else {
      unsupported.push(spec.key);
      assert.equal(afterKey.writes.length,beforeKey.writes.length,
        ENGINE+' unsupported native range key must not cause phantom seek');
      assert.ok(Math.abs(afterKey.seconds-beforeKey.seconds)<.3);
    }
    results.push({key:spec.key,os:spec.os,native,
      from:beforeKey.seconds,actual:afterKey.seconds,
      expected,supported:native.supported,
      writesDelta:afterKey.writes.length-beforeKey.writes.length});
  }
  console.log('FYMUSIC_PHASE40_NATIVE_KEYS_'+ENGINE+' '+
    JSON.stringify({duration,results,unsupported}));
  report.nativeKeyboardCases=results.length;
  report.nativeUnsupportedKeys=unsupported;
  report.keyboardFromLatestOS=true;

  // A held key is genuinely repeated by browser-generated trusted keydown
  // events (keyboard.down for the same key repeats, then keyboard.up).
  const heldDrag=await held(.87);
  const beforeHold=await snapshot();
  await page.evaluate(()=>window.__phase32OS.handlers.seekto({seekTime:4.6}));
  const atHoldOS=await snapshot();
  assert.equal(atHoldOS.writes.length,beforeHold.writes.length+1);
  await finish(heldDrag);
  await slider.focus();
  const repeatBefore=await snapshot();
  for(let n=0;n<6;n++)await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  const repeatAfter=await snapshot();
  assert.ok(repeatAfter.writes.length>repeatBefore.writes.length,
    ENGINE+' repeated native ArrowRight must affect real audio time');
  assert.ok(repeatAfter.seconds>4.6&&repeatAfter.seconds<6.1,
    ENGINE+' repeating key must not start at old ~87% thumb');
  console.log('FYMUSIC_PHASE40_REPEAT_'+ENGINE+' '+
    JSON.stringify({repeatBefore:repeatBefore.seconds,
      repeatAfter:repeatAfter.seconds,
      writesDelta:repeatAfter.writes.length-repeatBefore.writes.length}));
  report.repeatKeyRecovery=true;

  // Old A pointer must never commit to B. More importantly, the first
  // keyboard action on B must start from B's media time, not A's old thumb.
  const oldA=await held(.86);
  await page.evaluate(()=>
    document.querySelectorAll('.search-song-row .search-song-main')[1].click());
  await ready('3202');
  await page.evaluate(()=>window.__phase32OS.handlers.pause());
  await page.waitForFunction(()=>document.querySelector('#audio').paused);
  const newTrack=await snapshot();
  await finish(oldA);
  const afterOldA=await snapshot();
  assert.equal(afterOldA.title,'Phase32 Original B');
  assert.equal(afterOldA.osTitle,'Phase32 Original B');
  assert.equal(afterOldA.writes.length,newTrack.writes.length,
    ENGINE+' A pointer cannot change B audio on mouse release');
  assert.ok(Math.abs(afterOldA.seconds-newTrack.seconds)<.25);
  const bValue=Math.round(afterOldA.seconds/duration*1000);
  const bCalibration=await calibrate('ArrowRight',bValue);
  assert.ok(bCalibration.supported,
    ENGINE+' ArrowRight must be native supported');
  await slider.focus();
  const bBefore=await snapshot();
  await page.keyboard.press('ArrowRight');
  const bAfter=await snapshot();
  const bExpected=bCalibration.after/1000*duration;
  assert.equal(bAfter.writes.length,bBefore.writes.length+1,
    ENGINE+' B keyboard must write once');
  assert.ok(Math.abs(bAfter.seconds-bExpected)<.36,
    ENGINE+' B first keyboard input must use latest track time');
  console.log('FYMUSIC_PHASE40_TRACK_KEYBOARD_'+ENGINE+' '+
    JSON.stringify({bBefore:bBefore.seconds,bAfter:bAfter.seconds,
      bExpected,calibration:bCalibration}));
  report.trackKeyboardOwner=true;

  const resourcesAfter=await page.evaluate(()=>({
    nodes:document.querySelectorAll('#lyrics-overlay *').length,
    audio:document.querySelectorAll('audio').length,
    resolverCount:window.__phase32.resolvers.length
  }));
  assert.deepEqual(resourcesAfter.nodes,resourceBefore.nodes,
    ENGINE+' cleanup must leave exactly same immersive DOM count');
  assert.equal(resourcesAfter.audio,1);
  assert.equal(resourcesAfter.resolverCount,2);
  const chosen=await page.evaluate(()=>window.__phase32.resolvers.map(x=>
    ({id:x.id,quality:x.quality})));
  assert.deepEqual(chosen,[{id:'3201',quality:'320k'},
    {id:'3202',quality:'320k'}]);
  for(const id of ['3201','3202']){
    const matches=network.filter(x=>x.id===id);
    assert.ok(matches.some(x=>x.status===200||x.status===206),
      ENGINE+' must actually fetch original MP3 for '+id);
    const probe=await page.request.get(BASE+
      '/api/fymusic-codec-selftest?format=mp3&mode=normal&phase32='+id,
      {headers:{Range:'bytes=0-31'}});
    assert.equal(probe.status(),206);
    assert.equal((await probe.body()).byteLength,32);
  }
  assert.deepEqual(errors,[]);
  report.resourcesStable=true;
  report.originalMP3NativeDecoded=true;
  report.range206ServerVerified=true;
  report.controlledFixtureRequestsVerified=true;
  console.log('FYMUSIC_PHASE40_CROSS_BROWSER_KEYBOARD_PASS_'+ENGINE+' '+
    JSON.stringify({report,resourcesBefore,resourcesAfter,network}));
} finally {await browser.close()}
