(function (global) {
  'use strict';

  var QQ_ENDPOINT = 'https://u.y.qq.com/cgi-bin/musics.fcg';
  var PART_1 = [23, 14, 6, 36, 16, 40, 7, 19];
  var PART_2 = [16, 1, 32, 12, 19, 27, 8, 5];
  var SCRAMBLE = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179];

  function zzcSign(text) {
    var hash = global.LXLegacySHA1(text);
    var a = '', b = '', i;
    for (i = 0; i < PART_1.length; i += 1) a += hash.charAt(PART_1[i]);
    for (i = 0; i < PART_2.length; i += 1) b += hash.charAt(PART_2[i]);

    var bytes = [];
    for (i = 0; i < SCRAMBLE.length; i += 1) {
      bytes.push(SCRAMBLE[i] ^ parseInt(hash.substr(i * 2, 2), 16));
    }

    var binary = '';
    for (i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);

    return ('zzc' + a + global.btoa(binary).replace(/[\/+=]/g, '') + b).toLowerCase();
  }

  function requestJson(url, body, callback) {
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
        return finish(new Error('HTTP ' + xhr.status));
      }
      try {
        finish(null, JSON.parse(xhr.responseText));
      } catch (e) {
        finish(new Error('QQ response is not JSON'));
      }
    };
    xhr.onerror = function () { finish(new Error('Network request failed')); };
    xhr.open('POST', requestUrl, true);
    try {
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.setRequestHeader('X-LX-Headers', JSON.stringify({
        'User-Agent': 'QQMusic 14090508(android 12)'
      }));
    } catch (e) {}
    xhr.send(JSON.stringify(body));
  }

  function search(keyword, page, limit, callback) {
    page = page || 1;
    limit = limit || 20;

    var body = {
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
          searchid: String(Date.now())
        }
      }
    };

    requestJson(
      QQ_ENDPOINT + '?sign=' + encodeURIComponent(zzcSign(JSON.stringify(body))),
      body,
      function (err, response) {
        if (err) return callback(err);

        var service = response && response['music.search.SearchCgiService'];
        if (!service || response.code !== 0 || service.code !== 0) {
          return callback(new Error('QQ search service returned an error'));
        }

        var data = service.data;
        if (!data || !data.body || !data.body.song) {
          return callback(new Error('QQ search result format is invalid'));
        }

        var list = data.body.song.list || [];
        var result = [];

        for (var i = 0; i < list.length; i += 1) {
          var item = list[i];
          if (!item || !item.file || !item.file.media_mid) continue;

          var singers = [];
          var singerList = item.singer || [];
          for (var s = 0; s < singerList.length; s += 1) {
            singers.push(singerList[s].name || '');
          }

          var album = item.album || {};
          result.push({
            id: String(item.id || item.mid || ''),
            name: item.title || item.name || '',
            singer: singers.join('、'),
            source: 'tx',
            songmid: item.mid || '',
            mediaMid: item.file.media_mid,
            albumId: album.mid || '',
            albumName: album.name || '',
            interval: Number(item.interval || 0),
            image: album.mid ? 'https://y.gtimg.cn/music/photo_new/T002R500x500M000' + album.mid + '.jpg' : ''
          });
        }

        callback(null, {
          source: 'tx',
          page: page,
          total: Number(data.meta && data.meta.sum || result.length),
          list: result
        });
      }
    );
  }

  global.LXMusicSearch = { qq: search };
})(window);
