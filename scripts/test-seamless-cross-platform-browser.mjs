import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const fixture=[
 '/** @name 野花🌷 */',
 '(function(){',
 ' var api=globalThis.lx;',
 ' api.on(api.EVENT_NAMES.request,function(){return Promise.resolve({url:"https://media.example.test/test.wav"});});',
 ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
 '  kg:{name:"酷狗",type:"music",actions:["musicUrl"],qualitys:["320k","128k"]},',
 '  kw:{name:"酷我",type:"music",actions:["musicUrl"],qualitys:["320k","128k"]},',
 '  mg:{name:"咪咕",type:"music",actions:["musicUrl"],qualitys:["320k","128k"]},',
 '  wy:{name:"网易云",type:"music",actions:["musicUrl"],qualitys:["320k","128k"]}',
 ' }});',
 '})();'
].join('\n');
function wav(seconds=42,rate=8000){
 const b=Buffer.alloc(44+seconds*rate*2);
 b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);
 b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);
 b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);
 b.writeUInt16LE(2,32);b.write('data',36);
 b.writeUInt32LE(seconds*rate*2,40);return b;
}
const target={source:'kg',id:'kg-42',songmid:'kg-42',name:'示例歌曲',singer:'测试歌手',
 albumName:'示例专辑',interval:42};
const equivalent={source:'kw',id:'440613',songmid:'440613',name:'示例歌曲',
 singer:'测试歌手',albumName:'示例专辑',interval:43};
const wrong={...equivalent,id:'wrong',name:'示例歌曲 Live',interval:90};
const results=[];
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true,
   ...(engine==='chromium'?{args:['--autoplay-policy=no-user-gesture-required']}:{})});
 try{
  for(const scenario of ['missing-lyrics','kugou-media-failure']){
   const page=await browser.newPage({viewport:{width:engine==='webkit'?390:1360,height:860}});
   const errors=[];
   page.on('pageerror',e=>errors.push(String(e.message).slice(0,180)));
   await page.addInitScript(({fixture})=>{
    localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([{
     id:'seamless-test-source',name:'野花🌷',code:fixture,
     url:'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'
    }]));
    localStorage.setItem('only-testing-online-music.active-source-id','seamless-test-source');
   },{fixture});
   await page.route('https://media.example.test/**',route=>route.fulfill({
    status:200,contentType:'audio/wav',body:wav()
   }));
   await page.route('**/api/kuwo-song-meta?*',route=>{
    const id=new URL(route.request().url()).searchParams.get('id');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     source:'kw',id,lyric:'[00:00.00]第一句测试歌词\n[00:02.00]第二句测试歌词',
     image:'https://img1.kuwo.cn/star/albumcover/500/test.jpg',available:true
    })});
   });
   await page.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
   await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited&&
    !!window.OnlyTestingMusicApp?.playMusic,null,{timeout:18000});
   await page.evaluate(({scenario,equivalent,wrong})=>{
    window.__seamlessRequested=[];
    window.__seamlessSearch=[];
    window.LXMusicSearch.search=(source,query,page,size,done)=>{
      window.__seamlessSearch.push(source);
      done(null,{list:source==='kw'?[wrong,equivalent]:[]});
    };
    window.LXSourceManager.requestAction=(source,action,args,done)=>{
      window.__seamlessRequested.push({source,action,quality:args.type||null});
      if(action==='musicUrl'&&source==='kg'&&scenario==='kugou-media-failure')
       return done(new Error('Kugou Flower upstream HTTP 502'));
      if(action==='musicUrl')return done(null,{url:'https://media.example.test/test.wav'});
      return done(new Error('Unsupported action'));
    };
    const b=document.createElement('button');b.id='seamless-play';b.textContent='Test user play';
    b.style.cssText='position:fixed;top:15px;left:15px;z-index:2147483647';
    b.addEventListener('click',()=>window.OnlyTestingMusicApp.playMusic({
     source:'kg',id:'kg-42',songmid:'kg-42',name:'示例歌曲',
     singer:'测试歌手',albumName:'示例专辑',interval:42
    }));
    document.body.appendChild(b);
   },{scenario,equivalent,wrong});
   await page.locator('#seamless-play').click();
   await page.waitForFunction(({scenario})=>{
    const audio=document.getElementById('audio');
    const lines=document.querySelectorAll('#lyrics-lines .lyrics-line');
    const tracks=window.__seamlessRequested||[];
    const alternatePlayed=tracks.some(t=>t.source==='kw'&&t.action==='musicUrl');
    return audio&&!audio.paused&&audio.readyState>=2&&audio.currentTime>.45&&
     lines.length>=2&&
     (scenario==='missing-lyrics'||alternatePlayed);
   },{scenario},{timeout:18000});
   const result=await page.evaluate(()=>{
    const audio=document.getElementById('audio');
    return {
      audioPlaying:!audio.paused&&audio.currentTime>.45,
      lyrics:document.querySelectorAll('#lyrics-lines .lyrics-line').length,
      lyricStatus:document.getElementById('lyrics-status')?.textContent||'',
      searches:window.__seamlessSearch,
      requests:window.__seamlessRequested,
      title:document.getElementById('player-title')?.textContent,
      sourceState:window.__LXNowPlayingTrack?.source,
      manualButtons:document.querySelectorAll('.fymusic-alternate-search').length
    };
   });
   assert.equal(result.audioPlaying,true);
   assert.equal(result.lyrics,2);
   assert.ok(result.searches.includes('kw'));
   assert.equal(result.title,'示例歌曲');
   assert.equal(result.manualButtons,0,'Seamless fallback must not show a manual gate');
   if(scenario==='missing-lyrics'){
    assert.ok(result.requests.every(x=>x.source==='kg'),
      'Only the lyric provider should change, not the audio source');
    assert.match(result.lyricStatus,/匹配酷我/);
    assert.equal(result.sourceState,'kg');
   }else{
    assert.ok(result.requests.some(x=>x.source==='kw'&&x.action==='musicUrl'));
    assert.equal(result.sourceState,'kw');
   }
   assert.deepEqual(errors,[]);
   results.push({engine,scenario,audioPlaying:result.audioPlaying,
    lyricLines:result.lyrics,requestedSources:[...new Set(result.requests.map(x=>x.source))],
    lyricStatus:result.lyricStatus});
   await page.close();
  }
 }finally{await browser.close()}
}
console.log('FYMUSIC_SEAMLESS_LYRIC_AND_KUGOU_AUDIO_BROWSER_PASS',JSON.stringify(results));
