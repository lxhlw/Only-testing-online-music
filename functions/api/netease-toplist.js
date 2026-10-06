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
    var detail=await fetchJson('https://music.163.com/api/playlist/detail?id='+encodeURIComponent(id)+'&limit='+String(limit),controller.signal);
    var playlist=detail&&detail.playlist?detail.playlist:{};
    var tracks=playlist&&Array.isArray(playlist.tracks)?playlist.tracks:[];
    var songs=[];
    for(var t=0;t<tracks.length&&songs.length<limit;t+=1){
      var song=tracks[t]||{};if(song.id==null||!song.name)continue;
      var artists=Array.isArray(song.ar)?song.ar:[];var names=[];
      for(var a=0;a<artists.length;a+=1)if(artists[a]&&artists[a].name)names.push(artists[a].name);
      songs.push({id:String(song.id),name:String(song.name),singer:names.join('、'),source:'wy',albumName:song.al&&song.al.name?String(song.al.name):'',albumId:song.al&&song.al.id?String(song.al.id):'',interval:song.dt?Math.round(Number(song.dt)/1000):0,lyricId:String(song.id)});
    }
    return jsonResponse({playlist:{id:id,name:playlist.name||'',coverImgUrl:playlist.coverImgUrl||''},songs:songs},200,request);
  }catch(e){
    return jsonResponse({error:'NetEase ranking request failed',message:e&&e.name==='AbortError'?'NetEase ranking upstream timed out':(e&&e.message?e.message:'Request failed')},502,request);
  }finally{clearTimeout(timer);}
}
