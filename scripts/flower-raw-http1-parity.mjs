import net from 'node:net';
import {inspectFlowerRequest,inspectFlowerPayload,inspectFlowerTagShape}
  from './flower-protocol-parity.mjs';

// Forensic diagnostic ONLY. Recreates the production Cloudflare socket's
// HTTP/1.1 wire shape from the same browser-origin Flower script request.
// Source-generated tokens and complete wire data must never be logged.
// No proxy, redirect, private IP, alternate hostname or arbitrary endpoint.
const allowedHeaders=new Set([
  'user-agent','ver','source-ver','tag','accept','accept-encoding'
]);

export function buildFlowerCloudflareWire(raw,meta,sourceHeaders){
  const inspected=inspectFlowerRequest(raw,meta?.songmid,meta?.quality,meta?.source);
  if(!inspected.ok)throw new Error('REJECTED_NONCANONICAL');
  const tag=inspectFlowerTagShape(sourceHeaders);
  if(tag.type!=='string'||!tag.hexOnly||!tag.headerSafe||
     tag.length<2||tag.length>512||tag.length%2!==0)
    throw new Error('INVALID_SOURCE_TAG');
  const provided=sourceHeaders&&typeof sourceHeaders==='object'
    ?Object.keys(sourceHeaders):[];
  if(provided.some(key=>!allowedHeaders.has(key.toLowerCase())))
    throw new Error('UNEXPECTED_SOURCE_HEADER');
  const original=new Headers();
  for(const key of provided){
    if(!allowedHeaders.has(key.toLowerCase()))continue;
    const value=sourceHeaders[key];
    if(typeof value!=='string'||!value.length||value.length>512||
       /[\r\n]/.test(value))throw new Error('INVALID_SOURCE_HEADER');
    original.set(key,value);
  }
  for(const required of ['user-agent','ver','source-ver','tag']){
    if(!original.has(required))throw new Error('MISSING_SOURCE_HEADER');
  }
  // As in pickForwardHeaders(), an LX source's own Accept wins over the
  // browser's default */*. The Worker writes Host, Connection and Accept
  // first; Headers.forEach then emits normalized lowercase source headers.
  const lines=[
    'GET '+new URL(raw).pathname+new URL(raw).search+' HTTP/1.1',
    'Host: 97.64.37.235',
    'Connection: close',
    'Accept: '+(original.get('Accept')||'*/*')
  ];
  original.forEach((value,key)=>{
    if(key==='accept')return;
    lines.push(key+': '+value);
  });
  const wire=lines.join('\r\n')+'\r\n\r\n';
  return {wire,profile:{
    method:'GET',http:'1.1',host:'CANONICAL_FLOWER_IP',
    connection:'close',accept:original.has('Accept')?'SOURCE':'BROWSER_DEFAULT',
    headerCount:lines.length-1,tagLength:tag.length,
    hasVersion:original.has('ver'),hasSourceVersion:original.has('source-ver'),
    hasUserAgent:original.has('user-agent'),hasAcceptEncoding:original.has('accept-encoding')
  }};
}

export async function probeFlowerCloudflareWireOnGithub(raw,meta,sourceHeaders){
  let built;
  try{built=buildFlowerCloudflareWire(raw,meta,sourceHeaders);}
  catch(e){return {status:null,valid:false,
    kind:['REJECTED_NONCANONICAL','INVALID_SOURCE_TAG',
      'UNEXPECTED_SOURCE_HEADER','INVALID_SOURCE_HEADER',
      'MISSING_SOURCE_HEADER'].includes(e.message)?e.message:'REQUEST_REJECTED'};}
  const {wire,profile}=built;
  return await new Promise(resolve=>{
    const socket=net.connect({host:'97.64.37.235',port:80});
    let settled=false,total=0,chunks=[],connected=false;
    const finish=(kind)=>{
      if(settled)return;settled=true;
      socket.destroy();
      if(kind){resolve({status:null,valid:false,kind,wireProfile:profile});return;}
      const text=Buffer.concat(chunks).toString('utf8');
      const i=text.indexOf('\r\n\r\n');
      const line=i>=0?text.slice(0,i).split('\r\n')[0]:'';
      const match=line.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/);
      if(!match){resolve({status:null,valid:false,
        kind:'INVALID_HTTP_RESPONSE',wireProfile:profile});return;}
      const checked=inspectFlowerPayload(Number(match[1]),text.slice(i+4));
      resolve({...checked,wireProfile:profile});
    };
    socket.setTimeout(11000);
    socket.on('connect',()=>{connected=true;socket.write(wire,'utf8');});
    socket.on('data',data=>{
      total+=data.length;
      if(total>131072){finish('OVERSIZED_RESPONSE');return;}
      chunks.push(data);
    });
    socket.on('end',()=>finish(null));
    socket.on('error',()=>finish('CONNECT_OR_NETWORK_ERROR'));
    socket.on('timeout',()=>finish(connected?'RESPONSE_TIMEOUT':'CONNECT_TIMEOUT'));
    socket.on('close',()=>{if(!settled)finish('SOCKET_CLOSED');});
  });
}
