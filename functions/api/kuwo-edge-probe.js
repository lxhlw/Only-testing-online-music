// TEMPORARY development-only Cloudflare egress diagnostic. Delete before
// opening a release. No arbitrary URL or input, no actual lyric content.
export async function onRequestGet(){
 const urls=[
  ['mobile-https','https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=440613'],
  ['www-https','https://www.kuwo.cn/newh5/singles/songinfoandlrc?musicId=440613'],
  ['www-openapi','https://www.kuwo.cn/openapi/v1/www/lyric/getlyric?musicId=440613'],
  ['search','https://search.kuwo.cn/r.s?client=kt&all=%E7%A8%BB%E9%A6%99&pn=0&rn=2&rformat=json'],
  ['gd','https://music-api.gdstudio.xyz/api.php?types=lyric&source=kuwo&id=440613'],
  ['ucds','https://music-api.ucds.me/api.php?types=lyric&source=kuwo&id=440613'],
  ['root','https://kuwo.cn/newh5/singles/songinfoandlrc?musicId=440613'],
  ['mobile-http','http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=440613']
 ];
 const data=[];
 for(const [name,url] of urls){
  const attempt={name};
  try{
   const resp=await fetch(url,{signal:AbortSignal.timeout(4500),redirect:'manual'});
   attempt.status=resp.status;
   attempt.type=(resp.headers.get('content-type')||'').slice(0,60);
   attempt.redirect=resp.status>=300&&resp.status<400;
   let text=await resp.text();
   attempt.length=text.length;
   try{
    const obj=JSON.parse(text);
    attempt.lyrics=Array.isArray(obj?.data?.lrclist)?
      obj.data.lrclist.length:(typeof obj?.lyric==='string'&&obj.lyric.length>20);
    attempt.meta=Boolean(obj?.data?.songinfo);
   }catch{}
  }catch(e){
   attempt.error=String(e.name||'Error');
   attempt.message=String(e.message||'').slice(0,170).replace(/https?:\/\/\S+/g,'[url]');
  }
  data.push(attempt);
 }
 return new Response(JSON.stringify({data}),{
  status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
 });
}
