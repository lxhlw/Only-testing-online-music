(function (global) {
  'use strict';

  var BABEL_VERSION = '7.29.9';
  var CDN_URLS = [
    '/api/babel',
    'https://cdn.jsdelivr.net/npm/@babel/standalone@' + BABEL_VERSION + '/babel.min.js',
    'https://unpkg.com/@babel/standalone@' + BABEL_VERSION + '/babel.min.js'
  ];
  var loadState = 0;
  var loadQueue = [];
  var loadError = null;
  var loadIndex = 0;
  var timer = null;
  var LOAD_TIMEOUT_MS = 15000;

  function schedule(fn) {
    if (typeof global.setTimeout === 'function') {
      global.setTimeout(fn, 0);
    } else {
      fn();
    }
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
      loadError = err || new Error('Babel standalone did not expose a transform API');
    }

    var queue = loadQueue.slice();
    loadQueue.length = 0;
    for (var i = 0; i < queue.length; i += 1) {
      queue[i](loadState === 2 ? null : loadError, global.Babel);
    }
  }

  function loadNext() {
    if (loadIndex >= CDN_URLS.length) {
      finishLoad(new Error('Unable to load the legacy JavaScript transpiler'));
      return;
    }

    var script = global.document.createElement('script');
    var src = CDN_URLS[loadIndex];
    loadIndex += 1;
    script.type = 'text/javascript';
    script.async = true;
    script.src = src;

    function failed() {
      try {
        if (script.parentNode) script.parentNode.removeChild(script);
      } catch (e) {}
      if (loadIndex >= CDN_URLS.length) {
        finishLoad(new Error('Unable to load the legacy JavaScript transpiler'));
      } else {
        loadNext();
      }
    }

    script.onload = function () {
      if (global.Babel && typeof global.Babel.transform === 'function') {
        finishLoad(null);
      } else {
        failed();
      }
    };
    script.onreadystatechange = function () {
      if ((script.readyState === 'loaded' || script.readyState === 'complete') &&
          global.Babel && typeof global.Babel.transform === 'function') {
        finishLoad(null);
      }
    };
    script.onerror = failed;

    try {
      var parent = global.document.getElementsByTagName('head')[0] || global.document.documentElement;
      parent.appendChild(script);
    } catch (e) {
      failed();
      return;
    }

    timer = global.setTimeout(function () {
      timer = null;
      failed();
    }, LOAD_TIMEOUT_MS);
  }

  function loadBabel(callback) {
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
          presets: [
            ['env', {
              targets: { ie: '8' },
              bugfixes: false
            }]
          ]
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
