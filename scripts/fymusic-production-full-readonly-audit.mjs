import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const base=process.env.TEST_BASE_URL;
const sha=process.env.MAIN_SHA;
assert.equal(base,'https://only-testing-online-music.pages.dev');
assert.equal(sha,'586f592dc994b0868886bcb42b1213c3580f278b');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const req=async(path,init={})=>{
  const url=new URL(path,base);
  assert.equal(url.origin,base,'audit only reads exact production origin');
  const res=await fetch(url,{signal:AbortSignal.timeout(25000),redirect:'manual',...init});
  const body=init.method==='HEAD'?Buffer.alloc(0):Buffer.from(await res.arrayBuffer());
  return {res,body};
};
function headers(res){
  const keys=['content-type','cache-control','content-security-policy',
    'strict-transport-security','x-content-type-options','referrer-policy',
    'permissions-policy','x-frame-options','access-control-allow-origin',
    'cross-origin-resource-policy','x-robots-tag'];
  return Object.fromEntries(keys.map(k=>[k,res.headers.get(k)]));
}
const {res:vRes,body:vBody}=await req('/version.json');
assert.equal(vRes.status,200,'production version.json must serve 200');
const version=JSON.parse(vBody.toString('utf8'));
assert.equal(version.name,'FyMusic');
assert.equal(version.version,'0.4.27');
console.log('FYMUSIC_FULL_AUDIT_VERSION',JSON.stringify({version,headers:headers(vRes)}));

const {res:htmlRes,body:htmlBody}=await req('/');
assert.equal(htmlRes.status,200);
const html=htmlBody.toString('utf8');
assert.match(html,/<title>FyMusic/);
assert.match(html,/modern\.css\?v=0\.4\.27/);
console.log('FYMUSIC_FULL_AUDIT_ENTRY',JSON.stringify({
 status:htmlRes.status,bytes:htmlBody.length,headers:headers(htmlRes)
}));
const paths=['index.html','styles.css','modern.css','src/app-version.js',
'src/app.js','src/source-manager.js','src/player-controls.js',
'src/music-search.js','src/modern-ui.js','src/mobile-shell.js',
'src/mobile-shell.css','src/now-playing-experience.js',
'src/fymusic-playback-verifier.js','src/fymusic-playback-core.js',
'src/fymusic-chain-report.js','src/play-settings.js',
'src/music-library.js','src/music-lyrics.js','version.json','settings.html'];
const diffs=[];
for(const path of paths){
 const origin=execFileSync('git',['show',sha+':'+path],{maxBuffer:10_000_000});
 const remote=await req('/'+path);
 const same=remote.res.status===200&&hash(remote.body)===hash(origin);
 const result={path,status:remote.res.status,exact:same,localBytes:origin.length,
  remoteBytes:remote.body.length,contentType:remote.res.headers.get('content-type')};
 console.log('FYMUSIC_FULL_AUDIT_ASSET',JSON.stringify(result));
 if(!same)diffs.push(result);
}
console.log('FYMUSIC_FULL_AUDIT_ASSET_TOTAL',JSON.stringify({total:paths.length,
 exact:paths.length-diffs.length,nonidentical:diffs}));

// Read-only, nonfunctional safety behavior: all requests should fail before
// upstream networking; do NOT test arbitrary public targets or mutation.
const safeProbes=[
 {name:'proxy-missing-target',path:'/api/proxy',expected:[400]},
 {name:'proxy-loopback-ip',path:'/api/proxy?url='+encodeURIComponent('http://127.0.0.1/'),expected:[403]},
 {name:'proxy-localhost',path:'/api/proxy?url='+encodeURIComponent('http://localhost/'),expected:[403]},
 {name:'proxy-v6-loopback',path:'/api/proxy?url='+encodeURIComponent('http://[::1]/'),expected:[403]},
 {name:'proxy-file-scheme',path:'/api/proxy?url='+encodeURIComponent('file:///etc/passwd'),expected:[400]},
 {name:'proxy-cross-origin-header',path:'/api/proxy?url='+encodeURIComponent('https://example.com/'),
  expected:[403],headers:{Origin:'https://example.com'}},
 {name:'proxy-cross-site-fetch-meta',path:'/api/proxy?url='+encodeURIComponent('https://example.com/'),
  expected:[403],headers:{'Sec-Fetch-Site':'cross-site'}}
];
for(const t of safeProbes){
 const {res,body}=await req(t.path,{headers:t.headers||{}});
 const ok=t.expected.includes(res.status);
 console.log('FYMUSIC_FULL_AUDIT_SAFE_PROXY',JSON.stringify({name:t.name,
  status:res.status,expected:t.expected,ok,bytes:body.length}));
 if(!ok)diffs.push({path:'probe:'+t.name,status:res.status});
}
const probes=['README.md','package.json',
'scripts/test-modern-web-browser.mjs','android-companion/README.md',
'.github/workflows/verify-and-deploy.yml','functions/api/proxy.js',
'api/audio-selftest'];
for(const path of probes){
 try{
  const {res,body}=await req('/'+path);
  let matchesRepo=null;
  try{
   const expected=execFileSync('git',['show',sha+':'+path],{maxBuffer:2_000_000});
   matchesRepo=res.status===200&&hash(body)===hash(expected);
  }catch{}
  console.log('FYMUSIC_FULL_AUDIT_PUBLIC_PATH',JSON.stringify({
   path,status:res.status,contentType:res.headers.get('content-type'),
   bytes:body.length,matchesRepo
  }));
 }catch(error){
  console.log('FYMUSIC_FULL_AUDIT_PUBLIC_PATH_ERROR',JSON.stringify({
   path,error:String(error.message).slice(0,140)}));
 }
}
console.log('FYMUSIC_FULL_AUDIT_COMPLETE',JSON.stringify({
 version:'0.4.27',exactAssets:paths.length-diffs.filter(x=>!String(x.path).startsWith('probe:')).length,
 auditedAssets:paths.length,mismatches:diffs
}));
if(diffs.length){
  console.error('FYMUSIC_FULL_AUDIT_FINDINGS_REQUIRE_REVIEW');
  process.exitCode=1;
}
