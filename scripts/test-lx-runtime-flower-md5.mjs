import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

// Independent reference vectors for the LX runtime's MD5 and buffer helpers.
 // This DOES NOT prove Flower's live tag is an MD5 of a particular input.
const src=readFileSync(new URL('../src/lx-runtime.js',import.meta.url),'utf8');
const scope={window:{},Uint8Array,ArrayBuffer,TextEncoder,TextDecoder};
runInNewContext(src,scope,{timeout:3000});
const runtime=scope.window.createLXRuntime({env:'desktop'});
assert.equal(runtime.env,'desktop');
assert.equal(runtime.version,'2.0.0');
for(const value of ['', 'abc', 'message digest','宋冬野','477251491',
  '["477251491"]','flower/v1/url/wy/477251491/128k']){
  const originalMd5=createHash('md5').update(value,'utf8').digest('hex');
  assert.equal(runtime.utils.crypto.md5(value),originalMd5,
    'Flower signing MD5 does not match Node reference');
  assert.equal(runtime.utils.buffer.bufToString(originalMd5,'hex'),
    Buffer.from(originalMd5,'binary').toString('hex'),
    'LX runtime bufToString helper must match Node ASCII-to-hex encoding');
  assert.match(runtime.utils.buffer.bufToString(originalMd5,'hex'),/^[0-9a-f]{64}$/);
}
console.log('PASS LX runtime MD5 matches Node for ASCII, CJK, IDs and paths');

for(const input of ['', 'ascii ASCII', '赵雷', '成都', '宋冬野',
  '128k_音质', '🙂🎵', 'a\ud800b', '\udc00', '\ud83d\ude80'){
  for(const encoding of [undefined, 'utf8', 'UTF-8']){
    const actual=runtime.utils.buffer.from(input,encoding);
    const expected=Buffer.from(input,encoding);
    assert.deepEqual(Array.from(actual),Array.from(expected),
      'LX Buffer.from UTF-8 mismatch for '+JSON.stringify(input));
    assert.equal(actual.toString('hex'),expected.toString('hex'));
    assert.equal(actual.toString('base64'),expected.toString('base64'));
  }
}
for(const [input,mode] of [
  ['宋冬野','binary'],['Chengdu','ascii'],['éé','latin1'],
  ['f09f8e','hex'],['aaffzz80','hex'],['aaa','hex'],
  ['YWJj','base64'],['8J-Ygg','base64url']
]){
  const actual=runtime.utils.buffer.from(input,mode);
  assert.deepEqual(Array.from(actual),Array.from(Buffer.from(input,mode)),
    'LX Buffer.from encoding mismatch: '+mode);
}
for(const input of ['宋冬野', 'abc', 'é', 'ff', '9a']){
  for(const encoding of ['hex','base64']){
    assert.equal(runtime.utils.buffer.bufToString(input,encoding),
      Buffer.from(input,'binary').toString(encoding),
      'LX bufToString must preserve Desktop binary-string behavior');
  }
}
for(const input of [new Uint8Array([0,128,255]),Buffer.from('成都')]){
  assert.equal(runtime.utils.buffer.bufToString(input,'hex'),
    Buffer.from(input).toString('hex'));
}
console.log('PASS LX Buffer.from UTF-8, legacy Latin1, hex/base64 and bufToString match Node');

