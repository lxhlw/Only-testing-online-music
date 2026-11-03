import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const docs = ['docs/HANDOFF_CURRENT.md', 'docs/HANDOFF_LOG.md', 'docs/HANDOFF_POLICY.md'];
const content=Object.fromEntries(docs.map(file=>[file,fs.readFileSync(new URL(file,root),'utf8')]));
const all=Object.entries(content);
const checks=[
  ['email address', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['GitHub access token', /\bgh[pousr]_[A-Za-z0-9]{28,}\b/],
  ['GitHub fine-grained token', /\bgithub_pat_[A-Za-z0-9_]{24,}\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['auth header value', /(?:authorization|x-api-key)\s*[:=]\s*(?:bearer|basic|sk-|cf_)[^\s]+/i],
  ['Figma private file URL', /https?:\/\/(?:www\.)?figma\.com\/(?:design|file|board)\/[A-Za-z0-9]{15,}/i],
  ['signature URL parameter', /https?:\/\/\S+[?&](?:token|sign|signature|auth|access_token|key)=[^\s&]+/i],
  ['raw cookie header', /(?:^|\n)\s*cookie:\s*[^\n]+/i],
];
for(const [file,text] of all){
  assert.ok(text.length>400,file+' needs a real handoff, not an empty placeholder');
  for(const [label,pattern] of checks){
    assert.ok(!pattern.test(text),'Potential '+label+' in '+file+'; do not publish this checkpoint');
  }
}
const current=content[docs[0]], log=content[docs[1]], policy=content[docs[2]];
const version=JSON.parse(fs.readFileSync(new URL('version.json',root),'utf8')).version;
assert.ok(current.includes('v'+version),'Handoff must mention current release version v'+version);
for(const term of ['Next goal','Current limitations','Snapshot','Next chat']){
  assert.ok(current.includes(term),'Current handoff missing '+term);
}
for(const term of ['Status:','Next action:']){
  // Log entries may use markdown bullets around the terms.
  assert.ok(log.includes(term),'Operation log missing '+term);
}
assert.ok(policy.includes('PUBLIC') && policy.includes('COMMIT/check'),
  'Handoff privacy and commit policy must be present');
console.log('FYMUSIC_PUBLIC_HANDOFF_PRIVACY_CHECK_PASS', {
  files: docs.length, version, checks: checks.length
});
