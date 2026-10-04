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
    var urlPath = '/api/search/song/list/page';
    var requestBody = {
      keyword: keyword,
      needCorrect: '1',
      channel: 'typing',
      offset: limit * (page - 1),
      scene: 'normal',
      total: page === 1,
      limit: limit
    };
    var params = eapiParams(urlPath, requestBody);

    requestViaProxy(
      'http://interface.music.163.com/eapi/batch',
      'POST',
      encodeForm({ params: params }),
      {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
        'Origin': 'https://music.163.com',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      true,
      function (err, data) {
        if (err) return callback(err);
        var listRoot = data && data.data ? data.data : data;
        if (!listRoot || Number(listRoot.code) !== 200) {
          return callback(new Error('Netease search returned an invalid response'));
        }
        var resources = listRoot.data && Array.isArray(listRoot.data.resources)
          ? listRoot.data.resources
          : (Array.isArray(listRoot.resources) ? listRoot.resources : []);
        var list = buildNeteaseList(resources);
        if (!list.length) return callback(new Error('Netease search returned no usable songs'));

        var total = Number(listRoot.data && listRoot.data.totalCount != null
          ? listRoot.data.totalCount
          : listRoot.totalCount);
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
        if (code !== 0 || !/^https?:/i.test(returnedUrl)) {
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

      var url = API_ENDPOINT +
        '?types=url' +
        '&source=' + encodeURIComponent(mapped) +
        '&id=' + encodeURIComponent(ids[index]) +
        '&br=' + encodeURIComponent(br);

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
          if (err) {
            lastError = err;
            return tryId(index + 1);
          }

          var returnedUrl = data && typeof data.url === 'string'
            ? data.url
            : (data && data.data && typeof data.data.url === 'string' ? data.data.url : '');
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
      result.fallbackSearch = false;
      return callback(null, result);
    });
  }


  function resolveMusicUrl(source, musicInfo, quality, callback) {
    resolveHuibqUrl(source, musicInfo, quality, function (huibqErr, huibqResult) {
      if (!huibqErr && huibqResult && huibqResult.url) return callback(null, huibqResult);

      resolveGdStudioUrl(source, musicInfo, quality, function (gdErr, gdResult) {
        if (!gdErr && gdResult && gdResult.url) return callback(null, gdResult);

        var message = 'Huibq playback failed';
        if (huibqErr && huibqErr.message) message += ': ' + huibqErr.message;
        if (gdErr && gdErr.message) message += '；GD Studio playback failed: ' + gdErr.message;
        callback(new Error(message));
      });
    });
  }

  global.LXMusicSearch = {
    search: search,
    sourceMap: SOURCE_MAP,
    normalizeSong: normalizeSong,
    resolveMusicUrl: resolveMusicUrl
  };
})(window);