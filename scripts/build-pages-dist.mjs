// FyMusic: allowlisted Cloudflare Pages static artifact. Run at repo root.
// Wrangler's root functions/ directory supplies API routes: never copy it to dist.
import {readFile,writeFile,copyFile,rm,mkdir,stat,readdir} from 'node:fs/promises';
import {join,dirname,posix,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const out=join(root,'dist');
const required=['index.html','settings.html','version.json','styles.css','modern.css',
  'src/mobile-shell.css','vendor/forge.min.js'];
const entries=new Set(required);
const allowed=/^(?:index\.html|settings\.html|version\.json|styles\.css|modern\.css|src\/[a-z0-9.-]+\.(?:js|css)|vendor\/forge\.min\.js)$/;
function add(p) {
 const name=posix.normalize(String(p).replace(/\\/g,'/').split(/[?#]/)[0]);
 assert.ok(allowed.test(name)&&!name.includes('..'),'Disallowed asset: '+name);
 entries.add(name);
 return name;
}
const html=await readFile(join(root,'index.html'),'utf8');
for(const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)){
 if(/^(?:https?:|\/\/)/.test(match[1]))continue;
 add(match[1]);
}
for(const match of html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi)){
 if(/^(?:https?:|\/\/|#)/.test(match[1]))continue;
 add(match[1]);
}
const pending=[...entries],seen=new Set();
while(pending.length){
 const name=pending.shift();
 if(seen.has(name))continue;
 seen.add(name);
 const absolute=resolve(root,name);
 assert.ok(!relative(root,absolute).startsWith('..'));
 const info=await stat(absolute);
 assert.ok(info.isFile(),'Not a file: '+name);
 if(!name.endsWith('.js'))continue;
 const code=await readFile(absolute,'utf8');
 const imports=[
  ...code.matchAll(/\b(?:from\s*|import\s*)["'](\.[^"']+\.js)["']/g),
  ...code.matchAll(/\bimport\s*\(\s*["'](\.[^"']+\.js)["']\s*\)/g)
 ];
 for(const m of imports){
  const dep=add(posix.normalize(posix.join(posix.dirname(name),m[1])));
  if(!seen.has(dep))pending.push(dep);
 }
}
const files=[...entries].sort();
await rm(out,{recursive:true,force:true});
for(const file of files){
 const target=join(out,file);
 await mkdir(dirname(target),{recursive:true});
 await copyFile(join(root,file),target);
}
await writeFile(join(out,'404.html'),
 '<!doctype html>\n<html lang="en"><meta charset="utf-8"><title>Not found · FyMusic</title>'+
 '<body><h1>404 · Not found</h1><p>Return to <a href="/">FyMusic</a>.</p></body></html>\n');
// Only route API and archived repository paths through Functions. Keep media/UI static.
await writeFile(join(out,'_routes.json'),"{\n  \"version\": 1,\n  \"include\": [\n    \"/api/*\",\n    \"/README.md\",\n    \"/package.json\",\n    \"/package-lock.json\",\n    \"/npm-shrinkwrap.json\",\n    \"/yarn.lock\",\n    \"/pnpm-lock.yaml\",\n    \"/wrangler.toml\",\n    \"/wrangler.json\",\n    \"/wrangler.jsonc\",\n    \"/.env\",\n    \"/.env.*\",\n    \"/scripts/*\",\n    \"/android-companion/*\",\n    \"/.github/*\",\n    \"/.git/*\",\n    \"/node_modules/*\",\n    \"/docs/*\",\n    \"/tests/*\"\n  ],\n  \"exclude\": []\n}\n");
const copied=(await readdir(out,{recursive:true,withFileTypes:true}))
 .filter(x=>x.isFile()).length;
assert.equal(copied,files.length+2);
console.log('FYMUSIC_PAGES_DIST_CREATED',JSON.stringify({
 files:files.length+2,sourceAssets:files,output:'dist/',hasFunctionsInStatic:false
}));
