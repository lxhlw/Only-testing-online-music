import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Independent Node Buffer reference for the ACTUAL Flower v1 tag recipe.
// Official Flower v1 uses a hex encoding of JSON.stringify(regex matches,
// null, 1). This is not AES/RSA or an MD5 of the signed music URL.
// No real Flower tags, song hashes, URLs or credentials enter this test.
const src=readFileSync(new URL('../src/lx-runtime.js',import.meta.url),'utf8');
const browser={
  atob(value){return Buffer.from(String(value),'base64').toString('binary');},
  btoa(value){return Buffer.from(String(value),'binary').toString('base64');}
};
runInNewContext(src,{window:browser,Uint8Array,ArrayBuffer,Promise},{timeout:3000});
const lx=browser.createLXRuntime({env:'desktop'});
const fakeHashes=[
  '0123456789ABCDEF0123456789ABCDEF',
  'FEDCBA9876543210FEDCBA9876543210',
  'A0B1C2D3E4F567890A1B2C3D4E5F6789'
];
for(const hash of fakeHashes){
  for(const quality of ['128k','320k']){
    const route='/url/kg/'+hash+'/'+quality;
    const value=JSON.stringify(route.match(/(?:\d\w)+/g),null,1);
    const desktop=Buffer.from(value,'utf8').toString('hex');
    const web=lx.utils.buffer.bufToString(lx.utils.buffer.from(value),'hex');
    assert.equal(web,desktop,'Browser LX v1 Flower tag bytes differ from Desktop');
    assert.ok(/^[a-f0-9]+$/.test(web),'Tag must be lowercase hex');
    assert.deepEqual(Array.from(lx.utils.buffer.from(web,'hex')),
      Array.from(Buffer.from(desktop,'hex')),'LX hex decoding differs');
    // The one-space JSON indentation is part of Flower v1's exact signer.
    const compact=Buffer.from(JSON.stringify(route.match(/(?:\d\w)+/g)),'utf8').toString('hex');
    assert.notEqual(web,compact,'Flower v1 signing MUST preserve one-space JSON indent');
  }
}
console.log('PASS synthetic Flower v1 tag recipe equals Node Buffer UTF-8 + hex (no secrets)');
