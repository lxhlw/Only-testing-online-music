import assert from 'node:assert/strict';
import {chromium} from 'playwright';

// Modern touch/mobile UX fixture. Does not request or validate any third-party
// musicUrl, and does not imitate a successful real audio stream.
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({
   viewport:{width:390,height:844},isMobile:true,hasTouch:true,
   reducedMotion:'reduce'
 });
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(String(e.message||e).slice(0,120)));
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>document.documentElement.classList.contains('mobile-shell-ready') &&
   Boolean(document.querySelector('.mobile-menu-button')) &&
   Boolean(document.querySelector('.mobile-channel-toggle')),null,{timeout:16000});
 const menu=page.locator('.mobile-menu-button');
 const navRail=page.locator('.nav-rail');
 const close=page.locator('.mobile-drawer-close');
 const toggle=page.locator('.mobile-channel-toggle');
 const channels=page.locator('#channel-list');
 assert.equal(await navRail.evaluate(el=>el.inert),true,
   'closed mobile navigation must not be keyboard focusable');
 await menu.tap();
 assert.equal(await menu.getAttribute('aria-expanded'),'true');
 assert.equal(await navRail.getAttribute('role'),'dialog');
 assert.equal(await navRail.getAttribute('aria-modal'),'true');
 assert.equal(await navRail.evaluate(el=>el.inert),false);
 assert.equal(await page.locator('.mobile-menu-shade').isHidden(),false);
 assert.equal(await page.evaluate(()=>document.activeElement?.closest('.nav-rail')!=null),
   true,'opening drawer must move keyboard focus into it');
 // Earlier trap was attached to .main-nav, so it missed the close control.
 await page.locator('.main-nav .nav-item').last().focus();
 await page.keyboard.press('Tab');
 assert.equal(await close.evaluate(el=>document.activeElement===el),true,
   'last navigation item must wrap to drawer-close button');
 await page.keyboard.press('Shift+Tab');
 assert.equal(await page.locator('.main-nav .nav-item').last()
   .evaluate(el=>document.activeElement===el),true,
   'Shift+Tab from close button must wrap to last navigation item');
 // A programmatic focus escape must not leave the modal drawer.
 await page.locator('#global-search-input').focus();
 assert.equal(await close.evaluate(el=>document.activeElement===el),true,
   'focus must remain inside an open modal navigation drawer');
 await page.keyboard.press('Escape');
 assert.equal(await menu.getAttribute('aria-expanded'),'false');
 assert.equal(await menu.evaluate(el=>document.activeElement===el),true,
   'Escape must restore keyboard focus to menu trigger');
 assert.equal(await navRail.evaluate(el=>el.inert),true);
 // Check actual rendered touch targets rather than CSS declaration text.
 const buttons=[menu,close,toggle];
 const sizes=[];
 for(const b of buttons){
   const box=await b.boundingBox();
   sizes.push({width:Math.round(box?.width||0),height:Math.round(box?.height||0)});
 }
 assert.ok(sizes.every(x=>x.width>=44&&x.height>=44),
   'mobile menu, close and source picker must have at least 44px targets');
 // In a fresh browser a source may still be loading, so ensure two safe
 // fixture-only choice buttons exist without calling any playback API.
 await page.evaluate(()=>{
   const group=document.querySelector('#channel-list');
   for(const label of ['QA Channel A','QA Channel B']){
     const button=document.createElement('button');
     button.className='channel-button';
     button.textContent=label;
     button.type='button';
     group.appendChild(button);
   }
 });
 await toggle.tap();
 assert.equal(await toggle.getAttribute('aria-expanded'),'true');
 assert.equal(await channels.evaluate(el=>el.parentElement===document.body),true,
   'popover should move to the body to avoid clipping under sticky bars');
 assert.equal(await channels.evaluate(el=>el.contains(document.activeElement)),true,
   'opening source picker must focus an available choice');
 const optionSizes=await page.locator('#channel-list .channel-button').last().boundingBox();
 assert.ok(optionSizes.height>=44,'source choices need 44px touch targets');
 await page.keyboard.press('Escape');
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 assert.equal(await toggle.evaluate(el=>el===document.activeElement),true,
   'closing source picker with Escape must restore trigger focus');
 assert.equal(await channels.evaluate(el=>el.parentElement===document.body),false);
 await toggle.tap();
 // Slow Edge source initialization can rebuild #channel-list after the first
 // fixture insertion. Reinsert the synthetic choice inside the open popover
 // immediately before the real touch target test. No live source is selected.
 // Source initialization may asynchronously replace the channel list between
 // fixture insertion and tap. Keep the REAL touch interaction, but reinsert
 // the harmless QA-only choice on a bounded retry when its DOM node detaches.
 let qaTapped=false;
 for(let attempt=0;attempt<5&&!qaTapped;attempt++){
   await channels.evaluate(group=>{
     if([...group.querySelectorAll('.channel-button')].some(
       button=>button.textContent==='QA Channel A'))return;
     const button=document.createElement('button');
     button.type='button';
     button.className='channel-button';
     button.textContent='QA Channel A';
     group.appendChild(button);
   });
   try{
     await page.getByRole('button',{name:'QA Channel A',exact:true})
       .tap({timeout:3500});
     qaTapped=true;
   }catch(e){
     if(attempt===4)throw e;
   }
 }
 assert.ok(qaTapped,'real QA channel touch must succeed');
 assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 assert.equal(await toggle.evaluate(el=>el===document.activeElement),true,
   'touch selection must restore focus to source trigger');
 await toggle.tap();
 await page.setViewportSize({width:375,height:780});
 await page.waitForFunction(()=>
   document.querySelector('.mobile-channel-toggle')?.getAttribute('aria-expanded')==='false',
   null,{timeout:3500});
 assert.equal(await toggle.getAttribute('aria-expanded'),'false',
   'viewport geometry changes must close measured source popover');
 assert.equal(await channels.evaluate(el=>el.parentElement===document.body),false);
 // Resize must restore the exact navigation DOM to its original desktop dock.
 await page.setViewportSize({width:1024,height:768});
 await page.waitForFunction(()=>!matchMedia('(max-width:740px)').matches&&
   document.querySelector('.nav-rail')?.inert===false);
 assert.equal(await navRail.evaluate(el=>el.inert),false);
 assert.equal(await navRail.getAttribute('role'),null);
 assert.equal(await menu.isVisible(),false);
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>matchMedia('(max-width:740px)').matches&&
   document.querySelector('.nav-rail')?.inert===true);
 assert.equal(await navRail.evaluate(el=>el.inert),true);
 assert.deepEqual(errors,[]);
 console.log('FYMUSIC_MODERN_MOBILE_A11Y_PASS '+JSON.stringify({
   drawerModalSemantics:true,closeButtonInFocusTrap:true,
   focusEscapeBlocked:true,escapeRestoresTrigger:true,
   touchTargetsAtLeast44px:true,pickerFocused:true,
   pickerTouchAndEscapeRestoreFocus:true,resizeClosesPopover:true,
   desktopNavRestored:true,backToMobileInert:true,
   syntheticControlsOnly:true
 }));
}finally{await browser.close();}
