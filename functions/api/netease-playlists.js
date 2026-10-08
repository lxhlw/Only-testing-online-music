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
  if(!isFinite(limit)||limit<1)limit=20;
  limit=Math.floor(limit);
  var offset=Number(url.searchParams.get('offset')||0);
  if(!isFinite(offset)||offset<0)offset=0;
  offset=Math.floor(offset);
  // NetEase's current public playlist endpoint is /api/v6/playlist/detail.
  // It exposes full trackIds, while tracks may contain only a short preview.
  if(id){
    // Fetch one bounded page at a time. The UI can request subsequent pages.
    limit=Math.min(limit,50);
    var detailUrl=new URL('https://music.163.com/api/v6/playlist/detail');
    detailUrl.searchParams.set('id',id);
    detailUrl.searchParams.set('n','100000');
    var detailController=new AbortController();
    var detailTimeoutId=setTimeout(function(){try{detailController.abort();}catch(e){}},10000);
    try{
      var detailUpstream=await fetch(detailUrl.toString(),{method:'GET',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36','Referer':'https://music.163.com/','Accept':'application/json, text/plain, */*'},signal:detailController.signal});
      var detailText=await detailUpstream.text();
      if(detailUpstream.status<200||detailUpstream.status>=300)return jsonResponse({error:'NetEase playlist detail request failed',message:'HTTP '+detailUpstream.status},502,request);
      var detailData;
      try{detailData=JSON.parse(String(detailText||'').replace(/^\uFEFF/,'').replace(/^\s+|\s+$/g,''));}catch(e){return jsonResponse({error:'NetEase playlist detail response is not JSON'},502,request);}
      if(!detailData||Number(detailData.code)!==200||!detailData.playlist)return jsonResponse({error:'NetEase playlist detail is unavailable',message:'code='+(detailData&&detailData.code!=null?detailData.code:'unknown')},404,request);
      var detail=detailData.playlist;
      var trackIds=Array.isArray(detail.trackIds)?detail.trackIds:[];
      var previewTracks=Array.isArray(detail.tracks)?detail.tracks:[];
      var totalTracks=trackIds.length||previewTracks.length;
      var requestedLimit=Math.min(limit,Math.max(0,totalTracks-offset));
      var ids=[];
      var seenIds={};
      for(var ii=offset;ii<trackIds.length&&ids.length<requestedLimit;ii+=1){
        var trackId=trackIds[ii]&&trackIds[ii].id!=null?String(trackIds[ii].id):'';
        if(trackId&&!seenIds[trackId]){seenIds[trackId]=true;ids.push(trackId);}
      }
      for(var pi=trackIds.length?previewTracks.length:offset;pi<previewTracks.length&&ids.length<requestedLimit;pi+=1){
        var previewId=previewTracks[pi]&&previewTracks[pi].id!=null?String(previewTracks[pi].id):'';
        if(previewId&&!seenIds[previewId]){seenIds[previewId]=true;ids.push(previewId);}
      }

      function normalizeTrack(track){
        track=track||{};
        var artists=Array.isArray(track.ar)?track.ar:(Array.isArray(track.artists)?track.artists:[]);
        var singerNames=[];
        for(var ai=0;ai<artists.length;ai+=1){if(artists[ai]&&artists[ai].name)singerNames.push(String(artists[ai].name));}
        var album=track.al||track.album||{};
        var trackId=track.id==null?'':String(track.id);
        return {
          id:trackId,
          songId:trackId,
          songmid:trackId,
          name:String(track.name||''),
          singer:singerNames.join('、'),
          albumName:String(album.name||''),
          albumId:album.id==null?'':String(album.id),
          image:String(album.picUrl||album.pic_url||''),
          interval:Number(track.dt||track.duration||0)||0,
          source:'wy',
          raw:track
        };
      }

      var songs=[];
      if(ids.length){
        // Keep batches modest for legacy-friendly request sizes.
        for(var batchOffset=0;batchOffset<ids.length&&songs.length<requestedLimit;batchOffset+=50){
          var chunk=ids.slice(batchOffset,batchOffset+50);
          var songUrl=new URL('https://music.163.com/api/song/detail');
          songUrl.searchParams.set('id',chunk[0]);
          songUrl.searchParams.set('ids','['+chunk.join(',')+']');
          var songText='';
          var songController=new AbortController();
          var songTimeoutId=setTimeout(function(){try{songController.abort();}catch(e){}},8000);
          try{
            var songUpstream=await fetch(songUrl.toString(),{method:'GET',headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36','Referer':'https://music.163.com/','Accept':'application/json, text/plain, */*'},signal:songController.signal});
            if(songUpstream.status<200||songUpstream.status>=300)continue;
            songText=await songUpstream.text();
          }catch(e){continue;}
          finally{clearTimeout(songTimeoutId);}
          var songData=null;
          try{songData=JSON.parse(String(songText||'').replace(/^\uFEFF/,'').replace(/^\s+|\s+$/g,''));}catch(e){}
          var songList=songData&&Array.isArray(songData.songs)?songData.songs:[];
          for(var si=0;si<songList.length&&songs.length<requestedLimit;si+=1){
            var normalized=normalizeTrack(songList[si]);
            if(normalized.id&&normalized.name)songs.push(normalized);
          }
        }
      }

      // Fallback to the preview tracks for public or restricted playlists.
      if(!songs.length&&previewTracks.length){
        for(var ri=offset;ri<previewTracks.length&&songs.length<requestedLimit;ri+=1){
          var fallback=normalizeTrack(previewTracks[ri]);
          if(fallback.id&&fallback.name)songs.push(fallback);
        }
      }
      return jsonResponse({
        playlist:{id:String(detail.id),name:String(detail.name||''),description:String(detail.description||''),coverImgUrl:String(detail.coverImgUrl||''),trackCount:Number(detail.trackCount)||trackIds.length||songs.length,creator:detail.creator&&detail.creator.nickname?String(detail.creator.nickname):'',playCount:Number(detail.playCount)||0},
        songs:songs,
        total:totalTracks,
        nextOffset:Math.min(totalTracks,offset+requestedLimit),
        hasMore:offset+requestedLimit<totalTracks
      },200,request);
    }catch(e){
      return jsonResponse({error:'NetEase playlist detail request failed',message:e&&e.name==='AbortError'?'NetEase playlist detail upstream timed out':(e&&e.message?e.message:'Unknown upstream error')},502,request);
    }finally{clearTimeout(detailTimeoutId);}
  }
  limit=Math.min(limit,30);
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
