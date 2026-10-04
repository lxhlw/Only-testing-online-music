          searchProvider: 'kugou',
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
