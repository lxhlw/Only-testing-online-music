(function (global) {
  'use strict';

  var BABEL_VERSION = '7.29.9';
  var CDN_URLS = [
    '/api/babel',
    'https://cdn.jsdelivr.net/npm/@babel/standalone@' + BABEL_VERSION + '/babel.min.js',
    'https://unpkg.com/@babel/standalone@' + BABEL_VERSION + '/babel.min.js'
  ];
  var loadState = global.Babel && typeof global.Babel.transform === 'function' ? 2 : 0;
  var loadQueue = [];
  var loadError = null;
  var loadIndex = 0;
  var timer = null;
  var LOAD_TIMEOUT_MS = 15000;

  function schedule(fn) {
    if (typeof global.setTimeout === 'function') global.setTimeout(fn, 0);
    else fn();
  }

  function finishLoad(err) {
    if (timer && global.clearTimeout) {
      global.clearTimeout(timer);
      timer = null;
    }
    if (!err && global.Babel && typeof global.Babel.transform === 'function') {
      loadState = 2;
      loadError = null;
    } else {
      loadState = -1;
      loadError = err || new Error('Unable to load the legacy JavaScript transpiler');
    }

    var queue = loadQueue.slice();
    loadQueue.length = 0;
    for (var i = 0; i < queue.length; i += 1) {
      queue[i](loadState === 2 ? null : loadError, global.Babel);
    }
  }

  function evaluateScriptText(code) {
    var script = global.document.createElement('script');
    var parent = global.document.getElementsByTagName('head')[0] || global.document.documentElement;
    if (!parent) throw new Error('Document head is unavailable for legacy transpiler');
    script.type = 'text/javascript';
    script.async = false;

    if (global.document.createTextNode) {
      script.appendChild(global.document.createTextNode(String(code || '')));
    } else {
      script.innerHTML = String(code || '');
    }

    parent.appendChild(script);

    try {
      if (script.parentNode) script.parentNode.removeChild(script);
    } catch (e) {}

    if (!global.Babel || typeof global.Babel.transform !== 'function') {
      throw new Error('Legacy transpiler bundle did not initialize Babel');
    }
  }

  function loadViaXhr(src, done) {
    if (typeof global.XMLHttpRequest !== 'function') {
      done(false, new Error('XMLHttpRequest is unavailable'));
      return;
    }

    var xhr = null;
    var settled = false;
    var xhrTimer = null;

    function finish(ok, err) {
      if (settled) return;
      settled = true;
      if (xhrTimer && global.clearTimeout) {
        global.clearTimeout(xhrTimer);
        xhrTimer = null;
      }
      done(ok, err || null);
    }

    function fail(err) {
      finish(false, err || new Error('Legacy transpiler request failed'));
    }

    function success() {
      var status = Number(xhr.status || 0);
      if (!((status >= 200 && status < 300) || status === 0)) {
        fail(new Error('Legacy transpiler HTTP ' + status));
        return;
      }

      var body = String(xhr.responseText || '');
      if (!body) {
        fail(new Error('Legacy transpiler response was empty'));
        return;
      }

      try {
        evaluateScriptText(body);
        finish(true, null);
      } catch (e) {
        fail(new Error('Legacy transpiler execution failed: ' + (e && e.message ? e.message : String(e))));
      }
    }

    try {
      xhr = new global.XMLHttpRequest();
      xhr.open('GET', src, true);
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) success();
      };
      xhr.onerror = function () {
        fail(new Error('Legacy transpiler XHR failed'));
      };
      xhr.ontimeout = function () {
        fail(new Error('Legacy transpiler XHR timed out'));
      };

      xhrTimer = global.setTimeout(function () {
        xhrTimer = null;
        try { xhr.abort(); } catch (e) {}
        fail(new Error('Legacy transpiler XHR timed out'));
      }, LOAD_TIMEOUT_MS);

      xhr.send(null);
    } catch (e) {
      fail(new Error('Legacy transpiler XHR failed: ' + (e && e.message ? e.message : String(e))));
    }
  }

  function loadViaScript(src, done) {
    var script = global.document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = src;

    function failed(message) {
      try {
        if (script.parentNode) script.parentNode.removeChild(script);
      } catch (e) {}
      done(false, new Error(message || 'Legacy transpiler script load failed'));
    }

    script.onload = function () {
      if (global.Babel && typeof global.Babel.transform === 'function') done(true, null);
      else failed('Legacy transpiler script loaded without Babel');
    };
    script.onreadystatechange = function () {
      if ((script.readyState === 'loaded' || script.readyState === 'complete') &&
          global.Babel && typeof global.Babel.transform === 'function') {
        done(true, null);
      }
    };
    script.onerror = function () {
      failed('Legacy transpiler script request failed');
    };

    try {
      var parent = global.document.getElementsByTagName('head')[0] || global.document.documentElement;
      parent.appendChild(script);
    } catch (e) {
      failed('Legacy transpiler script insertion failed: ' + (e && e.message ? e.message : String(e)));
    }
  }

  function loadNext() {
    if (loadIndex >= CDN_URLS.length) {
      finishLoad(new Error('Unable to load the legacy JavaScript transpiler'));
      return;
    }

    var src = CDN_URLS[loadIndex];
    loadIndex += 1;

    if (src === '/api/babel') {
      loadViaXhr(src, function (ok) {
        if (ok) finishLoad(null);
        else loadNext();
      });
      return;
    }

    loadViaScript(src, function (ok) {
      if (ok) finishLoad(null);
      else loadNext();
    });
  }

  function loadBabel(callback) {
    if (loadState !== 2 && global.Babel && typeof global.Babel.transform === 'function') {
      loadState = 2;
      loadError = null;
    }
    if (loadState === 2) {
      schedule(function () { callback(null, global.Babel); });
      return;
    }
    if (loadState === -1) {
      schedule(function () { callback(loadError, null); });
      return;
    }

    loadQueue.push(callback);
    if (loadState === 1) return;
    loadState = 1;
    loadIndex = 0;
    loadNext();
  }

  function canParse(code) {
    try {
      new Function(String(code || ''));
      return true;
    } catch (e) {
      return false;
    }
  }

  function transform(code, filename, callback) {
    loadBabel(function (err, babel) {
      if (err) {
        callback(err);
        return;
      }
      try {
        var result = babel.transform(String(code || ''), {
          filename: filename || 'lx-source.js',
          sourceType: 'script',
          sourceMaps: false,
          comments: true,
          compact: false,
          presets: [['env', { targets: { ie: '8' }, bugfixes: false }]]
        });
        if (!result || typeof result.code !== 'string' || !result.code) {
          callback(new Error('Legacy JavaScript transpiler returned empty output'));
          return;
        }
        callback(null, result.code);
      } catch (e) {
        callback(new Error('Legacy JavaScript transpilation failed: ' + (e && e.message ? e.message : String(e))));
      }
    });
  }

  function prepare(code, filename, callback, options) {
    var text = String(code || '');
    var force = options && options.force === true;
    if (!force && canParse(text)) {
      schedule(function () { callback(null, text, false); });
      return;
    }
    transform(text, filename, function (err, output) {
      if (err) {
        callback(err, null, false);
        return;
      }
      callback(null, output, true);
    });
  }

  global.LXSourceTranspiler = {
    prepare: prepare,
    loadBabel: loadBabel,
    isLoaded: function () { return loadState === 2; },
    version: BABEL_VERSION,
    urls: CDN_URLS.slice()
  };
})(window);
