import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage()
let release
const blocked=new Promise(resolve=>{ release=resolve })
const code='/* @name Flower Fixture */\nwindow.lx.send(window.lx.EVENT_NAMES.inited, {status:true,sources:{mg:{actions:["musicUrl"],qualitys:["128k"]}}});'
const huibqCode='/* @name Huibq Fixture @version 1 */\nwindow.lx.send(window.lx.EVENT_NAMES.inited, {status:true,sources:{wy:{actions:["musicUrl"],qualitys:["128k"]},mg:{actions:["musicUrl"],qualitys:["128k"]}}});'
await page.route(/raw\\.githubusercontent\\.com\\/pdone\\/lx-music-source\\/main\\/huibq\\/latest\\.js/, async route => {
  await route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:huibqCode})
})
await page.route(/(?:ghproxy\.net\/raw\.githubusercontent\.com|raw\.githubusercontent\.com)\/pdone\/lx-music-source\/main\/flower\/latest\.js/,async route=>{
 await blocked
 await route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:code})
})
try{
 await page.goto(base+'/',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>window.LXSourceManager?.getSources?.().some(x=>x.url.includes('/huibq/latest.js')),
   null,{timeout:6000})
 await page.evaluate(()=>new Promise((resolve,reject)=>{
   const manual='/* @name My Selected Source */\nwindow.lx.send(window.lx.EVENT_NAMES.inited, {status:true,sources:{wy:{actions:["musicUrl"],qualitys:["128k"]}}});'
   window.LXSourceManager.installFromCode(manual,'https://my-source.example/source.js',err=>err?reject(err):resolve())
 }))
 const before=await page.evaluate(()=>window.LXSourceManager.getActive().url)
 assert.equal(before,'https://my-source.example/source.js')
 release()
 await page.waitForTimeout(1000)
 const result=await page.evaluate(()=>({
   active:window.LXSourceManager.getActive().url,
   sources:window.LXSourceManager.getSources().map(x=>x.url)
 }))
 assert.equal(result.active,before,'Delayed default import must not replace a manual source')
 assert.equal(result.sources.length,2,'Delayed default source must be discarded on manual intervention')
 console.log('PASS: manual installation wins against an in-flight background Flower import')
}finally{release();await browser.close()}
