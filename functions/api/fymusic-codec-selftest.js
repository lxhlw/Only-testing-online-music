// Only for isolated CI-generated original media. Never called by player.
const SPECS={
 mp3:{file:'phase25-tone.mp3',mime:'audio/mpeg'},
 aac:{file:'phase25-tone.m4a',mime:'audio/mp4'},
 flac:{file:'phase25-tone.flac',mime:'audio/flac'},
 // Phase 26 isolated original metadata/hi-res fixtures, never production songs.
 'mp3-cover':{file:'phase26-cover.mp3',mime:'audio/mpeg'},
 'aac-tail':{file:'phase26-tail.m4a',mime:'audio/mp4'},
 flac24:{file:'phase26-hires.flac',mime:'audio/flac'}
};
const GAP_MS=10000,CHUNK_SIZE=16384;
function badRange(headers,total){
 headers.set('Content-Range','bytes */'+total);
 headers.set('Content-Length','0');
 return new Response(null,{status:416,headers});
}
export async function onRequest({request,env}){
 if(!['GET','HEAD'].includes(request.method))
  return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
 const url=new URL(request.url);
 const format=url.searchParams.get('format'),spec=Object.hasOwn(SPECS,format)?SPECS[format]:null;
 if(!spec)return new Response('Invalid codec format',{status:400});
 const mode=url.searchParams.get('mode')||'normal';
 if(!['normal','gap'].includes(mode))
  return new Response('Invalid test mode',{status:400});
 if(!env?.ASSETS?.fetch)
  return new Response('QA asset binding missing',{status:503});
 const asset=await env.ASSETS.fetch(new Request(new URL('/qa-fixtures/'+spec.file,url.origin)));
 if(!asset.ok)return new Response('QA fixture missing',{status:503});
 const bytes=new Uint8Array(await asset.arrayBuffer()),total=bytes.length;
 if(total<10000||total>2500000)return new Response('Invalid QA fixture bytes',{status:503});
 const headers=new Headers({'Content-Type':spec.mime,'Accept-Ranges':'bytes',
  'Cache-Control':'no-store, no-transform',
  'X-Content-Type-Options':'nosniff','X-FyMusic-Fixture':'original-'+format});
 let start=0,last=total-1,status=200;
 const range=request.headers.get('range');
 if(range){
  const m=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!m||(!m[1]&&!m[2]))return badRange(headers,total);
  if(!m[1]){
   const suffix=Number(m[2]);
   if(!Number.isSafeInteger(suffix)||suffix<=0)return badRange(headers,total);
   start=Math.max(0,total-suffix);
  }else{
   start=Number(m[1]);
   if(m[2])last=Math.min(total-1,Number(m[2]));
  }
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(last)||
     start<0||start>=total||last<start)return badRange(headers,total);
  status=206;
  headers.set('Content-Range','bytes '+start+'-'+last+'/'+total);
 }
 headers.set('Content-Length',String(last-start+1));
 if(request.method==='HEAD')return new Response(null,{status,headers});
 // Test-only native buffer starvation; browser decides when to play.
 const split=Math.floor(total*.35);
 let offset=start,delayed=false;
 const stream=new ReadableStream({
  async pull(controller){
   if(offset>last){controller.close();return;}
   if(mode==='gap'&&start<split&&!delayed&&offset>=split){
    delayed=true;await new Promise(resolve=>setTimeout(resolve,GAP_MS));
   }
   let end=Math.min(offset+CHUNK_SIZE,last+1);
   if(mode==='gap'&&start<split&&offset<split)end=Math.min(end,split);
   controller.enqueue(bytes.slice(offset,end));
   offset=end;
  }
 },{highWaterMark:0});
 return new Response(stream,{status,headers});
}
