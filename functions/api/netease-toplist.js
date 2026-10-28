// Correctly normalize NetEase chart songs from trackIds. Public read-only.
const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=180, s-maxage=400','X-Content-Type-Options':'nosniff'};
const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers});
const fallbackCharts=[
  {id:'19723756',name:'飙升榜'},
  {id:'3779629',name:'新歌榜'},
  {id:'2884035',name:'原创榜'},
  {id:'3778678',name:'热歌榜'}
];
async function getJson(url,signal){
  const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Referer':'https://music.163.com/','Accept':'application/json'},signal});
  if(!r.ok)throw Error('Upstream HTTP '+r.status);
  const text=await r.text();
  if(text.length>1700000)throw Error('Chart response too large');
  return JSON.parse(text.replace(/^\uFEFF/,''));
}
const compact=(s,n=100)=>String(s||'').slice(0,n);
function song(track){
  const artists=track.ar||track.artists||[],album=track.al||track.album||{};
  const id=compact(track.id,30);
  return {id,songId:id,songmid:id,name:compact(track.name,170),
    singer:Array.isArray(artists)?artists.map(a=>a?.name||'').filter(Boolean).join('、').slice(0,180):'',
    albumName:compact(album.name,170),albumId:compact(album.id,30),
    image:compact(album.picUrl||album.pic_url,300),
    interval:Number(track.dt||track.duration||0)||0,source:'wy'};
}
export async function onRequestGet({request}){
  const q=new URL(request.url).searchParams,id=q.get('id')||'';
  const limit=Math.max(1,Math.min(50,Math.floor(Number(q.get('limit')||30)||30)));
  if(id&&!/^[0-9]{1,20}$/.test(id))return respond({error:'Invalid chart ID'},400);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),11000);
  try{
    if(!id){
      try{
        const raw=await getJson('https://music.163.com/api/toplist',controller.signal);
        const list=(Array.isArray(raw.list)?raw.list:[]).filter(x=>x?.id&&x?.name)
          .map(x=>({id:String(x.id),name:compact(x.name),coverImgUrl:compact(x.coverImgUrl,300),
            trackCount:Number(x.trackCount)||0}));
        if(list.length)return respond({list,source:'wy'});
      }catch{}
      // Official public IDs provide a visible, actionable directory, not
      // fictional track data. Each chart still loads its actual trackIds.
      return respond({list:fallbackCharts,source:'wy',directoryFallback:true});
    }
    // /api/playlist/detail can return an empty preview even with hundreds
    // of trackIds. /api/v6/playlist/detail reliably carries trackIds.
    const detail=await getJson('https://music.163.com/api/v6/playlist/detail?id='+id+'&n=100000',controller.signal);
    const playlist=detail?.playlist||{};
    if(Number(detail?.code)!==200||!playlist.id)throw Error('No chart detail returned');
    const ids=(Array.isArray(playlist.trackIds)?playlist.trackIds:[]).slice(0,limit)
      .map(x=>String(x?.id||'')).filter(x=>/^\d+$/.test(x));
    let songs=[];
    if(ids.length){
      const items=await getJson('https://music.163.com/api/song/detail?id='+ids[0]+'&ids='+encodeURIComponent('['+ids.join(',')+']'),controller.signal);
      const byId=new Map((items.songs||[]).map(x=>[String(x.id),x]));
      songs=ids.map(x=>byId.get(x)).filter(Boolean).map(song).filter(x=>x.id&&x.name);
    }
    if(!songs.length){
      songs=(Array.isArray(playlist.tracks)?playlist.tracks:[]).slice(0,limit).map(song).filter(x=>x.id&&x.name);
    }
    return respond({playlist:{id,name:compact(playlist.name),coverImgUrl:compact(playlist.coverImgUrl,300)},
      songs,total:Number(playlist.trackCount)||songs.length,source:'wy'});
  }catch(e){
    return respond({error:'Chart unavailable',message:e?.name==='AbortError'?'排行服务请求超时':'该榜单暂时无法取得实际歌曲，请重试'},502);
  }finally{clearTimeout(timer)}
}
export async function onRequestOptions(){return new Response(null,{status:204,headers:{Allow:'GET, OPTIONS'}})}
