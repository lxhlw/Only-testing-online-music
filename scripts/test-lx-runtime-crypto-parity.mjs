import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createCipheriv, publicEncrypt, constants} from 'node:crypto';

// Desktop uses Node crypto and returns raw Buffer bytes. Exercise the actual
// bundled browser forge runtime to detect binary-string/UTF-8 corruption.
// Uses a public test key and static vectors; no Flower URLs or secret tags.
const root = new URL('../', import.meta.url);
const forgeSrc = readFileSync(new URL('vendor/forge.min.js', root), 'utf8');
const runtimeSrc = readFileSync(new URL('src/lx-runtime.js', root), 'utf8');
const browser = {
  Uint8Array, ArrayBuffer, console,
  navigator: {userAgent: 'Mozilla/5.0 (compatible; LX parity test)'},
  atob(value) { return Buffer.from(String(value), 'base64').toString('binary'); },
  btoa(value) { return Buffer.from(String(value), 'binary').toString('base64'); }
};
browser.window = browser;
browser.self = browser;
runInNewContext(forgeSrc, browser, {timeout: 10000, filename: 'forge.min.js'});
assert.ok(browser.forge && browser.forge.cipher && browser.forge.pki, 'Bundled forge must load');
runInNewContext(runtimeSrc, browser, {timeout: 3000, filename: 'lx-runtime.js'});
const lx = browser.createLXRuntime({env: 'desktop'});
const from = lx.utils.buffer.from;

function sameBytes(actual, expected, label) {
  assert.deepEqual(Array.from(actual), Array.from(expected), label);
  assert.equal(actual.toString('hex'), expected.toString('hex'), label + ': hex');
  assert.equal(actual.length, expected.length, label + ': byte length');
  assert.ok(Array.from(expected).some(x => x >= 128), label + ': must contain high-bit bytes');
}

const key = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex');
const iv = Buffer.from('101112131415161718191a1b1c1d1e1f', 'hex');
const payloads = [
  Buffer.from('LX Desktop + Web AES binary parity'),
  Buffer.from('Chengdu 成都 · 🎵', 'utf8'),
  Buffer.from([0, 1, 127, 128, 254, 255])
];
for (const mode of ['aes-128-cbc', 'aes-128-ecb']) {
  for (const payload of payloads) {
    const opts = mode.endsWith('ecb') ? null : iv;
    const native = createCipheriv(mode, key, opts);
    const expected = Buffer.concat([native.update(payload), native.final()]);
    const actual = lx.utils.crypto.aesEncrypt(from(payload), mode, from(key),
      opts ? from(opts) : null);
    sameBytes(actual, expected, mode + ' payload=' + payload.length);
  }
}

const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDGDv8jH18Ear+UcHmJbXAphymQ
hkge5aNOXEUVleTaN4Wg1IOjWYRJZMTt1VXH89gDbCrbWT7suxoFQyYKae7cmVxb
pKzjg72OVpzGRQ1F0uOQvSzUzmvzNbX1qvzV8RNSghcLQH/ULcDPn/BNhn8FSj1a
sOIY5XLDjSice5iKcwIDAQAB
-----END PUBLIC KEY-----`;
for (const input of [
  Buffer.from([0, 128, 255, 42]),
  Buffer.from('Flower LX binary RSA compatibility')
]) {
  const padded = Buffer.concat([Buffer.alloc(128 - input.length), input]);
  const expected = publicEncrypt({key: publicKey, padding: constants.RSA_NO_PADDING}, padded);
  const actual = lx.utils.crypto.rsaEncrypt(from(input), publicKey);
  sameBytes(actual, expected, 'RSA_NO_PADDING 1024-bit input=' + input.length);
}
const random = lx.utils.crypto.randomBytes(32);
assert.equal(random.length, 32);
assert.equal(random.toString('hex').length, 64);
console.log('PASS real bundled forge AES-CBC/ECB + RSA_NO_PADDING byte parity vs Node crypto; randomBytes shape');
