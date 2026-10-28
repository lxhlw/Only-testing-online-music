// Public, read-only comments on one NetEase track. Strict numeric ID,
// bounded offset, fixed upstream host and independent hot/recent modes.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'public, max-age=45, s-maxage=120',
  'X-Content-Type-Options':'nosniff'}});
const bounded=(s,n)=>String(s||'').slice(0,n);
export async function onRequestGet({request}){
  const q=new URL(request.url).searchParams,id=q.get('id')||'',source=q.get('source')||'wy';
  if(!/^[0-9]{1,20}$/.test(id)||source!=='wy')return json({error:'Invalid song ID or source'},400);
  const mode=q.get('mode')||'hot';
  if(!['hot','recent'].includes(mode))return json({error:'Invalid comment mode'},400);
  const offset=Number(q.get('offset')||0);
  if(!Number.isSafeInteger(offset)||offset<0||offset>5000||offset%20!==0)
    return json({error:'Invalid comment page'},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),7000);
  try{
    const url='https://music.163.com/api/v1/resource/comments/R_SO_4_'+id+
      '?limit=20&offset='+(mode==='hot'?'0':offset);
    const r=await fetch(url,{headers:{Accept:'application/json',Referer:'https://music.163.com/','User-Agent':'Mozilla/5.0'},signal:controller.signal});
    if(!r.ok)return json({error:'Comment service unavailable'},502);
    const raw=await r.text();
    if(raw.length>600000)return json({error:'Comment payload too large'},502);
    let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid comment response'},502)}
    if(!data||Number(data.code||200)!==200)return json({error:'Upstream rejected comment request'},502);
    const sourceList=mode==='hot'?data.hotComments:data.comments;
    const items=Array.isArray(sourceList)?sourceList:[];
    const comments=items.slice(0,20).map(item=>({
      id:bounded(item.commentId,40),user:bounded(item.user?.nickname||'网易云听友',60),
      content:bounded(item.content,1100),likedCount:Math.max(0,Math.floor(Number(item.likedCount)||0)),
      time:Math.max(0,Number(item.time)||0)
    })).filter(item=>item.content);
    const total=Math.max(0,Number(data.total)||0);
    return json({source:'wy',id,kind:mode,total,offset,limit:20,
      // Hot list can be limited to a curated subset by NetEase. Do not
      // misrepresent unreturned comments as additional hot pages.
      hasMore:mode==='recent'&&comments.length===20&&offset+20<total&&offset+20<=5000,
      comments});
  }catch(e){return json({error:e?.name==='AbortError'?'Comments timed out':'Comment request failed'},502)}
  finally{clearTimeout(timer)}
}
