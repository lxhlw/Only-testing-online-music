// Android 4.4 compatibility calibration MP3, intentionally MPEG-1 Layer III
// mono / 44,100 Hz / CBR 64 kbit/s. The previous MPEG-2.5/8 kHz/16 kbit/s
// diagnostic clip could fail on Chrome 30/Android 4.4 media decoders.
// One complete LAME-encoded 880 Hz frame (no bit reservoir dependency) is
// repeated to form ~1.88 s of audible tone. Verified with FFmpeg/FFprobe.
// Serve audio bytes with correct RFC 7233 byte ranges for native media.
const MP3_FRAME_BASE64='//tSxAABSs0bAAt8qAlvo2Alb5UB3UpgMLsSE27PLxKs7qjlmoZClrtT01utubLZ1deyJS8usxzLRZHRNUe7TO6tY9OxldZQo1VeUtm6uz7Qi4uQR84+fFz/b4qrTM7qPnvU/vPd3Q6d931wASAqy1uBhciSg/R5eBVlZFY0tSqY1N0XMQr0Zkvy5rsjJ3Va2m0lIVKpOyrorWeVmR7kr3KjJMFlojTGu/RnbeEmGTj/kESZPd7HVlqpX8Sd9y/877+bEyOs6hMQU1FMy4xMDAA=';
const FRAME_COUNT=72;
let cache;
function bytes(){
  if(cache)return cache;
  const raw=atob(MP3_FRAME_BASE64);
  const frame=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)frame[i]=raw.charCodeAt(i);
  if(frame.length!==209||frame[0]!==0xff||frame[1]!==0xfb)
    throw new Error('Invalid MPEG-1 Layer III calibration frame');
  const data=new Uint8Array(frame.length*FRAME_COUNT);
  for(let i=0;i<FRAME_COUNT;i++)data.set(frame,i*frame.length);
  cache=data;
  return cache;
}
export async function onRequest(context){
  const request=context.request;
  if(request.method!=='GET'&&request.method!=='HEAD')
    return new Response('Method Not Allowed',{status:405});
  const data=bytes(),total=data.length;
  const headers=new Headers({
    'Content-Type':'audio/mpeg',
    'Accept-Ranges':'bytes',
    'Cache-Control':'public,max-age=300',
    'X-Content-Type-Options':'nosniff',
    'Content-Disposition':'inline; filename="android44-tone.mp3"'
  });
  let start=0,end=total-1,status=200;
  const value=request.headers.get('Range');
  if(value){
    const m=/^bytes=(\d*)-(\d*)$/.exec(value);
    if(!m||(!m[1]&&!m[2])) {
      headers.set('Content-Range','bytes */'+total);
      return new Response(null,{status:416,headers});
    }
    if(!m[1]){
      const suffix=Number(m[2]);
      if(!Number.isFinite(suffix)||suffix<=0){
        headers.set('Content-Range','bytes */'+total);
        return new Response(null,{status:416,headers});
      }
      start=Math.max(0,total-suffix);
    }else{
      start=Number(m[1]);
      if(m[2])end=Math.min(total-1,Number(m[2]));
    }
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>=total||end<start) {
      headers.set('Content-Range','bytes */'+total);
      return new Response(null,{status:416,headers});
    }
    status=206;
    headers.set('Content-Range','bytes '+start+'-'+end+'/'+total);
  }
  headers.set('Content-Length',String(end-start+1));
  return new Response(request.method==='HEAD'?null:data.slice(start,end+1),{status,headers});
}
