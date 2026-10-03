(function (global) {
  'use strict';

  var STORAGE_KEY = 'only-testing-online-music.lx-sources';
  var sources = [];
  var active = null;

  function parseMeta(code, url) {
    var name = (code.match(/@name\s+([^\n*\r]+)/i) || [])[1];
    var description = (code.match(/@description\s+([^\n*\r]+)/i) || [])[1];
    var version = (code.match(/@version\s+([^\n*\r]+)/i) || [])[1];
    var author = (code.match(/@author\s+([^\n*\r]+)/i) || [])[1];
    var homepage = (code.match(/@homepage\s+([^\n*\r]+)/i) || [])[1];
    return {
      name: name ? name.trim() : 'Unnamed LX Source',
      description: description ? description.trim() : '',
      version: version ? version.trim() : '',
      author: author ? author.trim() : '',
      homepage: homepage ? homepage.trim() : '',
      url: url
    };
  }

  function xhr(url, callback) {
    var req = new XMLHttpRequest();
    req.onreadystatechange = function () {
      if (req.readyState !== 4) return;
      if (req.status >= 200 && req.status < 300 || req.status === 0) {
        callback(null, req.responseText);
      } else {
        callback(new Error('HTTP ' + req.status), null);
      }
    };
    req.onerror = function () { callback(new Error('Network request failed'), null); };
    req.open('GET', url, true);
    req.send(null);
    return function () {
      try { req.abort(); } catch (e) {}
    };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sources));
    } catch (e) {}
  }

  function loadPersisted() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      sources = raw ? JSON.parse(raw) : [];
      if (!(sources instanceof Array)) sources = [];
      for (var i = 0; i < sources.length; i += 1) rehydrateItem(sources[i]);
    } catch (e) {
      sources = [];
    }
  }

  function rehydrateItem(item) {
    if (!item || typeof item.code !== 'string') return;
    item.runtime = global.createLXRuntime({
      env: 'desktop',
      onInited: function (data) {
        item.inited = true;
        item.sources = data && data.sources ? data.sources : null;
        item.initInfo = data || null;
        persist();
        notify();
        if (global.OnlyTestingMusicApp && global.OnlyTestingMusicApp.onSourceInited) {
          global.OnlyTestingMusicApp.onSourceInited(item);
        }
      },
      onUpdateAlert: function (data) {
        item.updateAlert = data || null;
        persist();
        notify();
      }
    });
    item.runtime.__requestHandler = makeRequestHandler();
    var meta = parseMeta(item.code, item.url);
    try {
      evaluate(item.code, meta, item.runtime);
    } catch (e) {
      item.error = e && e.message ? e.message : String(e);
      item.inited = false;
    }
  }

  function notify() {
    if (global.OnlyTestingMusicApp && global.OnlyTestingMusicApp.renderSources) {
      global.OnlyTestingMusicApp.renderSources(sources);
    }
  }

  function makeRequestHandler() {
    return function (url, options, callback) {
      var reqUrl = String(url || '');
      var opts = options || {};
      var method = String(opts.method || 'GET').toUpperCase();
      var req = new XMLHttpRequest();
      var done = false;

      function finish(err, body) {
        if (done) return;
        done = true;
        if (err) {
          callback(err, null, null);
          return;
        }

        var response = {
          statusCode: req.status,
          statusMessage: req.statusText || '',
          headers: {},
          bytes: body ? body.length : 0,
          raw: body || '',
          body: body || ''
        };
        callback(null, response, body || '');
      }

      req.onreadystatechange = function () {
        if (req.readyState !== 4) return;
        if (req.status >= 200 && req.status < 300 || req.status === 0) finish(null, req.responseText);
        else finish(new Error('HTTP ' + req.status), null);
      };
      req.onerror = function () { finish(new Error('Network request failed'), null); };
      req.ontimeout = function () { finish(new Error('Request timeout'), null); };

      try {
        req.open(method, reqUrl, true);
        if (opts.timeout) req.timeout = Number(opts.timeout);
        if (opts.headers) {
          for (var key in opts.headers) {
            if (Object.prototype.hasOwnProperty.call(opts.headers, key)) req.setRequestHeader(key, opts.headers[key]);
          }
        }

        var body = null;
        if (opts.form && typeof opts.form === 'object') {
          var parts = [];
          for (var formKey in opts.form) {
            if (Object.prototype.hasOwnProperty.call(opts.form, formKey)) {
              parts.push(encodeURIComponent(formKey) + '=' + encodeURIComponent(opts.form[formKey]));
            }
          }
          body = parts.join('&');
          if (!opts.headers || !opts.headers['Content-Type'] && !opts.headers['content-type']) {
            req.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          }
        } else if (opts.body != null) {
          body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
        } else if (opts.formData) {
          body = opts.formData;
        }

        req.send(body);
      } catch (e) {
        finish(e, null);
      }

      return function () {
        try { req.abort(); } catch (e) {}
      };
    };
  }

  function evaluate(code, meta) {
    var lx = global.LXRuntime;
    lx.currentScriptInfo = {
      name: meta.name,
      description: meta.description,
      version: meta.version,
      author: meta.author,
      homepage: meta.homepage,
      rawScript: code
    };

    var previousLX = global.lx;
    var previousGlobalThisLX = global.globalThis && global.globalThis.lx;
    global.lx = lx;

    var fn;
    try {
      fn = new Function('globalThis', 'window', 'console', 'setTimeout', 'clearTimeout', code + '\n//# sourceURL=' + meta.url);
      return {
        result: fn(global, global, global.console, global.setTimeout, global.clearTimeout),
        previousLX: previousLX,
        previousGlobalThisLX: previousGlobalThisLX
      };
    } catch (e) {
      global.lx = previousLX;
      throw e;
    }
  }

  function installFromCode(code, url, callback) {
    var meta = parseMeta(code, url);
    var item = {
      id: String(Date.now()) + '-' + Math.floor(Math.random() * 100000),
      url: url,
      name: meta.name,
      description: meta.description,
      version: meta.version,
      author: meta.author,
      homepage: meta.homepage,
      code: code,
      inited: false,
      sources: null,
      error: null,
      runtime: null
    };

    item.runtime = global.createLXRuntime({
      env: 'desktop',
      requestHandler: null,
      onInited: function (data) {
        item.inited = true;
        item.sources = data && data.sources ? data.sources : null;
        item.initInfo = data || null;
        persist();
        notify();
        if (global.OnlyTestingMusicApp && global.OnlyTestingMusicApp.onSourceInited) {
          global.OnlyTestingMusicApp.onSourceInited(item);
        }
      },
      onUpdateAlert: function (data) {
        item.updateAlert = data || null;
        persist();
        notify();
      }
    });

    item.runtime._setRequestHandler = function () {};
    item.runtime._setRequestHandler = function (handler) { item.runtime.__requestHandler = handler; };
    item.runtime.request = function (url, options, cb) {
      var handler = item.runtime.__requestHandler || makeRequestHandler();
      return handler.call(item.runtime, url, options || {}, cb || function () {});
    };

    var initHandler = function () {};

    try {
      evaluate(code, meta, item.runtime);
      sources.push(item);
      persist();
      active = item;
      notify();
      if (callback) callback(null, item);
    } catch (e) {
      item.error = e && e.message ? e.message : String(e);
      persist();
      if (callback) callback(e, item);
    }
  }
    var item = {
      id: String(Date.now()) + '-' + Math.floor(Math.random() * 100000),
      url: url,
      name: meta.name,
      description: meta.description,
      version: meta.version,
      author: meta.author,
      homepage: meta.homepage,
      code: code,
      inited: false,
      sources: null,
      error: null
    };

    var initHandler = function (data) {
      if (item.inited) return;
      item.inited = true;
      item.sources = data && data.sources ? data.sources : null;
      notify();
      if (global.OnlyTestingMusicApp && global.OnlyTestingMusicApp.onSourceInited) {
        global.OnlyTestingMusicApp.onSourceInited(item);
      }
    };

    var lxOn = global.LXRuntime.on;
    lxOn.call(global.LXRuntime, global.LXRuntime.EVENT_NAMES.inited, initHandler);

    try {
      evaluate(code, meta);
      sources.push(item);
      persist();
      active = item;
      notify();
      if (callback) callback(null, item);
    } catch (e) {
      item.error = e && e.message ? e.message : String(e);
      if (callback) callback(e, item);
    } finally {
      global.LXRuntime.off(global.LXRuntime.EVENT_NAMES.inited, initHandler);
    }
  }

  function installFromUrl(url, callback) {
    xhr(url, function (err, code) {
      if (err) return callback(err);
      if (!code || !String(code).trim()) return callback(new Error('LX source code is empty'));
      installFromCode(String(code), url, callback);
    });
  }

  function remove(id) {
    var next = [];
    for (var i = 0; i < sources.length; i += 1) {
      if (sources[i].id !== id) next.push(sources[i]);
    }
    sources = next;
    persist();
    notify();
  }

  function clear() {
    sources = [];
    active = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    notify();
  }

  function activate(id) {
    for (var i = 0; i < sources.length; i += 1) {
      if (sources[i].id === id) {
        active = sources[i];
        return active;
      }
    }
    return null;
  }

  function activate(id) {
    for (var i = 0; i < sources.length; i += 1) {
      if (sources[i].id === id) {
        active = sources[i];
        return active;
      }
    }
    return null;
  }

  function getSources() { return sources.slice(); }
  function getActive() { return active; }

  global.LXSourceManager = {
    init: function () {
      loadPersisted();
      active = sources.length ? sources[0] : null;
      notify();
    },
    installFromUrl: installFromUrl,
    installFromCode: installFromCode,
    remove: remove,
    clear: clear,
    activate: activate,
    getSources: getSources,
    activate: activate,
    getActive: getActive
  };
})(window);
