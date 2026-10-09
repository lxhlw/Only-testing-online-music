import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
const page=await browser.newPage({
  viewport:{width:360,height:640},
  userAgent:'Mozilla/5.0 (Linux; Android 4.4.2; Via) AppleWebKit/537.36 Mobile Safari/537.36'
})
const errors=[]
page.on('pageerror',e=>errors.push(String(e)))
await page.route(/(?:ghproxy\\.net\\/raw\\.githubusercontent\\.com|raw\\.githubusercontent\\.com)\\/pdone\\/lx-music-source\\/main\\/(?:flower|huibq)\\/latest\\.js/,async route=>{
  await route.abort('failed')
})
await page.route('**/api/netease-search?*',async route=>{
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    result:{songCount:1,songs:[{
      id:123456,name:'成都',duration:310000,
      artists:[{name:'赵雷'}],album:{name:'成都测试'}
    }]}
  })})
})
try{
  await page.goto(base+'/',{waitUntil:'domcontentloaded'})
  await page.locator('#channel-list .channel-button[title="WY"]').waitFor({timeout:4000})
  assert.equal(await page.evaluate(()=>window.LXSourceManager.getActive()),null,
    'Native platform search must be available before slow LX downloads complete')
  await page.locator('#global-search-input').fill('成都')
  await page.locator('#global-search-btn').click()
  await page.waitForFunction(()=>document.querySelectorAll('#search-results .search-row').length===1)
  assert.match(await page.locator('#search-results').textContent(),/成都/)
  console.log('PASS: Android 4.4 search returns 成都 even when default LX scripts cannot be reached')
  const result=await page.evaluate(()=>{
    window.__fallbackCalls=[]
    window.LXMusicSearch.resolveMusicUrl=function(source,info,quality,callback){
      window.__fallbackCalls.push({source,quality})
      callback(null,{url:'https://music-test.example/chengdu.mp3',provider:'netease-native'})
    }
    document.querySelector('#search-results .search-row .search-actions button').click()
    return {
      calls:window.__fallbackCalls,
      src:document.querySelector('#audio').src,
      status:document.querySelector('#status').textContent
    }
  })
  assert.equal(result.calls.length,1,'Playback should attempt native resolution when LX source is unavailable')
  assert.equal(result.calls[0].source,'wy')
  assert.ok(result.src.includes('chengdu.mp3'),'Resolved URL must reach the HTML5 audio element')
  assert.deepEqual(errors,[])
  console.log('PASS: 解析并播放 falls back to same-platform resolver without LX source')
}finally{await browser.close()}
