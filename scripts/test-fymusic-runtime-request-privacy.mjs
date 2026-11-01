import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Controlled protocol/privacy test: an invented URL and tag are intercepted
// before reaching the network. This is not a real Flower/music test.
const BASE=process.env.TEST_BASE_URL || 'http://127.0.0.1:8788';
const syntheticTag='FY-DO-NOT-RETAIN-SIGNED-TAG';
const syntheticId='FY-DO-NOT-RETAIN-TRACK-ID';
const syntheticUrl='http://97.64.37.235/flower/v1/url/kw/'+syntheticId+'/128k';
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1366,height:900}});
 await page.goto(BASE,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForFunction(()=>window.LXSourceManager?.installFromCode,
   null,{timeout:18000});
 let forwarded=null;
 await page.route('**/api/proxy?url=**',async route=>{
  const request=route.request();
  const u=new URL(request.url());
  if(u.searchParams.get('url')!==syntheticUrl) return route.continue();
  const headers=request.headers();
  const signed=JSON.parse(headers['x-lx-headers']||'{}');
  forwarded={
   proxied:true,
   signedTag:signed.tag===syntheticTag,
   desktopUserAgent:signed['User-Agent']==='lx-music/desktop'
  };
  return route.fulfill({
   status:502,contentType:'application/json',
   body:JSON.stringify({error:'Flower resolver unavailable',
    diagnostic:'FLOWER_UPSTREAM_UNAVAILABLE'})
  });
 });
 const result=await page.evaluate(async ({syntheticTag,syntheticUrl})=>{
  const sourceCode="/* @name FyMusic controlled privacy QA */\n"+
   "lx.send('inited',{sources:{kw:{actions:['musicUrl'],qualitys:['128k']}}});";
  const installed=await new Promise((resolve,reject)=>{
   window.LXSourceManager.installFromCode(sourceCode,
    'https://fixture.example.invalid/fymusic-privacy-test.js',
    (error,item)=>error?reject(new Error('fixture source install failed')):resolve(item));
  });
  const runtime=installed.runtime;
  const transport=await new Promise((resolve,reject)=>{
   runtime.request(syntheticUrl,{
    method:'GET',
    headers:{'User-Agent':'lx-music/desktop',tag:syntheticTag,
     ver:'2.0.0'}
   },(err,response)=>err?reject(new Error('unexpected XHR transport error')):
    resolve({status:response?.statusCode,diagnostic:response?.body?.diagnostic}));
  });
  return {transport,debugRecords:runtime.__debugRequests};
 },{syntheticTag,syntheticUrl});
 assert.deepEqual(forwarded,{
  proxied:true,signedTag:true,desktopUserAgent:true
 },'real request must still carry exact LX-supplied signed headers');
 assert.equal(result.transport.status,502,
  'HTTP errors must retain LX Desktop Needle response semantics');
 assert.equal(result.transport.diagnostic,'FLOWER_UPSTREAM_UNAVAILABLE');
 const json=JSON.stringify(result.debugRecords);
 assert.ok(!json.includes(syntheticTag)&&!json.includes(syntheticId)&&
  !json.includes('/api/proxy?url='),
  'runtime debug records must not retain signed headers, IDs or proxy URLs');
 assert.deepEqual(result.debugRecords,[{
  method:'GET',proxied:true,category:'flower-resolver'
 }],'debug records contain only stable safe primitives');
 console.log('FYMUSIC_RUNTIME_REQUEST_REDACTION_PASS '+JSON.stringify({
  signedTransportPreserved:true,needleHttp502Preserved:true,
  noSensitiveDebugSnapshots:true,category:'flower-resolver'
 }));
}finally{await browser.close();}
