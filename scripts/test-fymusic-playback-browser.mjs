import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Cloud-only browser test: real Chromium decoder + authorized calibration MP3.
// It never requests a third-party copyrighted song or mocks playback progress.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({
 headless:true,args:['--autoplay-policy=no-user-gesture-required']
});
try{
 const page=await browser.newPage();
 const pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(String(e).slice(0,160)));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForFunction(()=>Boolean(window.FyMusicPlaybackDiagnostics),null,{timeout:18000});
 assert.match(await page.title(),/FyMusic/);
 assert.equal(await page.locator('#fymusic-playback-debug').count(),0);
 await page.evaluate(()=>{
  window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:{
   source:'test',name:'授权校准测试音',singer:'FyMusic'
  }}));
  window.dispatchEvent(new CustomEvent('fymusic:url-resolved',{detail:{
   source:'test',quality:'320k',provider:'selftest',transport:'direct'
  }}));
 });
 const initial=await page.evaluate(()=>window.FyMusicPlaybackDiagnostics.snapshot());
 assert.equal(initial.progressConfirmed,false);
 assert.equal(initial.urlResolved,true);
 await page.evaluate(async()=>{
  const audio=document.getElementById('audio');
  audio.muted=true;
  audio.preload='auto';
  audio.src='/api/audio-selftest';
  await audio.play();
 });
 await page.waitForFunction(()=>window.FyMusicPlaybackDiagnostics.snapshot().progressConfirmed,
  null,{timeout:9000});
 const valid=await page.evaluate(()=>window.FyMusicPlaybackDiagnostics.snapshot());
 assert.equal(valid.progressConfirmed,true);
 assert.equal(valid.mediaReady,true);
 assert.ok(valid.mediaSeconds>0);
 assert.equal(valid.source,'test');
 assert.equal(valid.quality,'320k');
 assert.equal(JSON.stringify(valid).includes('/api/audio-selftest'),false);
 console.log('FYMUSIC_REAL_BROWSER_MEDIA '+JSON.stringify({
  urlResolved:valid.urlResolved,metadataLoaded:valid.metadataLoaded,
  mediaReady:valid.mediaReady,progressConfirmed:valid.progressConfirmed,
  mediaSeconds:valid.mediaSeconds,source:valid.source
 }));
 await page.route('**/fymusic-invalid.mp3',route=>route.fulfill({
  status:200,contentType:'text/html',body:'<!doctype html><title>Not an audio file</title>'
 }));
 await page.evaluate(async()=>{
  const audio=document.getElementById('audio');
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  window.dispatchEvent(new CustomEvent('lx:trackchange',{detail:{
   source:'test',name:'错误媒体测试',singer:'FyMusic'
  }}));
  window.dispatchEvent(new CustomEvent('fymusic:url-resolved',{detail:{
   source:'test',quality:'flac',provider:'selftest',transport:'direct'
  }}));
  audio.src='/fymusic-invalid.mp3';
  await audio.play().catch(()=>{});
 });
 await page.waitForFunction(()=>window.FyMusicPlaybackDiagnostics.snapshot().failed,
  null,{timeout:9000});
 const invalid=await page.evaluate(()=>window.FyMusicPlaybackDiagnostics.snapshot());
 assert.equal(invalid.progressConfirmed,false);
 assert.equal(invalid.failureCode,'media_error');
 assert.equal(invalid.urlResolved,true);
 console.log('FYMUSIC_INVALID_MEDIA '+JSON.stringify({
  failed:invalid.failed,reason:invalid.failureCode,
  mediaErrorCode:invalid.mediaErrorCode,progressConfirmed:invalid.progressConfirmed
 }));
 assert.deepEqual(pageErrors,[]);
 console.log('FYMUSIC_PHASE1_BROWSER_PASS');
}finally{await browser.close();}
