// FyMusic isolated CI fixture: original 440Hz mono PCM tone, never a music URL.
// This endpoint is present only on the development Preview branch. It is not
// used by the player itself, and does not proxy or resolve third-party audio.
const RATE=8000,SECONDS=14,HEADER=44,FRAME_BYTES=2;
const CHUNK_BYTES=16384,STALL_AT=HEADER+RATE*FRAME_BYTES*3;
const PRIMED_MP3_FRAMES=460,PRIMED_GAP_MS=16000;
const FRAME_BASE64='//tSxAABSs0bAAt8qAlvo2Alb5UB3UpgMLsSE27PLxKs7qjlmoZClrtT01utubLZ1deyJS8usxzLRZHRNUe7TO6tY9OxldZQo1VeUtm6uz7Qi4uQR84+fFz/b4qrTM7qPnvU/vPd3Q6d931wASAqy1uBhciSg/R5eBVlZFY0tSqY1N0XMQr0Zkvy5rsjJ3Va2m0lIVKpOyrorWeVmR7kr3KjJMFlojTGu/RnbeEmGTj/kESZPd7HVlqpX8Sd9y/877+bEyOs6hMQU1FMy4xMDAA=',FRAME_SIZE=209,MP3_FRAMES=1600,MP3_STALL_AT=FRAME_SIZE*136;
let stored=null,mp3Stored=null;
function fixture(format='wav'){
  if(format==='mp3'){
    if(mp3Stored)return mp3Stored;
    const binary=atob(FRAME_BASE64),frame=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)frame[i]=binary.charCodeAt(i);
    if(frame.length!==FRAME_SIZE||frame[0]!==255||frame[1]!==251)
      throw Error('Invalid isolated MP3 fixture');
    const bytes=new Uint8Array(FRAME_SIZE*MP3_FRAMES);
    for(let i=0;i<MP3_FRAMES;i++)bytes.set(frame,i*FRAME_SIZE);
    mp3Stored=bytes;return bytes;
  }
  if(stored)return stored;
  const total=HEADER+RATE*SECONDS*FRAME_BYTES;
  const bytes=new Uint8Array(total),v=new DataView(bytes.buffer);
  const ascii=(at,value)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i)};
  ascii(0,'RIFF');v.setUint32(4,total-8,true);
  ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,RATE,true);v.setUint32(28,RATE*FRAME_BYTES,true);
  v.setUint16(32,FRAME_BYTES,true);v.setUint16(34,16,true);
  ascii(36,'data');v.setUint32(40,total-HEADER,true);
  for(let i=0;i<RATE*SECONDS;i++)
    v.setInt16(HEADER+i*2,Math.round(Math.sin(i*2*Math.PI*440/RATE)*1200),true);
  stored=bytes;return stored;
}
const invalidRange=(headers,total)=>{
  headers.set('Content-Range','bytes */'+total);
  headers.set('Content-Length','0');
  return new Response(null,{status:416,headers});
};
export async function onRequest({request}){
  if(request.method!=='GET'&&request.method!=='HEAD')
    return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const mode=new URL(request.url).searchParams.get('mode')||'normal';
  if(!['normal','gap','cut','progressive','primed'].includes(mode))
    return new Response('Unsupported test mode',{status:400});
  const format=new URL(request.url).searchParams.get('format')||'wav';
  if(!['wav','mp3'].includes(format))return new Response('Invalid format',{status:400});
  if((mode==='progressive'||mode==='primed')&&format!=='mp3')
    return new Response('Progressive mode requires MP3',{status:400});
  const data=fixture(format),total=data.length;
  const split=mode==='primed'?FRAME_SIZE*PRIMED_MP3_FRAMES:
    (format==='mp3'?MP3_STALL_AT:STALL_AT);
  const headers=new Headers({
    'Content-Type':format==='mp3'?'audio/mpeg':'audio/wav',
    'Accept-Ranges':'bytes',
    'Cache-Control':'no-store, no-transform',
    'X-Content-Type-Options':'nosniff',
    'X-FyMusic-Synthetic-Fixture':mode
  });
  // QA-only progressive MP3 intentionally has neither declared length nor
  // RFC 7233 serving: an unknown-length HTTP 200 byte stream is legal.
  // This isolates Chromium's known-length/Range prebuffering from HTTP timing.
  const progressive=mode==='progressive'||mode==='primed';
  if(progressive)headers.set('Accept-Ranges','none');
  let first=0,last=total-1,status=200;
  const range=progressive?null:request.headers.get('range');
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||(!match[1]&&!match[2]))return invalidRange(headers,total);
    if(!match[1]){
      const suffix=Number(match[2]);
      if(!Number.isSafeInteger(suffix)||suffix<=0)return invalidRange(headers,total);
      first=Math.max(0,total-suffix);
    }else{
      first=Number(match[1]);
      if(match[2])last=Math.min(total-1,Number(match[2]));
    }
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||
       first<0||first>=total||last<first)
      return invalidRange(headers,total);
    status=206;
    headers.set('Content-Range',`bytes ${first}-${last}/${total}`);
  }
  if(mode!=='progressive')headers.set('Content-Length',String(last-first+1));
  if(request.method==='HEAD')return new Response(null,{status,headers});

  // A real streaming Response: send ~3 s of playable WAV data, then
  // optionally hold subsequent bytes for 3.8 s or close the byte stream
  // with a network error. The browser receives real network backpressure,
  // not synthetic audio DOM events or a full prebuffered route.fulfill().
  let offset=first,delayed=false,cut=false;
  const stream=new ReadableStream({
    async pull(controller){
      if(offset>last){controller.close();return;}
      if(mode!=='normal'&&first<split&&offset>=split){
        if(mode==='cut'&&!cut){
          cut=true;
          controller.error(new Error('Synthetic transport cut after 3s'));
          return;
        }
        if((mode==='gap'||mode==='progressive'||mode==='primed')&&!delayed){
          delayed=true;
          await new Promise(resolve=>setTimeout(resolve,
            mode==='primed'?PRIMED_GAP_MS:(format==='mp3'?5500:3800)));

        }
      }
      let end=Math.min(last+1,offset+CHUNK_BYTES);
      if(mode!=='normal'&&first<split&&offset<split)
        end=Math.min(end,split);
      if(end<=offset){controller.close();return;}
      controller.enqueue(data.slice(offset,end));
      offset=end;
    }
  },{highWaterMark:0});
  return new Response(stream,{status,headers});
}
