import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const fixture=[
 '/** @name 野花🌷 */',
 '(function(){',
 ' var api=globalThis.lx;',
 ' api.on(api.EVENT_NAMES.request,function(){',
 '   return Promise.resolve({url:"https://media.example.test/kuwo.wav?id=440613"});',
 ' });',
 ' api.send(api.EVENT_NAMES.inited,{status:true,sources:{',
 '  kw:{name:"酷我音乐",type:"music",actions:["musicUrl"],qualitys:["128k","320k"]}',
 ' }});',
 '})();'
].join('\n');
function wav(seconds=14,rate=8000){
 const bytes=Buffer.alloc(44+seconds*rate*2);
 bytes.write('RIFF',0);bytes.writeUInt32LE(bytes.length-8,4);
 bytes.write('WAVE',8);bytes.write('fmt ',12);bytes.writeUInt32LE(16,16);
 bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);
 bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*2,28);
 bytes.writeUInt16LE(2,32);bytes.writeUInt16LE(16,34);
 bytes.write('data',36);bytes.writeUInt32LE(seconds*rate*2,40);
 return bytes;
}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8X0AAAAASUVORK5CYII=','base64');
const results=[];
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true,...(engine==='chromium'?{args:['--autoplay-policy=no-user-gesture-required']}:{})});
 try{
  const page=await browser.newPage({viewport:{width:engine==='webkit'?390:1440,
    height:engine==='webkit'?844:900},hasTouch:engine==='webkit'});
  const exceptions=[],requests=[];
  page.on('pageerror',e=>exceptions.push(String(e.message||e)));
  page.on('request',r=>requests.push(new URL(r.url()).pathname));
  await page.addInitScript(({fixture})=>{
   localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
    {id:'kuwo-ui-fixture',name:'野花🌷',code:fixture,
     url:'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'}
   ]));
   localStorage.setItem('only-testing-online-music.active-source-id','kuwo-ui-fixture');
  },{fixture});
  await page.route('https://media.example.test/**',route=>route.fulfill({
   status:200,contentType:'audio/wav',body:wav()
  }));
  await page.route('https://img1.kuwo.cn/**',route=>route.fulfill({
   status:200,contentType:'image/png',body:png
  }));
  await page.route('**/api/kuwo-song-meta?*',route=>{
   const id=new URL(route.request().url()).searchParams.get('id');
   const body={id,source:'kw',name:'稻香',albumName:'魔杰座',
    singer:'周杰伦',image:'https://img1.kuwo.cn/star/albumcover/500/fake.jpg',
    lyric:'[00:00.00]样本歌词第一行\n[00:01.00]样本歌词第二行',
    available:true};
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited&&
    Boolean(window.OnlyTestingMusicApp?.playMusic),null,{timeout:18000});
  // Real user activation is required by Safari/WebKit autoplay policy.
  // Exercise the application through a gesture rather than bypassing it.
  await page.evaluate(()=>{
   const launch=document.createElement('button');
   launch.type='button'; launch.id='kuwo-real-click-gesture';
   launch.textContent='测试用户点击播放';
   launch.addEventListener('click',()=>window.OnlyTestingMusicApp.playMusic({
     id:'440613',songmid:'440613',name:'稻香',singer:'周杰伦',
     albumName:'魔杰座',source:'kw',interval:14
   }));
   document.body.appendChild(launch);
  });
  await page.locator('#kuwo-real-click-gesture').click();
  await page.waitForFunction(()=>{
   const a=document.getElementById('audio');
   return a&&a.readyState>=2&&!a.paused&&a.currentTime>.45;
  },null,{timeout:14000});
  await page.locator('#player-cover-button').click();
  await page.locator('#lyrics-overlay').waitFor({state:'visible',timeout:5000});
  await page.waitForFunction(()=>{
   const img=document.getElementById('lyrics-cover-image');
   const lines=document.querySelectorAll('#lyrics-lines .lyrics-line');
   return img?.complete&&img.naturalWidth>0&&lines.length>=2;
  },null,{timeout:10000});
  const getVisual=()=>page.evaluate(()=>{
   const btn=document.getElementById('detail-toggle-btn');
   const play=btn.querySelector('.detail-play-icon'),
    pause=btn.querySelector('.detail-pause-icon');
   return {playing:!document.getElementById('audio').paused,
    state:btn.dataset.playbackState,aria:btn.getAttribute('aria-label'),
    playVisible:getComputedStyle(play).display!=='none',
    pauseVisible:getComputedStyle(pause).display!=='none',
    coverVisible:document.getElementById('lyrics-cover-image').naturalWidth>0,
    lyricLines:document.querySelectorAll('#lyrics-lines .lyrics-line').length,
    lyricStatus:document.getElementById('lyrics-status').textContent};
  });
  const on=await getVisual();
  assert.deepEqual([on.playing,on.state,on.aria,on.playVisible,on.pauseVisible],
    [true,'playing','暂停',false,true]);
  await page.locator('#detail-toggle-btn').click();
  await page.waitForFunction(()=>document.getElementById('audio')?.paused===true,null,{timeout:6000});
  const off=await getVisual();
  assert.deepEqual([off.playing,off.state,off.aria,off.playVisible,off.pauseVisible],
    [false,'paused','播放',true,false]);
  await page.locator('#detail-toggle-btn').click();
  await page.waitForFunction(()=>document.getElementById('audio')?.paused===false,null,{timeout:8000});
  const resumed=await getVisual();
  assert.deepEqual([resumed.playing,resumed.state,resumed.aria,
     resumed.playVisible,resumed.pauseVisible],
    [true,'playing','暂停',false,true]);
  assert.equal(on.coverVisible,true);
  assert.equal(on.lyricLines,2);
  assert.match(on.lyricStatus,/歌词已加载/);
  assert.ok(requests.some(p=>p==='/api/kuwo-song-meta'),
    'Kuwo-specific metadata/lyric API was never called');
  assert.deepEqual(exceptions,[]);
  results.push({engine,playing:on,paused:off,resumed,
    requests:requests.filter(p=>p==='/api/kuwo-song-meta').length});
  await page.close();
 }finally{await browser.close()}
}
console.log('FYMUSIC_KUWO_NOW_PLAYING_BROWSER_PASS',JSON.stringify({
 engines:results.map(x=>x.engine),coverLoaded:true,
 lyricLines:2,playPauseVisibleDistinct:true,results
}));
