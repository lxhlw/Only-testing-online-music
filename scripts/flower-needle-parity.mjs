import needle from 'needle';
import {inspectFlowerPayload,inspectFlowerRequest,flowerRequestHeaders} from './flower-protocol-parity.mjs';

// This dependency is pinned to *the same fork and commit* as LX Desktop.
// A 48-hex tag is the real production value, not a guessed MD5 format.
// Never expose request headers, signed URLs, or media URLs in diagnostics.
export const LX_DESKTOP_NEEDLE_REF='93299ac841b7e9a9f82ca7279b88aaaeda404060';

export function describeNeedleTransport(rawHeaders){
  // Opaque header-presence indicators only; do not print raw values.
  const h=rawHeaders&&typeof rawHeaders==='object'?rawHeaders:{};
  const lower={};
  for(const key of Object.keys(h))lower[key.toLowerCase()]=true;
  return {
    hasUserAgent:!!lower['user-agent'],
    hasAccept:!!lower.accept,
    hasConnection:!!lower.connection,
    hasAcceptEncoding:!!lower['accept-encoding'],
    hasSignedTag:!!lower.tag,
    hasSourceVersion:!!lower['source-ver']
  };
}

export async function probeCanonicalFlowerWithDesktopNeedle(raw,meta,sourceHeaders){
  const request=inspectFlowerRequest(raw,meta?.songmid,meta?.quality,meta?.source||'wy');
  if(!request.ok)return {status:null,valid:false,kind:'REJECTED_NONCANONICAL'};
  const source=meta?.source||'wy';
  const headers=flowerRequestHeaders(sourceHeaders);
  // The current Flower KG script generated a 142-hex opaque tag for Chengdu,
  // versus the shorter WY shape. Never impose a guessed fixed size or hash
  // algorithm: forward the CURRENT script-generated value, validated as
  // bounded printable hex, exclusively to the canonical Flower IP/path.
  // Never forward it to aliases, wildcard DNS routes or external relays.
  if(source==='kg'){
    const originalTag=sourceHeaders?.tag??sourceHeaders?.Tag??sourceHeaders?.TAG;
    if(typeof originalTag==='string' &&
       /^[0-9a-f]{2,512}$/i.test(originalTag) &&
       originalTag.length%2===0){
      headers.tag=originalTag;
    }
  }
  if(!headers.tag)
    return {status:null,valid:false,kind:'MISSING_VALID_TAG'};
  return new Promise(resolve=>{
    let settled=false;
    let requestStream=null;
    let timer;
    const finish=value=>{
      if(settled)return;
      settled=true;
      clearTimeout(timer);
      resolve(value);
    };
    timer=setTimeout(()=>{
      try{requestStream?.request?.abort();}catch{}
      finish({status:null,valid:false,kind:'DEADLINE'});
    },12500);
    try{
      // Original Desktop preload's needle.request(method,url,data,{
      // headers,agent,response_timeout},callback), no proxy configured.
      // No auto-redirects: do not send tag to an unknown host.
      requestStream=needle.request('get',raw,null,{
        headers,
        response_timeout:10000,
        open_timeout:8000,
        read_timeout:5000,
        follow_max:0,
        parse_response:false
      },(err,response)=>{
        if(err||!response)return finish({
          status:null,valid:false,kind:'CONNECT_OR_TIMEOUT'
        });
        const status=Number(response.statusCode)||0;
        const body=response.raw?String(response.raw).slice(0,16384):'';
        const result=inspectFlowerPayload(status,body);
        finish(result);
      });
    }catch{finish({status:null,valid:false,kind:'CLIENT_ERROR'});}
  });
}
