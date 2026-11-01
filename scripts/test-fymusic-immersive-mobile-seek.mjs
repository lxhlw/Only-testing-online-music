import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Controlled mobile touch + keyboard seek test; no Flower or third-party music.
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},
  isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,130)));
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>Boolean(window.LXPlayerControls?.cancelSeek &&
  document.querySelector('#detail-seek')&&
  document.querySelector('#player-cover-button')),null,{timeout:18000});
 await page.evaluate(()=>{
  const audio=document.querySelector('#audio');
  let t=30;
  Object.defineProperty(audio,'currentTime',{configurable:true,
   get:()=>t,set:value=>{t=value}});
  Object.defineProperty(audio,'duration',{configurable:true,get:()=>200});
  window.__fymusicSeekState={baseChanges:0};
  document.querySelector('#player-seek').addEventListener('change',()=>{
   window.__fymusicSeekState.baseChanges++;
  });
  document.querySelector('#player-seek').disabled=false;
 });
 await page.locator('#player-cover-button').tap();
 const modal=page.locator('#lyrics-overlay'),full=page.locator('#detail-seek');
 assert.equal(await modal.getAttribute('aria-hidden'),'false');
 assert.equal(await page.locator('#lyrics-close-btn')
  .evaluate(e=>document.activeElement===e),true);
 const hit=await full.boundingBox();
 assert.ok(hit.height>=44,'immersive seek needs at least 44 CSS px height');
 const controls=await page.locator('.now-playing-transport-buttons button').all();
 for(const button of controls){
  const b=await button.boundingBox();
  assert.ok(b.height>=44,'immersive transport must have 44px touch targets');
 }
 const initial=await full.inputValue();assert.equal(initial,'150');
 async function beginSeek(value){
  await page.evaluate(value=>{
   const baseSeek=document.querySelector('#player-seek');
   const slider=document.querySelector('#detail-seek');
   baseSeek.disabled=false;slider.disabled=false;
   slider.value=String(value);slider.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
 }
 await beginSeek(500);
 assert.equal(await full.inputValue(),'500');
 assert.equal(await page.locator('#player-seek').inputValue(),'500');
 assert.equal(await page.locator('#detail-current-time').textContent(),'1:40');
 await full.dispatchEvent('pointercancel');
 const cancelled=await page.evaluate(()=>{
  document.querySelector('#detail-seek').dispatchEvent(new Event('change',{bubbles:true}));
  return {baseChanges:window.__fymusicSeekState.baseChanges,
   previewHidden:document.querySelector('#player-seek-preview')?.classList.contains('hidden'),
   fullValue:document.querySelector('#detail-seek')?.value,
   time:document.querySelector('#detail-current-time')?.textContent,
   playback:document.querySelector('#audio').currentTime};
 });
 assert.equal(cancelled.baseChanges,0,'pointercancel must never commit a seek');
 assert.equal(cancelled.playback,30,'pointercancel must not change audio.currentTime');
 assert.equal(cancelled.fullValue,'150','cancelled seek must snap to real playback position');
 assert.equal(cancelled.previewHidden,true,'base seek preview must be cleared');
 assert.equal(cancelled.time,'0:30');
 // Focus must not freeze position updates after cancellation: restore the
 // slider enabled state and synthesize the existing audio event.
 await page.evaluate(()=>{
   const full=document.querySelector('#detail-seek');
   full.focus();
   document.querySelector('#audio').currentTime=50;
   document.querySelector('#player-seek').disabled=false;
   document.querySelector('#audio').dispatchEvent(new Event('timeupdate'));
 });
 assert.equal(await full.inputValue(),'250',
  'focused seek must follow timeupdate when not actively previewing');
 await beginSeek(375);
 await full.dispatchEvent('change');
 assert.equal(await page.evaluate(()=>window.__fymusicSeekState.baseChanges),1,
  'confirmed seek must dispatch exactly one base seek commit');
 await beginSeek(400);
 await full.focus();
 await page.keyboard.press('Escape');
 assert.equal(await modal.getAttribute('aria-hidden'),'false',
  'first Escape cancels active seek rather than closing modal');
 assert.equal(await full.inputValue(),'250');
 await page.keyboard.press('Escape');
 assert.equal(await modal.getAttribute('aria-hidden'),'true',
  'second Escape closes the immersive modal');
 assert.equal(await page.locator('#player-cover-button')
  .evaluate(e=>document.activeElement===e),true);
 // Programmatic focus must not escape a visible immersive dialog.
 await page.locator('#player-cover-button').tap();
 await page.locator('#global-search-input').focus();
 assert.equal(await page.locator('#lyrics-close-btn')
  .evaluate(e=>document.activeElement===e),true);
 // Rotation/viewport change keeps controls in view and refreshes layout.
 await page.setViewportSize({width:740,height:390});
 await page.waitForFunction(()=>innerWidth===740&&innerHeight===390);
 await page.waitForTimeout(90);
 const landscape=await page.evaluate(()=>{
  const seek=document.querySelector('#detail-seek').getBoundingClientRect();
  return {modalOpen:document.querySelector('#lyrics-overlay').getAttribute('aria-hidden')==='false',
    bottom:seek.bottom,top:seek.top,viewport:innerHeight,visible:seek.height>0};
 });
 assert.equal(landscape.modalOpen,true);
 assert.ok(landscape.visible&&landscape.top>=0&&landscape.bottom<=landscape.viewport+2,
   'landscape resize must keep seek control within viewport');
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>innerWidth===390&&innerHeight===844);
 await page.locator('#lyrics-close-btn').tap();
 assert.equal(await modal.getAttribute('aria-hidden'),'true');
 assert.deepEqual(errors,[],'mobile seek interactions must not emit JS errors');
 console.log('FYMUSIC_IMMERSIVE_MOBILE_SEEK_PASS '+JSON.stringify({
   touchTargetsAtLeast44:true,previewWithoutCommit:true,
   pointerCancelResetsBase:true,focusedProgressSync:true,
   confirmedSeekOnce:true,escapeCancelsThenCloses:true,
   focusTrapped:true,landscapeControlsVisible:true,
   syntheticMediaOnly:true
 }));
}finally{await browser.close()}
