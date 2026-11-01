// FyMusic isolated CI fixture: original 440Hz mono PCM tone, never a music URL.
// This endpoint is present only on the development Preview branch. It is not
// used by the player itself, and does not proxy or resolve third-party audio.
const RATE=8000,SECONDS=14,HEADER=44,FRAME_BYTES=2;
const CHUNK_BYTES=16384,STALL_AT=HEADER+RATE*FRAME_BYTES*3;
let stored=null;
function fixture(){
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
  if(!['normal','gap','cut'].includes(mode))
    return new Response('Unsupported test mode',{status:400});
  const data=fixture(),total=data.length;
  const headers=new Headers({
    'Content-Type':'audio/wav',
    'Accept-Ranges':'bytes',
    'Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-FyMusic-Synthetic-Fixture':mode
  });
  let first=0,last=total-1,status=200;
  const range=request.headers.get('range');
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
  headers.set('Content-Length',String(last-first+1));
  if(request.method==='HEAD')return new Response(null,{status,headers});

  // A real streaming Response: send ~3 s of playable WAV data, then
  // optionally hold subsequent bytes for 3.8 s or close the byte stream
  // with a network error. The browser receives real network backpressure,
  // not synthetic audio DOM events or a full prebuffered route.fulfill().
  let offset=first,delayed=false,cut=false;
  const stream=new ReadableStream({
    async pull(controller){
      if(offset>last){controller.close();return;}
      if(mode!=='normal'&&first<STALL_AT&&offset>=STALL_AT){
        if(mode==='cut'&&!cut){
          cut=true;
          controller.error(new Error('Synthetic transport cut after 3s'));
          return;
        }
        if(mode==='gap'&&!delayed){
          delayed=true;
          await new Promise(resolve=>setTimeout(resolve,3800));
        }
      }
      let end=Math.min(last+1,offset+CHUNK_BYTES);
      if(mode!=='normal'&&first<STALL_AT&&offset<STALL_AT)
        end=Math.min(end,STALL_AT);
      if(end<=offset){controller.close();return;}
      controller.enqueue(data.slice(offset,end));
      offset=end;
    }
  },{highWaterMark:0});
  return new Response(stream,{status,headers});
}
