import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Only locally generated calibration WAV is decoded. Never use a real song
// or claim the fixture proves third-party Flower availability.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
function wav(seconds=48,rate=8000){
 const samples=seconds*rate,buffer=Buffer.alloc(44+samples*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);
 buffer.write('WAVEfmt ',8);buffer.writeUInt32LE(16,16);
 buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
 buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
 buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
 buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)buffer.writeInt16LE(
  Math.round(Math.sin(2*Math.PI*440*i/rate)*1800),44+i*2);
 return buffer;
}
const browser=await chromium.launch({headless:true,
 args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e).slice(0,140)));
 await page.route('**/fymusic-alternate-calibration.wav',r=>r.fulfill({
  status:200,contentType:'audio/wav',body:wav()
 }));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXMusicSearch?.search&&
  window.FyMusicCrossPlatformMatch?.inspect),null,{timeout:18000});
 await page.evaluate(()=>{
  const active={id:'alternate-qa-source',name:'Fixture Flower',inited:true,runtime:{},
   sources:{
    kg:{name:'KG',actions:['musicUrl'],qualitys:['flac24bit','128k']},
    kw:{name:'KW',actions:['musicUrl'],qualitys:['flac24bit','flac','320k','128k']}
   }};
  // Verify the explicitly selected high-fidelity format remains intact.
  window.LXPlaySettings.save({qualityMode:'fixed',fixedQuality:'flac24bit',autoFallback:false});
  const mgr=window.LXSourceManager;
  mgr.getActive=()=>active;
  window.__alternateQA={kwSearch:0,kwResolvers:0,kgResolvers:0,qualities:[],events:[]};
  const stats=window.__alternateQA;
  window.addEventListener('fymusic:alternate-search',()=>stats.events.push('search'));
  window.addEventListener('fymusic:alternate-approved',()=>stats.events.push('approved'));
  mgr.requestAction=(source,action,info,callback)=>{
   if(action!=='musicUrl')return callback(new Error('unsupported fixture action'));
   if(source==='kg'){
    stats.kgResolvers++;
    callback(new Error('Flower resolver unavailable'));return;
   }
   if(source==='kw'){
    stats.kwResolvers++;stats.qualities.push(info.type);
    callback(null,{url:location.origin+'/fymusic-alternate-calibration.wav'});
    return;
   }
   callback(new Error('wrong platform'));
  };
  window.LXMusicSearch.search=(source,keyword,page,limit,callback)=>{
   if(source==='kg')return callback(null,{searchProvider:'kugou-native',
    list:[{source:'kg',id:'kg-fixture',name:'安全备用校准',singer:'FyMusic QA',
     albumName:'受控音频',interval:'00:48'}]});
   if(source==='kw'){
    stats.kwSearch++;
    return callback(null,{searchProvider:'kuwo-native',list:[
     {source:'kw',id:'kw-wrong',name:'安全备用校准 Live',
      singer:'FyMusic QA',albumName:'受控音频',interval:'00:48'},
     {source:'kw',id:'kw-right',name:'安全备用校准',
      singer:'FyMusic QA',albumName:'受控音频',interval:'00:48'},
     {source:'kw',id:'kw-wrong-album',name:'安全备用校准',
      singer:'FyMusic QA',albumName:'其他专辑',interval:'00:48'}
    ]});
   }
   callback(new Error('unexpected platform'));
  };
  window.LXMusicSearch.isPlayableUrlForSource=(source,url)=>
    source==='kw' && new URL(url).pathname==='/fymusic-alternate-calibration.wav';
 });
 await page.locator('#channel-list .channel-button[title="KG"]').click();
 await page.locator('#global-search-input').fill('安全备用校准');
 await page.locator('#global-search-btn').click();
 await page.locator('.search-song-row .search-song-main').first().click();
 await page.locator('.fymusic-alternate-search').waitFor({timeout:12000});
 let stats=await page.evaluate(()=>window.__alternateQA);
 assert.equal(stats.kgResolvers,1);
 assert.equal(stats.kwSearch,0,'must not search alternate without user gesture');
 assert.equal(stats.kwResolvers,0,'must not resolve alternate without user gesture');
 await page.locator('.fymusic-alternate-search').click();
 await page.locator('.fymusic-alternate-confirm').waitFor({timeout:5000});
 assert.equal(await page.locator('.fymusic-alternate-confirm').count(),1,
  'mismatched live and album versions must be excluded');
 stats=await page.evaluate(()=>window.__alternateQA);
 assert.equal(stats.kwSearch,1);
 assert.equal(stats.kwResolvers,0,'search must not trigger playback');
 assert.equal(await page.locator('#player-title').innerText(),'未播放');
 await page.locator('.fymusic-alternate-confirm').click();
 await page.waitForFunction(()=>{
  const a=document.querySelector('#audio');
  return window.__alternateQA.kwResolvers===1 &&
   a&&a.readyState>=2&&a.currentTime>=.5&&!a.paused;
 },null,{timeout:16000});
 stats=await page.evaluate(()=>window.__alternateQA);
 assert.deepEqual(stats.events,['search','approved']);
 assert.equal(stats.kwResolvers,1);
 assert.equal(stats.qualities[0],'flac24bit','preserve top declared format');
 assert.equal(await page.evaluate(()=>window.__LXNowPlayingTrack.source),'kw');
 assert.match(await page.locator('#status').innerText(),/酷我|备用/);
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_EXPLICIT_KG_KW_BROWSER_PASS '+JSON.stringify({
  searches:stats.kwSearch,confirmedResolvers:stats.kwResolvers,
  quality:stats.qualities[0],actualAudio:true
 }));
}finally{await browser.close();}
