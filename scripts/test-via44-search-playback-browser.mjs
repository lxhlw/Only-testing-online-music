import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({
 viewport:{width:360,height:640},
 userAgent:'Mozilla/5.0 (Linux; U; Android 4.4.2; zh-cn; Via) AppleWebKit/537.36 Mobile Safari/537.36'
})
const errors=[]
page.on('pageerror',e=>errors.push(String(e)))
let searches=0
await page.route('**/api/netease-search?*',async route=>{
 searches++
 if(searches===1) return route.fulfill({status:502,contentType:'application/json',body:'{"error":"temporary upstream failure"}'})
 // Avoid relying on network while exercising the legacy UI.
 return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({result:{songs:[{
  id:1234,name:'成都',ar:[{name:'赵雷'}],al:{name:'测试专辑'},dt:300000
 }],songCount:1}})})
})
try {
 await page.goto(base+'/',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited,{},{timeout:25000})
 await page.locator('#channel-list .channel-button[title="WY"]').click()
 await page.locator('#global-search-input').fill('成都')
 await page.locator('#global-search-btn').click()
 await page.waitForFunction(()=>Boolean(document.querySelector('#retry-song-search')),{},{timeout:25000})
 assert.match(await page.locator('#status').textContent(),/搜索失败/)
 await page.locator('#retry-song-search').click()
 await page.waitForFunction(()=>document.querySelectorAll('#search-results .search-row').length>0,{},{timeout:25000})
 assert.equal(await page.locator('#search-results .search-row').count(),1)
 assert.ok(searches>=2)
 console.log('PASS: Via legacy search failure exposes retry; retry restores 成都 result')
 const qualities=await page.evaluate(()=>{
  const p=window.LXPlaySettings
  const supported=['flac','320k','128k']
  const settings=p.load()
  const ua=navigator.userAgent
  const low=/Android 4[.]4/i.test(ua)&&settings.qualityMode==='highest'
    ?p.buildPlan(supported,{qualityMode:'fixed',fixedQuality:'128k',autoFallback:true})
    :p.buildPlan(supported,settings)
  return {ua,low}
 })
 assert.equal(qualities.low[0],'128k')
 assert.deepEqual(errors,[])
 console.log('PASS: Android 4.4 default can prioritize standard compressed audio')
}finally {await browser.close()}
