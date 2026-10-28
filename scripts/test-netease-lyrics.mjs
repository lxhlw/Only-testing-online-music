import assert from 'node:assert/strict'
import { onRequestGet } from '../functions/api/netease-lyrics.js'
const makeRequest=id=>new Request('https://music.example.test/api/netease-lyrics?id='+id)
const invalid=await onRequestGet({request:makeRequest('https://evil.example/')})
assert.equal(invalid.status,400,'No arbitrary URLs are accepted')
const missing=await onRequestGet({request:makeRequest('')})
assert.equal(missing.status,400,'Missing id must be rejected')
const initialFetch=globalThis.fetch
try{
  let called=''
  globalThis.fetch=async (url)=>{
    called=String(url)
    return new Response(JSON.stringify({code:200,lrc:{lyric:'[00:00.00]第一句\\n[00:01.00]第二句'},tlyric:{lyric:''}}),{
      headers:{'Content-Type':'application/json'}
    })
  }
  const ok=await onRequestGet({request:makeRequest('123456')})
  assert.equal(ok.status,200)
  assert.equal(new URL(called).host,'music.163.com','Upstream host must be hardcoded')
  assert.equal(new URL(called).searchParams.get('id'),'123456')
  const payload=await ok.json()
  assert.equal(payload.available,true)
  assert.match(payload.lyric,/第一句/)
  globalThis.fetch=async ()=>new Response(JSON.stringify({code:200,lrc:{lyric:''}}))
  const none=await onRequestGet({request:makeRequest('3')})
  assert.equal(none.status,200)
  assert.equal((await none.json()).available,false)
  globalThis.fetch=async ()=>new Response('bad json')
  const invalidResponse=await onRequestGet({request:makeRequest('4')})
  assert.equal(invalidResponse.status,502)
}finally{globalThis.fetch=initialFetch}
console.log('PASS: secure NetEase lyrics lookup, empty/invalid responses and numeric ID validation')
