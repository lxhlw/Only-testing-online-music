(function (global) {
  'use strict';

  var API_ENDPOINT = 'https://music-api.gdstudio.xyz/api.php';

  var SOURCE_MAP = {
    kw: 'kuwo',
    kg: 'kugou',
    tx: 'tencent',
    wy: 'netease',
    mg: 'migu'
  };

  function requestJson(url, callback) {
    var origin = global.location && global.location.origin
      ? global.location.origin
      : (global.location.protocol + '//' + global.location.host);
    var requestUrl = origin + '/api/proxy?url=' + encodeURIComponent(url);
    var xhr = new XMLHttpRequest();
    var finished = false;

    function finish(err, data) {
      if (finished) return;
      finished = true;
      callback(err, data);
    }

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status < 200 || xhr.status >= 300) {
        return finish(new Error('Search API HTTP ' + xhr.status));
      }
      try {
        finish(null, JSON.parse(xhr.responseText));
      } catch (e) {
        finish(new Error('Search API response is not JSON'));
      }
    };
    xhr.onerror = function () { finish(new Error('Search network request failed')); };
    xhr.ontimeout = function () { finish(new Error('Search request timeout')); };

    try {
      xhr.open('GET', requestUrl, true);
      xhr.setRequestHeader('X-LX-Headers', JSON.stringify({
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': origin,
        'Referer': origin + '/',
        'X-Requested-With': 'XMLHttpRequest'
      }));
      if (xhr.timeout !== undefined) xhr.timeout = 15000;
      xhr.send(null);
    } catch (e) {
      finish(e);
    }
  }

  function normalizeArtist(artist) {
    if (Array.isArray(artist)) return artist.join('、');
    if (artist && typeof artist === 'object') {
      if (artist.name) return String(artist.name);
      return '';
    }
    return String(artist || '');
  }

  function normalizeSong(item, source) {
    item = item || {};
    var rawArtist = item.artist != null ? item.artist : item.artists;
    var albumName = item.album != null ? item.album : item.albumName;
    var id = item.id != null ? item.id :
      (item.songmid != null ? item.songmid :
      (item.mid != null ? item.mid :
      (item.hash != null ? item.hash : '')));

    return {
      id: String(id || ''),
      name: String(item.name != null ? item.name : ''),
      singer: normalizeArtist(rawArtist != null ? rawArtist : item.singer),
      source: source,
      albumName: String(albumName || ''),
      interval: item.interval != null ? item.interval :
        (item.duration != null ? item.duration : ''),
      songmid: String((item.songmid || item.mid || item.id || item.hash || '') || ''),
      mediaMid: String((item.mediaMid || item.media_mid || '') || ''),
      albumId: String((item.albumId || item.album_id || '') || ''),
      image: String((item.pic || item.image || item.img || '') || ''),
      lyricId: String((item.lyric_id || item.lyricId || '') || ''),
      meta: item.meta || null,
      raw: item
    };
  }

  function normalizeResult(source, page, data) {
    var list;
    var total;
    var isEnd = false;

    if (Array.isArray(data)) {
      list = data;
      total = list.length;
    } else if (data && Array.isArray(data.list)) {
      list = data.list;
      total = data.total != null ? Number(data.total) : list.length;
      isEnd = data.isEnd === true;
    } else if (data && data.data && Array.isArray(data.data.list)) {
      list = data.data.list;
      total = data.data.total != null ? Number(data.data.total) : list.length;
      isEnd = data.data.isEnd === true;
    } else {
      return null;
    }

    var result = [];
    for (var i = 0; i < list.length; i += 1) {
      var song = normalizeSong(list[i], source);
      if (!song.id || !song.name) continue;
      result.push(song);
    }

    return {
      source: source,
      page: page,
      total: isNaN(total) ? result.length : total,
      isEnd: isEnd,
      list: result
    };
  }

  function searchNative(source, keyword, page, limit, callback) {
    global.LXSourceManager.requestAction(source, 'musicSearch', {
      keyword: keyword,
      page: page,
      pagesize: limit
    }, function (err, data) {
      if (err) return callback(err);
      var normalized = normalizeResult(source, page, data);
      if (!normalized) return callback(new Error('LX musicSearch result format is invalid'));
      callback(null, normalized);
    });
  }

  function searchViaGdStudio(source, keyword, page, limit, callback) {
    var mapped = SOURCE_MAP[source];
    if (!mapped) return callback(new Error('Unsupported search source: ' + source));

    var url = API_ENDPOINT +
      '?types=search' +
      '&source=' + encodeURIComponent(mapped) +
      '&name=' + encodeURIComponent(keyword) +
      '&count=' + encodeURIComponent(limit) +
      '&pages=' + encodeURIComponent(page);

    requestJson(url, function (err, data) {
      if (err) return callback(err);
      var normalized = normalizeResult(source, page, data);
      if (!normalized) return callback(new Error('Search result format is invalid'));
      callback(null, normalized);
    });
  }

  function search(source, keyword, page, limit, callback) {
    source = String(source || '').toLowerCase();
    keyword = String(keyword || '');
    page = page || 1;
    limit = limit || 20;

    if (!keyword) return callback(new Error('Search keyword is empty'));

    var active = global.LXSourceManager && global.LXSourceManager.getActive
      ? global.LXSourceManager.getActive()
      : null;
    var sourceInfo = active && active.sources ? active.sources[source] : null;
    var actions = sourceInfo && sourceInfo.actions ? sourceInfo.actions : [];

    if (actions.indexOf('musicSearch') >= 0 && global.LXSourceManager && global.LXSourceManager.requestAction) {
      return searchNative(source, keyword, page, limit, function (nativeErr, nativeResult) {
        if (!nativeErr) return callback(null, nativeResult);

        if (SOURCE_MAP[source]) {
          return searchViaGdStudio(source, keyword, page, limit, function (fallbackErr, fallbackResult) {
            if (fallbackErr) {
              var combined = new Error(
                'LX musicSearch failed: ' + (nativeErr.message || nativeErr) +
                '; GD Studio fallback failed: ' + (fallbackErr.message || fallbackErr)
              );
              combined.nativeError = nativeErr;
              combined.fallbackError = fallbackErr;
              return callback(combined);
            }
            fallbackResult.fallbackFrom = 'native';
            return callback(null, fallbackResult);
          });
        }

        return callback(nativeErr);
      });
    }

    return searchViaGdStudio(source, keyword, page, limit, callback);
  }

  global.LXMusicSearch = {
    search: search,
    sourceMap: SOURCE_MAP,
    normalizeSong: normalizeSong
  };
})(window);
