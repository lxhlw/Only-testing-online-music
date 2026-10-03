(function (global) {
  'use strict';

  function EventBus() {
    this.map = {};
  }

  EventBus.prototype.on = function (name, handler) {
    if (!this.map[name]) this.map[name] = [];
    this.map[name].push(handler);
  };

  EventBus.prototype.off = function (name, handler) {
    var list = this.map[name];
    if (!list) return;
    for (var i = list.length - 1; i >= 0; i -= 1) {
      if (list[i] === handler) list.splice(i, 1);
    }
  };

  EventBus.prototype.emitAsync = function (name, data, context) {
    var list = (this.map[name] || []).slice();
    var jobs = [];
    for (var i = 0; i < list.length; i += 1) {
      try {
        jobs.push(Promise.resolve(list[i].call(context, data)));
      } catch (e) {
        jobs.push(Promise.reject(e));
      }
    }
    return Promise.all(jobs);
  };

  function bytesFrom(input, encoding) {
    if (input == null) return new Uint8Array(0);
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (Object.prototype.toString.call(input) === '[object Array]') return new Uint8Array(input);

    var text = String(input);
    if (encoding === 'base64') {
      var bin = global.atob ? global.atob(text) : '';
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
      return out;
    }
    if (encoding === 'hex') {
      var clean = text.replace(/[^0-9a-f]/gi, '');
      var hexOut = new Uint8Array(Math.floor(clean.length / 2));
      for (var h = 0; h < hexOut.length; h += 1) {
        hexOut[h] = parseInt(clean.substr(h * 2, 2), 16);
      }
      return hexOut;
    }
    var result = new Uint8Array(text.length);
    for (var j = 0; j < text.length; j += 1) result[j] = text.charCodeAt(j) & 255;
    return result;
  }

  function latin1(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 1) out += String.fromCharCode(bytes[i]);
    return out;
  }

  function utf8(bytes) {
    try {
      return decodeURIComponent(escape(latin1(bytes)));
    } catch (e) {
      return latin1(bytes);
    }
  }

  function base64(bytes) {
    var text = latin1(bytes);
    return global.btoa ? global.btoa(text) : '';
  }

  function md5Raw(message) {
    var input = String(message);
    var bytes = unescape(encodeURIComponent(input));
    var len = bytes.length;
    var words = [];
    var i;
    for (i = 0; i < len; i += 1) words[i >> 2] = (words[i >> 2] || 0) | (bytes.charCodeAt(i) << ((i % 4) * 8));
    words[len >> 2] = (words[len >> 2] || 0) | (0x80 << ((len % 4) * 8));
    words[(((len + 8) >>> 6) << 4) + 14] = len * 8;

    var a = 1732584193;
    var b = -271733879;
    var c = -1732584194;
    var d = 271733878;

    function add(x, y) { return (x + y) | 0; }
    function rol(x, n) { return (x << n) | (x >>> (32 - n)); }
    function ff(x, y, z) { return (x & y) | (~x & z); }
    function gg(x, y, z) { return (x & z) | (y & ~z); }
    function hh(x, y, z) { return x ^ y ^ z; }
    function ii(x, y, z) { return y ^ (x | ~z); }
    function step(fun, x, y, z, w, m, s, t) { return add(rol(add(add(add(x, fun(y, z, w)), m), t), s), y); }

    var k;
    for (k = 0; k < words.length; k += 16) {
      var aa = a, bb = b, cc = c, dd = d;

      a=step(ff,a,b,c,d,words[k]||0,7,-680876936);d=step(ff,d,a,b,c,words[k+1]||0,12,-389564586);c=step(ff,c,d,a,b,words[k+2]||0,17,606105819);b=step(ff,b,c,d,a,words[k+3]||0,22,-1044525330);
      a=step(ff,a,b,c,d,words[k+4]||0,7,-176418897);d=step(ff,d,a,b,c,words[k+5]||0,12,1200080426);c=step(ff,c,d,a,b,words[k+6]||0,17,-1473231341);b=step(ff,b,c,d,a,words[k+7]||0,22,-45705983);
      a=step(ff,a,b,c,d,words[k+8]||0,7,1770035416);d=step(ff,d,a,b,c,words[k+9]||0,12,-1958414417);c=step(ff,c,d,a,b,words[k+10]||0,17,-42063);b=step(ff,b,c,d,a,words[k+11]||0,22,-1990404162);
      a=step(ff,a,b,c,d,words[k+12]||0,7,1804603682);d=step(ff,d,a,b,c,words[k+13]||0,12,-40341101);c=step(ff,c,d,a,b,words[k+14]||0,17,-1502002290);b=step(ff,b,c,d,a,words[k+15]||0,22,1236535329);

      a=step(gg,a,b,c,d,words[k+1]||0,5,-165796510);d=step(gg,d,a,b,c,words[k+6]||0,9,-1069501632);c=step(gg,c,d,a,b,words[k+11]||0,14,643717713);b=step(gg,b,c,d,a,words[k]||0,20,-373897302);
      a=step(gg,a,b,c,d,words[k+5]||0,5,-701558691);d=step(gg,d,a,b,c,words[k+10]||0,9,38016083);c=step(gg,c,d,a,b,words[k+15]||0,14,-660478335);b=step(gg,b,c,d,a,words[k+4]||0,20,-405537848);
      a=step(gg,a,b,c,d,words[k+9]||0,5,568446438);d=step(gg,d,a,b,c,words[k+14]||0,9,-1019803690);c=step(gg,c,d,a,b,words[k+3]||0,14,-187363961);b=step(gg,b,c,d,a,words[k+8]||0,20,1163531501);
      a=step(gg,a,b,c,d,words[k+13]||0,5,-1444681467);d=step(gg,d,a,b,c,words[k+2]||0,9,-51403784);c=step(gg,c,d,a,b,words[k+7]||0,14,1735328473);b=step(gg,b,c,d,a,words[k+12]||0,20,-1926607734);

      a=step(hh,a,b,c,d,words[k+5]||0,4,-378558);d=step(hh,d,a,b,c,words[k+8]||0,11,-2022574463);c=step(hh,c,d,a,b,words[k+11]||0,16,1839030562);b=step(hh,b,c,d,a,words[k+14]||0,23,-35309556);
      a=step(hh,a,b,c,d,words[k+1]||0,4,-1530992060);d=step(hh,d,a,b,c,words[k+4]||0,11,1272893353);c=step(hh,c,d,a,b,words[k+7]||0,16,-155497632);b=step(hh,b,c,d,a,words[k+10]||0,23,-1094730640);
      a=step(hh,a,b,c,d,words[k+13]||0,4,681279174);d=step(hh,d,a,b,c,words[k]||0,11,-358537222);c=step(hh,c,d,a,b,words[k+3]||0,16,-722521979);b=step(hh,b,c,d,a,words[k+6]||0,23,76029189);
      a=step(hh,a,b,c,d,words[k+9]||0,4,-640364487);d=step(hh,d,a,b,c,words[k+12]||0,11,-421815835);c=step(hh,c,d,a,b,words[k+15]||0,16,530742520);b=step(hh,b,c,d,a,words[k+2]||0,23,-995338651);

      a=step(ii,a,b,c,d,words[k]||0,6,-198630844);d=step(ii,d,a,b,c,words[k+7]||0,10,1126891415);c=step(ii,c,d,a,b,words[k+14]||0,15,-1416354905);b=step(ii,b,c,d,a,words[k+5]||0,21,-57434055);
      a=step(ii,a,b,c,d,words[k+12]||0,6,1700485571);d=step(ii,d,a,b,c,words[k+3]||0,10,-1894986606);c=step(ii,c,d,a,b,words[k+10]||0,15,-1051523);b=step(ii,b,c,d,a,words[k+1]||0,21,-2054922799);
      a=step(ii,a,b,c,d,words[k+8]||0,6,1873313359);d=step(ii,d,a,b,c,words[k+15]||0,10,-30611744);c=step(ii,c,d,a,b,words[k+6]||0,15,-1560198380);b=step(ii,b,c,d,a,words[k+13]||0,21,1309151649);
      a=step(ii,a,b,c,d,words[k+4]||0,6,-145523070);d=step(ii,d,a,b,c,words[k+11]||0,10,-1120210379);c=step(ii,c,d,a,b,words[k+2]||0,15,718787259);b=step(ii,b,c,d,a,words[k+9]||0,21,-343485551);

      a=add(a,aa);b=add(b,bb);c=add(c,cc);d=add(d,dd);
    }
    function hex32(v){var s='',n;for(var z=0;z<4;z+=1){n=(v>>>(z*8))&255;s+=('0'+n.toString(16)).slice(-2)}return s}
    return hex32(a)+hex32(b)+hex32(c)+hex32(d);
  }

  function randomBytes(size) {
    var length = Math.max(0, Number(size) || 0);
    var bytes = new Uint8Array(length);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
    return makeBuffer(bytes);
  }

  function makeBuffer(input, encoding) {
    var bytes = bytesFrom(input, encoding);
    bytes.toString = function (format) {
      if (format === 'hex') {
        var h = '';
        for (var i = 0; i < bytes.length; i += 1) h += ('0' + bytes[i].toString(16)).slice(-2);
        return h;
      }
      if (format === 'base64') return base64(bytes);
      if (format === 'binary' || format === 'latin1') return latin1(bytes);
      return utf8(bytes);
    };
    return bytes;
  }

  function createRuntime(options) {
    options = options || {};
    var bus = new EventBus();
    var requestHandler = options.requestHandler || function (url, opts, callback) {
      callback(new Error('LX request handler is not configured'), null, null);
      return function () {};
    };
    var inited = false;
    var updateAlertShown = false;

    var runtime = {
      version: '2.0.0',
      env: options.env || 'desktop',
      currentScriptInfo: null,
      EVENT_NAMES: {
        inited: 'inited',
        request: 'request',
        updateAlert: 'updateAlert',
        openDevTools: 'openDevTools'
      },
      on: function (name, handler) {
        if (name !== 'request') return Promise.reject(new Error('The event is not supported: ' + name));
        bus.on(name, handler);
        return Promise.resolve();
      },
      off: function (name, handler) {
        bus.off(name, handler);
      },
      send: function (name, data) {
        if (name === 'inited') {
          if (inited) return Promise.reject(new Error('Script is inited'));
          inited = true;
          return Promise.resolve().then(function () {
            if (typeof options.onInited === 'function') return options.onInited(data);
            return undefined;
          });
        }
        if (name === 'updateAlert') {
          if (updateAlertShown) return Promise.reject(new Error('The update alert can only be called once.'));
          updateAlertShown = true;
          if (typeof options.onUpdateAlert === 'function') return Promise.resolve(options.onUpdateAlert(data));
          return Promise.resolve();
        }
        if (name === 'openDevTools') {
          if (typeof options.onOpenDevTools === 'function') return Promise.resolve(options.onOpenDevTools(data));
          return Promise.resolve();
        }
        return Promise.reject(new Error('Unknown event name: ' + name));
      },
      request: function (url, opts, callback) {
        return requestHandler.call(this, url, opts || {}, callback || function () {});
      },
      utils: {
        buffer: {
          from: makeBuffer,
          bufToString: function (buffer, format) {
            return makeBuffer(buffer).toString(format);
          }
        },
        crypto: {
          md5: md5Raw,
          randomBytes: randomBytes,
          aesEncrypt: function (buffer, mode, key, iv) {
            if (!global.forge || !global.forge.cipher) throw new Error('crypto runtime is not loaded');
            var input = latin1(bytesFrom(buffer));
            var keyBytes = latin1(bytesFrom(key));
            var ivBytes = iv == null ? null : latin1(bytesFrom(iv));
            var normalized = String(mode || '').toLowerCase();
            if (normalized.indexOf('aes-') === 0) normalized = normalized.substring(4);
            var parts = normalized.split('-');
            var blockMode = parts.length > 1 ? parts[1] : 'ecb';
            var cipher = global.forge.cipher.createCipher(blockMode === 'ecb' ? 'AES-ECB' : 'AES-CBC', keyBytes);
            var startOptions = blockMode === 'ecb' ? {} : { iv: ivBytes || '' };
            cipher.start(startOptions);
            cipher.update(global.forge.util.createBuffer(input, 'raw'));
            cipher.finish();
            return makeBuffer(cipher.output.getBytes());
          },
          rsaEncrypt: function (buffer, key) {
            if (!global.forge || !global.forge.pki) throw new Error('crypto runtime is not loaded');
            var pem = String(key || '');
            var publicKey = global.forge.pki.publicKeyFromPem(pem);
            var input = bytesFrom(buffer);
            var bytes = [];
            for (var i = 0; i < input.length; i += 1) bytes.push(input[i]);
            var raw = latin1(input);
            var keySize = publicKey.n.bitLength() / 8;
            if (raw.length > keySize) throw new Error('RSA input is too large');
            while (raw.length < keySize) raw = '\x00' + raw;
            var out = publicKey.encrypt(raw, 'NONE');
            return makeBuffer(out);
          }
        },
        zlib: {
          inflate: function () {
            return Promise.reject(new Error('LX zlib.inflate not implemented yet'));
          },
          deflate: function () {
            return Promise.reject(new Error('LX zlib.deflate not implemented yet'));
          }
        }
      }
    };

    return runtime;
  }

  global.createLXRuntime = createRuntime;
})(window);
