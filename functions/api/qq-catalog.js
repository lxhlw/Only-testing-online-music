// Read-only QQ Music public playlist / ranking adapter.
// Platform data always marked source:"tx"; it is never substituted by WY.
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{
 'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=90, s-maxage=180','X-Content-Type-Options':'nosniff'}});
const safe=(s,n=220)=>String(s==null?'':s).slice(0,n);
const number=(x)=>String(x||'');
async function getJson(path,query,signal){
 const url=new URL('https://c.y.qq.com/'+path);
 for(const [k,v] of Object.entries(query||{}))url.searchParams.set(k,String(v));
 url.searchParams.set('format','json');
 const r=await fetch(url,{headers:{'Accept':'application/json','User-Agent':'Mozilla/5.0','Referer':'https://y.qq.com/'},signal});
 if(!r.ok)throw Error('QQ upstream HTTP '+r.status);
 let text=await r.text();
 if(text.length>1300000)throw Error('QQ music response too large');
 text=text.trim().replace(/^callback\(/,'').replace(/\);?$/,'');
 return JSON.parse(text);
}
// QQ's category directory cannot search by keyword. Use the separate
// public SearchCgiService playlist search_type=3 instead of returning 422.
async function searchPlaylists(term,offset,limit,signal){
 const payload={'music.search.SearchCgiService':{
  module:'music.search.SearchCgiService',method:'DoSearchForQQMusicDesktop',
  param:{search_type:3,query:term,page_num:Math.floor(offset/limit)+1,num_per_page:limit}
 }};
 const res=await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg',{
  method:'POST',headers:{'Accept':'application/json','Content-Type':'application/json',
   'Referer':'https://y.qq.com/','User-Agent':'Mozilla/5.0'},
  body:JSON.stringify(payload),signal
 });
 if(!res.ok)throw Error('QQ search HTTP '+res.status);
 const raw=await res.text();
 if(raw.length>1300000)throw Error('QQ search response too large');
 const data=JSON.parse(raw);
 const answer=data?.['music.search.SearchCgiService']||data?.req_1||{};
 // Some valid QQ envelopes omit the outer or module-level code.
 // Only an explicitly non-zero code is an upstream failure.
 if(data?.code!=null&&Number(data.code)!==0)throw Error('QQ search service unavailable: top code');
 if(answer?.code!=null&&Number(answer.code)!==0)throw Error('QQ search service unavailable: module code');
 const body=answer?.data?.body||{};
 const block=body.songlist||body.playlist||{};
 if(!Array.isArray(block.list))throw Error('QQ playlist search response unavailable');
 const list=block.list.map(x=>({
  id:safe(x.dissid||x.tid||x.id,18),
  name:safe(x.dissname||x.title||x.name,160),
  creator:safe(x.creator?.name||x.creator?.nick||x.nickname||x.creator||'',80),
  coverImgUrl:safe(x.imgurl||x.logo||x.cover||x.coverImgUrl||'',300),
  trackCount:Number(x.song_count||x.songnum||x.song_cnt||x.songCount)||0,
  description:'QQ音乐公开歌单',source:'tx'
 })).filter(x=>/^[0-9]{1,18}$/.test(x.id)&&x.name);
 const total=Number(block.totalnum||block.total||block.sum||block.total_count)||list.length;
 return {result:{playlists:list,playlistCount:total},source:'tx'};
}
function normalizeTrack(src){
 const s=src?.data||src?.songInfo||src||{};
 const singers=Array.isArray(s.singer)?s.singer:Array.isArray(s.singers)?s.singers:[];
 const album=s.album||{};
 const songmid=s.songmid||s.mid||'';
 return {id:safe(songmid||s.songid||s.id,60),songmid:safe(songmid,60),
   name:safe(s.songname||s.name||s.title,160),
   singer:singers.map(x=>x?.name||'').filter(Boolean).join('、').slice(0,160),
   albumName:safe(typeof album==='object'?album.name:album,140),
   albumId:safe(typeof album==='object'?album.mid||album.id:s.albummid||s.albumid,60),
   image:album.mid?'https://y.gtimg.cn/music/photo_new/T002R300x300M000'+encodeURIComponent(album.mid)+'.jpg':'',
   interval:Number(s.interval||0),source:'tx'};
}
const qqDefaults={g_tk:'5381',uin:'0',inCharset:'utf8',outCharset:'utf-8',notice:'0',platform:'h5',needNewCode:'1'};
export async function onRequestGet({request}){
 const q=new URL(request.url).searchParams,kind=q.get('kind')||'rank';
 const id=q.get('id')||'',term=safe(q.get('s')||'',60).trim();
 const offset=Number(q.get('offset')||0);
 const limit=Math.min(50,Math.max(1,Math.floor(Number(q.get('limit')||20)||20)));
 if(!['rank','playlist'].includes(kind)||(!/^[0-9]{1,18}$/.test(id)&&id)||
   !Number.isSafeInteger(offset)||offset<0||offset>5000)return response({error:'Invalid query'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8500);
 try{
   if(kind==='rank'&&!id){
     const data=await getJson('v8/fcg-bin/fcg_myqq_toplist.fcg',qqDefaults,controller.signal);
     const list=(data?.data?.topList||[]).filter(x=>x.id&&x.topTitle).slice(0,50).map(x=>({
       id:safe(x.id,18),name:safe(x.topTitle),coverImgUrl:safe(x.picUrl,300),
       source:'tx',trackCount:0
     }));
     if(!list.length)throw Error('QQ chart directory returned no data');
     return response({list,source:'tx'});
   }
   if(kind==='rank'){
     const data=await getJson('v8/fcg-bin/fcg_v8_toplist_cp.fcg',{
       ...qqDefaults,topid:id,type:'top',page:'detail',tpl:'3',
       song_begin:offset,song_num:limit
     },controller.signal);
     const songs=(data?.songlist||data?.data?.songlist||[]).map(normalizeTrack).filter(x=>x.id&&x.name);
     return response({source:'tx',songs,total:Number(data?.total_song_num)||songs.length});
   }
   if(kind==='playlist'&&!id){
     if(term)return response(await searchPlaylists(term,offset,limit,controller.signal));
     const data=await getJson('splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg',{
       ...qqDefaults,picmid:'1',categoryId:'10000000',sortId:'5',sin:offset,ein:offset+limit-1
     },controller.signal);
     const list=(data?.data?.list||[]).map(x=>({
       id:safe(x.dissid||x.tid,18),name:safe(x.dissname||x.title,160),
       creator:safe(x.creator?.name||x.creator?.nick||'',80),
       coverImgUrl:safe(x.imgurl||x.logo||'',300),
       trackCount:Number(x.song_count)||0,
       description:'QQ音乐公开歌单',source:'tx'
     })).filter(x=>x.id&&x.name);
     if(!list.length)throw Error('QQ playlist directory returned no data');
     return response({result:{playlists:list,playlistCount:Number(data?.data?.sum)||list.length},source:'tx'});
   }
   const data=await getJson('qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg',{
     ...qqDefaults,type:'1',json:'1',utf8:'1',onlysong:'0',disstid:id
   },controller.signal);
   const detail=(Array.isArray(data?.cdlist)?data.cdlist[0]:null)||{};
   const tracks=Array.isArray(detail.songlist)?detail.songlist:[];
   if(!tracks.length)throw Error('QQ playlist track endpoint returned no data');
   const songs=tracks.slice(offset,offset+limit).map(normalizeTrack).filter(x=>x.id&&x.name);
   const total=Number(detail.songnum)||tracks.length;
   return response({source:'tx',playlist:{
     id,name:safe(detail.dissname||detail.title,160),source:'tx',
     description:safe(detail.desc,450),
     creator:safe(detail.nick||detail.creator?.nick,70),
     coverImgUrl:safe(detail.logo,300),trackCount:total
   },songs,total,nextOffset:offset+limit,hasMore:offset+limit<total&&offset+limit<tracks.length});
 }catch(e){
   const msg=String(e?.message||'');
   const diagnostic=e?.name==='AbortError'?'TIMEOUT':
     msg.includes('top code')?'SEARCH_TOP_CODE':
     msg.includes('module code')?'SEARCH_MODULE_CODE':
     msg.includes('search response unavailable')?'SEARCH_RESPONSE_SCHEMA':
     msg.includes('search HTTP')?'SEARCH_UPSTREAM_HTTP':
     msg.includes('response too large')?'SEARCH_RESPONSE_TOO_LARGE':
     e?.name==='SyntaxError'?'SEARCH_RESPONSE_JSON':'UPSTREAM_UNAVAILABLE';
   return response({error:'QQ Music unavailable',
     message:e?.name==='AbortError'?'QQ音乐请求超时':'QQ音乐暂未返回此内容，请重试或切换平台',
     diagnostic},502);
 }
 finally{clearTimeout(timer)}
}
