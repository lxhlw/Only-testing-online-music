// Read-only same-platform lyric lookup. No arbitrary URLs, secrets or cookies.
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=180, s-maxage=3600','X-Content-Type-Options':'nosniff'};
const response=(payload,status=200)=>new Response(JSON.stringify(payload),{status,headers});
export async function onRequestGet({request}){
  const id=new URL(request.url).searchParams.get('id')||'';
  if(!/^[0-9]{1,20}$/.test(id))return response({error:'Invalid song ID'},400);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7000);
  try{
    const url='https://music.163.com/api/song/lyric?os=pc&id='+id+'&lv=-1&kv=-1&tv=-1';
    const r=await fetch(url,{headers:{'Accept':'application/json','Referer':'https://music.163.com/','User-Agent':'Mozilla/5.0'},signal:controller.signal});
    if(!r.ok)return response({error:'Lyric service unavailable'},502);
    // Avoid accidental large responses from upstream.
    const length=Number(r.headers.get('content-length')||0);
    if(length>524288)return response({error:'Lyric response too large'},502);
    const raw=await r.text();
    if(raw.length>524288)return response({error:'Lyric response too large'},502);
    let data;
    try{data=JSON.parse(raw)}catch{return response({error:'Invalid lyric response'},502)}
    if(!data||typeof data!=='object'||(data.code!=null&&Number(data.code)!==200))
      return response({error:'Lyric unavailable'},404);
    const lrc=data.lrc&&typeof data.lrc.lyric==='string'?data.lrc.lyric:'';
    const translation=data.tlyric&&typeof data.tlyric.lyric==='string'?data.tlyric.lyric:'';
    if(!lrc)return response({lyric:'',tlyric:'',available:false},200);
    return response({lyric:lrc.slice(0,200000),tlyric:translation.slice(0,200000),available:true},200);
  }catch(e){
    return response({error:e?.name==='AbortError'?'Lyric request timed out':'Lyric request failed'},502);
  }finally{clearTimeout(timer)}
}
export async function onRequestOptions(){return new Response(null,{status:204,headers:{Allow:'GET, OPTIONS'}})}
