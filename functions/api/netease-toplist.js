import { onRequest as playlistDetailRequest } from './netease-playlists.js';
function corsHeaders(request) {
  return {'Access-Control-Allow-Origin':request.headers.get('Origin')||'*','Access-Control-Allow-Methods':'GET,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Range,If-Range,If-None-Match,If-Modified-Since,X-LX-Headers','Cache-Control':'no-store','Vary':'Origin'};
}
function jsonResponse(value,status,request){return new Response(JSON.stringify(value),{status:status,headers:Object.assign({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},corsHeaders(request))});}
export async function onRequestOptions(context){return new Response(null,{status:204,headers:corsHeaders(context.request)});}
async function fetchJson(target,signal){
  var upstream=await fetch(target,{method:'GET',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36','Referer':'https://music.163.com/','Accept':'application/json, text/plain, */*'},signal:signal});
  var text=await upstream.text();
  if(upstream.status<200||upstream.status>=300)throw new Error('HTTP '+upstream.status);
  return JSON.parse(String(text||'').replace(/^\uFEFF/,'').replace(/^\s+|\s+$/g,''));
}
export async function onRequest(context){
  var request=context.request;
  if(String(request.method||'GET').toUpperCase()!=='GET')return jsonResponse({error:'Method Not Allowed'},405,request);
  var url=new URL(request.url);var id=String(url.searchParams.get('id')||'');var limit=Number(url.searchParams.get('limit')||30);
  if(!isFinite(limit)||limit<1)limit=30;limit=Math.min(Math.floor(limit),50);
  var controller=new AbortController();var timer=setTimeout(function(){try{controller.abort();}catch(e){}},10000);
  try{
    if(!id){
      var data=await fetchJson('https://music.163.com/api/toplist',controller.signal);
      var list=data&&Array.isArray(data.list)?data.list:[];
      var slim=[];
      for(var i=0;i<list.length;i+=1){
        var item=list[i]||{};
        if(item.id==null||!item.name)continue;
        slim.push({id:item.id,name:item.name,coverImgUrl:item.coverImgUrl||'',updateFrequency:item.updateFrequency||'',trackCount:Number(item.trackCount)||0});
      }
      return jsonResponse({list:slim},200,request);
    }
    // Rankings are NetEase playlists, but the legacy /api/playlist/detail
    // endpoint often omits playlist.tracks. Delegate to the working V6
    // playlist handler which follows trackIds and resolves /api/song/detail.
    // Reuse the handler directly (no recursive Cloudflare/HTTP roundtrip).
    var detailUrl=new URL(request.url);
    detailUrl.pathname='/api/netease-playlists';
    detailUrl.search='';
    detailUrl.searchParams.set('id',id);
    detailUrl.searchParams.set('offset','0');
    detailUrl.searchParams.set('limit',String(limit));
    var detailRequest=new Request(detailUrl.toString(),request);
    var detailResponse=await playlistDetailRequest(Object.assign({},context,{request:detailRequest}));
    var detailData=await detailResponse.json();
    if(!detailResponse.ok){
      return jsonResponse({
        error:'NetEase ranking track lookup failed',
        message:String(detailData&&detailData.message||detailData&&detailData.error||'Detail unavailable')
      },detailResponse.status,request);
    }
    var songs=detailData&&Array.isArray(detailData.songs)?detailData.songs:[];
    var total=Number(detailData&&detailData.total)||Number(detailData&&detailData.playlist&&detailData.playlist.trackCount)||songs.length;
    if(!songs.length&&total>0){
      return jsonResponse({
        error:'NetEase ranking track metadata unavailable',
        message:'The ranking exists, but song details could not be loaded. Please retry.'
      },502,request);
    }
    return jsonResponse({
      playlist:detailData&&detailData.playlist||{id:id,name:''},
      songs:songs,
      total:total,
      hasMore:Boolean(detailData&&detailData.hasMore),
      nextOffset:Number(detailData&&detailData.nextOffset)||songs.length
    },200,request);
  }catch(e){
    return jsonResponse({error:'NetEase ranking request failed',message:e&&e.name==='AbortError'?'NetEase ranking upstream timed out':(e&&e.message?e.message:'Request failed')},502,request);
  }finally{clearTimeout(timer);}
}
