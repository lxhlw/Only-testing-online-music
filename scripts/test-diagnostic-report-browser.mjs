import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try{
 const page=await browser.newPage({viewport:{width:810,height:1000},
   userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Version/4.0 Chrome/30.0.0.0 Safari/537.36'})
 const errors=[],uploads=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.route('**/api/diagnostic-report',async route=>{
   if(route.request().method()==='POST'){
     uploads.push(JSON.parse(route.request().postData()))
     await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({
       id:'1234567890abcdef12345678',
       url:base+'/api/diagnostic-report?id=1234567890abcdef12345678',
       retentionHours:24
     })})
   }else await route.continue()
 })
 await page.goto(base+'/audio-test.html',{waitUntil:'domcontentloaded'})
 assert.equal(await page.locator('#quick-report').isVisible(),true)
 assert.equal(uploads.length,0,'No upload without explicit button click')
 await page.locator('#audible-choice').selectOption('no')
 await page.locator('#quick-report').click()
 await page.waitForFunction(()=>
   document.getElementById('quick-report-summary').textContent.includes('报告编号: 1234567890abcdef12345678'))
 assert.equal(uploads.length,1)
 const record=uploads[0]
 assert.equal(record.schema,1)
 assert.equal(record.platform.android,'4.4.2')
 assert.equal(record.platform.chrome,'30')
 assert.equal(record.observed.audible,false)
 assert.equal(record.audio.local.error,0)
 assert.equal(typeof record.audio.mp3.currentSrc,'undefined')
 const screenshot=await page.locator('#quick-report-summary').textContent()
 assert.match(screenshot,/无需|没有|MP3|WAV/)
 assert.match(await page.locator('#quick-report-status').textContent(),/24小时/)
 assert.equal(await page.locator('#log').count(),1,'Optional full debug text is retained')
 assert.deepEqual(errors,[])
 console.log('PASS: one-tap V8 compact photo card, consented POST, receipt, no song URLs')
 await page.close()
}finally{
 await browser.close()
}
