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
    var requestUrl = global.location.origin + '/api/proxy?url=' + encodeURIComponent(url);
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Origin': global.location.origin,
        'Referer': global.location.origin + '/',
        'X-Requested-With': 'XMLHttpRequest'
      }));
      if (xhr.timeout !== undefined) xhr.timeout = 15000;
      xhr.send(null);
    } catch (e) {
      finish(e);
    }
  }

  function normalizeArtist(artist) {
    if (artist instanceof Array) return artist.join('、');
    if (artist && typeof artist === 'object') {
      if (artist.name) return String(artist.name);
      return '';
    }
    return String(artist || '');
  }

  function normalizeSong(item, source) {
    var rawArtist = item && (item.artist != null ? item.artist : item.artists);
    var albumName = item && (item.album != null ? item.album : item.albumName);

    return {
      id: String(item && item.id != null ? item.id : ''),
      name: String(item && item.name != null ? item.name : ''),
      singer: normalizeArtist(rawArtist),
      source: source,
      albumName: String(albumName || ''),
      interval: item && item.interval != null ? item.interval : '',
      songmid: String(item && (item.songmid || item.mid || item.id || '') || ''),
      mediaMid: String(item && (item.mediaMid || item.media_mid || '') || ''),
      albumId: String(item && (item.albumId || item.album_id || '') || ''),
      image: String(item && (item.pic || item.image || item.img || '') || ''),
      lyricId: String(item && (item.lyric_id || item.lyricId || '') || ''),
      meta: item && item.meta ? item.meta : null,
      raw: item || {}
    };
  }

  function search(source, keyword, page, limit, callback) {
    source = String(source || '').toLowerCase();
    keyword = String(keyword || '');
    page = page || 1;
    limit = limit || 20;

    var mapped = SOURCE_MAP[source];
    if (!mapped) return callback(new Error('Unsupported search source: ' + source));
    if (!keyword) return callback(new Error('Search keyword is empty'));

    var url = API_ENDPOINT +
      '?types=search' +
      '&source=' + encodeURIComponent(mapped) +
      '&name=' + encodeURIComponent(keyword) +
      '&count=' + encodeURIComponent(limit) +
      '&pages=' + encodeURIComponent(page);

    requestJson(url, function (err, data) {
      if (err) return callback(err);
      if (!(data instanceof Array)) {
        return callback(new Error('Search result format is invalid'));
      }

      var result = [];
      for (var i = 0; i < data.length; i += 1) {
        var song = normalizeSong(data[i], source);
        if (!song.id || !song.name) continue;
        result.push(song);
      }

      callback(null, {
        source: source,
        page: page,
        total: result.length,
        list: result
      });
    });
  }

  global.LXMusicSearch = {
    search: search,
    sourceMap: SOURCE_MAP
  };
})(window);
