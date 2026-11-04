import assert from 'node:assert/strict';
import {chromium, webkit} from 'playwright';

// Browser-simulated touch checks only. They do NOT replace real-device tests,
// screen-reader inspection, or human visual approval.
const base=(process.env.TEST_BASE_URL||'http://127.0.0.1:8788').replace(/\/+$/,'');
const results=[];
for(const [engine,adapter] of Object.entries({chromium,webkit})){
 const browser=await adapter.launch({headless:true});
 try{
  for(const width of [320,390]){
   for(const theme of ['dark','light']){
    const page=await browser.newPage({viewport:{width,height:640},hasTouch:true,deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(e.name));
    // No account, real playlist, third-party audio, or upstream response data.
    await page.addInitScript(()=>{
      localStorage.setItem('only-testing-online-music.default-source-disabled','1');
    });
    await page.route('**/*',route=>{
      if(new URL(route.request().url()).origin===new URL(base).origin)return route.continue();
      return route.abort('blockedbyclient');
    });
    const touchTarget=async(selector,minimum=28)=>{
      const target=page.locator(selector).first();
      await target.scrollIntoViewIfNeeded();
      const check=await target.evaluate((el)=>{
        // Put a normal document control in the center of the available view.
        // A fixed dock must not obscure it when the user scrolls to reach it.
        if(getComputedStyle(el).position!=='fixed')
          el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
        const r=el.getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2;
        const hit=document.elementFromPoint(x,y);
        return {x,y,width:r.width,height:r.height,viewportWidth:innerWidth,
         viewportHeight:innerHeight,
         reachable:x>=0&&x<innerWidth&&y>=0&&y<innerHeight&&
          Boolean(hit&&(hit===el||el.contains(hit)))};
      });
      assert.ok(check.width>=minimum&&check.height>=minimum,
        engine+'/'+width+'/'+theme+' '+selector+' small hit target '+JSON.stringify(check));
      assert.ok(check.reachable,
        engine+'/'+width+'/'+theme+' '+selector+' covered or outside viewport '+JSON.stringify(check));
      return check;
    };
    try{
      await page.goto(base+'/?ui2=1&theme='+theme,{waitUntil:'domcontentloaded',timeout:40000});
      await page.waitForFunction(()=>window.FyMusicUI2Preview?.enabled===true&&
        document.documentElement.classList.contains('mobile-shell-ready'),null,{timeout:20000});
      assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth))<=width+2,
        engine+'/'+width+'/'+theme+' horizontal overflow');
      assert.equal(await page.locator('audio').count(),1);
      const dock=await page.locator('.player-bar').boundingBox();
      assert.ok(dock&&dock.x>=0&&dock.x+dock.width<=width+2&&
        dock.y>=0&&dock.y+dock.height<=640,
        engine+'/'+width+'/'+theme+' dock outside viewport '+JSON.stringify(dock));
      // Stronger than scroll reachability: at 320x640, the entire initial
      // welcome card must be visible above the fixed mini dock without scroll.
      if(width===320){
       const initial=await page.evaluate(()=>{
        const hero=document.querySelector('.search-inspiration');
        const dock=document.querySelector('.player-bar');
        const h=hero?.getBoundingClientRect(),d=dock?.getBoundingClientRect();
        return {scrollY:window.scrollY,cardBottom:h?.bottom??null,
         dockTop:d?.top??null,viewportHeight:innerHeight};
       });
       assert.equal(initial.scrollY,0,engine+'/'+theme+' unexpected initial scroll');
       assert.ok(Number.isFinite(initial.cardBottom)&&
        Number.isFinite(initial.dockTop)&&initial.cardBottom<=initial.dockTop-8,
        engine+'/'+theme+' initial welcome card obscured by fixed player '+
         JSON.stringify(initial));
      }
      await touchTarget('#player-cover-button',32);
      await touchTarget('#player-toggle-btn',40);
      await touchTarget('.search-suggestions button:last-child',28);
      const menu=await touchTarget('.mobile-menu-button',32);
      await page.touchscreen.tap(menu.x,menu.y);
      await page.waitForFunction(()=>document.querySelector('.mobile-menu-button')?.getAttribute('aria-expanded')==='true');
      const settings=await touchTarget('.nav-item[data-view="settings"]',28);
      await page.touchscreen.tap(settings.x,settings.y);
      await page.waitForFunction(()=>document.documentElement.dataset.activeView==='settings');
      await touchTarget('#inline-save-settings',28);
      const toggle=await touchTarget('#ui2-theme-settings-toggle',28);
      await page.touchscreen.tap(toggle.x,toggle.y);
      const opposite=theme==='light'?'dark':'light';
      await page.waitForFunction(value=>document.documentElement.dataset.ui2Theme===value,opposite);
      assert.deepEqual(errors,[],'Unhandled browser errors '+engine+'/'+width+'/'+theme);
      results.push({engine,width,theme,dockVisible:true,searchSuggestionReachable:true,
       menuTouchNavigates:true,settingsTouchReachable:true,themeTouchWorks:true,oneAudio:true});
    }finally{await page.close();}
   }
  }
 }finally{await browser.close();}
}
console.log('FYMUSIC_UI2_SIMULATED_TOUCH_REACHABILITY_PASS',JSON.stringify(results));
