import assert from 'node:assert/strict';
import {summarizeFlowerCloudflareEgress} from './flower-egress-parity.mjs';
const signedUrl='http://97.64.37.235/flower/v1/url/kg/SECRET/128k?tag=PRIVATE';
const report=summarizeFlowerCloudflareEgress(502,{
  diagnostic:'FLOWER_UPSTREAM_UNAVAILABLE',
  attempts:[
    {route:'canonical-socket',code:'FLOWER_SOCKET_HTTP_400',secret:signedUrl},
    {route:'ts-short',code:'HTTP_530'},
    {route:'sslip-short',code:'HTTP_403'},
    {route:'untrusted',code:'HTTP_200',signedUrl}
  ],tag:'A_SENSITIVE_TOKEN',rawUrl:signedUrl
});
assert.deepEqual(report,{
  proxyStatus:502,canonicalStatus:400,canonicalKind:'FLOWER_SOCKET_HTTP_400',
  aliasOutcomeCounts:{HTTP_530:1,HTTP_403:1},proxyReturnedCandidate:false
});
assert.equal(JSON.stringify(report).includes('SECRET'),false);
assert.equal(JSON.stringify(report).includes('A_SENSITIVE_TOKEN'),false);
assert.equal(summarizeFlowerCloudflareEgress(502,{attempts:[
  {route:'canonical-socket',code:'FLOWER_SOCKET_HTTP_404'}
]}).canonicalStatus,404);
assert.equal(summarizeFlowerCloudflareEgress(502,{attempts:[
  {route:'canonical-socket',code:'INVALID_WITH_TOKEN_'+signedUrl}
]}).canonicalStatus,null);
assert.equal(summarizeFlowerCloudflareEgress(200,{url:signedUrl}).proxyReturnedCandidate,true);
assert.equal(summarizeFlowerCloudflareEgress(502,{attempts:'not-an-array'}).canonicalKind,'NOT_OBSERVED');
console.log('PASS Flower same-signature Cloudflare egress diagnostics stay strictly redacted');
