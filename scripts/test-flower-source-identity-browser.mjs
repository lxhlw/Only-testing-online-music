import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const USER_FLOWER_URL = 'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js'
const SOURCE_KEY = 'only-testing-online-music.lx-sources'
const ACTIVE_KEY = 'only-testing-online-music.active-source-id'
const huibqCode = '/* @name Huibq_lxmusic源 */\nwindow.lx.send(window.lx.EVENT_NAMES.inited,{status:true,sources:{kw:{actions:["musicUrl"]},kg:{actions:["musicUrl"]},tx:{actions:["musicUrl"]},wy:{actions:["musicUrl"]},mg:{actions:["musicUrl"]}}});'
const flowerCode = '/* @name 野花🌷 */\nwindow.lx.send(window.lx.EVENT_NAMES.inited,{status:true,sources:{kw:{actions:["musicUrl"]},kg:{actions:["musicUrl"]},tx:{actions:["musicUrl"]},wy:{actions:["musicUrl"]},mg:{actions:["musicUrl"]}}});'

const browser=await chromium.launch({headless:true})
const page=await browser.newPage()
const failures=[]
page.on('pageerror',e=>failures.push(String(e)))
await page.addInitScript(({SOURCE_KEY,ACTIVE_KEY,huibqCode})=>{
  localStorage.setItem(SOURCE_KEY, JSON.stringify([{id:'huibq-preinstalled',url:'https://fixture.example/huibq/latest.js',code:huibqCode,name:'Huibq_lxmusic源'}]))
  localStorage.setItem(ACTIVE_KEY,'huibq-preinstalled')
},{SOURCE_KEY,ACTIVE_KEY,huibqCode})
await page.route(USER_FLOWER_URL,async route=>route.fulfill({
  status:200,
  contentType:'text/javascript',
  headers:{'access-control-allow-origin':'*'},
  body:flowerCode
}))
try {
  await page.goto(BASE+'/',{waitUntil:'domcontentloaded'})
  await page.waitForFunction(()=>window.LXSourceManager?.getActive?.()?.inited)
  assert.equal(await page.evaluate(()=>window.LXSourceManager.getActive().name),'Huibq_lxmusic源')
  await page.locator('.nav-item[data-view="settings"]').click()
  await page.locator('#source-url').fill(USER_FLOWER_URL)
  await page.locator('#install-btn').click()
  await page.waitForFunction(expected=>{
    const active=window.LXSourceManager?.getActive?.()
    return Boolean(active && active.inited && active.url===expected &&
      active.sources?.mg?.actions?.includes('musicUrl') &&
      active.sources?.kg?.actions?.includes('musicUrl'))
  },USER_FLOWER_URL,{timeout:12000})
  const snapshot=await page.evaluate(()=>({
    url:window.LXSourceManager.getActive().url,
    name:window.LXSourceManager.getActive().name,
    env:window.LXSourceManager.getActive().runtime?.env,
    mgButtons:document.querySelectorAll('#channel-list .channel-button[title="MG"]').length
  }))
  assert.equal(snapshot.url,USER_FLOWER_URL)
  assert.equal(snapshot.name,'野花🌷')
  assert.equal(snapshot.env,'desktop')
  assert.equal(snapshot.mgButtons,1)
  assert.deepEqual(failures,[])
  console.log('PASS: only the explicitly imported exact Flower mirror is treated as ready, not Huibq')
} finally {
  await browser.close()
}
