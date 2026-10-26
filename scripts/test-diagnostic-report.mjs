import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/diagnostic-report.js'

function store() {
  const saved=new Map()
  return {
    saved,
    async get(key){return saved.get(key)||null},
    async put(key,value,opts){
      assert.ok(opts.expirationTtl>=3600&&opts.expirationTtl<=86400)
      saved.set(key,value)
    }
  }
}
async function call(kv,method,url,payload,extra={}) {
  const headers={...extra}
  if(method==='POST') {
    headers['Content-Type']='application/json'
    if(!Object.hasOwn(extra,'X-LX-Diagnostic'))headers['X-LX-Diagnostic']='1'
  }
  const request=new Request(url,{
    method,headers,body:method==='POST'?JSON.stringify(payload):undefined
  })
  return onRequest({request,env:kv?{LX_DIAGNOSTICS:kv}:{}})
}
const endpoint='https://only-testing-online-music.pages.dev/api/diagnostic-report'
const value={
  schema:1,platform:{android:'4.4.2',chrome:'30'},
  audio:{
    mp3:{time:0,duration:NaN,error:4,ready:4,network:3,paused:true},
    wav:{time:0,duration:0,error:4,ready:0,network:3,paused:true},
    local:{time:0,duration:NaN,error:4,ready:0,network:3,paused:true}
  },
  transfer:{mp3:'SUCCESS 48901 bytes; HTTP 200, blob/URL',
    wav:'SUCCESS 176444 bytes; HTTP 200, blob/URL',
    mp3Method:'data-uri/forced',wavMethod:'blob/URL'},
  features:{audioContext:false,blob:true,dataUri:true},
  observed:{audible:false},
  // Arbitrary identifiers, song URLs and verbose debug logs must be ignored.
  secret:'do not keep me',currentSrc:'https://external.example/secret.mp3'
}
let result=await call(null,'GET',endpoint+'?health=1')
assert.equal((await result.json()).available,false)
result=await call(null,'POST',endpoint,value)
assert.equal(result.status,503)
const kv=store()
result=await call(kv,'POST',endpoint,value,{Origin:'https://not-this-project.example'})
assert.equal(result.status,403)
result=await call(kv,'POST',endpoint,value,{'X-LX-Diagnostic':'0'})
assert.equal(result.status,415)
result=await call(kv,'POST',endpoint,value,{Origin:'https://only-testing-online-music.pages.dev'})
assert.equal(result.status,201)
const receipt=await result.json()
assert.match(receipt.id,/^[a-f0-9]{24}$/)
assert.equal(receipt.retentionHours,24)
result=await call(kv,'GET',endpoint+'?id='+receipt.id)
assert.equal(result.status,200)
const saved=await result.json()
assert.equal(saved.platform.chrome,'30')
assert.equal(saved.audio.mp3.error,4)
assert.equal(saved.transfer.mp3Method,'data-uri/forced')
assert.equal(saved.observed.audible,false)
const serialized=JSON.stringify(saved)
assert.doesNotMatch(serialized,/secret.mp3|do not keep me|currentSrc|CF-Connecting-IP/)
assert.equal(saved.audio.mp3.duration,null)
result=await call(kv,'GET',endpoint+'?id=abc')
assert.equal(result.status,404)
result=await call(kv,'GET',endpoint+'?id='+'a'.repeat(24))
assert.equal(result.status,404)
for(let i=0;i<10;i++) {
  result=await call(kv,'POST',endpoint,value,{'CF-Connecting-IP':'192.0.2.99'})
  assert.equal(result.status,201)
}
result=await call(kv,'POST',endpoint,value,{'CF-Connecting-IP':'192.0.2.99'})
assert.equal(result.status,429)
console.log('PASS: private 24h reports, consent/same-origin guard, redaction, bounded content and abuse quota')
