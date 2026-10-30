import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788';
const browser=await chromium.launch({headless:true});
const flowerUrl='https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
const customUrl='https://example.test/custom-lx.js';
function fixture(name){
 return '/**\n * @name '+name+'\n * @version 1\n */\n'
  +'(function(){var l=globalThis.lx;'
  +'l.on(l.EVENT_NAMES.request,function(ev){return Promise.resolve("https://media.example.test/fixture.wav");});'
  +'l.send(l.EVENT_NAMES.inited,{sources:{wy:{type:"music",actions:["musicUrl"],qualitys:["128k"]}}});})();';
}
const page=await browser.newPage({viewport:{width:1280,height:800}});
try{
 await page.addInitScript(data=>{
  localStorage.setItem('only-testing-online-music.lx-sources',JSON.stringify([
   {id:'flower',url:data.flowerUrl,name:'Flower Fixture',code:data.flowerCode},
   {id:'custom',url:data.customUrl,name:'Custom LX Fixture',code:data.customCode}
  ]));
  // The Web must NOT destroy this user-selected source at startup.
  localStorage.setItem('only-testing-online-music.active-source-id','custom');
 },{flowerUrl,customUrl,flowerCode:fixture('Flower Fixture'),customCode:fixture('Custom LX Fixture')});
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:14000});
 assert.deepEqual(await page.evaluate(()=>window.LXSourceManager.getSources().map(x=>x.name)),
  ['Flower Fixture','Custom LX Fixture']);
 assert.equal(await page.evaluate(()=>window.LXSourceManager.getActive().name),'Custom LX Fixture');
 assert.equal(await page.evaluate(()=>window.LXSourceManager.isFlowerOnlyNative()),false);
 await page.locator('[data-view="settings"]').click();
 assert.equal(await page.locator('#source-url').isVisible(),true);
 assert.equal(await page.locator('#install-btn').isVisible(),true);
 assert.equal(await page.locator('.source-activate-button').count(),2);
 await page.locator('.source-item').first().locator('.source-activate-button').click();
 assert.equal(await page.evaluate(()=>window.LXSourceManager.getActive().name),'Flower Fixture');
 await page.reload({waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:14000});
 assert.equal(await page.evaluate(()=>window.LXSourceManager.getActive().name),'Flower Fixture');
 assert.equal(await page.evaluate(()=>window.LXSourceManager.getSources().length),2);
 await page.locator('[data-view="settings"]').click();
 await page.locator('.source-item').nth(1).locator('.source-activate-button').click();
 await page.reload({waitUntil:'domcontentloaded',timeout:25000});
 await page.waitForFunction(()=>window.LXSourceManager?.getActive()?.inited,{timeout:14000});
 assert.equal(await page.evaluate(()=>window.LXSourceManager.getActive().name),'Custom LX Fixture');
 const result=await page.evaluate(()=>new Promise(resolve=>{
  window.LXSourceManager.requestAction('wy','musicUrl',{type:'128k',musicInfo:{songmid:'fixture'}},
    (err,value)=>resolve({error:err?.message||'',value}));
 }));
 assert.equal(result.error,'');
 assert.equal(result.value,'https://media.example.test/fixture.wav');
 console.log('PASS web-source-persistence: two LX scripts retained, explicit selection persists, original LX musicUrl invoked (fixture only, NOT live audio)');
}finally{await browser.close();}
