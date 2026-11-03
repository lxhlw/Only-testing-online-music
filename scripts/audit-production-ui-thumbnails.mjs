import {chromium} from 'playwright';
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='https://only-testing-online-music.pages.dev';
const out='audit-ui-thumbnails';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const shots=[];
for(const width of [1440,390]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:900},deviceScaleFactor:1,hasTouch:width===390});
 const page=await context.newPage();
 await page.addInitScript(()=>localStorage.setItem('only-testing-online-music.default-source-disabled','1'));
 await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>Boolean(window.OnlyTestingNavigate&&window.LXPlayerControls),null,{timeout:15000});
 async function save(name){
  await page.waitForTimeout(280);
  const raw=await page.screenshot({type:'png',animations:'disabled'});
  await writeFile(out+'/'+name+'.png',raw);
  const optimized=await sharp(raw).resize({width:width===390?390:900}).jpeg({quality:56}).toBuffer();
  shots.push({name,size:optimized.length});
  console.log('FYMUSIC_UI_THUMB:'+name+':'+optimized.toString('base64'));
 }
 async function go(view){
  if(width===390)await page.locator('.mobile-menu-button').click();
  await page.locator('.nav-item[data-view="'+view+'"]').click();
  await page.waitForFunction(v=>document.querySelector('#view-'+v)?.classList.contains('active'),view);
 }
 await save(width+'-search');
 if(width===390){
  await page.locator('.mobile-menu-button').click();
  await save(width+'-nav-drawer');
  await page.locator('.mobile-menu-button').click();
 }
 await go('playlist');
 await page.waitForTimeout(1250);
 await save(width+'-playlist');
 await go('ranking');
 await page.waitForTimeout(1250);
 await save(width+'-ranking');
 await go('mylist');
 await save(width+'-library');
 await go('settings');
 await save(width+'-settings');
 await page.locator('#player-cover-button').click();
 await save(width+'-lyrics');
 await page.locator('#lyrics-close-btn').click();
 await context.close();
}
await browser.close();
console.log('FYMUSIC_UI_THUMB_COMPLETE',JSON.stringify(shots));
