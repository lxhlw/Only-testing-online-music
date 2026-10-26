import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8788'
const browser = await chromium.launch({ headless: true })
const userAgent = 'Mozilla/5.0 (Linux; Android 4.4.2; L101 Build/KOT49H) AppleWebKit/537.36 Version/4.0 Chrome/30.0.0.0 Safari/537.36'
try {
  const diagnostic = await browser.newPage({userAgent})
  const errors = []
  diagnostic.on('pageerror', e => errors.push(String(e)))
  await diagnostic.goto(base + '/audio-test.html', {waitUntil:'domcontentloaded'})
  assert.equal(await diagnostic.locator('#android-external-mp3').isVisible(),true)
  assert.equal(await diagnostic.locator('#android-external-wav').isVisible(),true)
  const intents = await diagnostic.evaluate(() => ({
    mp3:document.getElementById('android-external-mp3').getAttribute('href'),
    wav:document.getElementById('android-external-wav').getAttribute('href'),
    unsafe:window.LXAndroidExternalAudio.buildIntentUrl('javascript:alert(1)','audio/mpeg'),
    injected:window.LXAndroidExternalAudio.buildIntentUrl('https://a.test/x.mp3#Intent;package=evil;end','audio/mpeg'),
    safe:window.LXAndroidExternalAudio.buildIntentUrl('https://a.test/x.mp3?x=1;y=2','audio/mpeg')
  }))
  assert.match(intents.mp3,/^intent:\/\/[^#]+\/api\/legacy-audio\?type=mp3&v=9#Intent;scheme=https?;action=android\.intent\.action\.VIEW;/)
  assert.match(intents.wav,/type=audio\/wav;end$/)
  assert.equal(intents.unsafe,'')
  assert.equal(intents.injected,'')
  assert.match(intents.safe,/x=1%3By=2#Intent;/)
  await diagnostic.evaluate(() => document.getElementById('android-external-mp3').onclick())
  assert.match(await diagnostic.locator('#android-external-result').textContent(),/不.*(?:判断|确认)|已尝试/)
  assert.deepEqual(errors,[])
  await diagnostic.close()
  const app = await browser.newPage({userAgent})
  const pageErrors=[]
  app.on('pageerror', e => pageErrors.push(String(e)))
  await app.addInitScript(() => localStorage.setItem('only-testing-online-music.default-source-disabled','1'))
  await app.goto(base + '/', {waitUntil:'domcontentloaded'})
  assert.equal(await app.locator('#legacy-external-player').getAttribute('href'),null)
  assert.equal(await app.locator('#legacy-external-player').getAttribute('aria-disabled'),'true')
  await app.evaluate(() => {
    window.LXSourceManager.getActive=function(){return null}
    window.LXMusicSearch.resolveMusicUrl=function(source,music,quality,callback){
      callback(null,{url:'https://media.example.test/song.mp3?token=signed123',provider:'test-audio'})
    }
    const a=document.getElementById('audio')
    a.load=function(){}
    Object.defineProperty(a,'src',{configurable:true,set:function(v){this._fake=String(v)},get:function(){return this._fake||''}})
    Object.defineProperty(a,'duration',{configurable:true,get:function(){return 200}})
    Object.defineProperty(a,'readyState',{configurable:true,get:function(){return 4}})
    a.play=function(){return Promise.resolve()}
    a.pause=function(){}
    window.OnlyTestingMusicApp.playMusic({id:'321',songId:'321',source:'wy',name:'Android audio test',singer:'test',interval:200000})
  })
  await app.waitForFunction(() => Boolean(document.getElementById('legacy-external-player').getAttribute('href')))
  const state = await app.evaluate(() => ({
    href:document.getElementById('legacy-external-player').getAttribute('href'),
    disabled:document.getElementById('legacy-external-player').getAttribute('aria-disabled')
  }))
  assert.equal(state.disabled,null)
  assert.match(state.href,/^intent:\/\/[^#]+\/api\/proxy\?url=/)
  assert.match(state.href,/#Intent;scheme=https?;action=android\.intent\.action\.VIEW;/)
  assert.match(state.href,/type=audio\/mpeg;end$/)
  assert.deepEqual(pageErrors,[])
  console.log('PASS: Android 4.4 only, manual user-gesture intent links, no silent autoplay, signed URLs remain encoded in same-origin proxy')
}finally{await browser.close()}
