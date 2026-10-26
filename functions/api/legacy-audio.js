// Serve the two *existing* 4-second test assets with byte ranges for
// Chromium 30's native media stack. Cloudflare Pages static asset responses
// currently ignore Range and return 200, so this narrowly scoped Function
// implements RFC 7233 without accepting external URLs or arbitrary paths.
const MEDIA = {
  mp3: {path:'/diagnostics/android44-tone-v3.mp3', type:'audio/mpeg', filename:'android44-tone-v3.mp3'},
  wav: {path:'/diagnostics/android44-tone-v3.wav', type:'audio/wav', filename:'android44-tone-v3.wav'}
}
const MAX_BYTES = 512 * 1024
function fail(message,status,extra){
  const headers=new Headers({'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'})
  if(extra)headers.set('Content-Range',extra)
  return new Response(message,{status,headers})
}
function parseRange(value,length){
  if(!value)return null
  const match=/^bytes=(\d*)-(\d*)$/.exec(value.trim())
  if(!match || (!match[1]&&!match[2]))return false
  let start,end
  if(!match[1]){
    const count=Number(match[2])
    if(!Number.isSafeInteger(count)||count<=0)return false
    start=Math.max(0,length-count)
    end=length-1
  }else{
    start=Number(match[1])
    end=match[2] ? Number(match[2]) : length-1
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end))return false
    end=Math.min(end,length-1)
  }
  if(start>=length||end<start)return false
  return {start,end}
}
export async function onRequest(context){
  const req=context.request
  if(req.method!=='GET'&&req.method!=='HEAD')return fail('Method Not Allowed',405)
  const url=new URL(req.url)
  const kind=url.searchParams.get('type')
  if(!Object.prototype.hasOwnProperty.call(MEDIA,kind))return fail('Unsupported test media type',400)
  const item=MEDIA[kind]
  if(!context.env||!context.env.ASSETS)return fail('Static media binding unavailable',503)
  const assetUrl=new URL(item.path,req.url)
  // Do not forward caller Range: Pages currently ignores it.
  const upstream=await context.env.ASSETS.fetch(new Request(assetUrl.toString(),{method:'GET'}))
  if(!upstream.ok)return fail('Diagnostic audio unavailable',502)
  const type=String(upstream.headers.get('content-type')||'').toLowerCase()
  if(!type.startsWith('audio/') && !type.includes('octet-stream'))
    return fail('Asset returned non-audio content',502)
  const data=new Uint8Array(await upstream.arrayBuffer())
  const size=data.byteLength
  if(!size||size>MAX_BYTES)return fail('Unexpected audio size',502)
  if(kind==='mp3' && !(data[0]===0xff&&(data[1]&0xe0)===0xe0))
    return fail('MP3 signature mismatch',502)
  if(kind==='wav' && !(data[0]===82&&data[1]===73&&data[2]===70&&data[3]===70))
    return fail('WAV signature mismatch',502)
  const requested=req.headers.get('Range')
  const range=parseRange(requested,size)
  if(range===false)return fail('Range Not Satisfiable',416,'bytes */'+size)
  const start=range?range.start:0
  const end=range?range.end:size-1
  const status=range?206:200
  const headers=new Headers({
    'Content-Type':item.type,
    'Accept-Ranges':'bytes',
    'Content-Length':String(end-start+1),
    'Content-Disposition':(url.searchParams.get('download')==='1'?'attachment':'inline')+
      '; filename="'+item.filename+'"',
    'Cache-Control':'no-store, no-transform',
    'X-Content-Type-Options':'nosniff'
  })
  if(range)headers.set('Content-Range','bytes '+start+'-'+end+'/'+size)
  return new Response(req.method==='HEAD'?null:data.slice(start,end+1),{status,headers})
}
