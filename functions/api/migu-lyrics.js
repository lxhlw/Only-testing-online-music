// Migu same-platform, read-only LRC fallback.
// Accept only the official Migu CDN path supplied by Migu's own song search.
// No arbitrary URL proxy, redirects, cookies, credentials or audio content.
const respond=(value,status=200)=>new Response(JSON.stringify(value),{
 status,headers:{'Content-Type':'application/json; charset=utf-8',
   'Cache-Control':status===200?'public, max-age=120, s-maxage=300':'no-store',
   'X-Content-Type-Options':'nosniff'}
});
export function validateMiguLyricUrl(value){
 if(typeof value!=='string'||value.length>2000||!value.startsWith('https://'))return '';
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='d.musicapp.migu.cn'||
     url.port||url.username||url.password||url.hash||url.search)return '';
  // The current official result uses the file service's public LRC path.
  // Deny percent-encoded separators, traversal, other CDN products, audio.
  if(!/^\/prod\/file-service\/file-down01\/(?:[a-zA-Z0-9_-]+\/){2,8}[a-zA-Z0-9_.-]+$/.test(url.pathname))return '';
  if(/\.\.|%|(?:\.mp3|\.flac|\.m4a|\.aac|\.wav|\.mp4)$/i.test(url.pathname))return '';
  return url.href;
 }catch{return ''}
}
const validCopyright=id=>/^[A-Za-z0-9_-]{1,80}$/.test(id);
async function readBounded(response,limit){
 const announced=Number(response.headers.get('content-length')||0);
 if(announced>limit)throw new Error('oversized');
 if(!response.body)throw new Error('no-body');
 const reader=response.body.getReader(),chunks=[];
 let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   size+=(value||[]).byteLength;
   if(size>limit)throw new Error('oversized');
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}}
 const bytes=new Uint8Array(size);
 let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 return new TextDecoder('utf-8',{fatal:false}).decode(bytes);
}
export function sanitizeMiguLyric(text){
 if(typeof text!=='string'||text.length>180000||/<(?:html|script|!doctype)/i.test(text))return '';
 const lines=[],timeTag=/\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?\]/;
 let size=0;
 for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/).slice(0,1200)){
  const line=raw.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g,'').trim().slice(0,500);
  if(!timeTag.test(line))continue;
  size+=line.length+1;
  if(size>130000)break;
  lines.push(line);
 }
 return lines.length>=2?lines.join('\n'):'';
}
export async function onRequestGet({request}){
 const p=new URL(request.url).searchParams;
 const id=p.get('id')||'',url=validateMiguLyricUrl(p.get('url')||'');
 if(!validCopyright(id)||!url)return respond({error:'Invalid Migu lyric request'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
 try{
  const upstream=await fetch(url,{redirect:'manual',signal:controller.signal});
  if(upstream.status!==200)return respond({error:'Migu lyric unavailable'},502);
  const text=await readBounded(upstream,180000),lyric=sanitizeMiguLyric(text);
  if(!lyric)return respond({error:'No timed Migu lyric'},502);
  return respond({source:'mg',id,lyric,available:true});
 }catch{return respond({error:'Migu lyric temporarily unavailable'},502)}
 finally{clearTimeout(timer)}
}
export async function onRequestOptions(){
 return new Response(null,{status:204,headers:{Allow:'GET, OPTIONS'}});
}
