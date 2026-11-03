import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {onRequest} from '../functions/_middleware.js';
const original=new URL('../',import.meta.url);
const distRoutes=JSON.parse(await readFile(new URL('../dist/_routes.json',import.meta.url),'utf8'));
const tests=[
 ['/README.md',404],['/package.json',404],['/package-lock.json',404],
 ['/scripts/test-modern-web-browser.mjs',404],['/android-companion/README.md',404],
 ['/.github/workflows/verify-and-deploy.yml',404],['/.env.production',404],
 ['/node_modules/a.js',404],['/docs/old.txt',404],
 ['/',200],['/src/app.js',200],['/modern.css',200],['/api/proxy',200]
];
function routeMatches(pattern,pathname){
 return pattern.endsWith('*')?pathname.startsWith(pattern.slice(0,-1)):pattern===pathname;
}
for(const [path,expected] of tests){
 const intercepted=distRoutes.include.some(p=>routeMatches(p,path));
 if(expected===404)assert.ok(intercepted,'Blocked path must invoke edge Function: '+path);
 if(expected===200 && !path.startsWith('/api/'))assert.ok(!intercepted,'Runtime asset must be static: '+path);
 let nextCalled=false;
 const response=await onRequest({request:new Request(new URL(path,original).href),
  next:()=>{nextCalled=true;return new Response('PASSTHROUGH',{status:200})}});
 assert.equal(response.status,expected,path);
 assert.equal(nextCalled,expected===200,'Unexpected middleware pass-through: '+path);
 if(expected===404)assert.match(await response.text(),/404 · Not found/);
}
console.log('FYMUSIC_RETAINED_ASSET_EDGE_GUARD_PASS',{cases:tests.length});
