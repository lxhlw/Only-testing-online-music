// Read-only, same-platform Kuwo track enrichment. No user-supplied host
// or arbitrary proxy URL; never expose media/audio resolver URLs.
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':status===200?'public, max-age=120, s-maxage=900':'no-store',
    'X-Content-Type-Options':'nosniff'
  }
});
const safeCover=value=>{
  let raw=String(value||'').trim();
  if(raw.startsWith('//'))raw='https:'+raw;
  if(raw.startsWith('http://'))raw='https://'+raw.slice(7);
  try{
    const u=new URL(raw);
    if(u.protocol!=='https:'||u.username||u.password||u.port)return '';
    if(!/^img[0-9]*\.(?:kwcdn\.)?kuwo\.cn$/i.test(u.hostname))return '';
    return u.href;
  }catch{return ''}
};
function buildLrc(rows){
  if(!Array.isArray(rows))return '';
  let total=0;
  const lrc=[];
  for(const row of rows.slice(0,1200)){
    const seconds=Number(row?.time),content=String(row?.lineLyric||'')
      .replace(/[\r\n\u0000-\u001f]/g,' ').trim().slice(0,400);
    if(!Number.isFinite(seconds)||seconds<0||seconds>36000||!content)continue;
    const cs=Math.round(seconds*100);
    const min=String(Math.floor(cs/6000)).padStart(2,'0');
    const sec=String(Math.floor(cs%6000/100)).padStart(2,'0');
    const frac=String(cs%100).padStart(2,'0');
    const line='['+min+':'+sec+'.'+frac+']'+content;
    total+=line.length+1;
    if(total>150000)break;
    lrc.push(line);
  }
  return lrc.join('\n');
}
export async function onRequestGet({request}){
  const id=new URL(request.url).searchParams.get('id')||'';
  if(!/^[0-9]{1,20}$/.test(id))return json({error:'Invalid Kuwo song ID'},400);
  // Only these fixed public Kuwo hosts can ever be requested. No caller
  // controls a URL, origin, HTTP method, or authorization header.
  const endpoints=[
    'https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+id,
    'https://www.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+id,
    // Cloudflare's Kuwo HTTPS H5 endpoint can reply with a short empty
    // sentinel; its fixed public HTTP variant has returned real metadata.
    // This is server-side, no user data, credentials, or signed audio URLs.
    'http://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+id,
    // Prefer correct-source lyrics even when album art metadata is unavailable.
    'https://www.kuwo.cn/openapi/v1/www/lyric/getlyric?musicId='+id
  ];
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),8500);
  let lastHttp=null,lastFailure='upstream-unavailable';
  try{
    for(const endpoint of endpoints){
      try{
        // Do not spoof UA/Referer: Cloudflare Workers may reject these
        // restricted outgoing headers. The fixed endpoints accept plain GET.
        const response=await fetch(endpoint,{redirect:'manual',
          signal:controller.signal});
        lastHttp=response.status;
        if(!response.ok){lastFailure='upstream-http';continue;}
        const announced=Number(response.headers.get('content-length')||0);
        if(announced>700000){lastFailure='upstream-too-large';continue;}
        const raw=await response.text();
        if(raw.length>700000){lastFailure='upstream-too-large';continue;}
        let payload;
        try{payload=JSON.parse(raw.replace(/^\uFEFF/,'').trim())}
        catch{lastFailure='upstream-invalid-json';continue;}
        const data=payload?.data||{},song=data.songinfo||{};
        if(typeof data!=='object'||!song||typeof song!=='object'){
          lastFailure='upstream-invalid-song';continue;
        }
        const returnedId=String(song.musicId||song.musicrid||song.rid||song.id||'')
          .replace(/^MUSIC_/,'');
        if(returnedId&&/^\d+$/.test(returnedId)&&returnedId!==id)
          return json({error:'Kuwo track ID mismatch'},502);
        const lyric=buildLrc(data.lrclist);
        const image=safeCover(song.pic||song.pic120||song.albumpic||song.albumPic);
        if(!lyric&&!image){lastFailure='upstream-empty-track';continue;}
        return json({
          id,source:'kw',
          name:String(song.songName||song.name||'').slice(0,150),
          singer:String(song.artist||'').slice(0,180),
          albumName:String(song.album||'').slice(0,180),
          image,lyric,available:Boolean(lyric)
        });
      }catch(e){
        lastFailure=e?.name==='AbortError'?'upstream-timeout':'upstream-fetch';
        if(controller.signal.aborted)break;
      }
    }
    return json({error:'Kuwo metadata temporarily unavailable',
      upstreamStatus:lastHttp,reason:lastFailure},502);
  }finally{clearTimeout(timer)}
}
export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{Allow:'GET, OPTIONS'}});
}
