// Treat public Flower proxy diagnostics as untrusted. Print only an
// allowlisted, non-sensitive outcome; never raw body, signed URL or headers.
const validCode=/^(?:HTTP_[1-5][0-9]{2}|FLOWER_SOCKET_(?:HTTP_[1-5][0-9]{2}|CONNECT|WRITE|READ|PARSE|TIMEOUT|MISSING_HTTP|INVALID_STATUS|NO_PAYLOAD)|NETWORK_ERROR|TIMEOUT|BLOCKED_TARGET|INVALID_PAYLOAD)$/;
const allowedRoutes=new Set(['canonical-socket','ts-short','tm-short',
  'ts-full','tm-full','sslip-short','nip-short','sslip-full','nip-full']);
export function summarizeFlowerCloudflareEgress(httpStatus,envelope){
  const status=Number(httpStatus);
  const proxyStatus=Number.isInteger(status)&&status>=100&&status<=599?status:null;
  const data=envelope&&typeof envelope==='object'&&!Array.isArray(envelope)?envelope:{};
  const canonical=(Array.isArray(data.attempts)?data.attempts:[])
    .find(x=>x&&x.route==='canonical-socket'&&validCode.test(String(x.code||'')));
  const code=canonical?.code||'NOT_OBSERVED';
  const match=code.match(/^FLOWER_SOCKET_HTTP_([1-5][0-9]{2})$/);
  const aliasCodes=(Array.isArray(data.attempts)?data.attempts:[])
    .filter(x=>x&&allowedRoutes.has(x.route)&&x.route!=='canonical-socket'&&
      validCode.test(String(x.code||'')))
    .map(x=>x.code);
  const histogram={};
  for(const item of aliasCodes)histogram[item]=(histogram[item]||0)+1;
  return {
    proxyStatus,
    canonicalStatus:match?Number(match[1]):null,
    canonicalKind:code,
    aliasOutcomeCounts:histogram,
    // HTTP 200 alone does not establish decoded genuine audio.
    proxyReturnedCandidate:proxyStatus!==null&&proxyStatus>=200&&proxyStatus<300
  };
}
