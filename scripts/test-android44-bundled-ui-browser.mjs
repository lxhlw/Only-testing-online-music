import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const html=readFileSync('android-companion/app/src/main/assets/web/index.html','utf8')
const matches=[...html.matchAll(/<script\s+src="([^"]+)"\s*><\/script>/g)]
const packaged=new Map([['/','index.html'],['/styles.css','styles.css']])
for(const entry of matches) {
 const src=entry[1].replaceAll('&amp;','&').split('?')[0]
 packaged.set('/'+src,src)
}
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage({userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; L101) AppleWebKit/537.36 Version/4.0 Chrome/30.0.0.0 Safari/537.36'})
 const errors=[],served=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.route('**/*',async route=>{
   const url=new URL(route.request().url())
   if(url.origin!==new URL(base).origin)return route.continue()
   const entry=packaged.get(url.pathname)
   if(!entry)return route.continue()
   served.push(entry)
   const mime=entry.endsWith('.js')?'application/javascript':entry.endsWith('.css')?'text/css':'text/html'
   await route.fulfill({status:200,contentType:mime,body:readFileSync('android-companion/app/src/main/assets/web/'+entry)})
 })
 await page.goto(base+'/?native-companion=1',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>window.OnlyTestingMusicApp && window.OnlyTestingNavigate)
 assert.equal(await page.locator('#install-btn').evaluate(x=>typeof x.onclick),'function')
 assert.equal(await page.locator('#global-search-btn').evaluate(x=>typeof x.onclick),'function')
 assert.equal(await page.evaluate(()=>typeof window.LXSourceManager),'object')
 const old=await page.locator('#status').textContent()
 await page.locator('a[data-view="settings"]').click()
 await page.waitForFunction(()=>document.getElementById('view-settings').className.indexOf('active')>=0)
 await page.locator('#source-url').fill('invalid-not-a-https-url')
 await page.locator('#install-btn').click()
 await page.waitForFunction(()=>document.getElementById('status').textContent.indexOf('请输入 HTTP')>=0)
 const state=await page.locator('#status').textContent()
 assert.match(state,/请输入 HTTP/)
 assert.equal(served.length,packaged.size)
 assert.deepEqual(errors,[])
 console.log('PASS: APK-bundled UI rendered all '+served.length+' static resources, navigation/import/search click events bound and respond')
} finally {await browser.close()}
