import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { X509Certificate, createHash } from 'node:crypto'

const content=readFileSync('android-companion/app/src/main/assets/modern-webpki-roots.pem','utf8')
const roots=[...content.matchAll(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)]
assert.ok(roots.length>=15 && roots.length<=30)
const certs=roots.map(entry=>new X509Certificate(entry[0]))
const subjects=certs.map(c=>c.subject)
for(const cert of certs) {
 assert.equal(cert.ca,true,cert.subject+' must be CA')
 assert.ok(Date.parse(cert.validFrom)<=Date.now(),cert.subject+' not yet valid')
 assert.ok(Date.parse(cert.validTo)>Date.now(),cert.subject+' expired')
 assert.ok(cert.fingerprint256,'must have a fingerprint')
}
for(const authority of [
 'GTS Root R1','GTS Root R3','ISRG Root X1','ISRG Root X2',
 'GlobalSign','SSL.com'
])assert.ok(subjects.some(x=>x.includes(authority)),'missing root '+authority)

const main=readFileSync('android-companion/app/src/main/java/dev/lxmusic/legacy/MainActivity.java','utf8')
const interceptor=readFileSync('android-companion/app/src/main/java/dev/lxmusic/legacy/ModernPageInterceptor.java','utf8')
const trust=readFileSync('android-companion/app/src/main/java/dev/lxmusic/legacy/ModernTrust.java','utf8')
assert.match(main,/shouldInterceptRequest\(WebView view, String url\)/)
assert.match(main,/secureWeb\.intercept\(url\)/)
assert.match(main,/connection\.setSSLSocketFactory\(secureWeb\.sockets\(\)\)/)
assert.match(interceptor,/HOST\.equalsIgnoreCase\(u\.getHost\(\)\)/)
assert.match(interceptor,/setInstanceFollowRedirects\(false\)/)
assert.match(trust,/checkServerTrusted\(chain, type\)/)
assert.match(trust,/modern\.checkServerTrusted\(chain, type\)/)
assert.doesNotMatch(main+interceptor+trust,/handler\.proceed\(/)
assert.doesNotMatch(main+interceptor+trust,/ALLOW_ALL_HOSTNAME_VERIFIER|setHostnameVerifier\(/)
console.log('PASS: '+certs.length+' validated supplemental CA roots, strict host verification, no SSL bypass, SHA256 '+
 createHash('sha256').update(content).digest('hex').slice(0,16))
