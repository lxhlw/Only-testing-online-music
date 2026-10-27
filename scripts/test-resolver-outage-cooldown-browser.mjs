import assert from 'node:assert/strict'
import {chromium} from 'playwright'

const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
 const page=await browser.newPage()
 const calls={official:0,huibq:0,tune:0,gdTime:0,gdPlay:0}
 const errors=[]
 page.on('pageerror',e=>errors.push(String(e)))
 await page.route('**/api/proxy?url=*',async route=>{
   const request=route.request(),target=new URL(new URL(request.url()).searchParams.get('url'))
   const origin=target.hostname
   const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)})
   if(origin==='music.163.com'||origin==='interface3.music.163.com'){
     calls.official++
     return json(200,{code:200,data:[{id:123,url:null,br:0}]})
   }
   if(origin==='lxmusicapi.onrender.com'){
     calls.huibq++
     return route.fulfill({status:503,contentType:'text/html',body:'<html><title>Service Suspended</title></html>'})
   }
   if(origin==='music-dl.sayqz.com'){
     calls.tune++
     return route.fulfill({status:530,contentType:'text/html',body:'<html><title>Error 1016</title>Origin DNS error</html>'})
   }
   if(origin==='music.gdstudio.xyz'){
     calls.gdTime++
     return route.fulfill({status:200,contentType:'text/plain',body:'1793100000'})
   }
   if(origin==='music-api.gdstudio.xyz'){
     calls.gdPlay++
     return route.fulfill({status:200,contentType:'text/html',body:'<html>provider unavailable</html>'})
   }
   throw Error('unexpected resolver host: '+origin)
 })
 await page.goto(base+'/',{waitUntil:'domcontentloaded'})
 await page.waitForFunction(()=>window.LXMusicSearch && window.LXMusicSearch.resolveMusicUrl)
 async function resolve(id){
   return page.evaluate(id=>new Promise(resolve=>{
     window.LXMusicSearch.resolveMusicUrl('wy',{id:id,songmid:id,name:'Test'},'128k',
       function(err,result){resolve({error:err?String(err.message||err):null,result:result||null})})
   }),id)
 }
 const first=await resolve('123')
 assert.equal(first.result,null)
 assert.match(first.error,/Huibq.*503/)
 assert.match(first.error,/TuneHub.*1016/)
 assert.match(first.error,/GD Studio.*JSON/)
 assert.doesNotMatch(first.error,/<html|DOCTYPE|meta charset/i,'No raw HTML in UI error')
 assert.equal(calls.huibq,1)
 assert.equal(calls.tune,1)
 assert.equal(calls.gdPlay,1)
 const next=await resolve('456')
 assert.match(next.error,/自动重试|暂时不可用/)
 assert.ok(calls.official>=2,'First-party platform resolution must remain active per song')
 assert.equal(calls.huibq,1,'Suspended Huibq provider should not be contacted again immediately')
 assert.equal(calls.tune,1,'1016 DNS provider should not be contacted again immediately')
 assert.equal(calls.gdPlay,1,'Invalid JSON provider should not be contacted again immediately')
 // After the bounded circuit opens again the next song must re-probe all
 // sources; this is NOT a permanent blacklist or a track-ID negative cache.
 await page.evaluate(()=>{
   const after=Date.now()+121000
   Date.now=function(){return after}
 })
 const recovered=await resolve('789')
 assert.match(recovered.error,/Huibq.*503/)
 assert.equal(calls.huibq,2,'Huibq must be re-probed after cooldown expires')
 assert.equal(calls.tune,2,'TuneHub must be re-probed after cooldown expires')
 assert.equal(calls.gdPlay,2,'GD must be re-probed after cooldown expires')
 assert.ok(calls.official>=3,'Official source is always queried')
 assert.deepEqual(errors,[])
 console.log('PASS: actual 503/530-1016/HTML resolver failures summarized without HTML, cached briefly; official platform stays enabled; requests '+JSON.stringify(calls))
}finally{await browser.close()}
