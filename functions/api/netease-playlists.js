function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range,If-Range,If-None-Match,If-Modified-Since,X-LX-Headers',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}
function jsonResponse(value,status,request){
  return new Response(JSON.stringify(value),{status:status,headers:Object.assign({'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},corsHeaders(request))});
}
export async function onRequestOptions(context){return new Response(null,{status:204,headers:corsHeaders(context.request)});}
export async function onRequest(context){
  var request=context.request;
  if(String(request.method||'GET').toUpperCase()!=='GET') return jsonResponse({error:'Method Not Allowed'},405,request);
  var url=new URL(request.url);
  var keyword=String(url.searchParams.get('s')||'').replace(/^\s+|\s+$/g,'');
  var id=String(url.searchParams.get('id')||'');
  var limit=Number(url.searchParams.get('limit')||20);
  // id switches this endpoint from playlist search to playlist detail.
  if(id){
    var detailUrl=new URL('https://music.163.com/api/playlist/detail');
    detailUrl.searchParams.set('id',id);
    detailUrl.searchParams.set('s','0');
    detailUrl.searchParams.set('n',String(Math.min(limit,500)));
    var detailController=new AbortController();
    var detailTimeoutId=setTimeout(function(){try{detailController.abort();}catch(e){}},9000);
    try{
      var detailUpstream=await fetch(detailUrl.toString(),{method:'GET',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36','Referer':'https://music.163.com/','Accept':'application/json, text/plain, */*'},signal:detailController.signal});
      var detailText=await detailUpstream.text();
      if(detailUpstream.status<200||detailUpstream.status>=300)return jsonResponse({error:'NetEase playlist detail request failed',message:'HTTP '+detailUpstream.status},502,request);
      var detailData;
      try{detailData=JSON.parse(String(detailText||'').replace(/^\uFEFF/,'').replace(/^\s+|\s+$/g,''));}catch(e){return jsonResponse({error:'NetEase playlist detail response is not JSON'},502,request);}
      var detail=detailData&&detailData.playlist?detailData.playlist:null;
      if(!detail||detail.id==null||!detail.name)return jsonResponse({error:'NetEase playlist detail is unavailable'},404,request);
      var tracks=Array.isArray(detail.tracks)?detail.tracks:[];
      var songs=[];
      for(var ti=0;ti<tracks.length&&songs.length<limit;ti+=1){
        var track=tracks[ti]||{};
        if(track.id==null||!track.name)continue;
        var artists=Array.isArray(track.ar)?track.ar:[];
        var singerNames=[];
        for(var ai=0;ai<artists.length;ai+=1){if(artists[ai]&&artists[ai].name)singerNames.push(String(artists[ai].name));}
        var album=track.al||{};
        songs.push({id:String(track.id),songId:String(track.id),songmid:String(track.id),name:String(track.name||''),singer:singerNames.join('、'),albumName:String(album.name||''),albumId:album.id==null?'':String(album.id),image:String(album.picUrl||''),interval:Number(track.dt)||0,source:'wy',raw:{id:track.id,name:track.name||'',singer:singerNames.join('、'),artists:singerNames,album:album.name||'',albumId:album.id==null?'':album.id,pic:album.picUrl||'',interval:Number(track.dt)||0,source:'wy'}});
      }
      return jsonResponse({playlist:{id:String(detail.id),name:String(detail.name||''),description:String(detail.description||''),coverImgUrl:String(detail.coverImgUrl||''),trackCount:Number(detail.trackCount)||songs.length,creator:detail.creator&&detail.creator.nickname?String(detail.creator.nickname):'',playCount:Number(detail.playCount)||0},songs:songs,total:tracks.length},200,request);
    }catch(e){
      return jsonResponse({error:'NetEase playlist detail request failed',message:e&&e.name==='AbortError'?'NetEase playlist detail upstream timed out':(e&&e.message?e.message:'Unknown upstream error')},502,request);
    }finally{clearTimeout(detailTimeoutId);}
  }
  if(!isFinite(limit)||limit<1)limit=20;
  limit=Math.min(Math.floor(limit),30);
  var target=new URL('https://music.163.com/api/cloudsearch/pc');
  var body=new URLSearchParams();
  body.set('s',keyword||'热门');
  body.set('type','1000');
  body.set('offset','0');
  body.set('limit',String(limit));
  body.set('total','true');
  var controller=new AbortController();
  var timeoutId=setTimeout(function(){try{controller.abort();}catch(e){}},9000);
  try{
    var upstream=await fetch(target.toString(),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36','Referer':'https://music.163.com/','Accept':'application/json, text/plain, */*'},body:body.toString(),signal:controller.signal});
    var text=await upstream.text();
    if(upstream.status<200||upstream.status>=300)return jsonResponse({error:'NetEase playlist request failed',message:'HTTP '+upstream.status},502,request);
    var data;
    try{data=JSON.parse(String(text||'').replace(/^\uFEFF/,'').replace(/^\s+|\s+$/g,''));}catch(e){return jsonResponse({error:'NetEase playlist response is not JSON'},502,request);}
    var list=data&&data.result&&Array.isArray(data.result.playlists)?data.result.playlists:[];
    var slim=[];
    for(var i=0;i<list.length&&slim.length<limit;i+=1){
      var p=list[i]||{};if(p.id==null||!p.name)continue;
      slim.push({id:p.id,name:p.name,description:p.description||'',coverImgUrl:p.coverImgUrl||'',trackCount:Number(p.trackCount)||0,creator:p.creator&&p.creator.nickname?p.creator.nickname:''});
    }
    return jsonResponse({result:{playlistCount:Number(data&&data.result&&data.result.playlistCount)||slim.length,playlists:slim}},200,request);
  }catch(e){
    return jsonResponse({error:'NetEase playlist request failed',message:e&&e.name==='AbortError'?'NetEase playlist upstream timed out':(e&&e.message?e.message:'Unknown upstream error')},502,request);
  }finally{clearTimeout(timeoutId);}
}
