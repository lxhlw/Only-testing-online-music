// Diagnostic only, never print lyrics text, artwork URL tokens, or music streams.
const cancel=async(url,headers={})=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9500);
  try{
    const response=await fetch(url,{headers,signal:controller.signal});
    const body=(await response.text()).slice(0,700000);
    let data=null;
    try{data=JSON.parse(body.replace(/^\uFEFF/,'').trim())}catch{}
    return {http:response.status,mime:response.headers.get('content-type')||'',bytes:body.length,data,
      html:!data&&body.trim().startsWith('<')};
  }catch(e){return {error:String(e.message||e).slice(0,140)}}
  finally{clearTimeout(timer)}
};
const kwSearch='https://search.kuwo.cn/r.s?client=kt&all='+encodeURIComponent('稻香')+
  '&pn=0&rn=15&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1'+
  '&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1';
const search=await cancel(kwSearch,{'Accept':'application/json','User-Agent':'Mozilla/5.0'});
const tracks=Array.isArray(search.data?.abslist)?search.data.abslist:[];
const filtered=tracks.filter(x=>(String(x.SONGNAME||'').includes('稻香')||
  String(x.SONGNAME||'').includes('%'))&&String(x.ARTIST||'').length);
const selected=filtered.find(x=>String(x.ARTIST||'').includes('周杰伦'))||filtered[0]||tracks[0];
const id=String(selected?.MUSICRID||'').replace(/^MUSIC_/,'')||'145389372';
console.log('FYMUSIC_KW_SEARCH_PROBE',JSON.stringify({
 status:search.http,error:search.error||null,recordCount:tracks.length,
 validId:/^\d{1,20}$/.test(id),id,
 metadataImageKeys:Object.keys(selected||{}).filter(k=>/pic|cover|album|image|musicrid/i.test(k)),
 metadataPicExamples:Object.fromEntries(Object.entries(selected||{}).filter(([key])=>
   /pic|cover|image/i.test(key)).slice(0,8).map(([key,value])=>[key,{
     present:!!value,protocol:String(value).slice(0,6),host:(()=>{
       try{return new URL(String(value).startsWith('http')?value:'https:'+value).hostname}catch{return ''}
     })()}]))
}));
const urls=[
  ['kuwo-mobile','https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+id],
  ['kuwo-www','https://www.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+id],
  ['kuwo-openapi','https://www.kuwo.cn/openapi/v1/www/lyric/getlyric?musicId='+id],
  ['gd-lyric','https://music-api.gdstudio.xyz/api.php?types=lyric&source=kuwo&id='+id]
];
for(const [name,url] of urls){
 const rr=await cancel(url,{'Accept':'application/json, text/plain, */*',
   'Referer':'https://m.kuwo.cn/','User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1'});
 const d=rr.data;
 console.log('FYMUSIC_KW_ENRICH_PROBE',JSON.stringify({
   name,status:rr.http,error:rr.error||null,bytes:rr.bytes||0,mime:rr.mime,
   html:rr.html,code:d?.code??null,
   hasData:!!d?.data,songInfoKeys:Object.keys(d?.data?.songinfo||{}).filter(k=>/pic|album|name|artist|cover/i.test(k)).slice(0,12),
   imagePresent:!!(d?.data?.songinfo?.pic||d?.data?.songinfo?.pic120||d?.data?.songinfo?.albumpic),
   lyricRows:Array.isArray(d?.data?.lrclist)?d.data.lrclist.length:null,
   gdLyricsPresent:typeof d?.lyric==='string'&&d.lyric.length>15
 }));
}


const original=new URL('https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+id);
const upstream=await cancel(original.href,{'Accept':'application/json','Referer':'https://m.kuwo.cn/'});
const keys=['id','rid','musicId','musicrid','MUSICRID'];
const song=upstream?.data?.data?.songinfo||{};
const pic=String(song.pic||'');
const imageUrl=pic.startsWith('//')?'https:'+pic:
  pic.startsWith('http://')?'https://'+pic.slice(7):pic;
let host='';
try{host=new URL(imageUrl).hostname}catch{}
console.log('FYMUSIC_KW_SONGINFO_DIAGNOSTIC',JSON.stringify({
 id,keys:Object.fromEntries(keys.filter(k=>song[k]!=null).map(k=>[k,String(song[k]).slice(0,50)])),
 imageHost:host,imageProtocol:imageUrl.slice(0,6),imagePresent:!!pic
}));
const strict=await fetch(original.href,{redirect:'error',signal:AbortSignal.timeout(9000),
 headers:{'Accept':'application/json, text/plain, */*','Referer':'https://m.kuwo.cn/',
 'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1'}
}).then(r=>({status:r.status,redirected:r.redirected})).catch(e=>({error:String(e.message||e).slice(0,180)}));
console.log('FYMUSIC_KW_STRICT_FETCH_DIAGNOSTIC',JSON.stringify(strict));
const {onRequestGet}=await import('../functions/api/kuwo-song-meta.js');
const handler=await onRequestGet({request:new Request('https://fymusic.example/api/kuwo-song-meta?id='+id)});
const data=await handler.json();
console.log('FYMUSIC_KW_HANDLER_DIAGNOSTIC',JSON.stringify({
 status:handler.status,error:data.error||null,
 coverPresent:!!data.image,lyricLines:String(data.lyric||'').split('\n').filter(Boolean).length,
 source:data.source||null,albumPresent:!!data.albumName
}));
