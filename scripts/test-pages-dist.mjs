import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dist=join(root,'dist'),paths=[];
async function visit(dir,prefix=''){
 for(const item of await readdir(dir,{withFileTypes:true})){
  const pathname=prefix+item.name;
  if(item.isDirectory()) await visit(join(dir,item.name),pathname+'/');
  else {assert.ok(item.isFile());paths.push(pathname);}
 }
}
await visit(dist);
paths.sort();
assert.ok(paths.length>=20&&paths.length<=32,'Unexpected build size: '+paths.length);
for(const name of ['index.html','404.html','version.json','vendor/forge.min.js'])
 assert.ok(paths.includes(name),'Required static asset absent: '+name);
assert.equal(JSON.parse(await readFile(join(dist,'version.json'),'utf8')).version,
 JSON.parse(await readFile(join(root,'version.json'),'utf8')).version);
const forbidden=['README.md','package.json','.github/workflows/verify-and-deploy.yml',
 'scripts/test-modern-web-browser.mjs','android-companion/README.md',
 'functions/api/proxy.js','src/android-external-audio.js',
 'src/android-native-resolver.js','src/android-native-xhr-fallback.js',
 'src/source-transpiler.js','src/promise-lite.js'];
for(const name of forbidden)assert.ok(!paths.includes(name),'Repository file shipped: '+name);
assert.ok(paths.every(p=>!/(^|\/)(?:\.git|\.github|scripts|android-companion|functions|node_modules)(\/|$)/.test(p)));
const html=await readFile(join(dist,'index.html'),'utf8');
for(const m of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)){
 const url=m[1].split(/[?#]/)[0];
 if(!url||url.startsWith('http:')||url.startsWith('https:')||url.startsWith('//'))continue;
 assert.ok(paths.includes(url),'Broken index asset reference: '+url);
}
for(const name of paths.filter(p=>p!=='404.html')){
 const a=await readFile(join(root,name)),b=await readFile(join(dist,name));
 assert.ok(a.equals(b),'Unexpected static content rewrite: '+name);
}
const mobileSource=await readFile(join(dist,'src/mobile-shell.js'),'utf8');
assert.ok(mobileSource.includes("drawerName.textContent='FyMusic'"),
 'FyMusic mobile drawer brand was not updated');
assert.ok(!mobileSource.includes("drawerName.textContent='LX Music'"),
 'Obsolete mobile drawer brand exposed');
const appSource=await readFile(join(dist,'src/app.js'),'utf8');
assert.ok(!appSource.includes('音源已执行并发送 inited：'),
 'Technical-only source initialized message is still visible');
console.log('FYMUSIC_PAGES_DIST_ALLOWLIST_PASS',JSON.stringify({files:paths.length,paths}));
