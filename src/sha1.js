(function (global) {
  'use strict';

  function rol(n, bits) {
    return (n << bits) | (n >>> (32 - bits));
  }

  function sha1(input) {
    var text = unescape(encodeURIComponent(String(input)));
    var bytes = [];
    var i;
    for (i = 0; i < text.length; i += 1) bytes.push(text.charCodeAt(i));

    var bitLen = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);

    var high = Math.floor(bitLen / 4294967296);
    var low = bitLen >>> 0;
    for (i = 3; i >= 0; i -= 1) bytes.push((high >>> (i * 8)) & 255);
    for (i = 3; i >= 0; i -= 1) bytes.push((low >>> (i * 8)) & 255);

    var h0 = 0x67452301;
    var h1 = 0xEFCDAB89;
    var h2 = 0x98BADCFE;
    var h3 = 0x10325476;
    var h4 = 0xC3D2E1F0;

    for (var offset = 0; offset < bytes.length; offset += 64) {
      var w = [];
      for (i = 0; i < 16; i += 1) {
        var p = offset + i * 4;
        w[i] = (
          (bytes[p] << 24) |
          (bytes[p + 1] << 16) |
          (bytes[p + 2] << 8) |
          bytes[p + 3]
        ) | 0;
      }
      for (i = 16; i < 80; i += 1) {
        w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
      }

      var a = h0, b = h1, c = h2, d = h3, e = h4;
      for (i = 0; i < 80; i += 1) {
        var f, k;
        if (i < 20) {
          f = (b & c) | ((~b) & d);
          k = 0x5A827999;
        } else if (i < 40) {
          f = b ^ c ^ d;
          k = 0x6ED9EBA1;
        } else if (i < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = 0x8F1BBCDC;
        } else {
          f = b ^ c ^ d;
          k = 0xCA62C1D6;
        }

        var temp = (rol(a, 5) + f + e + k + w[i]) | 0;
        e = d;
        d = c;
        c = rol(b, 30);
        b = a;
        a = temp;
      }

      h0 = (h0 + a) | 0;
      h1 = (h1 + b) | 0;
      h2 = (h2 + c) | 0;
      h3 = (h3 + d) | 0;
      h4 = (h4 + e) | 0;
    }

    function hex(n) {
      return ('00000000' + (n >>> 0).toString(16)).slice(-8);
    }

    return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
  }

  global.LXLegacySHA1 = sha1;
})(window);
