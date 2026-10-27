import assert from 'node:assert/strict'
import {chromium} from 'playwright'
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8788'
const browser=await chromium.launch({headless:true})
try {
  const page=await browser.newPage()
  const errors=[]
  page.on('pageerror',error=>errors.push(String(error)))
  await page.addInitScript(()=>{
    window.__resolverRequests=[]
    window.LXNativeAudio={
      isAvailable:function(){return true},
      fetchResolver:function(id,path,method,body,headers) {
        window.__resolverRequests.push({id:id,path:path,method:method,body:body,headers:headers})
        var status=method==='POST'?502:200
        var response=status===200?'{"code":0,"url":"https://example.test/audio.mp3"}':'{"error":"Upstream provider unavailable"}'
        setTimeout(function(){
          window.LXNativeResolverTransport.receive(id,status,response)
        },5)
      },
      play:function(){},pause:function(){},resume:function(){},seek:function(){}
    }
  })
  await page.goto(base+'/',{waitUntil:'domcontentloaded'})
  assert.equal(await page.evaluate(()=>window.LXNativeResolverTransport.enabled),true)
  const results=await page.evaluate(()=>new Promise((resolve,reject)=>{
    var transport=window.LXNativeResolverTransport,got=[]
    var origin=location.protocol+'//'+location.host
    function link(x){return origin+'/api/proxy?url='+encodeURIComponent(x)}
    transport.request(link('https://lxmusicapi.onrender.com/url/wy/123/128k'),'GET','','{}',function(status,data){
      got.push({status:status,body:JSON.parse(data)})
      transport.request(link('https://music-api.gdstudio.xyz/api.php'),'POST','types=url&id=123','{}',function(status2,data2){
        got.push({status:status2,body:JSON.parse(data2)})
        resolve(got)
      })
    })
  }))
  assert.equal(results[0].status,200)
  assert.equal(results[1].status,502,'Upstream HTTP 502 must not become HTTP 0')
  assert.equal(results[1].body.error,'Upstream provider unavailable')
  const requests=await page.evaluate(()=>window.__resolverRequests)
  assert.equal(requests.length,2)
  assert.equal(requests[1].method,'POST')
  assert.equal(requests[1].body,'types=url&id=123')
  const other=await page.evaluate(()=>{
    var origin=location.protocol+'//'+location.host
    return window.LXNativeResolverTransport.request(origin+'/api/proxy?url='+
      encodeURIComponent('https://music.163.com/api/search'),'GET','','{}',function(){})
  })
  assert.equal(other,null,'Unrelated source must retain browser XHR path')
  assert.deepEqual(errors,[])
  console.log('PASS: native GET/POST resolver bridge returns real HTTP 200/502 and excludes unrelated source domains')
}finally{await browser.close()}
