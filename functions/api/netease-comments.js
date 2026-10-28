// Read-only public song comments from the requested platform; never
// synthesize comments and never accept an upstream host from query input.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=120, s-maxage=300','X-Content-Type-Options':'nosniff'}});
const bounded=(s,n)=>String(s||'').slice(0,n);
export async function onRequestGet({request}){
  const query=new URL(request.url).searchParams;
  const id=query.get('id')||'';
  if(!/^[0-9]{1,20}$/.test(id))return json({error:'Invalid song ID'},400);
  // Only NetEase: other platforms must have their own service adapters.
  if(query.has('source')&&query.get('source')!=='wy')return json({error:'Unsupported platform'},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
    const url='https://music.163.com/api/v1/resource/comments/R_SO_4_'+id+'?limit=20&offset=0';
    const r=await fetch(url,{headers:{Accept:'application/json',Referer:'https://music.163.com/','User-Agent':'Mozilla/5.0'},signal:controller.signal});
    if(!r.ok)return json({error:'Comment service unavailable'},502);
    const raw=await r.text();
    if(raw.length>600000)return json({error:'Comment payload too large'},502);
    let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid comment payload'},502)}
    if(!data||Number(data.code||200)!==200)return json({error:'Comment service rejected request'},502);
    const rawList=Array.isArray(data.hotComments)&&data.hotComments.length?data.hotComments:
      Array.isArray(data.comments)?data.comments:[];
    const list=rawList.slice(0,20).map(item=>({
      id:bounded(item.commentId,40),
      user:bounded(item.user?.nickname||'网易云听友',60),
      content:bounded(item.content,1100),
      likedCount:Math.max(0,Math.floor(Number(item.likedCount)||0)),
      time:Number.isFinite(Number(item.time))?Number(item.time):0
    })).filter(item=>item.content);
    return json({source:'wy',id,total:Math.max(0,Number(data.total)||0),kind:Array.isArray(data.hotComments)&&data.hotComments.length?'hot':'recent',comments:list});
  }catch(e){return json({error:e?.name==='AbortError'?'Comments timed out':'Comment request failed'},502)}
  finally{clearTimeout(timer)}
}
