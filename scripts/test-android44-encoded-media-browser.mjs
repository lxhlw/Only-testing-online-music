import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const paths={
 mp3:'/diagnostics/android44-tone-v3.mp3',
 wav:'/diagnostics/android44-tone-v3.wav'
}
for(const [name,path] of Object.entries(paths)){
 const url=new URL(path,base).toString()
 const response=await fetch(url)
 assert.equal(response.status,200,url)
 const type=response.headers.get('content-type')||''
 assert.match(type,name==='mp3'?/audio\/(?:mpeg|mp3)|application\/octet-stream/i:/audio\/wav|audio\/x-wav|application\/octet-stream/i)
 const buf=Buffer.from(await response.arrayBuffer())
 assert.ok(buf.length>20000)
 if(name==='mp3'){
   assert.ok(buf.length>30000,'Deployed MP3 unexpectedly small')
   assert.ok(buf[0]===0xff&&(buf[1]&0xe0)===0xe0,'Deployed MP3 lacks MPEG frame sync')
 } else {
   assert.equal(buf.toString('ascii',0,4),'RIFF','Deployed WAV must be PCM RIFF')
   assert.equal(buf.toString('ascii',8,12),'WAVE')
   assert.equal(buf.readUInt32LE(24),22050)
   assert.ok(buf.length>150000)
 }
 const ranged=await fetch(url,{headers:{Range:'bytes=0-63'}})
 // Cloudflare Pages and Wrangler may return 200 for small static files;
 // require correctly usable media bytes and consistent range when 206.
 assert.ok(ranged.status===206||ranged.status===200,
   'Unexpected static-media range response: '+ranged.status)
 if(ranged.status===206) {
   assert.match(ranged.headers.get('content-range')||'',/^bytes 0-63\/\d+$/)
   assert.equal((await ranged.arrayBuffer()).byteLength,64)
 }
 console.log('PASS: '+name+' served successfully '+buf.length+' bytes and range status '+ranged.status)
}
// Cloudflare Pages intentionally ignores Range on static assets. Our
// compatible Function must implement actual 206 and return only the
// requested payload, verified against the original static asset.
for (const kind of ['mp3','wav']) {
  const route=new URL('/api/legacy-audio?type='+kind,base).toString()
  const normal=await fetch(route)
  assert.equal(normal.status,200)
  assert.equal(normal.headers.get('accept-ranges'),'bytes')
  assert.equal(normal.headers.get('content-type'),kind==='mp3'?'audio/mpeg':'audio/wav')
  const whole=Buffer.from(await normal.arrayBuffer())
  assert.equal(Number(normal.headers.get('content-length')),whole.length)
  const partial=await fetch(route,{headers:{Range:'bytes=0-63'}})
  assert.equal(partial.status,206,'Real old-browser byte range required')
  assert.equal(partial.headers.get('content-range'),'bytes 0-63/'+whole.length)
  assert.equal(partial.headers.get('content-length'),'64')
  assert.deepEqual(Buffer.from(await partial.arrayBuffer()),whole.subarray(0,64))
  const suffix=await fetch(route,{headers:{Range:'bytes=-73'}})
  assert.equal(suffix.status,206)
  assert.equal(suffix.headers.get('content-range'),
    'bytes '+(whole.length-73)+'-'+(whole.length-1)+'/'+whole.length)
  assert.deepEqual(Buffer.from(await suffix.arrayBuffer()),whole.subarray(whole.length-73))
  const invalid=await fetch(route,{headers:{Range:'bytes=9999999-'}})
  assert.equal(invalid.status,416)
  assert.equal(invalid.headers.get('content-range'),'bytes */'+whole.length)
  const head=await fetch(route,{method:'HEAD'})
  assert.equal(head.status,200)
  assert.equal(Number(head.headers.get('content-length')),whole.length)
  assert.equal((await head.arrayBuffer()).byteLength,0)
  const download=await fetch(route+'&download=1')
  assert.equal(download.status,200)
  assert.match(download.headers.get('content-disposition'),/^attachment/)
  console.log('PASS: '+kind+' same-origin 200/206/416/HEAD, byte-accurate output and native-player download')
}
const unsupported=await fetch(new URL('/api/legacy-audio?type=secret',base))
assert.equal(unsupported.status,400,'Audio route must use a fixed allowlist')
const browser=await chromium.launch({headless:true})
try{
 const page=await browser.newPage({viewport:{width:800,height:850}})
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(new URL('/audio-test.html',base).toString(),{waitUntil:'domcontentloaded'})
 assert.ok(await page.locator('#tone source[src*="legacy-audio?type=mp3"]').count())
 assert.ok(await page.locator('#wav source[src*="legacy-audio?type=wav"]').count())
 assert.ok(await page.locator('a[href*="download=1"]').count()>=2)
 await page.locator('#manual-play').click()
 await page.waitForFunction(()=>{
   const a=document.getElementById('tone')
   return isFinite(a.duration) && a.duration>3.8 && a.currentTime>0.25
 },null,{timeout:12000})
 const mp3=await page.locator('#tone').evaluate(a=>({
   duration:a.duration,currentTime:a.currentTime,error:a.error?a.error.code:null,
   src:a.currentSrc
 }))
 assert.equal(mp3.error,null)
 assert.ok(mp3.src.includes('/api/legacy-audio?type=mp3'),'HTML5 player must use the range-enabled media route')
 console.log('PASS: actual MP3 duration and playback progress in Chromium '+JSON.stringify(mp3))
 await page.locator('#wav-play').click()
 await page.waitForFunction(()=>{
   const a=document.getElementById('wav')
   return isFinite(a.duration)&&a.duration>=3.9&&a.currentTime>0.20
 },null,{timeout:12000})
 assert.equal(await page.locator('#wav').evaluate(a=>a.error?a.error.code:null),null)
 console.log('PASS: real PCM WAV decodes and advances')
 await page.locator('#web-audio-test').click()
 const status=await page.locator('#web-audio-status').textContent()
 assert.match(status,/已要求 Web Audio/)
 assert.deepEqual(errors,[])
 console.log('PASS: diagnostic page exposes independent Web Audio output test')
 await page.close()
}finally{await browser.close()}
