// FyMusic Phase 20: isolated, original 440Hz WAV over a bounded low-bandwidth stream.
// QA only: no third-party music, no production player hooks, no proxying.
// Intended ONLY for the non-production development branch/Preview.
const RATE=8000, SECONDS=90, HEADER=44, BYTES_PER_SAMPLE=2;
const INITIAL_SECONDS=6, INITIAL_END=HEADER+RATE*BYTES_PER_SAMPLE*INITIAL_SECONDS;
const SLOW_BYTES=1024, SLOW_CHUNKS=22, SLOW_INTERVAL_MS=500;
let cached=null;

function fixture(){
  if(cached)return cached;
  const size=HEADER+RATE*SECONDS*BYTES_PER_SAMPLE;
  const bytes=new Uint8Array(size),view=new DataView(bytes.buffer);
  const str=(at,value)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i)};
  str(0,'RIFF');view.setUint32(4,size-8,true);
  str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,1,true);
  view.setUint32(24,RATE,true);view.setUint32(28,RATE*BYTES_PER_SAMPLE,true);
  view.setUint16(32,BYTES_PER_SAMPLE,true);view.setUint16(34,16,true);
  str(36,'data');view.setUint32(40,size-HEADER,true);
  // Original deterministic audio, about 90 seconds; bounded ~1.44 MB per isolate.
  for(let i=0;i<RATE*SECONDS;i++)
    view.setInt16(HEADER+i*BYTES_PER_SAMPLE,
      Math.round(Math.sin(i*2*Math.PI*440/RATE)*1200),true);
  cached=bytes;
  return cached;
}
export async function onRequest({request}){
  if(!['GET','HEAD'].includes(request.method))
    return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
  const url=new URL(request.url),mode=url.searchParams.get('mode')||'normal';
  if(!['normal','slow'].includes(mode))
    return new Response('Unsupported isolated fixture mode',{status:400});
  const bytes=fixture(),total=bytes.length;
  const headers=new Headers({
    'Content-Type':'audio/wav','Accept-Ranges':'bytes',
    'Cache-Control':'no-store, no-transform','X-Content-Type-Options':'nosniff',
    'X-FyMusic-Fixture':'phase20-synthetic-'+mode
  });
  let first=0,last=total-1,status=200;
  const range=request.headers.get('range');
  if(range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(range);
    if(!match||(!match[1]&&!match[2])){
      headers.set('Content-Range','bytes */'+total);
      return new Response(null,{status:416,headers});
    }
    if(!match[1]){
      const suffix=Number(match[2]);
      if(!Number.isSafeInteger(suffix)||suffix<=0){
        headers.set('Content-Range','bytes */'+total);
        return new Response(null,{status:416,headers});
      }
      first=Math.max(0,total-suffix);
    }else{
      first=Number(match[1]);
      if(match[2])last=Math.min(total-1,Number(match[2]));
    }
    if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||
       first<0||first>=total||last<first){
      headers.set('Content-Range','bytes */'+total);
      return new Response(null,{status:416,headers});
    }
    status=206;
    headers.set('Content-Range',`bytes ${first}-${last}/${total}`);
  }
  headers.set('Content-Length',String(last-first+1));
  if(request.method==='HEAD')return new Response(null,{status,headers});
  const throttle=mode==='slow'&&first<INITIAL_END;
  let offset=first,slowCount=0;
  const stream=new ReadableStream({
    async pull(controller){
      if(offset>last){controller.close();return;}
      if(request.signal.aborted){controller.close();return;}
      if(throttle&&offset>=INITIAL_END&&slowCount<SLOW_CHUNKS){
        await new Promise(resolve=>setTimeout(resolve,SLOW_INTERVAL_MS));
        if(request.signal.aborted){controller.close();return;}
        const next=Math.min(last+1,offset+SLOW_BYTES);
        controller.enqueue(bytes.slice(offset,next));
        offset=next;slowCount++;
        return;
      }
      let next=Math.min(last+1,offset+16384);
      if(throttle&&offset<INITIAL_END)next=Math.min(next,INITIAL_END);
      controller.enqueue(bytes.slice(offset,next));
      offset=next;
    },
    cancel(){}
  },{highWaterMark:0});
  return new Response(stream,{status,headers});
}
