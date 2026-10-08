(function (global) {
  'use strict';

  var STORAGE_KEY = 'only-testing-online-music.lx-sources';
  var ACTIVE_SOURCE_KEY = 'only-testing-online-music.active-source-id';
  var DEFAULT_SOURCE_LAST_ATTEMPT_KEY = 'only-testing-online-music.default-source-attempt';
  var DEFAULT_SOURCE_DISABLED_KEY = 'only-testing-online-music.default-source-disabled';
  // User-confirmed Flower mirror, with the matching maintainer GitHub raw URL
  // as a transport fallback. Never auto-import arbitrary repository contents.
  var DEFAULT_FLOWER_URL = 'https://ghproxy.net/raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
  var DEFAULT_FLOWER_RAW_URL = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/flower/latest.js';
  var DEFAULT_RETRY_MS = 12 * 60 * 60 * 1000;
  var sources = [];
  var active = null;

  function trim(s) { return String(s || '').replace(/^\s+|\s+$/g, ''); }

  function parseMeta(code, url) {
    return {
      name: trim((code.match(/@name\s+([^\n*\r]+)/i) || [])[1]) || 'Unnamed LX Source',
      description: trim((code.match(/@description\s+([^\n*\r]+)/i) || [])[1]),
      version: trim((code.match(/@version\s+([^\n*\r]+)/i) || [])[1]),
      author: trim((code.match(/@author\s+([^\n*\r]+)/i) || [])[1]),
      homepage: trim((code.match(/@homepage\s+([^\n*\r]+)/i) || [])[1]),
      url: url
    };
  }

  function notify() {
    if (global.OnlyTestingMusicApp && global.OnlyTestingMusicApp.renderSources) {
      global.OnlyTestingMusicApp.renderSources(sources);
    }
  }

  function persist() {
    try {
      var clean = [];
      for (var i = 0; i < sources.length; i += 1) {
        var x = sources[i];
        clean.push({
          id:x.id,url:x.url,name:x.name,description:x.description,version:x.version,
          author:x.author,homepage:x.homepage,code:x.code,inited:!!x.inited,
          sources:x.sources || null,initInfo:x.initInfo || null,error:x.error || null,
          transport:x.transport || null
        });
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
      // Keep the existing array format intact for previously installed sources.
      if (active && active.id) localStorage.setItem(ACTIVE_SOURCE_KEY, String(active.id));
      else localStorage.removeItem(ACTIVE_SOURCE_KEY);
    } catch (e) {}
  }

  function loadRaw() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var value = raw ? JSON.parse(raw) : [];
      return value instanceof Array ? value : [];
    } catch (e) { return []; }
  }

  function loadActiveId() {
    try { return String(localStorage.getItem(ACTIVE_SOURCE_KEY) || ''); }
    catch (e) { return ''; }
  }

  function makeRequestHandler(runtime) {
    runtime.__debugRequests = [];
    return function(url, options, callback) {
      var target = String(url || '');
      var requestUrl = target;
      try {
        if (typeof global.URL === 'function') {
          var page = new global.URL(global.location.href);
          var dest = new global.URL(target, page.href);
          if (dest.origin !== page.origin) {
            requestUrl = page.origin + '/api/proxy?url=' + encodeURIComponent(dest.href);
          }
        } else {
          var pageOrigin = global.location.protocol + '//' + global.location.host;
          var absoluteTarget = target;
          if (absoluteTarget.indexOf('//') === 0) {
            absoluteTarget = global.location.protocol + absoluteTarget;
          }
          var originMatch = null;
          if (absoluteTarget.indexOf('http://') === 0 || absoluteTarget.indexOf('https://') === 0) {
            var authority = absoluteTarget.split('/')[2] || '';
            originMatch = authority ? authority : null;
          }
          if (originMatch && (absoluteTarget.indexOf('http://') === 0 || absoluteTarget.indexOf('https://') === 0)) {
            var targetProtocol = absoluteTarget.split('/')[0];
            var targetOrigin = targetProtocol + '//' + originMatch;
            if (targetOrigin.toLowerCase() !== pageOrigin.toLowerCase()) {
              requestUrl = pageOrigin + '/api/proxy?url=' + encodeURIComponent(absoluteTarget);
            }
          }
        }
      } catch (e) {}

      var opts = options || {};
      var method = String(opts.method || 'GET').toUpperCase();
      try {
        runtime.__debugRequests.push({
          url: String(target),
          method: method,
          headers: opts.headers || null,
          proxied: requestUrl !== target,
          proxyUrl: requestUrl
        });
        if (runtime.__debugRequests.length > 100) runtime.__debugRequests.shift();
      } catch (e) {}
      var xhr = new XMLHttpRequest();
      var done = false;
      var proxied = requestUrl.indexOf('/api/proxy?url=') >= 0;

      function finish(err, body) {
        if (done) return;
        done = true;
        if (err) return callback.call(runtime, err, null, null);

        var parsed = body;
        try { parsed = JSON.parse(body); } catch (e) {}
        callback.call(runtime, null, {
          statusCode: xhr.status,
          statusMessage: xhr.statusText || '',
          headers: {},
          bytes: body ? String(body).length : 0,
          raw: body || '',
          body: parsed
        }, parsed);
      }

      xhr.onreadystatechange = function() {
        if (xhr.readyState !== 4) return;
        if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) finish(null, xhr.responseText);
        else finish(new Error('HTTP ' + xhr.status + (xhr.responseText ? ': ' + String(xhr.responseText).slice(0, 1200) : '')), null);
      };
      xhr.onerror = function() { finish(new Error('Network request failed'), null); };
      xhr.ontimeout = function() { finish(new Error('Request timeout'), null); };

      try {
        xhr.open(method, requestUrl, true);
        if (opts.timeout && xhr.timeout !== undefined) xhr.timeout = Number(opts.timeout);

        if (opts.headers) {
          if (proxied) {
            try { xhr.setRequestHeader('X-LX-Headers', JSON.stringify(opts.headers)); } catch (e) {}
          } else {
            for (var key in opts.headers) if (Object.prototype.hasOwnProperty.call(opts.headers, key)) {
              try { xhr.setRequestHeader(key, opts.headers[key]); } catch (e) {}
            }
          }
        }

        var body = null;
        if (opts.form && typeof opts.form === 'object') {
          var parts = [];
          for (var fk in opts.form) if (Object.prototype.hasOwnProperty.call(opts.form, fk)) {
            parts.push(encodeURIComponent(fk) + '=' + encodeURIComponent(opts.form[fk]));
          }
          body = parts.join('&');
          try { xhr.setRequestHeader('Content-Type','application/x-www-form-urlencoded'); } catch (e) {}
        } else if (opts.body != null) {
          body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
        } else if (opts.formData) body = opts.formData;

        xhr.send(body);
      } catch (e) {
        finish(e, null);
      }

      return function(){ try { xhr.abort(); } catch (e) {} };
    };
  }

  function detectLXEnv() {
    var ua = '';
    try {
      ua = String(global.navigator && global.navigator.userAgent || '');
    } catch (e) {}
    // LX user scripts run within our desktop API compatibility shim on
    // mobile, too. A "mobile" LX environment can make scripts skip working
    // desktop playback endpoints even though the page runs in a phone browser.
    return 'desktop';
  }

  function executeSource(item, callback) {
    var runtime = global.createLXRuntime({
      env:detectLXEnv(),
      onInited:function(data){
        item.inited=true;
        item.sources=data && data.sources ? data.sources : null;
        item.initInfo=data || null;
        item.error=null;
        persist(); notify();
        if (global.OnlyTestingMusicApp && global.OnlyTestingMusicApp.onSourceInited) {
          global.OnlyTestingMusicApp.onSourceInited(item);
        }
      },
      onUpdateAlert:function(data){
        item.updateAlert=data || null;
        persist();
      }
    });

    runtime.request = makeRequestHandler(runtime);
    item.runtime=runtime;
    item.inited=false;
    item.sources=null;
    item.error=null;
    item.transpiled=false;

    var meta=parseMeta(item.code,item.url);
    runtime.currentScriptInfo={
      name:meta.name,description:meta.description,version:meta.version,
      author:meta.author,homepage:meta.homepage,rawScript:item.code
    };

    global.LXSourceTranspiler.prepare(item.code,item.url,function(transpileErr, executionCode, transpiled){
      if (transpileErr) {
        item.error=transpileErr && transpileErr.message ? transpileErr.message : String(transpileErr);
        if (callback) callback(transpileErr,item);
        return;
      }

      var previousLX=global.lx;
      var previousGlobal=global.globalThis && global.globalThis.lx;

      try {
        if (!global.globalThis) global.globalThis=global;
        global.lx=runtime;
        global.globalThis.lx=runtime;
        var fn=new Function(
          'globalThis','window','console','setTimeout','clearTimeout',
          executionCode+'\n//# sourceURL='+item.url
        );
        fn(global,global,global.console,global.setTimeout,global.clearTimeout);
        item.transpiled=!!transpiled;
        if (callback) callback(null,item);
      } catch (e) {
        item.error=e && e.message ? e.message : String(e);
        if (callback) callback(e,item);
      } finally {
        global.lx=previousLX;
        if (global.globalThis) global.globalThis.lx=previousGlobal;
      }
    });
    return item;
  }

  function addOrReplace(item) {
    var next=[];
    for (var i=0;i<sources.length;i+=1) if (sources[i].url!==item.url) next.push(sources[i]);
    next.push(item);
    sources=next;
    active=item;
    persist(); notify();
  }

  function installFromCode(code,url,callback) {
    var meta=parseMeta(code,url);
    var item={
      id:String(Date.now())+'-'+Math.floor(Math.random()*100000),
      url:url,name:meta.name,description:meta.description,version:meta.version,
      author:meta.author,homepage:meta.homepage,code:String(code),inited:false,
      sources:null,initInfo:null,error:null,runtime:null,transport:null,transpiled:false
    };

    executeSource(item,function(err){
      if (err) {
        persist();
        if (callback) callback(err,item);
        return;
      }
      addOrReplace(item);
      if (callback) callback(null,item);
    });
  }

  function installFromUrl(url,callback) {
    var originalUrl = String(url || '');
    var finished = false;
    var activeXhr = null;
    var timer = null;
    var TIMEOUT_MS = 12000;
    var proxyUrl;

    try {
      var page = new URL(global.location.href);
      proxyUrl = page.protocol + '//' + page.host + '/api/proxy?url=' + encodeURIComponent(originalUrl);
    } catch (e) {
      proxyUrl = '/api/proxy?url=' + encodeURIComponent(originalUrl);
    }

    function cleanup() {
      if (timer) {
        global.clearTimeout(timer);
        timer = null;
      }
      activeXhr = null;
    }

    function finish(err, code, transport) {
      if (finished) return;
      finished = true;
      cleanup();
      if (err) return callback(err);
      if (!code || !String(code).replace(/\s+/g,'')) return callback(new Error('LX source code is empty'));
      installFromCode(String(code), originalUrl, function (installErr, item) {
        if (item) item.transport = transport || null;
        if (!installErr) persist();
        callback(installErr, item);
      });
    }

    function request(requestUrl, allowProxyFallback, transport) {
      if (timer) {
        global.clearTimeout(timer);
        timer = null;
      }
      activeXhr = new XMLHttpRequest();

      function succeed(code) {
        finish(null, code, transport);
      }

      function fail(message) {
        if (allowProxyFallback) {
          request(proxyUrl, false, 'proxy');
          return;
        }
        finish(new Error(message));
      }

      activeXhr.onreadystatechange = function(){
        if(activeXhr.readyState!==4)return;
        if(activeXhr.status>=200&&activeXhr.status<300) {
          succeed(activeXhr.responseText);
        } else if (activeXhr.status === 0) {
          fail('Network request failed (HTTP status 0)');
        } else {
          fail('HTTP '+activeXhr.status);
        }
      };
      activeXhr.onerror=function(){fail('Network request failed');};
      activeXhr.ontimeout=function(){fail('Request timeout after '+TIMEOUT_MS+' ms');};

      timer = global.setTimeout(function () {
        if (!finished && activeXhr) {
          try { activeXhr.abort(); } catch (e) {}
          fail('Request timeout after '+TIMEOUT_MS+' ms');
        }
      }, TIMEOUT_MS);

      try {
        activeXhr.open('GET',requestUrl,true);
        if (activeXhr.timeout !== undefined) activeXhr.timeout = TIMEOUT_MS;
        activeXhr.send(null);
      } catch (e) {
        fail(e && e.message ? e.message : String(e));
      }
    }

    request(originalUrl, true, 'direct');
    return function(){
      var xhr = activeXhr;
      finished = true;
      cleanup();
      try { if (xhr) xhr.abort(); } catch (e) {}
    };
  }

  var BUILTIN_HUIBQ_URL = 'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js';
  var BUILTIN_HUIBQ_CODE =
    '/*!\\n' +
    ' * @name Huibq_lxmusic源\\n' +
    ' * @description Github搜索“洛雪音乐音源”，禁止批量下载！\\n' +
    ' * @version v1.2.0\\n' +
    ' * @author Huibq\\n' +
    ' */\\n' +
    '/* only-testing-online-music verified built-in adapter marker */';

  function installBuiltinHuibq(callback) {
    installFromCode(BUILTIN_HUIBQ_CODE, BUILTIN_HUIBQ_URL, function (err, item) {
      if (item) item.transport = 'builtin';
      if (!err) persist();
      if (callback) callback(err, item);
    });
  }

  function hasDefaultFlower() {
    for (var i = 0; i < sources.length; i += 1) {
      var url = String(sources[i].url || '');
      if (url.indexOf('pdone/lx-music-source/main/flower/latest.js') >= 0) return true;
    }
    return false;
  }

  function hasDefaultHuibq() {
    for (var i = 0; i < sources.length; i += 1) {
      if (String(sources[i].url || '') === BUILTIN_HUIBQ_URL) return true;
    }
    return false;
  }

  function restorePreferredSource(id) {
    if (!id) return;
    for (var i = 0; i < sources.length; i += 1) {
      if (sources[i].id === id) {
        active = sources[i]; persist(); notify(); return;
      }
    }
  }

  function ensureDefaultSources(force, callback) {
    try {
      if (!force && localStorage.getItem(DEFAULT_SOURCE_DISABLED_KEY) === '1') {
        if (callback) callback(null); return;
      }
      var last = Number(localStorage.getItem(DEFAULT_SOURCE_LAST_ATTEMPT_KEY) || 0);
      var now = Date.now ? Date.now() : new Date().getTime();
      if (!force && sources.length && last && now - last < DEFAULT_RETRY_MS) {
        if (callback) callback(null); return;
      }
      localStorage.setItem(DEFAULT_SOURCE_LAST_ATTEMPT_KEY, String(now));
    } catch (e) {}

    var priorId = active && active.id;
    var hadExisting = sources.length > 0;

    function addFlower() {
      if (hasDefaultFlower()) {
        restorePreferredSource(priorId);
        if (callback) callback(null);
        return;
      }
      installFromUrl(DEFAULT_FLOWER_URL, function (err) {
        if (!err) {
          // A returning user should not have their chosen source changed.
          if (hadExisting) restorePreferredSource(priorId);
          if (callback) callback(null);
          return;
        }
        // A mirror outage must not stop fresh devices from using the
        // built-in ES5 Huibq source. Try upstream GitHub only once.
        installFromUrl(DEFAULT_FLOWER_RAW_URL, function (rawErr) {
          if (hadExisting) restorePreferredSource(priorId);
          if (callback) callback(rawErr || null);
        });
      });
    }

    if (!hasDefaultHuibq()) {
      installBuiltinHuibq(function () {
        restorePreferredSource(priorId);
        addFlower();
      });
    } else addFlower();
  }

  function rehydrate(item, callback) {
    if (!item || typeof item.code!=='string') {
      if (callback) callback();
      return;
    }
    executeSource(item,function(){
      if (callback) callback();
    });
  }

  function init() {
    var savedId=loadActiveId();
    sources=loadRaw();
    active=null;
    for (var i=0;i<sources.length;i+=1) {
      if (String(sources[i].id)===savedId) {
        active=sources[i];
        break;
      }
    }
    if (!active) active=sources.length?sources[0]:null;
    persist(); notify();

    function next(index) {
      if (index >= sources.length) {
        persist(); notify();
        // Do not stall the search UI while remote Flower imports on a slow
        // Android 4.4 device; Huibq initializes from a tiny bundled adapter.
        global.setTimeout(function () { ensureDefaultSources(false); }, 80);
        return;
      }
      rehydrate(sources[index],function(){
        next(index + 1);
      });
    }

    next(0);
  }

  function remove(id) {
    var next=[];
    for(var i=0;i<sources.length;i+=1)if(sources[i].id!==id)next.push(sources[i]);
    sources=next;
    if(active && active.id===id)active=sources.length?sources[0]:null;
    persist(); notify();
  }

  function clear() {
    sources=[]; active=null;
    try{
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVE_SOURCE_KEY);
      localStorage.setItem(DEFAULT_SOURCE_DISABLED_KEY, '1');
    }catch(e){}
    notify();
  }

  function restoreDefaults(callback) {
    try {
      localStorage.removeItem(DEFAULT_SOURCE_DISABLED_KEY);
      localStorage.removeItem(DEFAULT_SOURCE_LAST_ATTEMPT_KEY);
    } catch (e) {}
    ensureDefaultSources(true, callback);
  }

  function activate(id) {
    for(var i=0;i<sources.length;i+=1)if(sources[i].id===id){
      active=sources[i]; persist(); notify(); return active;
    }
    return null;
  }

  function requestAction(source,action,info,callback) {
    if(!active || !active.runtime){
      if(callback)callback(new Error('No active LX source runtime')); return;
    }
    active.runtime.__requestAction(source,action,info).then(function(result){
      if(callback)callback(null,result);
    }).catch(function(err){
      if(callback)callback(err);
    });
  }

  global.LXSourceManager={
    init:init,installFromUrl:installFromUrl,installFromCode:installFromCode,
    installBuiltinHuibq:installBuiltinHuibq,restoreDefaults:restoreDefaults,
    remove:remove,clear:clear,activate:activate,requestAction:requestAction,
    getSources:function(){return sources.slice();},
    getActive:function(){return active;}
  };
})(window);
