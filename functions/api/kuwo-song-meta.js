// Read-only, same-platform Kuwo track enrichment. No user-supplied host
// or arbitrary proxy URL; never expose media/audio resolver URLs.
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':'public, max-age=120, s-maxage=900',
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
    if(!/^img[0-9]*\.kuwo\.cn$/i.test(u.hostname))return '';
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
  const u=new URL(request.url),id=u.searchParams.get('id')||'';
  if(!/^[0-9]{1,20}$/.test(id))return json({error:'Invalid Kuwo song ID'},400);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),7500);
  try{
    const url='https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId='+id;
    const response=await fetch(url,{redirect:'error',signal:controller.signal,headers:{
      'Accept':'application/json, text/plain, */*',
      'Referer':'https://m.kuwo.cn/',
      'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Version/16.0 Mobile/15E148 Safari/604.1'
    }});
    if(!response.ok)return json({error:'Kuwo song metadata unavailable'},502);
    const announced=Number(response.headers.get('content-length')||0);
    if(announced>700000)return json({error:'Kuwo metadata too large'},502);
    const raw=await response.text();
    if(raw.length>700000)return json({error:'Kuwo metadata too large'},502);
    let payload;
    try{payload=JSON.parse(raw.replace(/^\uFEFF/,'').trim())}
    catch{return json({error:'Invalid Kuwo metadata response'},502)}
    const data=payload?.data||{},song=data.songinfo||{};
    if(!data||typeof data!=='object'||!song||typeof song!=='object')
      return json({error:'Invalid Kuwo track metadata'},502);
    const returnedId=String(song.musicId||song.musicrid||song.rid||song.id||'')
      .replace(/^MUSIC_/,'');
    if(returnedId&&/^\d+$/.test(returnedId)&&returnedId!==id)
      return json({error:'Kuwo track ID mismatch'},502);
    const lyric=buildLrc(data.lrclist);
    const image=safeCover(song.pic||song.pic120||song.albumpic||song.albumPic);
    return json({
      id,source:'kw',
      name:String(song.songName||song.name||'').slice(0,150),
      singer:String(song.artist||'').slice(0,180),
      albumName:String(song.album||'').slice(0,180),
      image,lyric,available:Boolean(lyric)
    });
  }catch(e){
    return json({error:e?.name==='AbortError'?
      'Kuwo metadata timed out':'Kuwo metadata request failed'},502);
  }finally{clearTimeout(timer)}
}
export async function onRequestOptions(){
  return new Response(null,{status:204,headers:{Allow:'GET, OPTIONS'}});
}
