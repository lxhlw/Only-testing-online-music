(function (global) {
  'use strict';

  var statusEl;
  var listEl;
  var countEl;
  var runtimeEl, resultsEl;
  var channelListEl, qualitySummaryEl;
  var selectedChannel = null;
  var playbackState = null;
  var playbackToken = 0;

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

    for (var i = 0; i < items.length; i += 1) {
      var item = items[i];
      var box = document.createElement('div');
      box.className = 'source-item';

      var meta = '<div class="source-name">' + escapeHtml(item.name) + '</div>';
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
      activate.innerHTML = '设为当前';
      activate.onclick = (function (sourceItem) {
        return function () {
          global.LXSourceManager.activate(sourceItem.id);
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

  function onSourceInited(item) {
    setCheck('check-inited', 'ok');
    setStatus('音源已执行并发送 inited：<b>' + escapeHtml(item.name) + '</b>', 'ready');
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
    musicInfo.name = musicInfo.name || '';
    musicInfo.singer = musicInfo.singer || '';
    return musicInfo;
  }

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

    setStatus(
      (index === 0 ? '正在请求' : '当前音质失败，正在自动切换') +
      ' ' + escapeHtml(quality) + '：' + escapeHtml(music.name) + '……'
    );

    global.LXSourceManager.requestAction(source, 'musicUrl', {
      type: quality,
      musicInfo: musicInfo
    }, function (err, result) {
      if (token !== playbackToken) return;

      if (err) {
        if (settings.autoFallback && index + 1 < plan.length) {
          return requestQuality(music, source, musicInfo, plan, index + 1, token);
        }
        return setStatus('musicUrl 失败（' + escapeHtml(quality) + '）：' +
          escapeHtml(err.message || err), 'fail');
      }

      var url = typeof result === 'string' ? result : (result && (result.url || result.result));
      if (!url || !/^https?:/i.test(url)) {
        if (settings.autoFallback && index + 1 < plan.length) {
          return requestQuality(music, source, musicInfo, plan, index + 1, token);
        }
        return setStatus('musicUrl 在 ' + escapeHtml(quality) + ' 下返回了无效结果。', 'fail');
      }

      var audio = document.getElementById('audio');
      playbackState.waitingForAudio = true;
      playbackState.quality = quality;
      playbackState.url = url;

      // Drop handlers for the previous media attempt before assigning a new
      // URL. Legacy browsers can dispatch a late error event after src changes.
      audio.onerror = null;
      audio.onplaying = null;
      audio.src = url;
      if (typeof audio.load === 'function') audio.load();

      audio.onerror = function () {
        handleAudioError(token, url);
      };
      audio.onplaying = function () {
        handleAudioPlaying(token, url);
      };

      document.getElementById('player-title').innerHTML = escapeHtml(music.name);
      document.getElementById('player-artist').innerHTML = escapeHtml(music.singer);
      setStatus(
        (CHANNEL_NAMES[source] || source.toUpperCase()) +
        ' 已返回 ' + escapeHtml(quality) + ' 播放地址，正在尝试播放。',
        'ready'
      );

      try {
        var playResult = audio.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(function () {
            if (token !== playbackToken || !playbackState || playbackState.url !== url) return;

            // Decode/not-supported failures can reject play() and may also
            // provide audio.error. Feed those into the same downgrade path.
            if (audio.error && settings.autoFallback) {
              handleAudioError(token, url);
              return;
            }

            // Browser autoplay policy is not a media-quality failure.
            setStatus(
              '已返回 ' + escapeHtml(quality) +
              ' 播放地址，但浏览器拒绝自动播放。可点击播放器播放。',
              'warn'
            );
          });
        }
      } catch (e) {
        if (audio.error && settings.autoFallback) {
          handleAudioError(token, url);
        } else {
          setStatus(
            '已返回 ' + escapeHtml(quality) +
            ' 播放地址，但浏览器未能自动播放。可点击播放器播放。',
            'warn'
          );
        }
      }
    });
  }

  function startPlayback(music, source) {
    var active = global.LXSourceManager.getActive();
    if (!active || !active.runtime || !active.inited) {
      setStatus('请先导入并初始化 LX 音源。', 'fail');
      return;
    }

    var audio = document.getElementById('audio');
    if (audio) {
      audio.pause();
      audio.onerror = null;
      audio.onplaying = null;
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
      waitingForAudio: false
    };

    requestQuality(music, source, buildMusicInfo(music, source), plan, 0, token);
  }

  function handleAudioPlaying(expectedToken, expectedUrl) {
    var state = playbackState;
    if (!state || state.token !== playbackToken || !state.waitingForAudio) return;
    if (expectedToken != null && expectedToken !== state.token) return;
    if (expectedUrl && state.url !== expectedUrl) return;

    state.waitingForAudio = false;
    state.playing = true;
    setStatus(
      (CHANNEL_NAMES[state.source] || state.source.toUpperCase()) +
      ' 正在播放 · ' + escapeHtml(state.quality),
      'ready'
    );
  }

  function handleAudioError(expectedToken, expectedUrl) {
    var state = playbackState;
    var settings = getPlaySettings();
    if (!state || !state.waitingForAudio || state.token !== playbackToken) return;
    if (expectedToken != null && expectedToken !== state.token) return;
    if (expectedUrl && state.url !== expectedUrl) return;
    state.waitingForAudio = false;

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
    var errorCode = audio.error && audio.error.code ? '（错误码 ' + audio.error.code + '）' : '';
    setStatus('当前音质无法播放，且没有可用的更低音质可切换' + errorCode + '。', 'fail');
  }

  function testMusic(music) {
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

    startPlayback(music, source);
  }

  function bind() {
    statusEl = document.getElementById('status');
    listEl = document.getElementById('source-list');
    countEl = document.getElementById('source-count');
    runtimeEl = document.getElementById('runtime-info');
    resultsEl = document.getElementById('search-results');
    channelListEl = document.getElementById('channel-list');
    qualitySummaryEl = document.getElementById('quality-summary');

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
    }

    document.getElementById('install-btn').onclick = function () {
      var url = document.getElementById('source-url').value.replace(/^\s+|\s+$/g, '');
      if (!/^https?:\/\//i.test(url)) {
        setStatus('请输入 HTTP / HTTPS 的 LX 音源地址。', 'fail');
        return;
      }

      setStatus('正在读取原始 LX 音源……');
      document.getElementById('install-btn').disabled = true;
      setCheck('check-inited', 'pending');

      global.LXSourceManager.installFromUrl(url, function (err, item) {
        document.getElementById('install-btn').disabled = false;
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

    document.getElementById('verified-install-btn').onclick = function () {
      document.getElementById('source-url').value =
        'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js';
      document.getElementById('install-btn').click();
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

      setStatus('正在按 ' + escapeHtml(CHANNEL_NAMES[selectedChannel] || selectedChannel.toUpperCase()) +
        ' 搜索「成都」……');
      resultsEl.innerHTML = '';
      global.LXMusicSearch.search(selectedChannel, '成都', 1, 3, function (err, result) {
        if (err) return setStatus('搜索「成都」失败：' + escapeHtml(err.message || err), 'fail');
        if (!result.list || !result.list.length) return setStatus('搜索「成都」没有返回结果。', 'fail');

        global.__LXLastSearchResults = result.list.slice();
        renderSearchResults(result.list);
        setStatus('已找到「成都」结果，正在测试第一首。', 'ready');
        testMusic(result.list[0]);
      });
    };

    renderSources(global.LXSourceManager.getSources());
  }

  function searchAndRender(keyword) {
    if (!selectedChannel) return setStatus('请先选择播放渠道。', 'fail');
    setStatus('正在按 ' + escapeHtml(CHANNEL_NAMES[selectedChannel] || selectedChannel.toUpperCase()) + ' 搜索「' + escapeHtml(keyword) + '」……');
    resultsEl.innerHTML = '';
    global.LXMusicSearch.search(selectedChannel, keyword, 1, 20, function (err, result) {
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
      var button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = '解析并播放';
      button.onclick = (function (music) {
        return function () { testMusic(music); };
      })(item);
      row.appendChild(button);
      resultsEl.appendChild(row);
    }
  }

  global.OnlyTestingMusicApp = {
    renderSources: renderSources,
    onSourceInited: onSourceInited
  };

  global.addEventListener('load', function () {
    bind();
    global.LXSourceManager.init();
    if (global.LXSourceManager.getSources().length) setCheck('check-storage', 'ok');
  });
})(window);

// CI trigger marker: no functional change.
