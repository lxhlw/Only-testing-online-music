(function (global) {
  'use strict';

  var API_ENDPOINT = 'https://music-api.gdstudio.xyz/api.php';
  var HUIBQ_API_ENDPOINT = 'https://lxmusicapi.onrender.com';
  var HUIBQ_API_KEY = 'share-v3';
  var HUIBQ_QUALITY_MAP = {
    '128k': '128k',
    '192k': '128k',
    '256k': '128k',
    '320k': '320k',
    'flac': '320k',
    'flac24bit': '320k',
    'flac32bit': '320k',
    '24bit': '320k',
    'wav': '320k',
    'ape': '320k',
    'hires': '320k',
    'atmos': '320k',
    'atmos_plus': '320k',
    'master': '320k'
  };

  var TUNEFREE_API_ENDPOINT = 'https://music-dl.sayqz.com/api/';
  var TUNEFREE_SOURCE_MAP = {
    kw: 'kuwo',
    tx: 'qq',
    wy: 'netease'
  };
  var TUNEFREE_QUALITY_MAP = {
    '128k': '128k',
    '192k': '192k',
    '256k': '320k',
    '320k': '320k',
    'flac': 'flac',
    'flac24bit': 'flac24bit',
    'flac32bit': 'flac24bit',
    '24bit': 'flac24bit',
    'wav': 'flac',
    'ape': 'flac',
    'hires': 'flac24bit',
    'atmos': 'flac24bit',
    'atmos_plus': 'flac24bit',
    'master': 'flac24bit'
  };

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
        if (err) {
          gdServerTime = String(Math.floor((Date.now ? Date.now() : new Date().getTime()) / 1000));
          gdServerTimeExpiresAt = (Date.now ? Date.now() : new Date().getTime()) + 10000;
          return callback(null, gdServerTime);
        }

        var timeText = typeof data === 'string' ? data : String(data || '');
        var match = timeText.match(/\d{9,13}/);
        if (!match) {
          gdServerTime = String(Math.floor((Date.now ? Date.now() : new Date().getTime()) / 1000));
          gdServerTimeExpiresAt = (Date.now ? Date.now() : new Date().getTime()) + 10000;
          return callback(null, gdServerTime);
        }

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

    var url = API_ENDPOINT +
      '?types=search' +
      '&source=' + encodeURIComponent(mapped) +
      '&name=' + encodeURIComponent(keyword) +
      '&count=' + encodeURIComponent(limit) +
      '&pages=' + encodeURIComponent(page);

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
        var normalized = normalizeResult(source, page, data);
        if (!normalized) return callback(new Error('Search result format is invalid for ' + mapped));
        if (!normalized.list.length) return callback(new Error('No search results from ' + mapped));
        normalized.searchProvider = 'gdstudio-native';
        normalized.requestedSource = source;
        normalized.fallbackSearch = false;
        return callback(null, normalized);
      }
    );
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

  function createLegacyCrypto() {
    if (!global.createLXRuntime) throw new Error('LX crypto runtime is not loaded');
    return global.createLXRuntime({ env: 'web' }).utils.crypto;
  }

  function utf8Binary(text) {
    var encoded = unescape(encodeURIComponent(String(text)));
    return encoded;
  }

  function bytesFromBinary(text) {
    var binary = utf8Binary(text);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i) & 255;
    return bytes;
  }

  function aesEcbHex(text, key) {
    var crypto = createLegacyCrypto();
    var encrypted = crypto.aesEncrypt(
      bytesFromBinary(text),
      'aes-128-ecb',
      key,
      ''
    );
    return encrypted.toString('hex').toUpperCase();
  }

  function qqZzcSign(text) {
    var sha1 = global.LXLegacySHA1 ? global.LXLegacySHA1(String(text)) : '';
    if (!sha1) throw new Error('LX SHA1 helper is not loaded');

    var part1Indexes = [23, 14, 6, 36, 16, 40, 7, 19];
    var part2Indexes = [16, 1, 32, 12, 19, 27, 8, 5];
    var scramble = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];

    var part1 = '';
    var part2 = '';
    var i;
    for (i = 0; i < part1Indexes.length; i += 1) part1 += sha1.charAt(part1Indexes[i]);
    for (i = 0; i < part2Indexes.length; i += 1) part2 += sha1.charAt(part2Indexes[i]);

    var raw = '';
    for (i = 0; i < scramble.length; i += 1) {
      var value = scramble[i] ^ parseInt(sha1.slice(i * 2, i * 2 + 2), 16);
      raw += String.fromCharCode(value);
    }

    var encoded = global.btoa(raw).replace(/[\\/+=]/g, '');
    return ('zzc' + part1 + encoded + part2).toLowerCase();
  }

  function createTencentSearchPayload(keyword, page, limit) {
    var guid = '';
    for (var i = 0; i < 32; i += 1) guid += Math.floor(Math.random() * 16).toString(16);
    guid = guid.toUpperCase() + ('00000' + Math.floor(Math.random() * 100000)).slice(-5);

    return {
      comm: {
        _channelid: '0',
        _os_version: '6.2.9200-2',
        ct: '19',
        cv: '2151',
        guid: '1F70E520B2EAA7D25E11760783C53CA9',
        patch: '118',
        psrf_access_token_expiresAt: 0,
        psrf_qqaccess_token: '',
        psrf_qqopenid: '',
        psrf_qqunionid: '',
        tmeAppID: 'qqmusic',
        tmeLoginType: 0,
        uin: '0',
        wid: '7223299733393904640'
      },
      'music.search.SearchCgiService': {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicDesktop',
        param: {
          grp: 1,
          num_per_page: limit,
          page_num: page,
          query: keyword,
          remoteplace: 'txt.newclient.top',
          search_type: 0,
          searchid: guid
        }
      }
    };
  }

  function buildTencentList(rawList) {
    var list = [];
    if (!Array.isArray(rawList)) return list;

    for (var i = 0; i < rawList.length; i += 1) {
      var item = rawList[i] || {};
      var file = item.file || {};
      if (!file.media_mid) continue;

      var types = [];
      function addType(type, bytes) {
        var n = Number(bytes);
        if (!isFinite(n) || n <= 0) return;
        types.push({
          type: type,
          size: String(Math.round(n / 1024 / 1024 * 10) / 10) + 'M'
        });
      }
      addType('128k', file.size_128mp3);
      addType('320k', file.size_320mp3);
      addType('flac', file.size_flac);
      addType('flac24bit', file.size_hires);

      var singerNames = [];
      var singers = Array.isArray(item.singer) ? item.singer : [];
      for (var s = 0; s < singers.length; s += 1) {
        if (singers[s] && singers[s].name) singerNames.push(String(singers[s].name));
      }

      var album = item.album || {};
      var albumId = album.mid ? String(album.mid) : '';
      list.push(normalizeSong({
        id: item.id,
        songmid: item.mid,
        name: item.title,
        singer: singerNames.join('、'),
        albumName: album.name,
        albumId: albumId,
        interval: item.interval || '',
        source: 'tx',
        strMediaMid: file.media_mid,
        types: types,
        raw: item
      }, 'tx'));
    }
    return list;
  }

  function searchTencent(keyword, page, limit, callback) {
    var payload = createTencentSearchPayload(keyword, page, limit);
    var text = JSON.stringify(payload);
    var sign = qqZzcSign(text);
    var url = 'https://u.y.qq.com/cgi-bin/musics.fcg?sign=' + encodeURIComponent(sign);

    requestViaProxy(
      url,
      'POST',
      text,
      {
        'User-Agent': 'QQMusic 14090508(android 12)',
        'Content-Type': 'application/json'
      },
      true,
      function (err, data) {
        if (err) return callback(err);
        var req = data && (data['music.search.SearchCgiService'] || data.req);
        if (!req || Number(data.code) !== 0 || Number(req.code) !== 0) {
          return callback(new Error('QQ Music search returned an invalid response'));
        }

        var payloadData = req.data || {};
        var rawList = payloadData.body && payloadData.body.song
          ? payloadData.body.song.list
          : [];
        var list = buildTencentList(rawList);
        if (!list.length) return callback(new Error('QQ Music search returned no usable songs'));

        var meta = payloadData.meta || {};
        var total = Number(meta.sum);
        if (!isFinite(total)) total = list.length;

        callback(null, {
          source: 'tx',
          page: page,
          total: total,
          isEnd: page * limit >= total,
          list: list,
          searchProvider: 'qqmusic-native',
          requestedSource: 'tx',
          fallbackSearch: false
        });
      }
    );
  }

  function eapiParams(urlPath, object) {
    var text = JSON.stringify(object);
    var digest = createLegacyCrypto().md5('nobody' + urlPath + 'use' + text + 'md5forencrypt');
    var data = urlPath + '-36cd479b6b5-' + text + '-36cd479b6b5-' + digest;
    return aesEcbHex(data, 'e82ckenh8dichen8');
  }

  function formatNeteaseTypes(item) {
    var types = [];
    var privilege = item && item.privilege ? item.privilege : {};
    var maxLevel = String(privilege.maxBrLevel || '');
    var maxbr = Number(privilege.maxbr || 0);

    function add(type, size) {
      var n = Number(size);
      if (!isFinite(n) || n <= 0) return;
      types.push({
        type: type,
        size: String(Math.round(n / 1024 / 1024 * 10) / 10) + 'M'
      });
    }

    if (maxLevel === 'hires' && item.hr) add('flac24bit', item.hr.size);
    if (maxbr === 999000 && item.sq) add('flac', item.sq.size);
    if (maxbr === 320000 && item.h) add('320k', item.h.size);
    if (maxbr === 192000 && item.l) add('128k', item.l.size);
    if (maxbr === 128000 && item.l) add('128k', item.l.size);
    return types;
  }

  function buildNeteaseList(resources) {
    var list = [];
    if (!Array.isArray(resources)) return list;

    for (var i = 0; i < resources.length; i += 1) {
      var resource = resources[i] || {};
      var item = resource.baseInfo && resource.baseInfo.simpleSongData;
      if (!item || item.id == null) continue;

      var singers = Array.isArray(item.ar) ? item.ar : [];
      var singerNames = [];
      for (var s = 0; s < singers.length; s += 1) {
        if (singers[s] && singers[s].name) singerNames.push(String(singers[s].name));
      }

      var album = item.al || {};
      list.push(normalizeSong({
        id: item.id,
        songmid: item.id,
        name: item.name,
        singer: singerNames.join('、'),
        albumName: album.name,
        albumId: album.id,
        interval: Number(item.dt || 0) > 0 ? String(Math.floor(Number(item.dt) / 60000)).padStart ? Math.floor(Number(item.dt) / 60000) : item.dt : item.dt,
        image: album.picUrl || '',
        types: formatNeteaseTypes(item),
        raw: item
      }, 'wy'));
    }
    return list;
  }

  function searchNetease(keyword, page, limit, callback) {
    function fallbackToGd(primaryError) {
      searchViaGdStudio('wy', keyword, page, limit, function (fallbackErr, fallbackResult) {
        if (!fallbackErr) {
          fallbackResult.searchProvider = 'gdstudio-native';
          fallbackResult.requestedSource = 'wy';
          fallbackResult.fallbackSearch = true;
          fallbackResult.fallbackFrom = primaryError
            ? String(primaryError.message || primaryError)
            : 'netease-native';
          return callback(null, fallbackResult);
        }
        callback(primaryError || fallbackErr);
      });
    }

    var offset = limit * (page - 1);
    var target = 'https://music.163.com/api/cloudsearch/pc';
    var body = encodeForm({
      s: keyword,
      type: 1,
      offset: offset,
      limit: limit,
      total: page === 1 ? 'true' : 'false'
    });

    requestViaProxy(
      target,
      'POST',
      body,
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Accept': 'application/json, text/plain, */*'
      },
      true,
      function (err, data) {
        if (err) return fallbackToGd(err);

        var root = data && data.result ? data.result : data;
        var songs = root && Array.isArray(root.songs) ? root.songs : [];
        if (!songs.length) return fallbackToGd(new Error('Netease cloudsearch returned no usable songs'));

        var resources = [];
        for (var i = 0; i < songs.length; i += 1) {
          var song = songs[i] || {};
          if (song.id == null || !song.name) continue;

          resources.push({
            baseInfo: {
              simpleSongData: {
                id: song.id,
                name: song.name,
                dt: song.duration || 0,
                ar: Array.isArray(song.artists) ? song.artists : [],
                al: song.album || {},
                privilege: song.privilege || {}
              }
            }
          });
        }

        var list = buildNeteaseList(resources);
        if (!list.length) return fallbackToGd(new Error('Netease cloudsearch returned no usable songs'));

        var total = Number(root.songCount);
        if (!isFinite(total)) total = list.length;

        callback(null, {
          source: 'wy',
          page: page,
          total: total,
          isEnd: page * limit >= total,
          list: list,
          searchProvider: 'netease-native',
          requestedSource: 'wy',
          fallbackSearch: false
        });
      }
    );
  }

  function miguCreateSignature(time, str) {
    var deviceId = '963B7AA0D21511ED807EE5846EC87D20';
    var base = '6cdc72a439cef99a3418d2a78aa28c73';
    var suffix = 'yyapp2d16148780a1dcc7408e06336b98cfd50';
    var sign = createLegacyCrypto().md5(
      String(str) + base + suffix + deviceId + String(time)
    );
    return { sign: sign, deviceId: deviceId };
  }

  function buildMiguList(rawData) {
    var list = [];
    var seen = {};
    if (!Array.isArray(rawData)) return list;

    for (var i = 0; i < rawData.length; i += 1) {
      var group = rawData[i];
      if (!Array.isArray(group)) continue;
      for (var j = 0; j < group.length; j += 1) {
        var data = group[j] || {};
        if (!data.songId || !data.copyrightId) continue;
        var key = String(data.copyrightId);
        if (seen[key]) continue;
        seen[key] = true;

        var types = [];
        var formats = Array.isArray(data.audioFormats) ? data.audioFormats : [];
        for (var k = 0; k < formats.length; k += 1) {
          var format = formats[k] || {};
          var formatType = String(format.formatType || '');
          var sizeValue = format.asize != null ? format.asize : format.isize;
          var size = Number(sizeValue);
          var sizeText = isFinite(size) && size > 0
            ? String(Math.round(size / 1024 / 1024 * 10) / 10) + 'M'
            : '';
          if (formatType === 'PQ') types.push({ type: '128k', size: sizeText });
          else if (formatType === 'HQ') types.push({ type: '320k', size: sizeText });
          else if (formatType === 'SQ') types.push({ type: 'flac', size: sizeText });
          else if (formatType === 'ZQ24') types.push({ type: 'flac24bit', size: sizeText });
        }

        var singerList = Array.isArray(data.singerList) ? data.singerList : [];
        var singerNames = [];
        for (var s = 0; s < singerList.length; s += 1) {
          if (singerList[s] && singerList[s].name) singerNames.push(String(singerList[s].name));
        }

        list.push(normalizeSong({
          id: data.copyrightId,
          songmid: data.songId,
          copyrightId: data.copyrightId,
          name: data.name,
          singer: singerNames.join('、'),
          albumName: data.album,
          albumId: data.albumId,
          interval: data.duration,
          image: data.img3 || data.img2 || data.img1 || '',
          lyricId: data.lrcUrl || '',
          types: types,
          raw: data
        }, 'mg'));
      }
    }
    return list;
  }

  function searchMigu(keyword, page, limit, callback) {
    var time = String(Date.now ? Date.now() : new Date().getTime());
    var signature = miguCreateSignature(time, keyword);
    var target =
      'https://jadeite.migu.cn/music_search/v3/search/searchAll' +
      '?isCorrect=0' +
      '&isCopyright=1' +
      '&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D' +
      '&pageSize=' + encodeURIComponent(limit) +
      '&text=' + encodeURIComponent(keyword) +
      '&pageNo=' + encodeURIComponent(page) +
      '&sort=0' +
      '&sid=USS';

    requestViaProxy(
      target,
      'GET',
      null,
      {
        'uiVersion': 'A_music_3.6.1',
        'deviceId': signature.deviceId,
        'timestamp': time,
        'sign': signature.sign,
        'channel': '0146921',
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30',
        'Accept': 'application/json, text/javascript, */*; q=0.01'
      },
      true,
      function (err, data) {
        if (err) return callback(err);
        if (!data || data.code !== '000000') {
          return callback(new Error('Migu search returned an invalid response'));
        }
        var resultData = data.songResultData || {};
        var list = buildMiguList(resultData.resultList);
        if (!list.length) return callback(new Error('Migu search returned no usable songs'));

        var total = Number(resultData.totalCount);
        if (!isFinite(total)) total = list.length;

        callback(null, {
          source: 'mg',
          page: page,
          total: total,
          isEnd: page * limit >= total,
          list: list,
          searchProvider: 'migu-native',
          requestedSource: 'mg',
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

  var GD_PLAYBACK_QUALITY_MAP = {
    '128k': '128',
    '192k': '192',
    '256k': '320',
    '320k': '320',
    'flac': '740',
    'flac24bit': '999',
    'flac32bit': '999',
    '24bit': '999',
    'wav': '740',
    'ape': '740',
    'hires': '999',
    'atmos': '999',
    'atmos_plus': '999',
    'master': '999'
  };

  function getGdPlaybackIds(source, musicInfo) {
    var info = musicInfo || {};
    var ids = [];

    function add(value) {
      var id = String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
      if (!id) return;
      for (var i = 0; i < ids.length; i += 1) if (ids[i] === id) return;
      ids.push(id);
    }

    if (source === 'kg') {
      add(info.songmid);
      add(info.hash);
      add(info.fileHash);
      add(info.id);
    } else if (source === 'mg') {
      add(info.copyrightId);
      add(info.copyright_id);
      add(info.songmid);
      add(info.id);
    } else {
      add(info.songmid);
      add(info.mediaMid);
      add(info.mid);
      add(info.id);
    }

    return ids;
  }


  function kugouV5Sign(params, md5Fn) {
    var keys = Object.keys(params || {}).sort();
    var raw = '';
    for (var i = 0; i < keys.length; i += 1) {
      raw += keys[i] + '=' + String(params[keys[i]] == null ? '' : params[keys[i]]);
    }
    return String(md5Fn('OIlwieks28dk2k092lksi2UIkp' + raw + 'OIlwieks28dk2k092lksi2UIkp'));
  }

  function resolveKugouV5Url(hash, musicInfo, quality, callback) {
    hash = String(hash || '').replace(/^\s+|\s+$/g, '').toLowerCase();
    if (!hash) return callback(new Error('No Kugou hash for V5 playback'));

    var info = musicInfo || {};
    var md5Fn = null;
    try {
      md5Fn = global.createLXRuntime({ env: 'web' }).utils.crypto.md5;
    } catch (e) {}
    if (typeof md5Fn !== 'function') {
      return callback(new Error('LX MD5 runtime unavailable for Kugou V5'));
    }

    var requested = String(quality || '').toLowerCase();
    var qualityMap = {
      '128k': '128',
      '192k': '320',
      '256k': '320',
      '320k': '320',
      'flac': 'flac',
      'flac24bit': 'high',
      'flac32bit': 'high',
      '24bit': 'high',
      'wav': 'flac',
      'ape': 'flac',
      'hires': 'high',
      'atmos': 'viper_atmos',
      'atmos_plus': 'viper_atmos',
      'master': 'viper_clear'
    };
    var requestedPlatformQuality = qualityMap[requested] || '128';

    function extractUrl(data) {
      if (!data || typeof data !== 'object') return '';
      var candidates = [
        data.url,
        data.play_url,
        data.playUrl,
        data.data && data.data.url,
        data.data && data.data.play_url,
        data.data && data.data.playUrl
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var value = candidates[i];
        if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
        if (Array.isArray(value)) {
          for (var j = 0; j < value.length; j += 1) {
            if (typeof value[j] === 'string' && /^https?:\/\//i.test(value[j].trim())) {
              return value[j].trim();
            }
          }
        }
      }
      return '';
    }

    function requestV5(albumId, albumAudioId, done) {
      var clientTime = Math.floor((Date.now ? Date.now() : new Date().getTime()) / 1000);
      var params = {
        album_id: String(albumId || ''),
        userid: '0',
        area_code: '1',
        hash: hash,
        mid: 'musicapi',
        appid: '1005',
        ssa_flag: 'is_fromtrack',
        clientver: '20349',
        token: '',
        album_audio_id: String(albumAudioId == null ? '0' : albumAudioId),
        behavior: 'play',
        clienttime: String(clientTime),
        pid: '2',
        key: String(md5Fn(
          hash +
          '57ae12eb6890223e355ccfcb74edf70d' +
          '1005' +
          'musicapi' +
          '0'
        )),
        quality: requestedPlatformQuality,
        version: '20349',
        dfid: '-',
        pidversion: '3001'
      };
      params.signature = kugouV5Sign(params, md5Fn);

      requestViaProxy(
        'https://tracker.kugou.com/v5/url?' + encodeForm(params),
        'GET',
        null,
        {
          'KG-THash': '255d751',
          'KG-Rec': '1',
          'KG-RC': '1',
          'User-Agent': 'Android12-AndroidCar-20089-46-0-NetMusic-wifi',
          'Accept': 'application/json, text/plain, */*'
        },
        true,
        function (err, data) {
          if (err) return done(err);

          var directUrl = extractUrl(data);
          if (!directUrl || isCrossPlatformPlaybackUrl('kg', directUrl)) {
            var status = data && data.status != null ? String(data.status) : '';
            return done(new Error(
              'Kugou V5 returned no playable URL' + (status ? ' (status ' + status + ')' : '')
            ));
          }

          var actualBr = data && data.br != null
            ? String(data.br)
            : (data && data.data && data.data.br != null ? String(data.data.br) : requestedPlatformQuality);

          done(null, {
            url: directUrl,
            source: 'kg',
            provider: 'kugou-native',
            resolver: 'kugou-v5',
            requestedQuality: requested,
            requestedBr: requestedPlatformQuality,
            actualBr: actualBr,
            id: hash,
            raw: data
          });
        }
      );
    }

    var albumId = String(
      info.albumId || info.album_id ||
      (info.raw && (info.raw.album_id || info.raw.albumId)) || ''
    ).replace(/^\s+|\s+$/g, '');
    var albumAudioId = String(
      info.albumAudioId || info.album_audio_id ||
      (info.raw && (info.raw.album_audio_id || info.raw.albumAudioId)) || ''
    ).replace(/^\s+|\s+$/g, '');

    function requestMetadata(done) {
      requestViaProxy(
        'https://gateway.kugou.com/v3/album_audio/audio',
        'POST',
        JSON.stringify({
          area_code: '1',
          show_privilege: '1',
          show_album_info: '1',
          is_publish: '',
          appid: 1005,
          clientver: 11451,
          mid: '114514',
          dfid: '-',
          clienttime: Math.floor((Date.now ? Date.now() : new Date().getTime()) / 1000),
          key: 'OIlwlieks28dk2k092lksi2UIkp',
          data: [{ hash: hash }]
        }),
        {
          'Content-Type': 'application/json',
          'KG-THash': '13a3164',
          'KG-RC': '1',
          'KG-Fake': '0',
          'KG-RF': '00869891',
          'User-Agent': 'Android712-AndroidPhone-11451-376-0-FeeCacheUpdate-wifi',
          'x-router': 'kmr.service.kugou.com',
          'Accept': 'application/json, text/plain, */*'
        },
        true,
        function (err, data) {
          if (err) return done(err);
          var item = data && data.data && Array.isArray(data.data[0]) ? data.data[0][0] : null;
          var resolvedAlbumId = item && item.album_info ? item.album_info.album_id : '';
          var resolvedAlbumAudioId = item ? (item.album_audio_id || '') : '';
          if (!resolvedAlbumId && item) resolvedAlbumId = item.album_id || '';
          if (!resolvedAlbumId) return done(new Error('Kugou V5 metadata returned no album id'));
          requestV5(resolvedAlbumId, resolvedAlbumAudioId || '0', done);
        }
      );
    }

    requestV5(albumId, albumAudioId || '0', function (v5Err, v5Result) {
      if (!v5Err && v5Result && v5Result.url) {
        return callback(null, v5Result);
      }
      requestMetadata(function (metadataErr, metadataResult) {
        if (!metadataErr && metadataResult && metadataResult.url) {
          return callback(null, metadataResult);
        }
        callback(metadataErr || v5Err || new Error('Kugou V5 resolution failed'));
      });
    });
  }

  function resolveKugouGatewayUrl(hash, musicInfo, quality, callback) {
    hash = String(hash || '').replace(/^\s+|\s+$/g, '');
    if (!hash) return callback(new Error('No Kugou hash for gateway playback'));

    var info = musicInfo || {};
    var md5Fn = null;
    try {
      md5Fn = global.createLXRuntime({ env: 'web' }).utils.crypto.md5;
    } catch (e) {}
    if (typeof md5Fn !== 'function') {
      return callback(new Error('LX MD5 runtime unavailable for Kugou gateway'));
    }

    var mid = '239526275778893399526700786998289824956';
    var userid = '0';
    var secret = '57ae12eb6890223e355ccfcb74edf70d';
    var key = '';
    try {
      key = String(md5Fn(hash.toLowerCase() + secret + mid + userid));
    } catch (e) {
      return callback(new Error('Kugou gateway key generation failed'));
    }

    var albumId = String(
      info.albumId || info.album_id ||
      (info.raw && (info.raw.album_id || info.raw.albumId)) || ''
    ).replace(/^\s+|\s+$/g, '');
    var albumAudioId = String(
      info.albumAudioId || info.album_audio_id ||
      (info.raw && (info.raw.album_audio_id || info.raw.albumAudioId)) || ''
    ).replace(/^\s+|\s+$/g, '');

    var url = 'https://gateway.kugou.com/i/v2/' +
      '?dfid=' +
      '&pid=2' +
      '&mid=' + encodeURIComponent(mid) +
      '&cmd=26' +
      '&token=' +
      '&hash=' + encodeURIComponent(hash.toLowerCase()) +
      '&area_code=1' +
      '&behavior=play' +
      '&appid=1005' +
      '&module=' +
      '&vipType=6' +
      '&ptype=1' +
      '&userid=0' +
      '&mtype=1' +
      '&album_id=' + encodeURIComponent(albumId) +
      '&pidversion=3001' +
      '&key=' + encodeURIComponent(key) +
      '&version=10209' +
      '&album_audio_id=' + encodeURIComponent(albumAudioId) +
      '&with_res_tag=1';

    requestViaProxy(
      url,
      'GET',
      null,
      {
        'x-router': 'tracker.kugou.com',
        'User-Agent': 'Android511-AndroidPhone-10209-14-0-NetMusic-wifi',
        'Accept': 'application/json, text/plain, */*'
      },
      true,
      function (err, data) {
        if (err) return callback(err);

        var directUrl = '';
        if (data && Array.isArray(data.url)) directUrl = String(data.url[0] || '').trim();
        else if (data && typeof data.url === 'string') directUrl = String(data.url).trim();
        else if (data && data.data && Array.isArray(data.data.url)) directUrl = String(data.data.url[0] || '').trim();
        else if (data && data.data && typeof data.data.url === 'string') directUrl = String(data.data.url).trim();

        if (!directUrl || !/^https?:\/\//i.test(directUrl)) {
          return callback(new Error('Kugou gateway returned no playable URL'));
        }
        if (isCrossPlatformPlaybackUrl('kg', directUrl)) {
          return callback(new Error('Kugou gateway returned a cross-platform URL'));
        }

        var actualBr = data && data.br != null ? String(data.br) :
          (data && data.data && data.data.br != null ? String(data.data.br) : String(quality || ''));

        callback(null, {
          url: directUrl,
          source: 'kg',
          provider: 'kugou-native',
          requestedQuality: String(quality || ''),
          actualBr: actualBr,
          id: hash,
          raw: data
        });
      }
    );
  }

  function resolveKugouTrackerUrl(hash, quality, callback) {
    hash = String(hash || '').replace(/^\s+|\s+$/g, '');
    if (!hash) return callback(new Error('No Kugou hash for tracker playback'));

    var md5Fn = null;
    try {
      md5Fn = global.createLXRuntime({ env: 'web' }).utils.crypto.md5;
    } catch (e) {}
    if (typeof md5Fn !== 'function') return callback(new Error('LX MD5 runtime unavailable for Kugou tracker'));

    var key = '';
    try {
      key = String(md5Fn(hash + 'kgcloudv2'));
    } catch (e) {
      return callback(new Error('Kugou tracker key generation failed'));
    }

    function extractTrackerUrl(detail) {
      if (!detail || typeof detail !== 'object') return '';
      var candidates = [
        detail.url,
        detail.play_url,
        detail.playUrl,
        detail.data && detail.data.url,
        detail.data && detail.data.play_url,
        detail.data && detail.data.playUrl
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var value = candidates[i];
        if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
        if (Array.isArray(value)) {
          for (var j = 0; j < value.length; j += 1) {
            if (typeof value[j] === 'string' && /^https?:\/\//i.test(value[j].trim())) {
              return value[j].trim();
            }
          }
        }
      }
      return '';
    }

    var endpoints = [
      'http://trackercdn.kugou.com/i/v2/?key=' + encodeURIComponent(key) +
        '&hash=' + encodeURIComponent(hash) +
        '&br=hq&appid=1005&pid=2&cmd=25&behavior=play',
      'http://trackercdnbj.kugou.com/i/v2/?cmd=23&pid=1&behavior=download' +
        '&hash=' + encodeURIComponent(hash) + '&key=' + encodeURIComponent(key)
    ];

    var lastError = null;
    function tryEndpoint(index) {
      if (index >= endpoints.length) {
        return callback(lastError || new Error('Kugou tracker returned no playable URL'));
      }

      requestViaProxy(
        endpoints[index],
        'GET',
        null,
        {
          'User-Agent': 'lx-music/desktop',
          'Accept': 'application/json, text/plain, */*'
        },
        true,
        function (err, detail) {
          if (!err) {
            var directUrl = extractTrackerUrl(detail);
            if (directUrl && !isCrossPlatformPlaybackUrl('kg', directUrl)) {
              return callback(null, {
                url: directUrl,
                source: 'kg',
                provider: 'kugou-native',
                requestedQuality: String(quality || ''),
                actualBr: detail.bitRate != null ? String(detail.bitRate) : '',
                id: hash,
                raw: detail
              });
            }
            lastError = new Error('Kugou tracker returned no URL');
          } else {
            lastError = err;
          }
          tryEndpoint(index + 1);
        }
      );
    }

    tryEndpoint(0);
  }

  function resolveKugouNativeUrl(musicInfo, quality, callback) {
    var info = musicInfo || {};
    var baseHash = String(info.hash || info.fileHash || '').replace(/^\s+|\s+$/g, '');
    if (!baseHash) return callback(new Error('No Kugou hash for native playback'));

    var requested = String(quality || '').toLowerCase();

    function fallbackAfterTracker(trackerErr) {
      requestDetail(baseHash, function (baseErr, baseResult) {
        if (baseErr) return requestWebApi(baseHash, trackerErr || baseErr);

        if (requested === '128k') return callback(null, baseResult);

        var detail = baseResult.raw || {};
        var qualityHash = chooseQualityHash(detail);
        if (qualityHash && qualityHash !== baseHash) {
          return requestDetail(qualityHash, function (qualityErr, qualityResult) {
            if (!qualityErr && qualityResult && qualityResult.url) return callback(null, qualityResult);
            requestWebApi(baseHash, qualityErr || baseErr);
          });
        }

        requestWebApi(baseHash, trackerErr || baseErr);
      });
    }

    function extractDirectUrl(detail) {
      if (!detail || typeof detail !== 'object') return '';
      var candidates = [
        detail.url,
        detail.play_url,
        detail.playUrl,
        detail.audioUrl,
        detail.data && detail.data.url,
        detail.data && detail.data.play_url,
        detail.data && detail.data.playUrl
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var value = candidates[i];
        if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
        if (Array.isArray(value)) {
          for (var j = 0; j < value.length; j += 1) {
            if (typeof value[j] === 'string' && /^https?:\/\//i.test(value[j].trim())) {
              return value[j].trim();
            }
          }
        }
      }
      return '';
    }

    function chooseQualityHash(detail) {
      var extra = detail && detail.extra && typeof detail.extra === 'object' ? detail.extra : {};
      if (requested === '320k' || requested === '256k' || requested === '192k') {
        return String(extra['320hash'] || baseHash).replace(/^\s+|\s+$/g, '');
      }
      if (requested.indexOf('flac') === 0 || requested === 'wav' || requested === 'ape' ||
          requested === 'hires' || requested === 'master' || requested === 'atmos' ||
          requested === 'atmos_plus') {
        return String(extra.sqhash || extra.SQHash || extra['320hash'] || baseHash)
          .replace(/^\s+|\s+$/g, '');
      }
      return baseHash;
    }

    function requestDetail(hash, done) {
      var url = 'http://m.kugou.com/app/i/getSongInfo.php' +
        '?cmd=playInfo&hash=' + encodeURIComponent(hash);
      requestViaProxy(
        url,
        'GET',
        null,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        true,
        function (err, detail) {
          if (err) return done(err);
          var directUrl = extractDirectUrl(detail);
          if (!directUrl || isCrossPlatformPlaybackUrl('kg', directUrl)) return done(new Error('Kugou native API returned no playable URL for ' + hash));
          done(null, {
            url: directUrl,
            source: 'kg',
            provider: 'kugou-native',
            requestedQuality: requested,
            actualBr: detail.bitRate != null ? String(detail.bitRate) : requested,
            id: hash,
            raw: detail
          });
        }
      );
    }

    function finishAfterWebApi(webErr) {
      resolveKugouAggregateUrl(info, requested, function (aggregateErr, aggregateResult) {
        if (!aggregateErr && aggregateResult && aggregateResult.url) return callback(null, aggregateResult);
        callback(webErr || aggregateErr || new Error('Kugou playback resolution failed'));
      });
    }

    function requestWebApi(hash, fallbackError) {
      var url = 'https://wwwapi.kugou.com/yy/index.php' +
        '?r=play/getdata&hash=' + encodeURIComponent(hash);
      requestViaProxy(
        url,
        'GET',
        null,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
          'Accept': 'application/json, text/javascript, */*; q=0.01'
        },
        false,
        function (err, raw) {
          if (err) return finishAfterWebApi(fallbackError || err);
          var text = String(raw || '').replace(/^\s+|\s+$/g, '');
          var parsed = null;
          try {
            var callbackMatch = text.match(/^\s*[^\(]+\((.*)\)\s*;?\s*$/s);
            parsed = JSON.parse(callbackMatch ? callbackMatch[1] : text);
          } catch (e) {}
          var detail = parsed && parsed.data ? parsed.data : parsed;
          var directUrl = extractDirectUrl(detail);
          if (!directUrl || isCrossPlatformPlaybackUrl('kg', directUrl)) return finishAfterWebApi(fallbackError || new Error('Kugou web API returned no playable URL for ' + hash));
          callback(null, {
            url: directUrl,
            source: 'kg',
            provider: 'kugou-native',
            requestedQuality: requested,
            actualBr: detail && detail.feq ? String(detail.feq) : requested,
            id: hash,
            raw: detail
          });
        }
      );
    }

    function resolveKugouAggregateUrl(info, quality, callback) {
      var requestedQuality = String(quality || '').toLowerCase() || '128k';
      var levelMap = {
        '128k': 'standard',
        '192k': 'standard',
        '320k': 'exhigh',
        'flac': 'lossless',
        'flac24bit': 'hires',
        'hires': 'hires',
        'atmos': 'atmos',
        'atmos_plus': 'atmos',
        'master': 'clear'
      };
      var level = levelMap[requestedQuality] || 'standard';
      var songmid = String((info && (info.songmid || info.id || info.mediaMid)) || '')
        .replace(/^\s+|\s+$/g, '');
      var hash = String((info && (info.hash || info.fileHash)) || '')
        .replace(/^\s+|\s+$/g, '');
      if (!hash && !songmid) return callback(new Error('No Kugou id for aggregate playback'));

      var albumId = String((info && (info.albumId || info.album_id)) || '')
        .replace(/^\s+|\s+$/g, '');

      function extractUrl(data) {
        if (data == null) return '';
        if (typeof data === 'string') {
          var text = data.replace(/^\s+|\s+$/g, '');
          return /^https?:\/\//i.test(text) ? text : '';
        }
        var candidates = [
          data.url,
          data.play_url,
          data.playUrl,
          data.data && data.data.url,
          data.data && data.data.play_url,
          data.data && data.data.playUrl,
          data.data && data.data.musicUrl,
          data.data && data.data.playurl
        ];
        for (var i = 0; i < candidates.length; i += 1) {
          var value = candidates[i];
          if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
          if (Array.isArray(value)) {
            for (var j = 0; j < value.length; j += 1) {
              if (typeof value[j] === 'string' && /^https?:\/\//i.test(value[j].trim())) return value[j].trim();
            }
          }
        }
        return '';
      }

      function acceptUrl(url, provider, raw, done) {
        var clean = String(url || '').replace(/^\s+|\s+$/g, '');
        if (!/^https?:\/\//i.test(clean)) return done(new Error(provider + ' returned no playable URL'));
        if (isCrossPlatformPlaybackUrl('kg', clean)) {
          return done(new Error(provider + ' returned a cross-platform URL'));
        }
        done(null, {
          url: clean,
          source: 'kg',
          provider: provider,
          requestedQuality: requestedQuality,
          actualBr: requestedQuality,
          id: hash || songmid,
          raw: raw
        });
      }

      var backends = [
        {
          provider: 'kugou-aggregate-haitang',
          method: 'POST',
          url: 'https://musicserver.haitangw.cc/v1/music/resolve-url',
          body: JSON.stringify({ source: 'kg', rid: hash || songmid, level: level }),
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        },
        {
          provider: 'kugou-aggregate-xinghai',
          method: 'GET',
          url: 'https://yy.zddyr.top/lx/api/?source=kg' +
            '&quality=' + encodeURIComponent(requestedQuality) +
            '&songmid=' + encodeURIComponent(songmid || hash) +
            '&albumId=' + encodeURIComponent(albumId) +
            '&mainHash=' + encodeURIComponent(hash || songmid) +
            '&hash=' + encodeURIComponent(hash || songmid),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        },
        {
          provider: 'kugou-aggregate-zrcdy',
          method: 'GET',
          url: 'https://zrcdy.dpdns.org/lx/api/api.php?source=kg' +
            '&songmid=' + encodeURIComponent(songmid || hash) +
            '&quality=' + encodeURIComponent(requestedQuality),
          headers: { 'User-Agent': 'Mozilla/5.0' }
        },
        {
          provider: 'kugou-aggregate-lerd',
          method: 'POST',
          url: 'https://api.music.lerd.dpdns.org/kg',
          body: JSON.stringify({
            musicInfo: { songmid: songmid || hash, hash: hash || undefined, albumId: albumId || undefined },
            type: requestedQuality
          }),
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' }
        }
      ];

      var lastError = null;
      function tryBackend(index) {
        if (index >= backends.length) {
          return callback(lastError || new Error('All Kugou aggregate backends failed'));
        }
        var backend = backends[index];
        requestViaProxy(
          backend.url,
          backend.method,
          backend.body || null,
          backend.headers,
          true,
          function (err, data) {
            if (!err) {
              var directUrl = extractUrl(data);
              if (directUrl) {
                return acceptUrl(directUrl, backend.provider, data, function (acceptErr, result) {
                  if (!acceptErr) return callback(null, result);
                  lastError = acceptErr;
                  tryBackend(index + 1);
                });
              }
              lastError = new Error(backend.provider + ' returned no playable URL');
            } else {
              lastError = err;
            }
            tryBackend(index + 1);
          }
        );
      }
      tryBackend(0);
    }


    resolveKugouV5Url(baseHash, info, quality, function (v5Err, v5Result) {
      if (!v5Err && v5Result && v5Result.url) {
        return callback(null, v5Result);
      }
      resolveKugouGatewayUrl(baseHash, info, quality, function (gatewayErr, gatewayResult) {
        if (!gatewayErr && gatewayResult && gatewayResult.url) {
          return callback(null, gatewayResult);
        }
        resolveKugouTrackerUrl(baseHash, quality, function (trackerErr, trackerResult) {
          if (!trackerErr && trackerResult && trackerResult.url) {
            return callback(null, trackerResult);
          }
          fallbackAfterTracker(trackerErr || gatewayErr || v5Err);
        });
      });
    });
  }

  function normalizeTencentPlaybackUrl(value) {
    var clean = String(value || '').replace(/^\s+|\s+$/g, '');
    if (!clean || !/^https?:\/\//i.test(clean)) return clean;
    try {
      var target = new URL(clean);
      var host = String(target.hostname || '').toLowerCase();
      if (host === 'ws.stream.qqmusic.qq.com' || host === 'stream.qqmusic.qq.com') {
        target.protocol = 'https:';
        target.hostname = 'isure.stream.qqmusic.qq.com';
        return target.toString();
      }
    } catch (e) {}
    return clean;
  }

  function resolveTencentAggregateUrl(musicInfo, quality, callback, options) {
    var info = musicInfo || {};
    options = options || {};
    var skipProvider = String(options.skipProvider || '').toLowerCase();
    var songmid = String(info.songmid || info.id || info.mediaMid || '').replace(/^\s+|\s+$/g, '');
    if (!songmid) return callback(new Error('No Tencent songmid for aggregate playback'));
    var requestedQuality = String(quality || '').toLowerCase() || '128k';
    var qMap = { '128k': '8', '192k': '8', '320k': '9', 'flac': '10', 'flac24bit': '16', 'hires': '14', 'atmos': '13', 'atmos_plus': '12', 'master': '11' };
    var vkeysQuality = qMap[requestedQuality] || '8';

    function extractUrl(data) {
      if (data == null) return '';
      if (typeof data === 'string') {
        var text = data.replace(/^\s+|\s+$/g, '');
        return /^https?:\/\//i.test(text) ? text : '';
      }
      var candidates = [
        data.url,
        data.play_url,
        data.playUrl,
        data.music,
        data.data && data.data.url,
        data.data && data.data.play_url,
        data.data && data.data.playUrl,
        data.data && data.data.music,
        data.req_0 && data.req_0.data && data.req_0.data.midurlinfo &&
          data.req_0.data.midurlinfo[0] && data.req_0.data.midurlinfo[0].purl
          ? 'https://isure.stream.qqmusic.qq.com/' + data.req_0.data.midurlinfo[0].purl
          : '',
        data.req_0 && data.req_0.data && data.req_0.data.midurlinfo &&
          data.req_0.data.midurlinfo[0] && data.req_0.data.midurlinfo[0].wifiurl
          ? data.req_0.data.midurlinfo[0].wifiurl
          : ''
      ];
      for (var i = 0; i < candidates.length; i += 1) {
        var value = candidates[i];
        if (typeof value === 'string' && /^https?:\/\//i.test(value.trim())) return value.trim();
      }
      return '';
    }

    function acceptUrl(url, provider, raw, done) {
      var clean = normalizeTencentPlaybackUrl(url);
      if (!/^https?:\/\//i.test(clean)) return done(new Error(provider + ' returned no playable URL'));
      if (isCrossPlatformPlaybackUrl('tx', clean)) return done(new Error(provider + ' returned a cross-platform URL'));
      done(null, {
        url: clean,
        source: 'tx',
        provider: provider,
        requestedQuality: requestedQuality,
        actualBr: requestedQuality,
        id: songmid,
        raw: raw
      });
    }

    var officialGuid = 'lxweb' + String(Date.now ? Date.now() : new Date().getTime());
    var officialFilePrefix = requestedQuality === '128k' || requestedQuality === '192k' ? 'M500' :
      (requestedQuality === '320k' ? 'M800' :
      (requestedQuality.indexOf('flac') === 0 || requestedQuality.indexOf('hires') === 0 ? 'F000' : 'M500'));
    var officialFileExt = officialFilePrefix === 'F000' ? '.flac' : '.mp3';

    var backends = [
      {
        provider: 'tencent-aggregate-official',
        method: 'POST',
        url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
        body: JSON.stringify({
          req_0: {
            module: 'vkey.GetVkeyServer',
            method: 'CgiGetVkey',
            param: {
              filename: [officialFilePrefix + songmid + officialFileExt],
              guid: officialGuid,
              songmid: [songmid],
              songtype: [0],
              uin: '0',
              loginflag: 0,
              platform: '20'
            }
          },
          loginUin: '0',
          comm: { uin: '0', format: 'json', ct: 24, cv: 0 }
        }),
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'QQMusic 14090508(android 12)',
          'Accept': 'application/json'
        }
      },
      {
        provider: 'tencent-aggregate-xinghai',
        method: 'GET',
        url: 'https://yy.zddyr.top/lx/api/?source=qq&songmid=' + encodeURIComponent(songmid) + '&quality=' + encodeURIComponent(requestedQuality),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      },
      {
        provider: 'tencent-aggregate-zrcdy',
        method: 'GET',
        url: 'https://zrcdy.dpdns.org/lx/api/api.php?source=qq&songmid=' + encodeURIComponent(songmid) + '&quality=' + encodeURIComponent(requestedQuality),
        headers: { 'User-Agent': 'Mozilla/5.0' }
      },
      {
        provider: 'tencent-aggregate-vkeys',
        method: 'GET',
        url: 'https://api.vkeys.cn/v2/music/tencent/geturl?mid=' + encodeURIComponent(songmid) + '&quality=' + encodeURIComponent(vkeysQuality),
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
      },
      {
        provider: 'tencent-aggregate-lxmusic88',
        method: 'GET',
        url: 'https://88.lxmusic.xn--fiqs8s/lxmusicv4/url/tx/' + encodeURIComponent(songmid) + '/' + encodeURIComponent(requestedQuality),
        headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'x-request-key': 'lxmusic' }
      }
    ];

    var lastError = null;
    function tryBackend(index) {
      if (index >= backends.length) return callback(lastError || new Error('All Tencent aggregate backends failed'));
      var backend = backends[index];
      if (skipProvider && String(backend.provider || '').toLowerCase() === skipProvider) {
        return tryBackend(index + 1);
      }
      requestViaProxy(backend.url, backend.method, backend.body || null, backend.headers, true, function (err, data) {
        if (!err) {
          var directUrl = extractUrl(data);
          if (directUrl) {
            return acceptUrl(directUrl, backend.provider, data, function (acceptErr, result) {
              if (!acceptErr) return callback(null, result);
              lastError = acceptErr;
              tryBackend(index + 1);
            });
          }
          lastError = new Error(backend.provider + ' returned no playable URL');
        } else {
          lastError = err;
        }
        tryBackend(index + 1);
      });
    }
    tryBackend(0);
  }


  function getHuibqPlaybackId(source, musicInfo) {
    var info = musicInfo || {};
    var candidates = [];

    function add(value) {
      var id = String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
      if (!id) return;
      for (var i = 0; i < candidates.length; i += 1) {
        if (candidates[i] === id) return;
      }
      candidates.push(id);
    }

    if (source === 'kg') {
      add(info.hash);
      add(info.songmid);
      add(info.id);
    } else if (source === 'mg') {
      add(info.songmid);
      add(info.copyrightId);
      add(info.copyright_id);
      add(info.id);
    } else {
      add(info.songmid);
      add(info.mediaMid);
      add(info.mid);
      add(info.id);
    }

    return candidates[0] || '';
  }

  function isCrossPlatformPlaybackUrl(source, value) {
    var text = String(value || '').toLowerCase();
    if (text.indexOf('http://') !== 0 && text.indexOf('https://') !== 0) return true;

    var blocked = {
      kg: ['kuwo.cn', 'panspace.kuwo.cn', 'bd-er.kuwo.cn', 'qq.com', 'y.qq.com', 'm.music.migu.cn', '163.com', 'music.163.com'],
      kw: ['kugou.com', 'webfs.kugou.com', 'qq.com', 'y.qq.com', 'music.163.com', 'm.music.migu.cn'],
      tx: ['kugou.com', 'webfs.kugou.com', 'kuwo.cn', 'panspace.kuwo.cn', 'music.163.com', 'm.music.migu.cn'],
      wy: ['kugou.com', 'webfs.kugou.com', 'kuwo.cn', 'panspace.kuwo.cn', 'qq.com', 'y.qq.com', 'm.music.migu.cn'],
      mg: ['kugou.com', 'webfs.kugou.com', 'kuwo.cn', 'panspace.kuwo.cn', 'qq.com', 'y.qq.com', 'music.163.com']
    };

    var list = blocked[String(source || '').toLowerCase()] || [];
    for (var i = 0; i < list.length; i += 1) {
      if (text.indexOf(list[i]) >= 0) return true;
    }
    return false;
  }

  function resolveHuibqUrl(source, musicInfo, quality, callback) {
    source = String(source || '').toLowerCase();
    if (!SOURCE_MAP[source]) return callback(new Error('Unsupported playback source: ' + source));

    var id = getHuibqPlaybackId(source, musicInfo);
    if (!id) return callback(new Error('No platform track id for Huibq playback: ' + source));

    var requestedQuality = String(quality || '').toLowerCase();
    var huibqQuality = HUIBQ_QUALITY_MAP[requestedQuality] || '128k';
    var url = HUIBQ_API_ENDPOINT +
      '/url/' + encodeURIComponent(source) +
      '/' + encodeURIComponent(id) +
      '/' + encodeURIComponent(huibqQuality);

    requestViaProxy(
      url,
      'GET',
      null,
      {
        'User-Agent': 'lx-music-web/2.0.0',
        'Accept': 'application/json, text/plain, */*',
        'X-Request-Key': HUIBQ_API_KEY
      },
      true,
      function (err, data) {
        if (err) return callback(err);

        var code = data && data.code != null ? Number(data.code) : NaN;
        var returnedUrl = data && typeof data.url === 'string' ? data.url : '';
        if (code !== 0 || !/^https?:/i.test(returnedUrl) || isCrossPlatformPlaybackUrl(source, returnedUrl)) {
          var message = data && data.msg ? String(data.msg) : 'Huibq returned no playable URL';
          return callback(new Error(message));
        }

        callback(null, {
          url: String(returnedUrl).replace(/^\s+|\s+$/g, ''),
          source: source,
          provider: 'huibq',
          requestedQuality: String(quality || ''),
          requestedQualityMapped: huibqQuality,
          actualBr: huibqQuality,
          id: id
        });
      }
    );
  }

  function getTuneFreePlaybackIds(source, musicInfo) {
    var info = musicInfo || {};
    var ids = [];

    function add(value) {
      var id = String(value == null ? '' : value).replace(/^\\s+|\\s+$/g, '');
      if (!id) return;
      for (var i = 0; i < ids.length; i += 1) {
        if (ids[i] === id) return;
      }
      ids.push(id);
    }

    if (source === 'kw' || source === 'tx' || source === 'wy') {
      add(info.songmid);
      add(info.mediaMid);
      add(info.mid);
      add(info.id);
    }

    return ids;
  }

  function resolveTuneFreeUrl(source, musicInfo, quality, callback) {
    source = String(source || '').toLowerCase();
    var platform = TUNEFREE_SOURCE_MAP[source];
    if (!platform) return callback(new Error('Unsupported TuneHub source: ' + source));

    var ids = getTuneFreePlaybackIds(source, musicInfo);
    if (!ids.length) return callback(new Error('No platform track id for TuneHub playback: ' + source));

    var br = TUNEFREE_QUALITY_MAP[String(quality || '').toLowerCase()] || '128k';
    var lastError = null;

    function tryId(index) {
      if (index >= ids.length) {
        return callback(lastError || new Error('TuneHub returned no playable URL for ' + platform));
      }

      var url = TUNEFREE_API_ENDPOINT +
        '?source=' + encodeURIComponent(platform) +
        '&id=' + encodeURIComponent(ids[index]) +
        '&type=url' +
        '&br=' + encodeURIComponent(br);

      requestViaProxy(
        url,
        'GET',
        null,
        {
          'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/49.0.2623.112 Safari/537.36',
          'Accept': 'application/json, audio/mpeg, audio/*, */*; q=0.01'
        },
        false,
        function (err, data) {
          if (err) {
            lastError = err;
            return tryId(index + 1);
          }

          var text = String(data || '').replace(/^\\s+|\\s+$/g, '');
          var returnedUrl = '';
          try {
            var parsed = JSON.parse(text);
            returnedUrl = parsed && (parsed.url || (parsed.data && parsed.data.url) || '') || '';
          } catch (e) {}

          if (!returnedUrl && /^https?:/i.test(text)) returnedUrl = text;
          if (!returnedUrl || !/^https?:/i.test(returnedUrl) || isCrossPlatformPlaybackUrl(source, returnedUrl)) {
            lastError = new Error('TuneHub returned no playable URL for ' + platform + ' (' + br + ')');
            return tryId(index + 1);
          }

          var actualBr = '';
          try {
            var parsedMeta = JSON.parse(text);
            actualBr = parsedMeta && parsedMeta.br != null ? parsedMeta.br :
              (parsedMeta && parsedMeta.data && parsedMeta.data.br != null ? parsedMeta.data.br : '');
          } catch (e2) {}

          callback(null, {
            url: String(returnedUrl).replace(/^\\s+|\\s+$/g, ''),
            source: source,
            provider: 'tune-free',
            requestedQuality: String(quality || ''),
            requestedBr: br,
            actualBr: String(actualBr || br),
            id: ids[index]
          });
        }
      );
    }

    tryId(0);
  }

  function resolveGdStudioUrl(source, musicInfo, quality, callback) {
    source = String(source || '').toLowerCase();
    var mapped = SOURCE_MAP[source];
    if (!mapped) return callback(new Error('Unsupported playback source: ' + source));

    var ids = getGdPlaybackIds(source, musicInfo);
    if (!ids.length) return callback(new Error('No platform track id for ' + source));

    var br = GD_PLAYBACK_QUALITY_MAP[String(quality || '').toLowerCase()] || '128';
    var lastError = null;

    function tryId(index) {
      if (index >= ids.length) {
        return callback(lastError || new Error('GD Studio returned no playable URL for ' + mapped));
      }

      getGdServerTime(function (timeErr, serverTime) {
        if (timeErr) {
          lastError = timeErr;
          return tryId(index + 1);
        }

        var encodedId = encodeURIComponent(ids[index]);
        var sign = gdStudioSign(encodedId, serverTime);
        var body = encodeForm({
          types: 'url',
          id: ids[index],
          source: mapped,
          br: br,
          s: sign
        });

        requestViaProxy(
          API_ENDPOINT,
          'POST',
          body,
          {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/149.0.0.0 Safari/537.36',
            'Referer': 'https://music.gdstudio.xyz/',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Origin': 'https://music.gdstudio.xyz'
          },
          true,
          function (err, data) {
            if (err) {
              lastError = err;
              return tryId(index + 1);
            }

            var returnedUrl = data && typeof data.url === 'string'
              ? data.url
              : (data && data.data && typeof data.data.url === 'string' ? data.data.url : '');
            if (returnedUrl && !/^https?:/i.test(returnedUrl)) {
              returnedUrl = 'https://music.gdstudio.xyz/' + String(returnedUrl).replace(/^\/+/, '');
            }
            if (!returnedUrl || !/^https?:/i.test(returnedUrl)) {
              lastError = new Error('GD Studio returned no playable URL for ' + mapped + ' (' + br + ')');
              return tryId(index + 1);
            }

            var actualBr = data && data.br != null ? data.br :
              (data && data.data && data.data.br != null ? data.data.br : br);

            callback(null, {
              url: String(returnedUrl).replace(/^\s+|\s+$/g, ''),
              source: source,
              provider: 'gd-studio',
              requestedQuality: String(quality || ''),
              requestedBr: br,
              actualBr: String(actualBr || br),
              id: ids[index]
            });
          }
        );
      });
    }

    tryId(0);
  }


  function searchViaGdStudio(source, keyword, page, limit, callback) {
    // GD Studio is only used for platforms it currently exposes. Never
    // substitute another platform for the selected source.
    requestGdSearch(source, keyword, page, limit, callback);
  }

  function searchViaPlatform(source, keyword, page, limit, callback) {
    if (source === 'kw') return searchKuwo(keyword, page, limit, callback);
    if (source === 'kg') return searchKugou(keyword, page, limit, callback);
    if (source === 'tx') return searchTencent(keyword, page, limit, callback);
    if (source === 'wy') return searchNetease(keyword, page, limit, callback);
    if (source === 'mg') return searchMigu(keyword, page, limit, callback);
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
      result.fallbackSearch = result.fallbackSearch === true;
      return callback(null, result);
    });
  }


  function resolveMusicUrl(source, musicInfo, quality, callback, options) {
    source = String(source || '').toLowerCase();
    options = options || {};
    var skipProvider = String(options.skipProvider || '').toLowerCase();

    function finishGd(huibqErr, tuneErr) {
      if (skipProvider === 'gd-studio') {
        var message = 'No alternate playback provider remains for ' + source;
        if (huibqErr && huibqErr.message) message += '；Huibq: ' + huibqErr.message;
        if (tuneErr && tuneErr.message) message += '；TuneHub: ' + tuneErr.message;
        return callback(new Error(message));
      }

      resolveGdStudioUrl(source, musicInfo, quality, function (gdErr, result) {
        if (!gdErr && result && result.url) return callback(null, result);

        var message = 'Playback fallback failed for ' + source;
        if (huibqErr && huibqErr.message) message += '；Huibq: ' + huibqErr.message;
        if (tuneErr && tuneErr.message) message += '；TuneHub: ' + tuneErr.message;
        if (gdErr && gdErr.message) message += '；GD Studio: ' + gdErr.message;
        callback(new Error(message));
      });
    }

    function afterTuneHub(huibqErr) {
      if (TUNEFREE_SOURCE_MAP[source] && skipProvider !== 'tune-free') {
        resolveTuneFreeUrl(source, musicInfo, quality, function (tuneErr, result) {
          if (!tuneErr && result && result.url) return callback(null, result);
          finishGd(huibqErr, tuneErr);
        });
        return;
      }
      finishGd(huibqErr, null);
    }

    function afterHuibq() {
      if (source === 'tx' && skipProvider !== 'gd-studio') {
        return resolveGdStudioUrl(source, musicInfo, quality, function (gdErr, gdResult) {
          if (!gdErr && gdResult && gdResult.url) return callback(null, gdResult);

          // GD Studio availability is independent of the selected Tencent
          // track. Prefer the existing LX/Huibq resolver before aggregates
          // when GD cannot produce a URL.
          if (skipProvider !== 'huibq') {
            return resolveHuibqUrl(source, musicInfo, quality, function (huibqErr, huibqResult) {
              if (!huibqErr && huibqResult && huibqResult.url) return callback(null, huibqResult);
              afterTencentAggregate(gdErr || huibqErr);
            });
          }

          afterTencentAggregate(gdErr);
        });
      }
      afterTencentAggregate(null);
    }

    function afterTencentAggregate(preferredGdError) {
      if (source === 'tx' && skipProvider !== 'tencent-aggregate') {
        return resolveTencentAggregateUrl(musicInfo, quality, function (aggregateErr, aggregateResult) {
          if (!aggregateErr && aggregateResult && aggregateResult.url) return callback(null, aggregateResult);
          var aggregateFailure = aggregateErr;
          resolveHuibqUrl(source, musicInfo, quality, function (huibqErr, result) {
            if (!huibqErr && result && result.url) return callback(null, result);
            afterTuneHub(aggregateFailure || huibqErr);
          });
        }, { skipProvider: skipProvider });
      }
      if (skipProvider === 'huibq') return afterTuneHub(null);

      resolveHuibqUrl(source, musicInfo, quality, function (huibqErr, result) {
        if (!huibqErr && result && result.url) return callback(null, result);
        afterTuneHub(huibqErr);
      });
    }


    if (source === 'kg' && skipProvider !== 'kugou-native') {
      return resolveKugouNativeUrl(musicInfo, quality, function (nativeErr, nativeResult) {
        if (!nativeErr && nativeResult && nativeResult.url) return callback(null, nativeResult);
        afterHuibq();
      });
    }

    return afterHuibq();
  }

  global.LXMusicSearch = {
    search: search,
    sourceMap: SOURCE_MAP,
    normalizeSong: normalizeSong,
    resolveMusicUrl: resolveMusicUrl
  };
})(window);