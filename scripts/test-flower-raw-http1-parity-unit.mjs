import assert from 'node:assert/strict';
import {buildFlowerCloudflareWire} from './flower-raw-http1-parity.mjs';
const id='A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4';
const endpoint='http://97.64.37.235/flower/v1/url/kg/'+id+'/128k';
const tag='ab'.repeat(71); // 142-hex shape observed on real KG, never a live secret.
const headers={'User-Agent':'lx-music/desktop','source-ver':'1',
  ver:'2.0.0',tag};
const meta={songmid:id,quality:'128k',source:'kg'};
const {wire,profile}=buildFlowerCloudflareWire(endpoint,meta,headers);
assert.ok(wire.startsWith('GET /flower/v1/url/kg/'));
assert.equal(wire.split('\r\n').filter(x=>/^Accept:/i.test(x)).length,1);
assert.equal(wire.split('\r\n').filter(x=>/^tag:/i.test(x)).length,1);
assert.ok(wire.includes('\r\nHost: 97.64.37.235\r\n'));
assert.ok(wire.includes('\r\nConnection: close\r\nAccept: */*\r\n'));
assert.equal(wire.split('\r\n').filter(x=>/^accept-encoding:/i.test(x)).length,0);
assert.equal(wire.split('\r\n').filter(x=>/^tag:/i.test(x))[0],'tag: '+tag);
assert.equal(profile.tagLength,142);
assert.equal(profile.hasUserAgent,true);
assert.equal(profile.hasSourceVersion,true);
assert.equal(profile.accept,'BROWSER_DEFAULT');
assert.equal(JSON.stringify(profile).includes(tag),false);
assert.throws(()=>buildFlowerCloudflareWire(
  endpoint.replace('97.64.37.235','127.0.0.1'),meta,headers
),/REJECTED_NONCANONICAL/);
assert.throws(()=>buildFlowerCloudflareWire(endpoint,meta,
  {...headers,Authorization:'secret'}),/UNEXPECTED_SOURCE_HEADER/);
assert.throws(()=>buildFlowerCloudflareWire(endpoint,meta,
  {...headers,tag:'INVALID'}),/INVALID_SOURCE_TAG/);
console.log('PASS canonical Worker-wire recreation keeps full 142-hex tag, no extra headers or data leakage');
