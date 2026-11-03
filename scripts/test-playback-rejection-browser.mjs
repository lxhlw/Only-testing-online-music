import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Deliberately inject one play() rejection into the *real browser UI*
// to verify the user-facing behavior. Audio data is a harmless WAV fixture.
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const fixture=[
 '/** @name Flower audio policy fixture */',
 '(function(){',
 ' var lx=globalThis.lx;',
 ' lx.on(lx.EVENT_NAMES.request,function(){return Promise.resolve({url:"https://media.example.test/kg.wav"});});',
 ' lx.send(lx.EVENT_NAMES.inited,{status:true,sources:{',
 '  kg:{name:"酷狗",type:"music",actions:["musicUrl"],qualitys:["128k","320k","flac"]}',
 ' }});',
 '})();'
].join('\n');
function wav(seconds=223,rate=8000){
 const b=Buffer.alloc(44+seconds*rate*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
 b.write('data',36);b.writeUInt32LE(seconds*rate*2,40);return b;
}
const bytes=wav();
const browser=await chromium.launch({headless:true});
const audit=[];
try {
 for(const rejection of ['NotAllowedError','NotSupportedError','AbortError']){
  const page=await browser.newPage({viewport:{width:1360,height:860}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message)));
  await page.addInitScript(code=>{
    localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
      {id:'fixture-audio-policy',name:'Flower audio policy fixture',code,
       url:'https://example.test/flower.js'}]));
    localStorage.setItem('only-testing-online-music.active-source-id','fixture-audio-policy');
    localStorage.setItem('only-testing-online-music.play-settings',JSON.stringify({
      qualityMode:'fixed',fixedQuality:'flac32bit',autoFallback:true
    }));
  },fixture);
  await page.route('https://media.example.test/**',route=>{
    const range=route.request().headers().range||'';
    const match=/^bytes=(\d+)-(\d*)$/.exec(range);
    if(match){
      const start=Number(match[1]);
      const end=match[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1;
      if(start<bytes.length&&end>=start)return route.fulfill({
        status:206,body:bytes.subarray(start,end+1),
        headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes',
         'Content-Range':'bytes '+start+'-'+end+'/'+bytes.length,
         'Content-Length':String(end-start+1)}
      });
    }
    return route.fulfill({status:200,body:bytes,
      headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes'}});
  });
  await page.route('**/api/proxy?*',route=>route.fulfill({
    status:200,body:bytes,headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes'}
  }));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited&&
    window.OnlyTestingMusicApp?.playMusic,null,{timeout:20000});
  await page.evaluate((kind)=>{
    window.__policyQuality=[];
    window.__policyErrors=[];
    window.addEventListener('fymusic:audio-play-rejected',e=>window.__policyErrors.push(e.detail.reason));
    const old=window.LXSourceManager.requestAction.bind(window.LXSourceManager);
    window.LXSourceManager.requestAction=function(source,action,args,done){
      if(source==='kg'&&action==='musicUrl'){
        window.__policyQuality.push(args.type);
        return done(null,'https://media.example.test/kg.wav');
      }
      return old(source,action,args,done);
    };
    window.LXMusicSearch.isPlayableUrlForSource=()=>true;
    const audio=document.getElementById('audio');
    const realPlay=audio.play.bind(audio);
    let first=true;
    audio.play=function(){
      if(first){
        first=false;
        return Promise.reject(new DOMException('Injected expected rejection',kind));
      }
      return realPlay();
    };
    const btn=document.createElement('button');
    btn.id='policy-fixture-play';
    btn.textContent='Test playback';
    btn.style.cssText='position:fixed;top:10px;left:15px;z-index:999999;pointer-events:auto';
    btn.onclick=()=>window.OnlyTestingMusicApp.playMusic({
      source:'kg',id:'fixture-kg',songmid:'fixture-kg',
      name:'稻香',singer:'周杰伦',interval:'03:43',albumName:'魔杰座'
    });
    document.body.appendChild(btn);
  },rejection);
  await page.locator('#policy-fixture-play').click();
  await page.waitForFunction(()=>window.__policyErrors?.length>0,null,{timeout:16000});
  const firstQuality=await page.evaluate(()=>window.__policyQuality[0]);
  assert.equal(firstQuality,'flac','Best available declared quality must precede 128k');
  const code=await page.evaluate(()=>window.__policyErrors[0]);
  assert.equal(code,rejection==='NotAllowedError'?'autoplay_policy':
    rejection==='NotSupportedError'?'unsupported_media':'interrupted');
  if(rejection==='NotAllowedError'){
    const resume=page.locator('#resume-audio-on-gesture');
    await resume.waitFor({timeout:12000});
    assert.match(await page.locator('#status').innerText(),/浏览器当前限制/);
    await resume.click();
    await page.waitForFunction(()=>document.getElementById('audio').currentTime>=0.4,
      null,{timeout:18000});
    assert.ok(!(await page.locator('#status').innerText()).includes('浏览器当前限制'));
  }else{
    await page.waitForTimeout(200);
    assert.equal(await page.locator('#resume-audio-on-gesture').count(),0,
      rejection+' must not be misreported as autoplay permission denial');
  }
  assert.deepEqual(errors,[]);
  const position=await page.evaluate(()=>Number(document.getElementById('audio').currentTime||0));
  audit.push({rejection,firstQuality,code,position:Math.round(position*100)/100});
  await page.close();
 }
 console.log('FYMUSIC_REAL_BROWSER_MEDIA_PLAY_REJECTION_PASS',JSON.stringify(audit));
} finally {
 await browser.close();
}
