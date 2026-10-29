import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

// Independent reference vectors for the Web LX runtime's signature MD5.
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
    'Flower tag must use original LX Desktop second-stage ASCII-to-hex encoding');
  assert.match(runtime.utils.buffer.bufToString(originalMd5,'hex'),/^[0-9a-f]{64}$/);
}
console.log('PASS LX runtime MD5 matches Node for ASCII, CJK, IDs and paths');
