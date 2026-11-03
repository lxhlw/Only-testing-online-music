// Block historical repository assets retained in Cloudflare Pages' asset cache.
// Scope requests via generated dist/_routes.json: never wrap normal app assets.
const blockedFiles=new Set([
 '/readme.md','/package.json','/package-lock.json','/npm-shrinkwrap.json',
 '/pnpm-lock.yaml','/yarn.lock','/wrangler.toml','/wrangler.json',
 '/wrangler.jsonc','/.env'
]);
const blockedRoots=['/scripts','/android-companion','/.github','/.git',
 '/node_modules','/docs','/tests'];
function denied(){
 return new Response('<!doctype html>\n<html lang="en"><meta charset="utf-8"><title>Not found · FyMusic</title><body><h1>404 · Not found</h1><p>Return to <a href="/">FyMusic</a>.</p></body></html>\n',{
  status:404,
  headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store',
   'X-Content-Type-Options':'nosniff'}
 });
}
export function onRequest(context){
 let path;
 try{path=decodeURIComponent(new URL(context.request.url).pathname).replace(/\/+/g,'/').toLowerCase();}
 catch{return denied();}
 if(blockedFiles.has(path)||path.startsWith('/.env.')||
    blockedRoots.some(root=>path===root||path.startsWith(root+'/')))return denied();
 return context.next();
}
