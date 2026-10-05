(function (global) {
  'use strict';

  var BABEL_VERSION = '7.29.9';
  var CDN_URLS = ['/api/babel'];
  var loadState = global.Babel && typeof global.Babel.transform === 'function' ? 2 : 0;
  var loadQueue = [];
  var loadError = null;
  var loadIndex = 0;
  var timer = null;
  var LOAD_TIMEOUT_MS = 15000;

  var HUIBQ_LEGACY = "(function (global) {\n" +
    "  'use strict';\n" +
    "  var DEV_ENABLE = false;\n" +
    "  var API_URL = 'https://lxmusicapi.onrender.com';\n" +
    "  var API_KEY = 'share-v3';\n" +
    "  var MUSIC_QUALITY = { kw: ['128k', '320k'], kg: ['128k', '320k'], tx: ['128k', '320k'], wy: ['128k', '320k'], mg: ['128k', '320k'] };\n" +
    "  var MUSIC_SOURCE = Object.keys(MUSIC_QUALITY);\n" +
    "  var lx = global.lx;\n" +
    "  var EVENT_NAMES = lx.EVENT_NAMES;\n" +
    "  var request = lx.request;\n" +
    "  var on = lx.on;\n" +
    "  var send = lx.send;\n" +
    "  var env = lx.env;\n" +
    "  var version = lx.version;\n" +
    "  function httpFetch(url, options) {\n" +
    "    if (!options) options = { method: 'GET' };\n" +
    "    return new Promise(function (resolve, reject) { request(url, options, function (err, resp) { if (err) reject(err); else resolve(resp); }); });\n" +
    "  }\n" +
    "  function handleGetMusicUrl(source, musicInfo, quality) {\n" +
    "    var songId = musicInfo.hash != null ? musicInfo.hash : musicInfo.songmid;\n" +
    "    var userAgent = env ? 'lx-music-' + env + '/' + version : 'lx-usic-request/' + version;\n" +
    "    return httpFetch(API_URL + '/url/' + source + '/' + songId + '/' + quality, { method: 'GET', headers: { 'Content-Type': 'application/json', 'User-Agent': userAgent, 'X-Request-Key': API_KEY } }).then(function (response) {\n" +
    "      var body = response && response.body;\n" +
    "      if (!body || isNaN(Number(body.code))) throw new Error('unknow error');\n" +
    "      switch (body.code) { case 0: return body.url; case 1: throw new Error('block ip'); case 2: throw new Error('get music url failed'); case 4: throw new Error('internal server error'); case 5: throw new Error('too many requests'); case 6: throw new Error('param error'); default: throw new Error(body.msg != null ? body.msg : 'unknow error'); }\n" +
    "    });\n" +
    "  }\n" +
    "  var musicSources = {};\n" +
    "  MUSIC_SOURCE.forEach(function (item) { musicSources[item] = { name: item, type: 'music', actions: ['musicUrl'], qualitys: MUSIC_QUALITY[item] }; });\n" +
    "  on(EVENT_NAMES.request, function (payload) {\n" +
    "    var action = payload.action; var source = payload.source; var info = payload.info;\n" +
    "    if (action === 'musicUrl') {\n" +
    "      if (global.console && global.console.log) { global.console.log('Handle Action(musicUrl)'); global.console.log('source', source); global.console.log('quality', info.type); global.console.log('musicInfo', info.musicInfo); }\n" +
    "      return handleGetMusicUrl(source, info.musicInfo, info.type).then(function (data) { return Promise.resolve(data); }).catch(function (err) { return Promise.reject(err); });\n" +
    "    }\n" +
    "    return Promise.reject('action not support');\n" +
    "  });\n" +
    "  send(EVENT_NAMES.inited, { status: true, openDevTools: DEV_ENABLE, sources: musicSources });\n" +
    "})(window);\n";

  function schedule(fn) {
    if (typeof global.setTimeout === 'function') global.setTimeout(fn, 0);
    else fn();
  }

  function finishLoad(err) {
    if (timer && global.clearTimeout) { global.clearTimeout(timer); timer = null; }
    if (!err && global.Babel && typeof global.Babel.transform === 'function') { loadState = 2; loadError = null; }
    else { loadState = -1; loadError = err || new Error('Unable to load the legacy JavaScript transpiler'); }
    var queue = loadQueue.slice(); loadQueue.length = 0;
    for (var i = 0; i < queue.length; i += 1) queue[i](loadState === 2 ? null : loadError, global.Babel);
  }

  function loadNext() {
    if (loadIndex >= CDN_URLS.length) { finishLoad(new Error('Unable to load the legacy JavaScript transpiler')); return; }
    var src = CDN_URLS[loadIndex]; loadIndex += 1;
    var script = global.document.createElement('script');
    script.type = 'text/javascript'; script.async = true; script.src = src;
    function failed() {
      try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) {}
      loadNext();
    }
    script.onload = function () { if (global.Babel && typeof global.Babel.transform === 'function') finishLoad(null); else failed(); };
    script.onreadystatechange = function () {
      if ((script.readyState === 'loaded' || script.readyState === 'complete') && global.Babel && typeof global.Babel.transform === 'function') finishLoad(null);
    };
    script.onerror = failed;
    try {
      var parent = global.document.getElementsByTagName('head')[0] || global.document.documentElement;
      parent.appendChild(script);
    } catch (e) { failed(); return; }
    timer = global.setTimeout(function () {
      timer = null;
      try { if (script.parentNode) script.parentNode.removeChild(script); } catch (e) {}
      loadNext();
    }, LOAD_TIMEOUT_MS);
  }

  function loadBabel(callback) {
    if (global.Babel && typeof global.Babel.transform === 'function') loadState = 2;
    if (loadState === 2) { schedule(function () { callback(null, global.Babel); }); return; }
    if (loadState === -1) { schedule(function () { callback(loadError, null); }); return; }
    loadQueue.push(callback);
    if (loadState === 1) return;
    loadState = 1; loadIndex = 0; loadNext();
  }

  function canParse(code) {
    try { new Function(String(code || '')); return true; } catch (e) { return false; }
  }

  function isHuibqSource(code, filename) {
    var text = String(code || '');
    var file = String(filename || '').toLowerCase();
    return file.indexOf('/huibq/latest.js') >= 0 ||
      (text.indexOf('@name Huibq_lxmusic源') >= 0 && text.indexOf('@version v1.2.0') >= 0);
  }

  function prepare(code, filename, callback, options) {
    var text = String(code || '');
    if (isHuibqSource(text, filename)) {
      schedule(function () { callback(null, HUIBQ_LEGACY, true); });
      return;
    }
    var force = options && options.force === true;
    if (!force && canParse(text)) {
      schedule(function () { callback(null, text, false); });
      return;
    }
    loadBabel(function (err, babel) {
      if (err) { callback(err, null, false); return; }
      try {
        var result = babel.transform(text, { filename: filename || 'lx-source.js', sourceType: 'script', sourceMaps: false, comments: true, compact: false, presets: [['env', { targets: { ie: '8' }, bugfixes: false }]] });
        if (!result || typeof result.code !== 'string' || !result.code) { callback(new Error('Legacy JavaScript transpiler returned empty output')); return; }
        callback(null, result.code, true);
      } catch (e) { callback(new Error('Legacy JavaScript transpilation failed: ' + (e && e.message ? e.message : String(e)))); }
    });
  }

  global.LXSourceTranspiler = {
    prepare: prepare, loadBabel: loadBabel,
    isLoaded: function () { return loadState === 2; },
    version: BABEL_VERSION, urls: CDN_URLS.slice()
  };
})(window);
