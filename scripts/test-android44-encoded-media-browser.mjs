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
const browser=await chromium.launch({headless:true})
try{
 const page=await browser.newPage({viewport:{width:800,height:850}})
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.goto(new URL('/audio-test.html',base).toString(),{waitUntil:'domcontentloaded'})
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
 assert.ok(mp3.src.includes('android44-tone-v3.mp3'))
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
