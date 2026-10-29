// Safe, provider-neutral observability for the ONLY approved Flower source.
// Never emit signed media URLs, HTTP request headers, song IDs, or raw errors.
export const FLOWER_PLATFORMS=Object.freeze(['wy','tx','kg','kw','mg']);
const allowedRoute=/^(?:ts-short|tm-short|ts-full|tm-full|sslip-short|sslip-full|nip-short|nip-full|canonical-socket)$/;
const allowedError=/^(?:HTTP_[1-5][0-9]{2}|FLOWER_SOCKET_[A-Z0-9_]+|NETWORK_ERROR|INVALID_PAYLOAD|BLOCKED_TARGET|TIMEOUT)$/;

export function sameArtistSong(list, title='郭源潮', artist='宋冬野') {
  if(!Array.isArray(list))return null;
  return list.find(song=>{
    const titleValue=String(song?.name||'').trim();
    const artistValue=String(song?.singer||song?.artist||'');
    return titleValue===title && artistValue.includes(artist);
  })||null;
}

export function classifyFlowerResolutionFailure(error) {
  const raw=String(error?.message||error||'');
  const failure={category:'UNKNOWN',attempts:[]};
  if(/PROBE_DEADLINE/.test(raw)){failure.category='PROBE_DEADLINE';return failure;}
  const pos=raw.indexOf('{');
  if(pos>=0){
    try{
      const info=JSON.parse(raw.slice(pos));
      if(info && typeof info==='object'){
        if(/^FLOWER_[A-Z0-9_]+$/.test(String(info.diagnostic||'')))
          failure.category=info.diagnostic;
        if(Array.isArray(info.attempts)){
          failure.attempts=info.attempts.slice(0,9).filter(x=>
            allowedRoute.test(String(x?.route||''))&&allowedError.test(String(x?.code||''))
          ).map(x=>({route:x.route,code:x.code}));
        }
      }
    }catch{}
  }
  if(failure.category==='UNKNOWN'){
    if(/HTTP\s+502/.test(raw))failure.category='PROXY_HTTP_502';
    else if(/HTTP\s+404/.test(raw))failure.category='UPSTREAM_HTTP_404';
    else if(/timeout/i.test(raw))failure.category='TIMEOUT';
    else if(/Network/i.test(raw))failure.category='NETWORK_ERROR';
  }
  return failure;
}

export function classifyFlowerRequestRoute(requests,source){
  if(!FLOWER_PLATFORMS.includes(source)||!Array.isArray(requests))
    return {flowerRequested:false,platformMatched:false};
  for(let i=requests.length-1;i>=0;i--){
    const call=requests[i];
    try{
      const url=new URL(call?.url||'');
      if(url.hostname!=='97.64.37.235'||url.protocol!=='http:')continue;
      const path=url.pathname.split('/').filter(Boolean);
      if(path.length<6||path[0]!=='flower'||path[1]!=='v1'||path[2]!=='url')continue;
      return {flowerRequested:true,platformMatched:path[3]===source};
    }catch{}
  }
  return {flowerRequested:false,platformMatched:false};
}
