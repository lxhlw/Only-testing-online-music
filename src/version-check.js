(function (global) {
  'use strict';

  var REMOTE_VERSION_URL = 'https://raw.githubusercontent.com/lxhlw/Only-testing-online-music/main/version.json';

  function getOrigin() {
    if (global.location && global.location.origin) return global.location.origin;
    return global.location.protocol + '//' + global.location.host;
  }

  function compareVersions(a, b) {
    function parts(value) {
      var raw = String(value || '').replace(/^v/i, '').split('.');
      var result = [];
      for (var i = 0; i < 3; i += 1) {
        var match = String(raw[i] || '0').match(/\d+/);
        result.push(match ? Number(match[0]) : 0);
      }
      return result;
    }

    var left = parts(a);
    var right = parts(b);
    for (var i = 0; i < 3; i += 1) {
      if (left[i] > right[i]) return 1;
      if (left[i] < right[i]) return -1;
    }
    return 0;
  }

  function checkLatest(callback) {
    callback = callback || function () {};
    var current = global.OnlyTestingMusicVersion || {};
    var origin = getOrigin();
    var requestUrl = origin + '/api/proxy?url=' +
      encodeURIComponent(REMOTE_VERSION_URL + '?t=' + new Date().getTime());
    var xhr = new XMLHttpRequest();
    var finished = false;

    function finish(err, remote) {
      if (finished) return;
      finished = true;
      callback(err, remote || null);
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        finish(new Error('版本检查 HTTP ' + xhr.status));
        return;
      }
      try {
        var data = JSON.parse(xhr.responseText || '{}');
        if (!data || !data.version) {
          finish(new Error('版本信息格式无效'));
          return;
        }
        finish(null, {
          currentVersion: String(current.version || ''),
          latestVersion: String(data.version),
          releaseDate: String(data.releaseDate || ''),
          name: String(data.name || ''),
          compare: compareVersions(String(current.version || ''), String(data.version))
        });
      } catch (e) {
        finish(new Error('版本信息不是有效 JSON'));
      }
    };
    xhr.onerror = function () { finish(new Error('版本检查网络请求失败')); };
    xhr.ontimeout = function () { finish(new Error('版本检查超时')); };

    try {
      xhr.open('GET', requestUrl, true);
      if (xhr.timeout !== undefined) xhr.timeout = 8000;
      xhr.send(null);
    } catch (e) {
      finish(e);
    }
  }

  global.OnlyTestingMusicVersionCheck = {
    compareVersions: compareVersions,
    checkLatest: checkLatest,
    remoteUrl: REMOTE_VERSION_URL
  };
})(window);
