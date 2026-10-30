import assert from 'node:assert/strict';
import {chromium} from 'playwright';
// Full UI smoke on an isolated Cloudflare Pages local preview.
// Catalog and resolver are controlled fixtures. Only a locally generated
// calibration tone is played; NEVER mislabel this as a commercial song.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
function wav(seconds=20,rate=8000){
 const samples=seconds*rate,buf=Buffer.alloc(44+samples*2);
 buf.write('RIFF',0);buf.writeUInt32LE(buf.length-8,4);
 buf.write('WAVEfmt ',8);buf.writeUInt32LE(16,16);buf.writeUInt16LE(1,20);
 buf.writeUInt16LE(1,22);buf.writeUInt16LE(rate,24);
 buf.writeUInt32LE(rate*2,28);buf.writeUInt16LE(2,32);
 buf.writeUInt16LE(16,34);buf.write('data',36);
 buf.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++){
  const sample=Math.round(Math.sin(2*Math.PI*440*i/rate)*1800);
  buf.writeInt16LE(sample,44+i*2);
 }
 return buf;
}
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 const errors=[],tone=wav();
 page.on('pageerror',e=>errors.push(String(e).slice(0,150)));
 await page.route('**/fymusic-e2e-tone.wav',route=>route.fulfill({
  status:200,contentType:'audio/wav',body:tone
 }));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>Boolean(window.FyMusicPlaybackDiagnostics?.report),
  null,{timeout:20000});
 await page.evaluate(()=>{
  const mgr=window.LXSourceManager;
  const qualitys=['flac24bit','flac','320k'];
  const fake={id:'fymusic-calibration',name:'FyMusic Test',
   inited:true,runtime:{},sources:{wy:{name:'网易云音乐',
    type:'music',actions:['musicUrl'],qualitys}}};
  mgr.getActive=()=>fake;
  mgr.requestAction=(source,action,info,callback)=>{
   if(source!=='wy'||action!=='musicUrl'){
    callback(new Error('Unsupported fixture action'));return;
   }
   callback(null,{url:location.origin+'/fymusic-e2e-tone.wav'});
  };
  window.LXMusicSearch.search=(source,keyword,page,limit,callback)=>{
   if(source!=='wy'||keyword!=='校准音轨'){
    callback(null,{list:[],searchProvider:'netease-native'});return;
   }
   callback(null,{list:[{id:'fymusic-e2e-test',source:'wy',
    name:'校准音轨',singer:'FyMusic QA',albumName:'校准音频',
    interval:20}],searchProvider:'netease-native'});
  };
  window.LXMusicSearch.isPlayableUrlForSource=(source,url)=>
   source==='wy'&&new URL(url).pathname==='/fymusic-e2e-tone.wav';
 });
 await page.locator('#channel-list .channel-button').filter({hasText:'网易云'}).click();
 await page.locator('#global-search-input').fill('校准音轨');
 await page.locator('#global-search-btn').click();
 await page.locator('.search-song-row').first().waitFor({timeout:10000});
 assert.match(await page.locator('.search-song-row').first().innerText(),/校准音轨/);
 await page.locator('.search-song-row .search-song-main').first().click();
 await page.waitForFunction(()=>
  window.FyMusicPlaybackDiagnostics.report().outcome==='playback_progress_confirmed',
  null,{timeout:12000});
 const report=await page.evaluate(()=>window.FyMusicPlaybackDiagnostics.report());
 assert.equal(report.search.status,'selected');
 assert.equal(report.search.provider,'netease-native');
 assert.equal(report.stages.catalog,'matched');
 assert.equal(report.resolver.attemptCount,1);
 assert.equal(report.media.urlResolved,true);
 assert.equal(report.media.metadataLoaded,true);
 assert.equal(report.media.mediaReady,true);
 assert.equal(report.media.progressConfirmed,true);
 assert.equal(report.media.quality,'flac24bit'); // requested; not actual WAV codec
 assert.equal(report.outcome,'playback_progress_confirmed');
 assert.equal(report.media.http?.result,'media_http_accepted');
 assert.ok(report.media.mediaSeconds>=.35);
 const snapshot=JSON.stringify(report);
 assert.ok(!snapshot.includes('/fymusic-e2e-tone.wav'));
 assert.ok(!snapshot.includes('http://'));
 assert.ok(!snapshot.includes('https://'));
 console.log('FYMUSIC_REAL_UI_CHAIN '+JSON.stringify({
  search:report.search.status,catalog:report.stages.catalog,
  attempts:report.resolver.attemptCount,requestedQuality:report.resolver.quality,
  httpStatus:report.media.http?.status,
  mediaReady:report.media.mediaReady,progress:report.media.progressConfirmed,
  outcome:report.outcome
 }));
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_REAL_UI_CHAIN_PASS');
}finally{await browser.close();}
