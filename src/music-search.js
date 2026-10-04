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

  var GD_TO_LX_SOURCE = {
    kuwo: 'kw',
    kugou: 'kg',
    tencent: 'tx',
    netease: 'wy',
    migu: 'mg'
  };

  var GD_STUDIO_TIME_ENDPOINT = 'https://music.gdstudio.xyz/time';
  var GD_STUDIO_API_VERSION = '2026.08.01';
  var gdServerTime = '';
  var gdServerTimeExpiresAt = 0;

  function encodeForm(data) {
    var parts = [];
    for (var key in data) {
      if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(data[key] == null ? '' : data[key]));
    }
    return parts.join('&');
  }

  function requestViaProxy(targetUrl, method, body, headers, parseJson, callback) {
    var origin = global.location && global.location.origin
      ? global.location.origin
      : (global.location.protocol + '//' + global.location.host);
    var proxyUrl = origin + '/api/proxy?url=' + encodeURIComponent(targetUrl);
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
        var detail = String(xhr.responseText || '').replace(/^\s+|\s+$/g, '');
        if (detail.length > 240) detail = detail.slice(0, 240) + '…';
        return finish(new Error(
          'Search API HTTP ' + xhr.status + (detail ? ': ' + detail : '')
        ));
      }
      if (!parseJson) {
        return finish(null, xhr.responseText);
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
      xhr.open(method, proxyUrl, true);
      if (headers) {
        xhr.setRequestHeader('X-LX-Headers', JSON.stringify(headers));
      }
      if (xhr.timeout !== undefined) xhr.timeout = 15000;
      xhr.send(body || null);
    } catch (e) {
      finish(e);
    }
  }

  function getGdServerTime(callback) {
    var now = Date.now ? Date.now() : new Date().getTime();
    if (gdServerTime && now < gdServerTimeExpiresAt) {
      return callback(null, gdServerTime);
    }

    requestViaProxy(
      GD_STUDIO_TIME_ENDPOINT,
      'GET',
      null,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
        'Accept': 'text/plain, */*; q=0.01'
      },
      false,
      function (err, data) {
        if (err) return callback(err);
        var timeText = typeof data === 'string' ? data : String(data || '');
        var match = timeText.match(/\d{9,13}/);
        if (!match) return callback(new Error('GD Studio /time returned an invalid timestamp'));
        gdServerTime = match[0].slice(0, 13);
        if (gdServerTime.length > 10) {
          gdServerTime = String(Math.floor(Number(gdServerTime) / 1000));
        }
        gdServerTimeExpiresAt = (Date.now ? Date.now() : new Date().getTime()) + 30000;
        callback(null, gdServerTime);
      }
    );
  }

  function gdStudioMd5(input) {
    if (global.createLXRuntime) {
      try {
        return global.createLXRuntime({ env: 'web' }).utils.crypto.md5(input);
      } catch (e) {}
    }
    throw new Error('GD Studio search requires the LX MD5 runtime');
  }

  function gdStudioSign(encodedKeyword, serverTime) {
    var version = GD_STUDIO_API_VERSION.replace(/\./g, '');
    var timePrefix = String(serverTime).substring(0, 9);
    var payload = timePrefix + '|music.gdstudio.xyz|' + version + '|' + encodedKeyword;
    return gdStudioMd5(payload).slice(-8).toUpperCase();
  }

  function requestGdSearch(source, keyword, page, limit, callback) {
    var mapped = SOURCE_MAP[source];
    if (!mapped) return callback(new Error('Unsupported search source: ' + source));

    getGdServerTime(function (timeErr, serverTime) {
      if (timeErr) return callback(timeErr);

      var encodedKeyword = encodeURIComponent(keyword);
      var sign;
      try {
        sign = gdStudioSign(encodedKeyword, serverTime);
      } catch (e) {
        return callback(e);
      }

      var form = encodeForm({
        types: 'search',
        source: mapped,
        name: keyword,
        count: limit,
        pages: page,
        s: sign
      });

      requestViaProxy(
        API_ENDPOINT,
        'POST',
        form,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        true,
        function (err, data) {
          if (err) return callback(err);
          var normalized = normalizeResult(source, page, data);
          if (!normalized) return callback(new Error('Search result format is invalid for ' + mapped));
          if (!normalized.list.length) return callback(new Error('No search results from ' + mapped));
          normalized.searchProvider = mapped;
          normalized.requestedSource = source;
          normalized.fallbackSearch = false;
          return callback(null, normalized);
        }
      );
    });
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
      hash: String((item.hash || item.FileHash || item.fileHash || '') || ''),
      strMediaMid: String((item.strMediaMid || item.str_media_mid || item.mediaMid || item.media_mid || '') || ''),
      copyrightId: String((item.copyrightId || item.copyright_id || '') || ''),
      types: item.types && Array.isArray(item.types) ? item.types : null,
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
      var item = list[i] || {};
      var itemSource = String(item.source || '').toLowerCase();

      // A platform fallback may expose an explicit source field. Never allow
      // a result from another platform to leak into the selected channel.
      // Native LX source results without a source field remain bound to the
      // requested source.
      if (itemSource) {
        var expectedProvider = SOURCE_MAP[source] || '';
        var normalizedItemSource = GD_TO_LX_SOURCE[itemSource] || itemSource;
        if (expectedProvider && normalizedItemSource !== source && itemSource !== source) {
          continue;
        }
      }

      var song = normalizeSong(item, source);
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

  function formatKugouArtist(singers) {
    if (!Array.isArray(singers)) return String(singers || '');
    var names = [];
    for (var i = 0; i < singers.length; i += 1) {
      var singer = singers[i];
      if (singer && typeof singer === 'object') singer = singer.name;
      if (singer) names.push(String(singer));
    }
    return names.join('、');
  }

  function formatKugouInterval(seconds) {
    var total = Number(seconds);
    if (!isFinite(total) || total < 0) return '';
    total = Math.floor(total);
    var minutes = Math.floor(total / 60);
    var remain = total % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (remain < 10 ? '0' : '') + remain;
  }


  function decodeKuwoText(value) {
    return String(value == null ? '' : value)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function formatKuwoInterval(seconds) {
    var total = Number(seconds);
    if (!isFinite(total) || total < 0) return '';
    total = Math.floor(total);
    var minutes = Math.floor(total / 60);
    var remain = total % 60;
    return (minutes < 10 ? '0' : '') + minutes + ':' + (remain < 10 ? '0' : '') + remain;
  }

  function parseKuwoNMinfos(raw) {
    var types = [];
    var pieces = String(raw || '').split(';');
    for (var i = 0; i < pieces.length; i += 1) {
      var match = pieces[i].match(/level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/);
      if (!match) continue;
      var bitrate = match[2];
      if (bitrate === '4000') types.push({ type: 'flac24bit', size: match[4] });
      else if (bitrate === '2000') types.push({ type: 'flac', size: match[4] });
      else if (bitrate === '320') types.push({ type: '320k', size: match[4] });
      else if (bitrate === '192') types.push({ type: '192k', size: match[4] });
      else if (bitrate === '128') types.push({ type: '128k', size: match[4] });
    }
    return types.reverse();
  }

  function searchKuwo(keyword, page, limit, callback) {
    var url = 'http://search.kuwo.cn/r.s' +
      '?client=kt' +
      '&all=' + encodeURIComponent(keyword) +
      '&pn=' + encodeURIComponent(page - 1) +
      '&rn=' + encodeURIComponent(limit) +
      '&uid=794762570' +
      '&ver=kwplayer_ar_9.2.2.1' +
      '&vipver=1' +
      '&show_copyright_off=1' +
      '&newver=1' +
      '&ft=music' +
      '&cluster=0' +
      '&strategy=2012' +
      '&encoding=utf8' +
      '&rformat=json' +
      '&vermerge=1' +
      '&mobi=1' +
      '&issubtitle=1';

    requestViaProxy(
      url,
      'GET',
      null,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      true,
      function (err, data) {
        if (err) return callback(err);
        var rawList = data && Array.isArray(data.abslist) ? data.abslist : [];
        var list = [];

        for (var i = 0; i < rawList.length; i += 1) {
          var item = rawList[i] || {};
          var rawId = String(item.MUSICRID || '').replace(/^MUSIC_/, '');
          var name = decodeKuwoText(item.SONGNAME);
          if (!rawId || !name) continue;

          list.push(normalizeSong({
            id: rawId,
            songmid: rawId,
            name: name,
            singer: decodeKuwoText(item.ARTIST),
            albumName: decodeKuwoText(item.ALBUM),
            albumId: decodeKuwoText(item.ALBUMID),
            interval: formatKuwoInterval(item.DURATION),
            source: 'kw',
            types: parseKuwoNMinfos(item.N_MINFO),
            raw: item
          }, 'kw'));
        }

        if (!list.length) {
          return callback(new Error('Kuwo search returned no usable songs'));
        }

        var total = Number(data && data.TOTAL);
        if (!isFinite(total)) total = list.length;

        callback(null, {
          source: 'kw',
          page: page,
          total: total,
          isEnd: page * limit >= total,
          list: list,
          searchProvider: 'kuwo-native',
          requestedSource: 'kw',
          fallbackSearch: false
        });
      }
    );
  }

  function buildKugouList(rawList) {
    var list = [];
    var seen = {};

    function pushItem(item) {
      if (!item) return;
      var hash = String(
        item.FileHash || item.hash || item['128hash'] || item.HQFileHash ||
        item['320hash'] || item.SQFileHash || item.sqhash || ''
      ).toUpperCase();
      var audioId = String(item.Audioid || item.audio_id || item.songmid || '');
      var key = audioId + '|' + hash;
      if (!hash || !audioId || seen[key]) return;
      seen[key] = true;

      list.push(normalizeSong({
        id: audioId,
        songmid: audioId,
        hash: hash,
        name: String(item.OriSongName || item.SongName || item.songname || item.name || ''),
        artist: formatKugouArtist(item.Singers || item.singers || item.singername || item.artist),
        album: String(item.AlbumName || item.album_name || item.albumName || item.album || ''),
        albumId: String(item.AlbumID || item.album_id || item.albumId || ''),
        interval: formatKugouInterval(item.Duration != null ? item.Duration : item.duration),
        source: 'kugou',
        types: []
      }, 'kg'));
    }

    for (var i = 0; i < rawList.length; i += 1) {
      pushItem(rawList[i]);
      var groups = rawList[i] && Array.isArray(rawList[i].Grp)
        ? rawList[i].Grp
        : (rawList[i] && Array.isArray(rawList[i].group) ? rawList[i].group : []);
      for (var g = 0; g < groups.length; g += 1) pushItem(groups[g]);
    }

    return list;
  }

  function searchKugouMobile(keyword, page, limit, callback) {
    var url = 'http://mobilecdn.kugou.com/api/v3/search/song' +
      '?format=json' +
      '&keyword=' + encodeURIComponent(keyword) +
      '&page=' + encodeURIComponent(page) +
      '&pagesize=' + encodeURIComponent(limit) +
      '&showtype=1';

    requestViaProxy(
      url,
      'GET',
      null,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      true,
      function (err, data) {
        if (err) return callback(err);
        if (!data || Number(data.status) !== 1 || !data.data) {
          return callback(new Error(
            'Kugou mobile search returned invalid response' +
            (data && data.error ? ': ' + String(data.error) : '')
          ));
        }

        var rawList = Array.isArray(data.data.info) ? data.data.info : [];
        var list = buildKugouList(rawList);
        if (!list.length) return callback(new Error('Kugou mobile search returned no usable songs'));

        var total = Number(data.data.total);
        if (!isFinite(total)) total = list.length;

        callback(null, {
          source: 'kg',
          page: page,
          total: total,
          isEnd: page * limit >= total,
          list: list,
          searchProvider: 'kugou-mobile-native',
          requestedSource: 'kg',
          fallbackSearch: false
        });
      }
    );
  }

  function searchKugou(keyword, page, limit, callback) {
    var url = 'http://songsearch.kugou.com/song_search_v2' +
      '?platform=AndroidFilter' +
      '&iscorrection=1' +
      '&keyword=' + encodeURIComponent(keyword) +
      '&hifiquality=0' +
      '&pagesize=' + encodeURIComponent(limit) +
      '&PrivilegeFilter=0' +
      '&page=' + encodeURIComponent(page);

    function fallbackToMobile(primaryError) {
      searchKugouMobile(keyword, page, limit, function (mobileErr, mobileResult) {
        if (!mobileErr) return callback(null, mobileResult);
        callback(primaryError || mobileErr);
      });
    }

    requestViaProxy(
      url,
      'GET',
      null,
      {
        'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      true,
      function (err, data) {
        if (err) return fallbackToMobile(err);
        if (!data || Number(data.error_code) !== 0 || !data.data) {
          return fallbackToMobile(new Error(
            'Kugou search returned error code ' +
            String(data && data.error_code != null ? data.error_code : 'unknown') +
            (data && data.error ? ': ' + String(data.error) : '')
          ));
        }

        var rawList = Array.isArray(data.data.lists) ? data.data.lists : [];
        var list = buildKugouList(rawList);
        if (!list.length) return fallbackToMobile(new Error('Kugou search returned no usable songs'));

        var total = Number(data.data.total);
        if (!isFinite(total)) total = list.length;

        callback(null, {
          source: 'kg',
          page: page,
          total: total,
          isEnd: page * limit >= total,
          list: list,
          searchProvider: 'kugou-native',
          requestedSource: 'kg',
          fallbackSearch: false
        });
      }
    );
  }

  function searchViaGdStudio(source, keyword, page, limit, callback) {
    // GD Studio is only used for platforms it currently exposes. Never
    // substitute another platform for the selected source.
    requestGdSearch(source, keyword, page, limit, callback);
  }

  function searchViaPlatform(source, keyword, page, limit, callback) {
    if (source === 'kw') return searchKuwo(keyword, page, limit, callback);
    if (source === 'kg') return searchKugou(keyword, page, limit, callback);
    return searchViaGdStudio(source, keyword, page, limit, callback);
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

    // LX Music separates platform search from user-source playback:
    // a custom LX source such as Flower normally declares musicUrl only.
    // When musicSearch is declared, it is authoritative and must never be
    // replaced with another provider on failure. Otherwise use the native
    // platform search path for the selected channel.
    if (actions.indexOf('musicSearch') >= 0 && global.LXSourceManager && global.LXSourceManager.requestAction) {
      return searchNative(source, keyword, page, limit, function (nativeErr, nativeResult) {
        if (nativeErr) return callback(nativeErr);
        nativeResult.searchProvider = 'lx-native';
        nativeResult.requestedSource = source;
        nativeResult.fallbackSearch = false;
        return callback(null, nativeResult);
      });
    }

    if (!SOURCE_MAP[source]) {
      return callback(new Error('当前 LX 音源未提供 musicSearch，且该渠道没有可用的平台搜索适配：' + source));
    }

    return searchViaPlatform(source, keyword, page, limit, function (err, result) {
      if (err) return callback(err);
      result.requestedSource = source;
      result.fallbackSearch = false;
      return callback(null, result);
    });
  }

  global.LXMusicSearch = {
    search: search,
    sourceMap: SOURCE_MAP,
    normalizeSong: normalizeSong
  };
})(window);