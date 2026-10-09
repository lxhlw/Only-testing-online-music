import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Linux; Android 4.4.2; Via) AppleWebKit/537.36 Mobile Safari/537.36'
})
const page = await context.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
const code = '/* @name Flower Fixture @version 1 */\nwindow.lx.send(window.lx.EVENT_NAMES.inited, {status:true,sources:{wy:{name:"网易云",actions:["musicUrl"],qualitys:["128k"]},mg:{name:"咪咕",actions:["musicUrl"],qualitys:["128k"]}}});'
let flowerFetches = 0
const huibqCode='/* @name Huibq Fixture @version 1 */\nwindow.lx.send(window.lx.EVENT_NAMES.inited, {status:true,sources:{wy:{actions:["musicUrl"],qualitys:["128k"]},mg:{actions:["musicUrl"],qualitys:["128k"]}}});'
await page.route(/raw\.githubusercontent\.com\/pdone\/lx-music-source\/main\/huibq\/latest\.js/, async route => {
  await route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:huibqCode})
})
await page.route(/(?:ghproxy\.net\/raw\.githubusercontent\.com|raw\.githubusercontent\.com)\/pdone\/lx-music-source\/main\/flower\/latest\.js/, async route => {
  flowerFetches++
  await route.fulfill({status:200, contentType:'text/javascript', headers:{'Access-Control-Allow-Origin':'*'},body:code})
})
await page.route('**/api/proxy?url=*',async route=>{
  const target=new URL(route.request().url()).searchParams.get('url') || ''
  if(target.includes('/v1.0/content/search_all.do')){
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      code:'000000', songResultData:{totalCount:1,result:[{
        songId:'123456',copyrightId:'6005861N71E',contentId:'600929000002562618',
        name:'成都',singerList:[{name:'赵雷'}],resourceType:'2',
        audioFormats:[{formatType:'PQ',asize:3400000}]
      }]}
    })})
    return
  }
  await route.continue()
})
try {
  await page.goto(base+'/',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(() =>
    window.LXSourceManager?.getSources?.().length >= 2 &&
    window.LXSourceManager?.getActive?.()?.inited,
    null,{timeout:30000}
  )
  const state = await page.evaluate(() => ({
    list: window.LXSourceManager.getSources().map(x=>({name:x.name,url:x.url,inited:x.inited})),
    active: window.LXSourceManager.getActive().url,
    runtimeEnv: window.LXSourceManager.getActive().runtime?.env,
    supported: Array.from(document.querySelectorAll('#channel-list button')).map(x=>x.title)
  }))
  assert.equal(state.list.length,2,'New devices need exactly two real default LX scripts')
  assert.ok(state.list.some(x=>x.url.includes('/flower/latest.js')))
  assert.ok(state.list.some(x=>x.url.includes('/huibq/latest.js')))
  assert.ok(await page.evaluate(() => window.LXSourceManager.getSources().every(x => x.inited && !x.code.includes('verified built-in adapter marker'))),'Defaults must contain initialized original LX code, never placeholder metadata')
  assert.ok(state.active.includes('/flower/latest.js'))
  assert.equal(state.runtimeEnv,'desktop','Legacy Via must expose desktop LX API environment')
  assert.ok(state.supported.includes('MG'))
  assert.ok(state.supported.includes('WY'))
  assert.equal(await page.locator('#channel-list .channel-button.active').getAttribute('title'),'WY',
    'Android 4.4 Via should initially search the lighter same-origin WY channel')
  await page.locator('#channel-list button[title="MG"]').click()
  await page.locator('#global-search-input').fill('成都')
  await page.locator('#global-search-btn').click()
  await page.waitForFunction(() => document.querySelectorAll('#search-results .search-row').length>0)
  assert.equal(await page.locator('#search-results .search-row').count(),1,
    'Via user must see Migu 成都 search result without manual importing')
  assert.match(await page.locator('#search-results .search-row').first().textContent(),/成都/)
  console.log('PASS: Android 4.4 Via search of 成都 works with default Flower')

  const fetchedOnce=flowerFetches
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForFunction(() => window.LXSourceManager?.getActive?.()?.inited,null,{timeout:16000})
  assert.equal(await page.evaluate(()=>window.LXSourceManager.getSources().length),2,'Reload cannot duplicate defaults')
  assert.equal(flowerFetches,fetchedOnce,'Cached source must run locally without network re-import')
  await page.locator('.nav-item[data-view="settings"]').click()
  assert.ok(await page.locator('#restore-default-sources-btn').isVisible())
  await page.locator('#clear-btn').click()
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(()=>window.LXSourceManager.getSources().length),0,
    'Explicit clear must not silently reinstate third-party scripts')
  console.log('PASS: Android Via first visit auto-seeds Flower/Huibq, caches once and respects clear')
  assert.deepEqual(errors,[],'Unexpected browser errors')
} finally { await browser.close() }
