// Song details are fetched from a fixed NetEase host. No user-defined URL.
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=600, s-maxage=1800','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({request}){
  const id=new URL(request.url).searchParams.get('id')||'';
  if(!/^[0-9]{1,20}$/.test(id))return json({error:'Invalid song ID'},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
  try{
    const url='https://music.163.com/api/song/detail?ids='+encodeURIComponent('['+id+']');
    const r=await fetch(url,{headers:{Accept:'application/json',Referer:'https://music.163.com/','User-Agent':'Mozilla/5.0'},signal:controller.signal});
    if(!r.ok)return json({error:'Metadata upstream unavailable'},502);
    const raw=await r.text();
    if(raw.length>300000)return json({error:'Metadata payload too large'},502);
    let data;try{data=JSON.parse(raw)}catch{return json({error:'Invalid metadata'},502)}
    const track=(Array.isArray(data.songs)?data.songs:[]).find(s=>String(s.id)===id);
    if(!track)return json({error:'Track not found'},404);
    const album=track.al||track.album||{},artists=track.ar||track.artists||[];
    const image=String(album.picUrl||album.pic_url||'');
    let cover='';
    try{
      const u=new URL(image);
      if(u.protocol==='https:'&&/^p[0-9]+\.music\.126\.net$/.test(u.hostname))cover=u.href;
    }catch{}
    return json({id,name:String(track.name||'').slice(0,150),singer:(Array.isArray(artists)?artists.map(a=>a?.name||'').filter(Boolean).join('、'):'').slice(0,180),albumName:String(album.name||'').slice(0,180),image:cover,source:'wy'});
  }catch(e){return json({error:e?.name==='AbortError'?'Metadata request timed out':'Metadata request failed'},502)}
  finally{clearTimeout(timer)}
}
