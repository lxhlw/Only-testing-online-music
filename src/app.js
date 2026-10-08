(function (global) {
  'use strict';

  var statusEl;
  var listEl;
  var countEl;
  var runtimeEl, resultsEl;
  var channelListEl, qualitySummaryEl;
  var queueListEl, favoriteListEl, historyListEl;
  var lyricsStatusEl, lyricsTitleEl, lyricsLinesEl, lyricsRefreshBtn;
  var lyricsState = null;
  var selectedChannel = null;
  var playbackState = null;
  var playbackToken = 0;
  var searchToken = 0;
  var MIN_UNKNOWN_MEDIA_DURATION_SECONDS = 15;
  var MIN_CONFIRMED_PLAYBACK_PROGRESS_SECONDS = 0.25;
  var PLAYBACK_CONFIRM_TIMEOUT_MS = 3500;
  var PLAYBACK_CONNECT_TIMEOUT_MS = 7000;
  // Migu-only budget for a single user-visible play attempt, across all
  // qualities and fallback providers. Do not bound other four channels.
  var MIGU_PLAYBACK_MAX_WAIT_MS = 25000;

  var CHANNEL_NAMES = {
    kw: '酷我音乐',
    kg: '酷狗音乐',
    tx: 'QQ音乐',
    wy: '网易云音乐',
    mg: '咪咕音乐'
  };

  function setStatus(text, type) {
    statusEl.className = 'status' + (type ? ' ' + type : '');
    statusEl.innerHTML = text;
  }

  function renderSources(items) {
    countEl.innerHTML = String(items.length);
    listEl.innerHTML = '';
    var current = global.LXSourceManager && global.LXSourceManager.getActive ?
      global.LXSourceManager.getActive() : null;
    cancelStaleMiguPlaybackOnSourceChange(current);
    var selectedName = current && current.name ? String(current.name) : '未选择';
    var summary = document.getElementById('active-source-summary');
    if (summary) {
      summary.className = 'active-source-summary' + (current ? ' is-selected' : '');
      if (current) {
        var currentState = current.inited ? '已就绪' : (current.error ? '初始化失败' : '正在初始化');
        summary.innerHTML = '<span class="active-source-summary-label">当前使用音源</span>' +
          '<strong class="active-source-summary-name">' + escapeHtml(selectedName) + '</strong>' +
          '<span class="active-source-summary-state">状态：' + currentState + '</span>';
      } else {
        summary.innerHTML = '<span class="active-source-summary-label">当前使用音源</span>' +
          '<strong class="active-source-summary-name">尚未选择音源</strong>';
      }
    }
    var topSource = document.getElementById('top-source-label');
    if (topSource) {
      topSource.className = 'topbar-chip top-source-indicator' + (current ? ' is-selected' : '');
      topSource.textContent = '当前音源：' + selectedName;
      topSource.title = '当前音源：' + selectedName;
    }

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var isCurrent = !!(current && String(current.id) === String(item.id));
      var box = document.createElement('div');
      box.className = 'source-item' + (isCurrent ? ' is-active-source' : '');
      if (isCurrent) box.setAttribute('aria-current', 'true');

      var meta = '<div class="source-name-row"><div class="source-name">' + escapeHtml(item.name) + '</div>' +
        (isCurrent ? '<span class="source-current-badge">✓ 当前使用中</span>' : '') + '</div>';
      meta += '<div class="source-meta">版本：' + escapeHtml(item.version || '—') + '</div>';
      meta += '<div class="source-meta">URL：' + escapeHtml(item.url) + '</div>';
      meta += '<div class="source-meta">初始化：' + (item.inited ? '<span class="ready">READY</span>' : '<span class="pending">WAIT</span>') + '</div>';
      if (item.sources) meta += '<div class="source-meta">支持源：' + escapeHtml(sourceNames(item.sources)) + '</div>';
      if (item.transport) meta += '<div class="source-meta">导入通道：' + escapeHtml(item.transport === 'proxy' ? '项目代理' : '直连') + '</div>';
      if (item.error) meta += '<div class="source-meta fail">错误：' + escapeHtml(item.error) + '</div>';

      var buttons = document.createElement('div');
      buttons.className = 'source-buttons';

      var activate = document.createElement('button');
      activate.type = 'button';
      activate.className = 'source-activate-button' + (isCurrent ? ' is-current' : '');
      activate.innerHTML = isCurrent ? '✓ 当前使用中' : '设为当前音源';
      activate.disabled = isCurrent;
      activate.setAttribute('aria-label', (isCurrent ? '当前使用音源：' : '切换到音源：') + String(item.name || '未命名音源'));
      activate.onclick = (function (sourceItem) {
        return function () {
          var selected = global.LXSourceManager.activate(sourceItem.id);
          if (selected) setStatus('已切换当前音源：' + escapeHtml(selected.name), 'ready');
        };
      })(item);
      buttons.appendChild(activate);

      var remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'secondary';
      remove.innerHTML = '删除';
      remove.onclick = (function (sourceItem) {
        return function () {
          global.LXSourceManager.remove(sourceItem.id);
        };
      })(item);
      buttons.appendChild(remove);

      box.innerHTML = meta;
      box.appendChild(buttons);
      listEl.appendChild(box);
    }

    renderChannelSelectors();
  }

  function sourceNames(sources) {
    var names = [];
    for (var key in sources) {
      if (Object.prototype.hasOwnProperty.call(sources, key)) {
        names.push(key + (sources[key] && sources[key].name ? ' (' + sources[key].name + ')' : ''));
      }
    }
    return names.join(', ');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function setCheck(id, state) {
    var el = document.getElementById(id);
    el.className = state === 'ok' ? 'ready' : (state === 'fail' ? 'fail' : 'pending');
    el.innerHTML = state === 'ok' ? 'PASS' : (state === 'fail' ? 'FAIL' : 'WAIT');
  }

  function getSupportedChannels() {
    var active = global.LXSourceManager.getActive();
    var supported = [];
    var sources = active && active.sources ? active.sources : {};
    for (var key in sources) {
      if (!Object.prototype.hasOwnProperty.call(sources, key)) continue;
      var info = sources[key] || {};
      var actions = info.actions || [];
      if (actions.indexOf('musicUrl') >= 0 || !info.actions) supported.push(key);
    }
    return supported;
  }

  function getPlaySettings() {
    return global.LXPlaySettings ? global.LXPlaySettings.load() : {
      qualityMode: 'highest',
      fixedQuality: '320k',
      autoFallback: true
    };
  }

  function getQualityPlan(activeSource, channel) {
    if (!activeSource || !activeSource.sources || !activeSource.sources[channel]) return [];
    var available = activeSource.sources[channel].qualitys || [];
    if (global.LXPlaySettings) return global.LXPlaySettings.buildPlan(available, getPlaySettings());
    return available instanceof Array ? available.slice() : [];
  }

  function renderChannelSelectors() {
    if (!channelListEl) return;
    var active = global.LXSourceManager.getActive();
    var supported = getSupportedChannels();
    channelListEl.innerHTML = '';
    if (qualitySummaryEl) qualitySummaryEl.innerHTML = '';

    if (!active || !active.inited || !supported.length) {
      channelListEl.innerHTML = '<span class="muted">当前音源没有可用的在线音乐渠道。</span>';
      if (qualitySummaryEl) qualitySummaryEl.innerHTML = '<span class="muted">暂无音质设置。</span>';
      selectedChannel = null;
      return;
    }

    if (supported.indexOf(selectedChannel) < 0) {
      selectedChannel = supported.indexOf('tx') >= 0 ? 'tx' : supported[0];
    }

    for (var i = 0; i < supported.length; i += 1) {
      var key = supported[i];
      var channelInfo = active.sources[key] || {};
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'channel-button' + (key === selectedChannel ? ' active' : '');
      button.innerHTML = escapeHtml(channelInfo.name || CHANNEL_NAMES[key] || key.toUpperCase());
      button.title = key.toUpperCase();
      button.onclick = (function (channel) {
        return function () {
          selectedChannel = channel;
          searchToken += 1;
          global.__LXLastSearchResults = [];
          renderChannelSelectors();
          resultsEl.innerHTML = '';
          setStatus('已选择播放渠道：' + escapeHtml(CHANNEL_NAMES[channel] || channel.toUpperCase()) +
            '；' + escapeHtml(global.LXPlaySettings ? global.LXPlaySettings.getLabel(getPlaySettings()) : '最高音质优先'));
        };
      })(key);
      channelListEl.appendChild(button);
    }

    var channelInfo = active.sources[selectedChannel] || {};
    var available = channelInfo.qualitys instanceof Array ? channelInfo.qualitys : [];
    var plan = getQualityPlan(active, selectedChannel);
    if (qualitySummaryEl) {
      if (!available.length) {
        qualitySummaryEl.innerHTML = '<span class="muted">当前渠道未声明音质列表，运行时将使用默认音质。</span>';
      } else {
        var settingsLabel = global.LXPlaySettings ?
          global.LXPlaySettings.getLabel(getPlaySettings()) : '最高音质优先（失败自动降级）';
        var highest = global.LXPlaySettings ?
          global.LXPlaySettings.getPreferredQuality(available, { qualityMode: 'highest', autoFallback: true }) :
          available[0];
        var nextText = plan.length > 1 ? ' · 降级顺序：' + escapeHtml(plan.join(' → ')) : '';
        qualitySummaryEl.innerHTML =
          '<span class="quality-summary-label">' + escapeHtml(settingsLabel) + '</span>' +
          '<span class="quality-summary-detail">当前渠道最高：' + escapeHtml(highest || '—') +
          ' · 可用：' + escapeHtml(available.join(', ')) + nextText + '</span>';
      }
    }
  }

  function sourceSupportsAction(source, action) {
    var active = global.LXSourceManager.getActive();
    if (!active || !active.sources || !active.sources[source]) return false;
    var actions = active.sources[source].actions;
    return actions instanceof Array && actions.indexOf(action) >= 0;
  }

  function setLyricsStatus(text, type) {
    if (!lyricsStatusEl) return;
    lyricsStatusEl.className = 'lyrics-status' + (type ? ' ' + type : '');
    lyricsStatusEl.innerHTML = text;
  }

  function clearLyrics() {
    lyricsState = null;
    if (lyricsTitleEl) lyricsTitleEl.innerHTML = '未选择歌曲';
    if (lyricsLinesEl) lyricsLinesEl.innerHTML = '';
    setLyricsStatus('播放支持歌词的 LX 音源后会自动尝试加载歌词。');
  }

  function renderLyricsResult(music, result) {
    if (!global.LXMusicLyrics) {
      setLyricsStatus('歌词解析模块未加载。', 'fail');
      return;
    }

    var normalized = global.LXMusicLyrics.normalize(result);
    var lines = global.LXMusicLyrics.parseLrc(normalized.lyric);
    lyricsState = {
      musicKey: musicKey(music),
      music: music,
      source: String(music.source || '').toLowerCase(),
      lyric: normalized.lyric,
      lines: lines
    };

    if (lyricsTitleEl) {
      lyricsTitleEl.innerHTML = escapeHtml(music.name || '未知歌曲') +
        ' <span class="muted">· ' + escapeHtml(music.singer || '未知歌手') + '</span>';
    }

    if (!normalized.lyric) {
      if (lyricsLinesEl) lyricsLinesEl.innerHTML = '<div class="muted">当前歌曲没有返回歌词内容。</div>';
      setLyricsStatus('歌词接口已返回，但内容为空。', 'warn');
      return;
    }

    if (!lyricsLinesEl) return;
    lyricsLinesEl.innerHTML = '';

    if (!lines.length) {
      var rawParts = normalized.lyric.split('\n');
      for (var r = 0; r < rawParts.length; r += 1) {
        var rawText = rawParts[r].replace(/^\s+|\s+$/g, '');
        if (!rawText) continue;
        var rawLine = document.createElement('div');
        rawLine.className = 'lyrics-line';
        rawLine.innerHTML = escapeHtml(rawText);
        lyricsLinesEl.appendChild(rawLine);
      }
      setLyricsStatus('已加载歌词（未检测到标准 LRC 时间轴）。', 'ready');
      return;
    }

    for (var i = 0; i < lines.length; i += 1) {
      var line = document.createElement('div');
      line.className = 'lyrics-line';
      line.setAttribute('data-lyric-index', String(i));
      line.innerHTML = escapeHtml(lines[i].text);
      lyricsLinesEl.appendChild(line);
    }
    setLyricsStatus('歌词已加载，可随播放进度高亮当前歌词。', 'ready');
    syncLyrics();
  }

  function loadLyricsForState(state) {
    if (!state || !state.music) return;
    if (!sourceSupportsAction(state.source, 'lyric')) {
      setLyricsStatus('当前音源未声明 lyric 接口，跳过歌词请求。', 'warn');
      return;
    }

    setLyricsStatus('正在加载歌词……');
    global.LXSourceManager.requestAction(state.source, 'lyric', {
      musicInfo: buildMusicInfo(state.music, state.source)
    }, function (err, result) {
      if (state.token !== playbackToken || !playbackState || musicKey(playbackState.music) !== musicKey(state.music)) return;
      if (err) {
        setLyricsStatus('歌词加载失败：' + escapeHtml(err.message || err), 'fail');
        return;
      }
      renderLyricsResult(state.music, result);
    });
  }

  function syncLyrics() {
    if (!lyricsState || !lyricsState.lines || !lyricsState.lines.length) return;
    var audio = document.getElementById('audio');
    if (!audio) return;
    var activeIndex = global.LXMusicLyrics.getActiveLine(lyricsState.lines, audio.currentTime);
    var children = lyricsLinesEl ? lyricsLinesEl.childNodes : [];
    for (var i = 0; i < children.length; i += 1) {
      if (!children[i] || !children[i].getAttribute) continue;
      var index = Number(children[i].getAttribute('data-lyric-index'));
      children[i].className = 'lyrics-line' + (index === activeIndex ? ' active' : '');
    }
  }

  function musicKey(music) {
    if (!music) return '';
    var source = String(music.source || '').toLowerCase();
    var id = String(music.id || music.songId || music.songmid || music.mid || music.hash || '');
    return source + ':' + id;
  }

  function playLibraryMusic(music) {
    var source = music && music.source ? String(music.source).toLowerCase() : '';
    var supported = getSupportedChannels();
    if (!source || supported.indexOf(source) < 0) {
      setStatus('当前音源无法播放已保存歌曲：' + escapeHtml(music && music.name || '未知歌曲'), 'fail');
      return;
    }
    selectedChannel = source;
    renderChannelSelectors();
    testMusic(music, false);
  }

  function makeLibraryButton(text, handler, secondary) {
    var button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = text;
    if (secondary) button.className = 'secondary';
    button.onclick = handler;
    return button;
  }

  function renderLibraryList(target, items, mode) {
    if (!target) return;
    target.innerHTML = '';

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var row = document.createElement('div');
      row.className = 'library-row';

      var main = document.createElement('div');
      main.className = 'library-main';
      main.innerHTML =
        '<div class="library-title">' + escapeHtml(item.name || '未知歌曲') + '</div>' +
        '<div class="library-meta">' +
        escapeHtml(item.singer || '未知歌手') + ' · ' +
        escapeHtml(CHANNEL_NAMES[item.source] || String(item.source || '').toUpperCase()) +
        '</div>';

      var actions = document.createElement('div');
      actions.className = 'library-actions';

      actions.appendChild(makeLibraryButton('播放', (function (music) {
        return function () { playLibraryMusic(music); };
      })(item)));

      if (mode === 'queue') {
        actions.appendChild(makeLibraryButton('删除', (function (music) {
          return function () {
            global.LXMusicLibrary.removeQueue(music);
            renderLibrary();
          };
        })(item), true));
      } else if (mode === 'favorite') {
        actions.appendChild(makeLibraryButton('加入队列', (function (music) {
          return function () {
            global.LXMusicLibrary.addQueue(music);
            renderLibrary();
            setStatus('已加入播放队列：' + escapeHtml(music.name), 'ready');
          };
        })(item), true));
      } else {
        actions.appendChild(makeLibraryButton(
          global.LXMusicLibrary.isFavorite(item) ? '取消收藏' : '收藏',
          (function (music) {
            return function () {
              global.LXMusicLibrary.toggleFavorite(music);
              renderLibrary();
            };
          })(item),
          true
        ));
      }

      row.appendChild(main);
      row.appendChild(actions);
      target.appendChild(row);
    }
  }

  function renderLibrary() {
    if (!global.LXMusicLibrary) return;
    var data = global.LXMusicLibrary.snapshot();
    renderLibraryList(queueListEl, data.queue, 'queue');
    renderLibraryList(favoriteListEl, data.favorites, 'favorite');
    renderLibraryList(historyListEl, data.history, 'history');
  }

  function onSourceInited(item) {
    setCheck('check-inited', 'ok');
    setStatus('音源已执行并发送 inited：<b>' + escapeHtml(item.name) + '</b>', 'ready');
  }

  function buildPlayableUrl(url, forceProxy) {
    var value = String(url || '');
    if (!/^https?:/i.test(value)) return value;

    try {
      if (global.location && typeof global.URL === 'function') {
        var target = new global.URL(value, global.location.href);
        var page = new global.URL(global.location.href);
        var hostname = String(target.hostname || '').toLowerCase();
        var trustedKuwoMediaHost =
          hostname === 'kw-bj.kuwo.cn' ||
          hostname === 'kw-lv.kuwo.cn' ||
          hostname === 'bd-er.kuwo.cn' ||
          hostname === 'kwcdn.kuwo.cn';
        var trustedKugouMediaHost = hostname.indexOf('.hw.kugou.com') === hostname.length - '.hw.kugou.com'.length;

        // Signed Kuwo CDN URLs and Kugou HW CDN media can be used directly.
        // The Kugou resolver commonly returns an HTTP CDN URL; upgrading that
        // media request to HTTPS avoids mixed-content blocking on the Pages app
        // and avoids routing a valid media CDN through the JSON proxy.
        // Official Migu HTTPS media/redirect endpoints also stay direct.
        if (!forceProxy &&
            (trustedKuwoMediaHost || trustedKugouMediaHost || target.protocol === 'https:')) {
          if (trustedKugouMediaHost && target.protocol === 'http:') {
            target.protocol = 'https:';
          }
          return target.href;
        }

        if (target.origin === page.origin && target.protocol === page.protocol) {
          return target.href;
        }
        return page.origin + '/api/proxy?url=' + encodeURIComponent(target.href);
      }
    } catch (e) {}

    try {
      var origin = String(global.location.protocol || '') + '//' + String(global.location.host || '');
      if (origin && !forceProxy && /^https:/i.test(value)) return value;
      if (origin) return origin + '/api/proxy?url=' + encodeURIComponent(value);
    } catch (e) {}

    return value;
  }

  function unavailablePlaybackMessage(source) {
    if (source === 'mg') {
      return '咪咕这首歌曲暂无可用的播放地址：当前音源和官方解析接口未能提供有效音频，可能受到授权、地区或接口可用性限制。请试试同平台其他歌曲或稍后重试。';
    }
    return '';
  }

  function buildMusicInfo(music, source) {
    var musicInfo = {};
    var key;
    for (key in music) {
      if (Object.prototype.hasOwnProperty.call(music, key) && key !== 'raw') musicInfo[key] = music[key];
    }
    if (music.raw && typeof music.raw === 'object') {
      for (key in music.raw) {
        if (Object.prototype.hasOwnProperty.call(music.raw, key) && musicInfo[key] == null) {
          musicInfo[key] = music.raw[key];
        }
      }
    }
    musicInfo.source = source;
    musicInfo.songId = musicInfo.songId || music.id;
    if (!musicInfo.songmid && !musicInfo.hash && music.id != null) {
      musicInfo.songmid = String(music.id);
    }
    // The legacy Huibq adapter selects hash whenever it is not null,
    // including an empty string. Migu search results can expose hash=''
    // alongside a valid copyrightId, producing /url/mg//320k (HTTP 404).
    // Use the authoritative Migu copyright ID for that missing field only.
    if (source === 'mg' && !String(musicInfo.hash == null ? '' : musicInfo.hash).trim()) {
      var miguId = musicInfo.copyrightId || musicInfo.copyright_id ||
        musicInfo.songmid || musicInfo.id;
      if (miguId != null && String(miguId)) musicInfo.hash = String(miguId);
    }
    musicInfo.name = musicInfo.name || '';
    musicInfo.singer = musicInfo.singer || '';
    return musicInfo;
  }

  function getDurationSeconds(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') {
      var numeric = Number(value);
      if (!isFinite(numeric) || numeric <= 0) return 0;
      return numeric > 10000 ? numeric / 1000 : numeric;
    }

    var text = String(value).replace(/^\s+|\s+$/g, '');
    if (!text) return 0;
    if (text.indexOf(':') >= 0) {
      var parts = text.split(':');
      var total = 0;
      for (var i = 0; i < parts.length; i += 1) {
        var part = Number(parts[i]);
        if (!isFinite(part) || part < 0) return 0;
        total = total * 60 + part;
      }
      return total;
    }

    var plain = Number(text);
    if (!isFinite(plain) || plain <= 0) return 0;
    return plain > 10000 ? plain / 1000 : plain;
  }

  function getExpectedDurationSeconds(music) {
    var info = music || {};
    var candidates = [
      info.interval,
      info.duration,
      info.durationMs,
      info.length,
      info.raw && info.raw.interval,
      info.raw && info.raw.duration
    ];

    for (var i = 0; i < candidates.length; i += 1) {
      var seconds = getDurationSeconds(candidates[i]);
      if (seconds > 0) return seconds;
    }
    return 0;
  }

  function isSuspiciousPlaybackDuration(actualSeconds, expectedSeconds) {
    var actual = Number(actualSeconds);
    var expected = Number(expectedSeconds);
    if (!isFinite(actual) || actual <= 0) return false;

    // Some error/protection endpoints return a valid audio file (often a
    // short spoken prompt) instead of an HTTP/media error. When the search
    // result has no trusted duration, a sub-15-second file is not treated as
    // a playable song and must go through resolver fallback first.
    if (!isFinite(expected) || expected <= 0) {
      return actual < MIN_UNKNOWN_MEDIA_DURATION_SECONDS;
    }

    if (expected >= 120) return actual < Math.max(30, expected * 0.45);
    if (expected >= 60) return actual < Math.max(20, expected * 0.45);
    if (expected >= 30) return actual < Math.max(15, expected * 0.40);
    return actual < Math.max(8, expected * 0.30);
  }

  function isSuspiciousPlaybackEnd(currentSeconds, expectedSeconds) {
    var current = Number(currentSeconds);
    var expected = Number(expectedSeconds);
    if (!isFinite(current) || current <= 0) return true;
    if (!isFinite(expected) || expected <= 0) return current < 12;
    if (expected >= 120) return current < Math.max(30, expected * 0.45);
    if (expected >= 60) return current < Math.max(20, expected * 0.45);
    if (expected >= 30) return current < Math.max(15, expected * 0.40);
    return current < Math.max(8, expected * 0.30);
  }

  function useResolvedUrl(
    url,
    quality,
    token,
    music,
    source,
    musicInfo,
    settings,
    viaLabel,
    viaProvider,
    forceProxy
  ) {
    if (token !== playbackToken) return;

    var audio = document.getElementById('audio');
    var playableUrl = buildPlayableUrl(url, forceProxy === true);
    if (playbackState && playbackState.confirmTimer) {
      try { global.clearTimeout(playbackState.confirmTimer); } catch (e) {}
      playbackState.confirmTimer = null;
    }
    playbackState.waitingForAudio = true;
    playbackState.url = playableUrl;
    playbackState.sourceUrl = url;
    playbackState.transport = playableUrl === String(url || '') ? 'direct' : 'proxy';
    playbackState.lastForceProxy = forceProxy === true;

    playbackState.quality = quality;
    playbackState.resolver = viaLabel || 'LX source';
    playbackState.resolverProvider = viaProvider || 'lx-source';
    playbackState.expectedDuration = getExpectedDurationSeconds(music);

    var playRequested = false;

    function startAudioPlayback() {
      if (playRequested) return;
      if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
      playRequested = true;

      try {
        var playResult = audio.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(function () {
            if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
            if (audio.error && settings.autoFallback) {
              playRequested = false;
              handleAudioError(token, playableUrl);
              return;
            }
            setStatus(
              '已验证 ' + escapeHtml(quality) + ' 播放地址，但浏览器拒绝自动播放。可点击播放器继续播放。',
              'warn'
            );
          });
        }
      } catch (e) {
        if (audio.error && settings.autoFallback) {
          playRequested = false;
          handleAudioError(token, playableUrl);
        } else {
          setStatus(
            '已验证 ' + escapeHtml(quality) + ' 播放地址，但浏览器未能自动播放。可点击播放器继续播放。',
            'warn'
          );
        }
      }
    }

    audio.onerror = function () {
      handleAudioError(token, playableUrl);
    };
    audio.onplaying = function () {
      handleAudioPlaying(token, playableUrl);
    };
    audio.ontimeupdate = function () {
      handleAudioPlaying(token, playableUrl);
    };
    audio.onloadedmetadata = function () {
      if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
      var duration = Number(audio.duration || 0);
      if (isSuspiciousPlaybackDuration(duration, playbackState.expectedDuration)) {
        setStatus(
          '返回的 ' + escapeHtml(quality) + ' 地址疑似为错误/短音频（' +
          Math.round(duration) + ' 秒），尚未开始播放，正在自动更换解析器……',
          'warn'
        );
        return handleAudioError(token, playableUrl);
      }

      // Never start audible playback until metadata has been validated.
      startAudioPlayback();
    };
    audio.onended = function () {
      if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;

      var duration = Number(audio.duration || 0);
      var currentTime = Number(audio.currentTime || 0);
      if (playbackState.waitingForAudio) {
        setStatus(
          '媒体连接已结束，但尚未产生真实播放进度，正在自动更换解析器……',
          'warn'
        );
        handleAudioError(token, playableUrl);
        return;
      }
      if (playbackState.playing &&
          (isSuspiciousPlaybackDuration(duration, playbackState.expectedDuration) ||
           isSuspiciousPlaybackEnd(currentTime, playbackState.expectedDuration))) {
        setStatus(
          '播放在 ' + Math.round(currentTime) + ' 秒提前结束，疑似为错误/短音频，正在自动更换解析器……',
          'warn'
        );
        handleAudioError(token, playableUrl);
        return;
      }

      if (playbackState.playing) {
        playbackState.playing = false;
        playbackState.waitingForAudio = false;
        playNextQueued();
      }
    };
    audio.preload = 'auto';
    audio.src = playableUrl;
    if (typeof audio.load === 'function') audio.load();

    // Start the real-media connection timeout when the URL is attached, not
    // only after a "playing" event. A stalled CDN can stop at loadstart forever
    // and otherwise bypass the fallback path completely.
    clearPlaybackConfirmTimer(playbackState);
    playbackState.confirmTimer = global.setTimeout(function () {
      if (
        token !== playbackToken ||
        !playbackState ||
        playbackState.token !== token ||
        playbackState.url !== playableUrl ||
        !playbackState.waitingForAudio
      ) return;

      playbackState.confirmTimer = null;
      if (confirmAudioPlayback(token, playableUrl)) return;

      setStatus(
        '媒体连接超过 ' + Math.round(PLAYBACK_CONNECT_TIMEOUT_MS / 1000) +
        ' 秒仍未产生真实播放进度，正在自动更换解析器……',
        'warn'
      );
      handleAudioError(token, playableUrl);
    }, PLAYBACK_CONNECT_TIMEOUT_MS);

    document.getElementById('player-title').innerHTML = escapeHtml(music.name);
    document.getElementById('player-artist').innerHTML = escapeHtml(music.singer);
    setStatus(
      (CHANNEL_NAMES[source] || source.toUpperCase()) +
      ' 已返回 ' + escapeHtml(quality) + ' 播放地址' +
      (viaLabel ? '（' + escapeHtml(viaLabel) + '）' : '') +
      '，正在验证媒体信息。',
      'ready'
    );
  }

  function cancelStaleMiguPlaybackOnSourceChange(active) {
    var state = playbackState;
    if (!state || state.source !== 'mg' || state.token !== playbackToken) return;
    var currentId = String(active && (active.id || active.url) || '');
    if (String(state.activeSourceId || '') === currentId) return;
    clearMiguPlaybackDeadline(state);
    clearPlaybackConfirmTimer(state);
    playbackToken += 1;
    state.waitingForAudio = false;
    state.playing = false;
    var audio = document.getElementById('audio');
    if (!audio) return;
    try { audio.pause(); } catch (e) {}
    audio.onerror = null;
    audio.onplaying = null;
    audio.ontimeupdate = null;
    audio.onloadedmetadata = null;
    audio.onended = null;
    try { audio.removeAttribute('src'); } catch (e) {}
    try { if (typeof audio.load === 'function') audio.load(); } catch (e) {}
  }

  function clearMiguPlaybackDeadline(state) {
    if (!state || !state.miguDeadlineTimer) return;
    try { global.clearTimeout(state.miguDeadlineTimer); } catch (e) {}
    state.miguDeadlineTimer = null;
  }

  function concludeMiguUnavailable(token) {
    var state = playbackState;
    if (!state || state.token !== token || playbackToken !== token) return;
    clearMiguPlaybackDeadline(state);
    state.waitingForAudio = false;
    state.playing = false;
    setStatus(unavailablePlaybackMessage('mg'), 'fail');
  }

  function armMiguPlaybackDeadline(state) {
    if (!state || state.source !== 'mg') return;
    var token = state.token;
    clearMiguPlaybackDeadline(state);
    state.miguDeadlineTimer = global.setTimeout(function () {
      if (playbackState !== state || playbackToken !== token || state.playing) return;
      clearMiguPlaybackDeadline(state);
      clearPlaybackConfirmTimer(state);
      // Invalidate every pending LX-source/native/fallback callback. A stale
      // audio URL must never start after this attempt has finished.
      playbackToken += 1;
      state.waitingForAudio = false;
      state.playing = false;
      var audio = document.getElementById('audio');
      if (audio) {
        try { audio.pause(); } catch (e) {}
        audio.onerror = null;
        audio.onplaying = null;
        audio.ontimeupdate = null;
        audio.onloadedmetadata = null;
        audio.onended = null;
        try { audio.removeAttribute('src'); } catch (e) {}
        try { if (typeof audio.load === 'function') audio.load(); } catch (e) {}
      }
      setStatus(
        '咪咕播放已等待 ' + Math.round(MIGU_PLAYBACK_MAX_WAIT_MS / 1000) +
        ' 秒，仍未成功开始播放。已停止本次等待；可稍后重试或尝试其他歌曲。',
        'fail'
      );
    }, MIGU_PLAYBACK_MAX_WAIT_MS);
  }

  var SOURCE_RESOLVE_TIMEOUT_MS = 8000;

  function requestQuality(music, source, musicInfo, plan, index, token) {
    var active = global.LXSourceManager.getActive();
    var settings = getPlaySettings();
    if (!active || !active.runtime || token !== playbackToken) return;

    var quality = plan[index];
    playbackState.index = index;
    playbackState.quality = quality;
    playbackState.waitingForAudio = false;
    playbackState.playing = false;
    playbackState.url = '';
    playbackState.resolveAttemptId = Number(playbackState.resolveAttemptId || 0) + 1;

    var resolveAttemptId = playbackState.resolveAttemptId;
    var settled = false;
    var sourceTimer = null;

    function isCurrentAttempt() {
      return token === playbackToken &&
        playbackState &&
        playbackState.token === token &&
        playbackState.resolveAttemptId === resolveAttemptId;
    }

    function clearSourceTimer() {
      if (sourceTimer) {
        global.clearTimeout(sourceTimer);
        sourceTimer = null;
      }
    }

    function finishAttempt() {
      if (settled) return false;
      settled = true;
      clearSourceTimer();
      return true;
    }

    function providerLabel(provider) {
      if (provider === 'huibq') return 'Huibq 平台兜底';
      if (provider === 'tune-free') return 'TuneHub 平台兜底';
      if (provider === 'kugou-native') return '酷狗直连兜底';
      if (provider === 'kuwo-native') return '酷我直连兜底';
      if (provider === 'netease-native') return '网易云直连兜底';
      return 'GD Studio 平台兜底';
    }

    function runFallback(reason) {
      if (!isCurrentAttempt() || !finishAttempt()) return;

      if (reason) setStatus(reason, 'warn');

      if (global.LXMusicSearch && typeof global.LXMusicSearch.resolveMusicUrl === 'function') {
        return global.LXMusicSearch.resolveMusicUrl(
          source,
          musicInfo,
          quality,
          function (fallbackErr, fallbackResult) {
            if (
              token !== playbackToken ||
              !playbackState ||
              playbackState.resolveAttemptId !== resolveAttemptId
            ) return;

            if (!fallbackErr && fallbackResult && fallbackResult.url) {
              return useResolvedUrl(
                fallbackResult.url,
                quality,
                token,
                music,
                source,
                musicInfo,
                settings,
                providerLabel(fallbackResult.provider),
                fallbackResult.provider
              );
            }

            if (settings.autoFallback && index + 1 < plan.length) {
              return requestQuality(music, source, musicInfo, plan, index + 1, token);
            }

            if (source === 'mg') return concludeMiguUnavailable(token);
            return setStatus(
              'musicUrl 备用解析失败（' + escapeHtml(quality) + '）：'
              + escapeHtml(
                (fallbackErr && (fallbackErr.message || fallbackErr))
                || '没有可用地址'
              ),
              'fail'
            );
          },
          { skipProvider: '' }
        );
      }

      if (settings.autoFallback && index + 1 < plan.length) {
        return requestQuality(music, source, musicInfo, plan, index + 1, token);
      }

      if (source === 'mg') return concludeMiguUnavailable(token);
      return setStatus('当前音质无法播放，且没有可用的备用解析器。', 'fail');
    }

    setStatus(
      (index === 0 ? '正在请求' : '当前音质失败，正在自动切换')
      + ' ' + escapeHtml(quality) + '：' + escapeHtml(music.name) + '……'
    );

    // Flower's imported LX source is authoritative for a Flower track.
    // Do not race native/aggregate resolvers against it: an independently
    // resolved URL can be stale or protected even when the exact Flower result
    // is playable in LX Music. The timeout below still falls back to the same
    // channel's native resolver when the Flower source cannot respond.
    sourceTimer = global.setTimeout(function () {
      if (!isCurrentAttempt() || settled) return;
      runFallback(
        '原始音源解析超过 ' + Math.round(SOURCE_RESOLVE_TIMEOUT_MS / 1000)
        + ' 秒，正在切换备用解析器……'
      );
    }, SOURCE_RESOLVE_TIMEOUT_MS);

    global.LXSourceManager.requestAction(
      source,
      'musicUrl',
      {
        type: quality,
        musicInfo: musicInfo
      },
      function (err, result) {
        if (!isCurrentAttempt() || settled) return;

        if (err) {
          return runFallback(
            '原始音源解析失败，正在切换备用解析器……'
          );
        }

        var url = typeof result === 'string'
          ? result
          : (result && (result.url || result.result));
        if (url != null) url = String(url).replace(/^\\s+|\\s+$/g, '');

        if (!url || !/^https?:/i.test(url)) {
          return runFallback(
            '原始音源返回的播放地址无效，正在切换备用解析器……'
          );
        }

        if (
          global.LXMusicSearch &&
          typeof global.LXMusicSearch.isPlayableUrlForSource === 'function' &&
          !global.LXMusicSearch.isPlayableUrlForSource(source, url)
        ) {
          return runFallback(
            '原始音源返回了其他渠道的播放地址，正在使用当前渠道解析器……'
          );
        }

        if (!finishAttempt()) return;

        return useResolvedUrl(
          url,
          quality,
          token,
          music,
          source,
          musicInfo,
          settings,
          null,
          'lx-source'
        );
      }
    );
  }

  function startPlayback(music, source) {
    var active = global.LXSourceManager.getActive();
    if (!active || !active.runtime || !active.inited) {
      setStatus('请先导入并初始化 LX 音源。', 'fail');
      return;
    }

    // A new click owns a new deadline; the previous track must not be able
    // to time out and overwrite its status.
    clearMiguPlaybackDeadline(playbackState);
    var audio = document.getElementById('audio');
    if (audio) {
      audio.pause();
      audio.onerror = null;
      audio.onplaying = null;
      // Never retain the previous track while a new source resolver is
      // running. This prevents stale media URLs from appearing as a new
      // channel's playback attempt.
      try { audio.removeAttribute('src'); } catch (e) {}
      try { if (typeof audio.load === 'function') audio.load(); } catch (e) {}
    }

    var plan = getQualityPlan(active, source);
    if (!plan.length) plan = ['128k'];

    playbackToken += 1;
    var token = playbackToken;
    playbackState = {
      token: token,
      music: music,
      source: source,
      plan: plan,
      index: 0,
      quality: plan[0],
      url: '',
      waitingForAudio: false,
      playing: false,
      transport: '',
      sourceUrl: '',
      directProxyRetry: false,
      confirmTimer: null,
      miguDeadlineTimer: null,
      activeSourceId: String(active.id || active.url || '')
    };

    armMiguPlaybackDeadline(playbackState);
    requestQuality(music, source, buildMusicInfo(music, source), plan, 0, token);
  }

  function clearPlaybackConfirmTimer(state) {
    if (!state || !state.confirmTimer) return;
    try { global.clearTimeout(state.confirmTimer); } catch (e) {}
    state.confirmTimer = null;
  }

  function confirmAudioPlayback(expectedToken, expectedUrl) {
    var state = playbackState;
    var audio = document.getElementById('audio');
    if (!state || state.token !== playbackToken || !state.waitingForAudio || !audio) return false;
    if (expectedToken != null && expectedToken !== state.token) return false;
    if (expectedUrl && state.url !== expectedUrl) return false;

    var currentTime = Number(audio.currentTime || 0);
    if (audio.readyState < 2 || currentTime < MIN_CONFIRMED_PLAYBACK_PROGRESS_SECONDS) {
      return false;
    }

    clearPlaybackConfirmTimer(state);
    clearMiguPlaybackDeadline(state);
    state.waitingForAudio = false;
    state.playing = true;
    if (global.LXMusicLibrary) {
      global.LXMusicLibrary.addHistory(state.music);
      renderLibrary();
    }
    setStatus(
      (CHANNEL_NAMES[state.source] || state.source.toUpperCase()) +
      ' 正在播放 · ' + escapeHtml(state.quality),
      'ready'
    );
    loadLyricsForState(state);
    return true;
  }

  function handleAudioPlaying(expectedToken, expectedUrl) {
    var state = playbackState;
    var audio = document.getElementById('audio');
    if (!state || state.token !== playbackToken || !state.waitingForAudio || !audio) return;
    if (expectedToken != null && expectedToken !== state.token) return;
    if (expectedUrl && state.url !== expectedUrl) return;

    if (isSuspiciousPlaybackDuration(
      Number(audio.duration || 0),
      state.expectedDuration
    )) {
      return handleAudioError(state.token, state.url);
    }

    if (confirmAudioPlayback(expectedToken, expectedUrl)) return;

    if (!state.confirmTimer) {
      state.confirmTimer = global.setTimeout(function () {
        if (!playbackState || playbackState.token !== state.token) return;
        state.confirmTimer = null;
        var currentTime = Number(audio.currentTime || 0);
        if (currentTime >= MIN_CONFIRMED_PLAYBACK_PROGRESS_SECONDS && audio.readyState >= 2) {
          confirmAudioPlayback(state.token, state.url);
          return;
        }
        setStatus(
          '媒体已连接但播放进度没有增长，正在自动更换解析器……',
          'warn'
        );
        handleAudioError(state.token, state.url);
      }, PLAYBACK_CONFIRM_TIMEOUT_MS);
    }
  }

  function handleAudioError(expectedToken, expectedUrl) {
    var state = playbackState;
    var settings = getPlaySettings();
    if (!state || state.token !== playbackToken) return;
    if (!state.waitingForAudio && !state.playing) return;
    if (expectedToken != null && expectedToken !== state.token) return;
    if (expectedUrl && state.url !== expectedUrl) return;
    clearPlaybackConfirmTimer(state);
    state.waitingForAudio = false;
    state.playing = false;

    // Stop and detach the failed stream before resolving a replacement. This
    // prevents a short prompt/error file from continuing to play while the
    // fallback resolver is being queried.
    var currentAudio = document.getElementById('audio');
    if (currentAudio) {
      try { currentAudio.pause(); } catch (e) {}
      try { currentAudio.removeAttribute('src'); } catch (e) {}
      try { if (typeof currentAudio.load === 'function') currentAudio.load(); } catch (e) {}
    }

    var failedProvider = state.resolverProvider;
    var failedQuality = state.quality;

    // If direct HTTPS media stalls, retry the exact same signed URL through
    // the project proxy once before selecting a different resolver.
    if (
      state.transport === 'direct' &&
      !state.directProxyRetry &&
      state.sourceUrl &&
      /^https?:/i.test(String(state.sourceUrl)) &&
      global.location &&
      String(state.sourceUrl).indexOf(String(global.location.origin || '')) !== 0
    ) {
      state.directProxyRetry = true;
      return useResolvedUrl(
        state.sourceUrl,
        failedQuality,
        state.token,
        state.music,
        state.source,
        buildMusicInfo(state.music, state.source),
        settings,
        state.resolver,
        failedProvider,
        true
      );
    }

    if (settings.autoFallback && global.LXMusicSearch &&
        typeof global.LXMusicSearch.resolveMusicUrl === 'function') {
      return global.LXMusicSearch.resolveMusicUrl(
        state.source,
        buildMusicInfo(state.music, state.source),
        failedQuality,
        function (resolverErr, resolverResult) {
          if (state.token !== playbackToken) return;
          if (!resolverErr && resolverResult && resolverResult.url &&
              String(resolverResult.provider || '') !== failedProvider) {
            var resolverLabel = 'GD Studio 平台兜底';
            if (resolverResult.provider === 'huibq') resolverLabel = 'Huibq 平台兜底';
            else if (resolverResult.provider === 'tune-free') resolverLabel = 'TuneHub 平台兜底';
            else if (resolverResult.provider === 'kugou-native') resolverLabel = '酷狗直连兜底';
            else if (resolverResult.provider === 'kuwo-native') resolverLabel = '酷我直连兜底';
            else if (resolverResult.provider === 'netease-native') resolverLabel = '网易云直连兜底';
            return useResolvedUrl(
              resolverResult.url,
              failedQuality,
              state.token,
              state.music,
              state.source,
              buildMusicInfo(state.music, state.source),
              settings,
              resolverLabel,
              resolverResult.provider
            );
          }

          if (settings.autoFallback && state.index + 1 < state.plan.length) {
            var nextIndex = state.index + 1;
            setStatus(
              '当前音质 ' + escapeHtml(state.quality) +
              ' 无法播放，自动切换到 ' + escapeHtml(state.plan[nextIndex]) + '……',
              'warn'
            );
            requestQuality(
              state.music,
              state.source,
              buildMusicInfo(state.music, state.source),
              state.plan,
              nextIndex,
              state.token
            );
            return;
          }

          var resolverAudio = document.getElementById('audio');
          var resolverErrorCode = resolverAudio && resolverAudio.error && resolverAudio.error.code
            ? '（错误码 ' + resolverAudio.error.code + '）'
            : '';
          if (state.source === 'mg') {
            concludeMiguUnavailable(state.token);
          } else {
            setStatus('当前音质无法播放，备用解析器也无法提供可用地址' + resolverErrorCode + '。', 'fail');
          }
        },
        { skipProvider: failedProvider === 'lx-source' ? '' : failedProvider }
      );
    }

    if (settings.autoFallback && state.index + 1 < state.plan.length) {
      var nextIndex = state.index + 1;
      setStatus(
        '当前音质 ' + escapeHtml(state.quality) +
        ' 无法播放，自动切换到 ' + escapeHtml(state.plan[nextIndex]) + '……',
        'warn'
      );
      requestQuality(
        state.music,
        state.source,
        buildMusicInfo(state.music, state.source),
        state.plan,
        nextIndex,
        state.token
      );
      return;
    }

    var audio = document.getElementById('audio');
    if (state.source === 'mg') return concludeMiguUnavailable(state.token);
    var errorCode = audio.error && audio.error.code ? '（错误码 ' + audio.error.code + '）' : '';
    setStatus('当前音质无法播放，且没有可用的更低音质可切换' + errorCode + '。', 'fail');
  }



  function testMusic(music, addToQueue) {
    var active = global.LXSourceManager.getActive();
    var supported = getSupportedChannels();
    if (!active || !active.runtime || !active.inited) {
      setStatus('请先导入并初始化 LX 音源。', 'fail');
      return;
    }
    if (!selectedChannel || supported.indexOf(selectedChannel) < 0) {
      setStatus('当前音源没有可用的播放渠道。', 'fail');
      return;
    }

    var source = music && music.source ? String(music.source).toLowerCase() : selectedChannel;
    if (source !== selectedChannel) {
      setStatus('该歌曲属于 ' + escapeHtml(CHANNEL_NAMES[source] || source.toUpperCase()) +
        '，当前选择的是 ' + escapeHtml(CHANNEL_NAMES[selectedChannel] || selectedChannel.toUpperCase()) +
        '。请重新搜索。', 'fail');
      return;
    }

    if (addToQueue !== false && global.LXMusicLibrary) {
      global.LXMusicLibrary.addQueue(music);
      renderLibrary();
    }
    startPlayback(music, source);
  }

  function playQueuedOffset(offset) {
    if (!global.LXMusicLibrary || !playbackState) return;
    var queue = global.LXMusicLibrary.snapshot().queue;
    var currentKey = musicKey(playbackState.music);
    var currentIndex = -1;

    for (var i = 0; i < queue.length; i += 1) {
      if (musicKey(queue[i]) === currentKey) {
        currentIndex = i;
        break;
      }
    }

    if (currentIndex < 0) {
      setStatus('当前歌曲不在播放队列中。', 'warn');
      return;
    }

    var targetIndex = currentIndex + offset;
    if (targetIndex < 0) {
      setStatus('已经是播放队列第一首。', 'ready');
      return;
    }
    if (targetIndex >= queue.length) {
      setStatus('已经是播放队列最后一首。', 'ready');
      return;
    }
    playLibraryMusic(queue[targetIndex]);
  }

  function playNextQueued() {
    playQueuedOffset(1);
  }

  function bindInstallButton() {
    var installButton = document.getElementById('install-btn');
    if (!installButton) return;
    installButton.onclick = function () {
      var urlInput = document.getElementById('source-url');
      var url = urlInput ? urlInput.value.replace(/^\s+|\s+$/g, '') : '';
      if (!/^https?:\/\//i.test(url)) {
        setStatus('请输入 HTTP / HTTPS 的 LX 音源地址。', 'fail');
        return;
      }

      setStatus('正在读取原始 LX 音源……');
      installButton.disabled = true;
      setCheck('check-inited', 'pending');

      global.LXSourceManager.installFromUrl(url, function (err, item) {
        installButton.disabled = false;
        if (err) {
          setStatus('导入失败：' + escapeHtml(err.message || err), 'fail');
          setCheck('check-inited', 'fail');
          return;
        }
        setCheck('check-storage', 'ok');
        var transportText = item.transport === 'proxy' ? '项目代理' : '直连';
        setStatus('已保存原始音源代码：' + escapeHtml(item.name) + '（导入通道：' + transportText + '）', 'ready');
      });
    };
  }

  function bind() {
    bindInstallButton();
    statusEl = document.getElementById('status');
    listEl = document.getElementById('source-list');
    countEl = document.getElementById('source-count');
    runtimeEl = document.getElementById('runtime-info');
    resultsEl = document.getElementById('search-results');
    channelListEl = document.getElementById('channel-list');
    qualitySummaryEl = document.getElementById('quality-summary');
    lyricsStatusEl = document.getElementById('lyrics-status');
    lyricsTitleEl = document.getElementById('lyrics-title');
    lyricsLinesEl = document.getElementById('lyrics-lines');
    lyricsRefreshBtn = document.getElementById('lyrics-refresh-btn');
    queueListEl = document.getElementById('queue-list');
    favoriteListEl = document.getElementById('favorite-list');
    historyListEl = document.getElementById('history-list');

    runtimeEl.innerHTML =
      'factory: ' + (typeof global.createLXRuntime) + '\n' +
      'version: 2.0.0\n' +
      'env: desktop\n' +
      'EVENT_NAMES: inited, request, updateAlert, openDevTools\n' +
      'buffer.from: ' + (global.createLXRuntime ? typeof global.createLXRuntime({}).utils.buffer.from : 'n/a') + '\n' +
      'crypto.md5: ' + (global.createLXRuntime ? typeof global.createLXRuntime({}).utils.crypto.md5 : 'n/a');

    setCheck('check-runtime', 'ok');
    renderChannelSelectors();

    var audio = document.getElementById('audio');
    if (audio) {
      audio.onerror = function () {
        var state = playbackState;
        if (state) handleAudioError(state.token, state.url);
      };
      audio.onplaying = function () {
        var state = playbackState;
        if (state) handleAudioPlaying(state.token, state.url);
      };
      audio.onended = function () {
        playNextQueued();
      };
      audio.ontimeupdate = function () {
        syncLyrics();
      };
    }

    document.getElementById('verified-install-btn').onclick = function () {
      document.getElementById('source-url').value =
        'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js';
      setStatus('正在载入内置已验证 Huibq v1.2.0……');
      var button = document.getElementById('verified-install-btn');
      button.disabled = true;
      setCheck('check-inited', 'pending');
      global.LXSourceManager.installBuiltinHuibq(function (err, item) {
        button.disabled = false;
        if (err) {
          setStatus('Huibq 导入失败：' + escapeHtml(err.message || err), 'fail');
          setCheck('check-inited', 'fail');
          return;
        }
        setCheck('check-storage', 'ok');
        setStatus('已导入并初始化 Huibq：' + escapeHtml(item.name) + ' v' +
          escapeHtml(item.version || '1.2.0') + '（内置 ES5 适配器）', 'ready');
      });
    };

    document.getElementById('sixyin-install-btn').onclick = function () {
      document.getElementById('source-url').value =
        'https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js';
      document.getElementById('install-btn').click();
    };

    document.getElementById('clear-btn').onclick = function () {
      global.LXSourceManager.clear();
      setCheck('check-storage', 'pending');
      setCheck('check-inited', 'pending');
      setStatus('已清空本地音源。');
    };

    document.getElementById('clear-queue-btn').onclick = function () {
      if (global.LXMusicLibrary) {
        global.LXMusicLibrary.clearQueue();
        renderLibrary();
        setStatus('已清空播放队列。', 'ready');
      }
    };

    document.getElementById('clear-favorites-btn').onclick = function () {
      if (!global.LXMusicLibrary) return;
      var data = global.LXMusicLibrary.snapshot();
      for (var fi = data.favorites.length - 1; fi >= 0; fi -= 1) {
        global.LXMusicLibrary.toggleFavorite(data.favorites[fi]);
      }
      renderLibrary();
      setStatus('已清空收藏。', 'ready');
    };

    document.getElementById('clear-history-btn').onclick = function () {
      if (global.LXMusicLibrary) {
        global.LXMusicLibrary.clearHistory();
        renderLibrary();
        setStatus('已清空最近播放记录。', 'ready');
      }
    };

    if (lyricsRefreshBtn) {
      lyricsRefreshBtn.onclick = function () {
        if (!playbackState || !playbackState.music) {
          setLyricsStatus('请先播放一首歌曲。', 'warn');
          return;
        }
        loadLyricsForState(playbackState);
      };
    }

    document.getElementById('prev-track-btn').onclick = function () {
      playQueuedOffset(-1);
    };

    document.getElementById('next-track-btn').onclick = function () {
      playQueuedOffset(1);
    };

    document.getElementById('search-btn').onclick = function () {
      var keyword = document.getElementById('search-input').value.replace(/^\s+|\s+$/g, '');
      if (!keyword) return setStatus('请输入搜索词。', 'fail');
      searchAndRender(keyword);
    };

    document.getElementById('quick-test-btn').onclick = function () {
      var active = global.LXSourceManager.getActive();
      if (!active || !active.runtime || !active.inited) {
        return setStatus('请先导入并初始化 LX 音源。', 'fail');
      }
      if (!selectedChannel) {
        return setStatus('当前音源没有可用的播放渠道。', 'fail');
      }

      var channel = selectedChannel;
      var token = ++searchToken;
      global.__LXLastSearchResults = [];
      setStatus('正在按 ' + escapeHtml(CHANNEL_NAMES[channel] || channel.toUpperCase()) +
        ' 搜索「成都」……');
      resultsEl.innerHTML = '';
      global.LXMusicSearch.search(channel, '成都', 1, 3, function (err, result) {
        if (token !== searchToken || channel !== selectedChannel) return;
        if (err) return setStatus('搜索「成都」失败：' + escapeHtml(err.message || err), 'fail');
        if (!result.list || !result.list.length) return setStatus('搜索「成都」没有返回结果。', 'fail');

        global.__LXLastSearchResults = result.list.slice();
        renderSearchResults(result.list);
        setStatus('已找到「成都」结果，正在测试第一首。', 'ready');
        testMusic(result.list[0], true);
      });
    };


    var versionCurrentEl = document.getElementById('version-current');
    var versionDateEl = document.getElementById('version-release-date');
    var versionStatusEl = document.getElementById('version-status');
    var checkUpdateBtn = document.getElementById('check-update-btn');

    if (global.OnlyTestingMusicVersion) {
      var currentVersionText = 'v' + global.OnlyTestingMusicVersion.version;
      if (versionCurrentEl) versionCurrentEl.innerHTML = currentVersionText;
      var topVersionEl = document.getElementById('app-version');
      if (topVersionEl) topVersionEl.innerHTML = currentVersionText;
      if (versionDateEl) versionDateEl.innerHTML = global.OnlyTestingMusicVersion.releaseDate || '';
    }

    if (checkUpdateBtn && global.OnlyTestingMusicVersionCheck) {
      checkUpdateBtn.onclick = function () {
        checkUpdateBtn.disabled = true;
        if (versionStatusEl) {
          versionStatusEl.className = 'version-status';
          versionStatusEl.innerHTML = '正在检查……';
        }
        global.OnlyTestingMusicVersionCheck.checkLatest(function (err, result) {
          checkUpdateBtn.disabled = false;
          if (err) {
            if (versionStatusEl) {
              versionStatusEl.className = 'version-status fail';
              versionStatusEl.innerHTML = '无法检查：' + escapeHtml(err.message || err);
            }
            return;
          }
          if (result.compare === 0) {
            if (versionStatusEl) {
              versionStatusEl.className = 'version-status ready';
              versionStatusEl.innerHTML = '已是最新版 v' + escapeHtml(result.latestVersion);
            }
          } else if (result.compare < 0) {
            if (versionStatusEl) {
              versionStatusEl.className = 'version-status update';
              versionStatusEl.innerHTML = '发现新版本 v' + escapeHtml(result.latestVersion);
            }
          } else {
            if (versionStatusEl) {
              versionStatusEl.className = 'version-status ready';
              versionStatusEl.innerHTML = '当前版本较新 v' + escapeHtml(result.currentVersion);
            }
          }
        });
      };
    }

    renderSources(global.LXSourceManager.getSources());
    clearLyrics();
    renderLibrary();
    if (global.LXMusicLibrary) global.LXMusicLibrary.onChange(renderLibrary);
  }

  function searchAndRender(keyword) {
    if (!selectedChannel) return setStatus('请先选择播放渠道。', 'fail');

    var channel = selectedChannel;
    var token = ++searchToken;

    setStatus('正在按 ' + escapeHtml(CHANNEL_NAMES[channel] || channel.toUpperCase()) + ' 搜索「' + escapeHtml(keyword) + '」……');
    resultsEl.innerHTML = '';
    global.__LXLastSearchResults = [];

    global.LXMusicSearch.search(channel, keyword, 1, 20, function (err, result) {
      if (token !== searchToken || channel !== selectedChannel) return;

      if (err) return setStatus('搜索失败：' + escapeHtml(err.message || err), 'fail');
      setStatus('搜索完成：' + result.list.length + ' 条结果。', 'ready');
      global.__LXLastSearchResults = result.list.slice();
      renderSearchResults(result.list);
    });
  }

  function renderSearchResults(items) {
    resultsEl.innerHTML = '';
    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var row = document.createElement('div');
      row.className = 'search-row';
      row.innerHTML = '<b>' + escapeHtml(item.name) + '</b> <span>' + escapeHtml(item.singer) + '</span>' +
        '<small class="search-source">' + escapeHtml(CHANNEL_NAMES[item.source] || item.source || '') + '</small>';
      var actions = document.createElement('div');
      actions.className = 'search-actions';

      var playButton = document.createElement('button');
      playButton.type = 'button';
      playButton.innerHTML = '解析并播放';
      playButton.onclick = (function (music) {
        return function () { testMusic(music, true); };
      })(item);
      actions.appendChild(playButton);

      var queueButton = document.createElement('button');
      queueButton.type = 'button';
      queueButton.className = 'secondary';
      queueButton.innerHTML = '加入队列';
      queueButton.onclick = (function (music) {
        return function () {
          if (global.LXMusicLibrary) global.LXMusicLibrary.addQueue(music);
          renderLibrary();
          setStatus('已加入播放队列：' + escapeHtml(music.name), 'ready');
        };
      })(item);
      actions.appendChild(queueButton);

      var favoriteButton = document.createElement('button');
      favoriteButton.type = 'button';
      favoriteButton.className = 'secondary';
      favoriteButton.innerHTML = global.LXMusicLibrary && global.LXMusicLibrary.isFavorite(item) ? '取消收藏' : '收藏';
      favoriteButton.onclick = (function (music) {
        return function () {
          if (global.LXMusicLibrary) global.LXMusicLibrary.toggleFavorite(music);
          renderLibrary();
          renderSearchResults(global.__LXLastSearchResults || []);
        };
      })(item);
      actions.appendChild(favoriteButton);

      row.appendChild(actions);
      resultsEl.appendChild(row);
    }
  }

  global.OnlyTestingMusicApp = {
    renderSources: renderSources,
    onSourceInited: onSourceInited,
    playMusic: function (music) {
      if (!music) return;
      var source = music.source ? String(music.source).toLowerCase() : '';
      if (source) selectedChannel = source;
      renderChannelSelectors();
      testMusic(music, true);
    },
    addToQueue: function (music) {
      if (!music || !global.LXMusicLibrary) return;
      global.LXMusicLibrary.addQueue(music);
      renderLibrary();
    },
    renderLibraryListForExternal: renderLibraryList
  };

  var appStarted = false;

  function startApp() {
    if (appStarted) return;
    appStarted = true;
    bind();
    global.LXSourceManager.init();
    if (global.LXSourceManager.getSources().length) setCheck('check-storage', 'ok');
  }

  // app.js is loaded after the page controls, so initialize immediately.
  // This avoids a window.load race on slow legacy browsers where the user can
  // see and tap the import button before its handler has been bound.
  if (document.getElementById('install-btn')) {
    startApp();
  } else {
    global.addEventListener('DOMContentLoaded', startApp);
    global.addEventListener('load', startApp);
  }
})(window);

// CI trigger marker: no functional change.
