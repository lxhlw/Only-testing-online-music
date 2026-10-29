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
  assert.equal(runtime.utils.crypto.md5(value),
    createHash('md5').update(value,'utf8').digest('hex'),
    'Flower signing MD5 does not match Node reference');
}
console.log('PASS LX runtime MD5 matches Node for ASCII, CJK, IDs and paths');
