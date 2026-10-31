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
  var lyricsActiveIndex = -1;
  var selectedChannel = null;
  var playbackState = null;
  // Keep the most recently selected track even when a strict quality check
  // rejects playback. User may change the format and retry that same song.
  var lastRequestedPlayback = null;
  var playlistPlayback = null;
  var shuffleHistory = [];
  var shuffleCursor = -1;
  var playbackToken = 0;
  var MODERN_WEB = true;
  var MODERN_FLOWER_TIMEOUT_MS = 12000;
  var searchToken = 0;
  var songSearchSession = null;
  var songSearchObserver = null;
  var legacyFullResolveNext = false;
  var MIN_UNKNOWN_MEDIA_DURATION_SECONDS = 15;
  var MIN_CONFIRMED_PLAYBACK_PROGRESS_SECONDS = 0.25;
  var PLAYBACK_CONFIRM_TIMEOUT_MS = 3500;
  var PLAYBACK_CONNECT_TIMEOUT_MS = 7000;
  // Android 4.4 Chromium WebView can require touching the native media UI;
  // auto-play from an asynchronous resolver has no valid tap gesture.
  var LEGACY_NATIVE_MEDIA = !MODERN_WEB && /Android 4[.]4(?:[.;\s]|$)/i.test(String(global.navigator && global.navigator.userAgent || ''));
  var legacyPreferDirect = false;
  if (LEGACY_NATIVE_MEDIA) document.documentElement.className += ' legacy-native-media';
  // Only inside the trusted native APK. Keep the working Via HTML5 fallbacks
  // and diagnostic pages unchanged for a standalone old browser.
  var NATIVE_COMPANION = false;
  try { NATIVE_COMPANION = !!(global.LXNativeAudio &&
    typeof global.LXNativeAudio.isAvailable === 'function' &&
    global.LXNativeAudio.isAvailable()); } catch (ignored) {}
  if (NATIVE_COMPANION) document.documentElement.className += ' native-companion';
  // Migu-only budget for a single user-visible play attempt, across all
  // qualities and fallback providers. Do not bound other four channels.
  var MIGU_PLAYBACK_MAX_WAIT_MS = 25000;
  var MIGU_PLAYBACK_PROGRESS_FRESH_MS = 5000;
  var MIGU_PLAYBACK_ESTABLISHED_SECONDS = 3;

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
      // There is exactly one playback LX source in the native APK; exposing
      // 'switch' and 'delete' would just break the working Flower session.
      if (!NATIVE_COMPANION) box.appendChild(buttons);
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
    var sources = active && active.inited && active.sources ? active.sources : {};
    // Search uses platform APIs, not the third-party LX playback script.
    // These two channels must remain available even when a fresh/legacy
    // device has not yet downloaded its default Flower/Huibq scripts.
    supported.push('wy');
    supported.push('mg');
    for (var key in sources) {
      if (!Object.prototype.hasOwnProperty.call(sources, key)) continue;
      var info = sources[key] || {};
      var actions = info.actions || [];
      if ((actions.indexOf('musicUrl') >= 0 || !info.actions) &&
          supported.indexOf(key) < 0) supported.push(key);
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
    if (global.LXPlaySettings) {
      var settings = getPlaySettings();
      // Modern browser: automatic means the best *lossy/MP3-size* quality
      // explicitly declared by this Flower channel, not a hard-coded 128k.
      // Lossless remains a manual selection because it may start more slowly.
      if (MODERN_WEB && settings.qualityMode === 'highest') {
        var preferredMp3=['320k','256k','192k','128k'],best='';
        for(var mp=0;mp<preferredMp3.length&&!best;mp++)
          for(var aq=0;aq<available.length;aq++)
            if(String(available[aq]).toLowerCase()===preferredMp3[mp]){best=available[aq];break;}
        if(best){
          var quick=[best];
          if(settings.autoFallback&&String(best).toLowerCase()!=='128k')
            for(var low=0;low<available.length;low++)
              if(String(available[low]).toLowerCase()==='128k'){quick.push(available[low]);break;}
          return quick;
        }
      }
      if (MODERN_WEB) {
        // A fixed quality MUST be declared by Flower; an absent FLAC 32bit
        // cannot be quietly translated into 128k, even when fallback is on.
        var fixedKey=String(settings.fixedQuality||'').toLowerCase();
        if(settings.qualityMode==='fixed'&&!available.some(function(q){
          return String(q||'').toLowerCase()===fixedKey;
        })){
          // "Allow downgrade" must work even if Flower never declares the
          // requested format. Skip that impossible request and use the
          // declared MP3 fallback, with explicit provenance in playback.
          if(settings.autoFallback){
            for(var fa=0;fa<available.length;fa++){
              if(String(available[fa]).toLowerCase()==='128k')return [available[fa]];
            }
          }
          return [];
        }
        // For manually selected quality, only one optional low-quality
        // fallback is allowed; do not traverse a slow ladder.
        var requested=global.LXPlaySettings.buildPlan(available,settings);
        if(!requested.length)return [];
        var compact=[requested[0]];
        if(settings.autoFallback&&String(compact[0]).toLowerCase()!=='128k')
          for(var quickLow=0;quickLow<available.length;quickLow++)
            if(String(available[quickLow]).toLowerCase()==='128k'){compact.push(available[quickLow]);break;}
        return compact;
      }
      // Android 4.4 browsers often cannot decode FLAC/Hi-Res streams.
      // On the default automatic setting, prefer an MP3-sized stream first;
      // never override a quality explicitly chosen by the listener.
      var ua = String(global.navigator && global.navigator.userAgent || '');
      if (/Android 4[.]4/i.test(ua) && settings.qualityMode === 'highest') {
        var low = '';
        for (var qi = 0; qi < available.length; qi += 1) {
          var q = String(available[qi] || '').toLowerCase();
          if (q === '128k') { low = available[qi]; break; }
          if (!low && q === '320k') low = available[qi];
        }
        if (low) return global.LXPlaySettings.buildPlan(available, {
          qualityMode:'fixed', fixedQuality:low, autoFallback:settings.autoFallback
        });
      }
      return global.LXPlaySettings.buildPlan(available, settings);
    }
    return available instanceof Array ? available.slice() : [];
  }

  function renderChannelSelectors() {
    if (!channelListEl) return;
    var active = global.LXSourceManager.getActive();
    var supported = getSupportedChannels();
    channelListEl.innerHTML = '';
    if (qualitySummaryEl) qualitySummaryEl.innerHTML = '';

    if (!supported.length) {
      channelListEl.innerHTML = '<span class="muted">当前没有可用的音乐搜索渠道。</span>';
      selectedChannel = null;
      return;
    }

    if (supported.indexOf(selectedChannel) < 0) {
      // Older Via browsers get the lighter same-origin NetEase search path
      // on first load; users can still switch to MG and all other channels.
      var legacyUa = String(global.navigator && global.navigator.userAgent || '');
      var oldVia = /Android 4[.]4|Via[/]/i.test(legacyUa);
      selectedChannel = oldVia && supported.indexOf('wy') >= 0
        ? 'wy' : (supported.indexOf('tx') >= 0 ? 'tx' : supported[0]);
    }

    for (var i = 0; i < supported.length; i += 1) {
      var key = supported[i];
      var channelInfo = active && active.sources ? (active.sources[key] || {}) : {};
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'channel-button' + (key === selectedChannel ? ' active' : '');
      button.innerHTML = escapeHtml(channelInfo.name || CHANNEL_NAMES[key] || key.toUpperCase());
      button.title = key.toUpperCase();
      button.onclick = (function (channel) {
        return function () {
          selectedChannel = channel;
          searchToken += 1;
          songSearchSession=null;
          if(songSearchObserver){songSearchObserver.disconnect();songSearchObserver=null;}
          var scrollNote=document.getElementById('song-search-footer');
          if(scrollNote)scrollNote.hidden=true;
          var searchCount=document.getElementById('song-result-counter');
          if(searchCount)searchCount.textContent='按当前渠道搜索并播放';
          global.__LXLastSearchResults = [];
          renderChannelSelectors();
          resultsEl.innerHTML = '';
          setStatus('已选择播放渠道：' + escapeHtml(CHANNEL_NAMES[channel] || channel.toUpperCase()) +
            '；' + escapeHtml(global.LXPlaySettings ? global.LXPlaySettings.getLabel(getPlaySettings()) : '最高音质优先'));
        };
      })(key);
      channelListEl.appendChild(button);
    }

    var channelInfo = active && active.sources ? (active.sources[selectedChannel] || {}) : {};
    var available = channelInfo.qualitys instanceof Array ? channelInfo.qualitys : [];
    var plan = getQualityPlan(active, selectedChannel);
    if (qualitySummaryEl) {
      var qualitySettings=getPlaySettings();
      var requestedName=qualitySettings.qualityMode==='fixed'
        ?qualitySettings.fixedQuality:'自动';
      var selected=plan[0]||'暂不可用';
      var hasFallback=qualitySettings.autoFallback;
      var text='音质 '+requestedName+' · '+(selected===requestedName?'按所选播放':'首选 '+selected)+
        (hasFallback&&plan.length>1?' · 可降级':'');
      if(!available.length)text='音质 '+requestedName+' · 音源准备中';
      qualitySummaryEl.textContent=text;
      qualitySummaryEl.title='当前渠道声明音质：'+(available.join('、')||'未提供')+
        '；实际媒体规格以服务器响应为准';
      qualitySummaryEl.setAttribute('aria-label',qualitySummaryEl.title);
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
    lyricsActiveIndex = -1;
    if (lyricsTitleEl) lyricsTitleEl.textContent = '未选择歌曲';
    if (lyricsLinesEl) lyricsLinesEl.innerHTML = '<div class="lyrics-empty">选择歌曲开始播放，歌词会自动载入</div>';
    setLyricsStatus('播放歌曲后显示同步歌词');
  }

  function renderLyricsResult(music, result) {
    if (!global.LXMusicLyrics) {
      setLyricsStatus('歌词解析模块未加载。', 'fail');
      return;
    }

    var normalized = global.LXMusicLyrics.normalize(result);
    var lines = global.LXMusicLyrics.parseLrc(normalized.lyric);
    lyricsActiveIndex = -1;
    lyricsState = {
      musicKey: musicKey(music),
      music: music,
      source: String(music.source || '').toLowerCase(),
      lyric: normalized.lyric,
      lines: lines
    };

    if (lyricsTitleEl) {
      lyricsTitleEl.textContent = String(music.name || '未知歌曲');
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
    var track=state.music;
    var valid=function(){return !!(state.token===playbackToken &&
      playbackState && musicKey(playbackState.music)===musicKey(track));};
    if (lyricsTitleEl) lyricsTitleEl.textContent=String(track.name||'未知歌曲');
    if (lyricsLinesEl) lyricsLinesEl.innerHTML='<div class="lyrics-empty">正在获取歌词…</div>';
    lyricsActiveIndex=-1;
    setLyricsStatus('正在获取歌词…');
    var fallback=function(previousError){
      if(!valid())return;
      // Never mix lyrics from a different platform or song. Official NetEase
      // lyric ID lookup applies only to numeric NetEase track identifiers.
      var rawId=track.lyricId||track.id||track.songId||track.songmid||'';
      var id=String(rawId);
      if(state.source!=='wy'||!/^[0-9]{1,20}$/.test(id)){
        if(lyricsLinesEl)lyricsLinesEl.innerHTML='<div class="lyrics-empty">这首歌曲暂时没有可获取的歌词</div>';
        setLyricsStatus('当前歌曲暂无可用歌词','warn');return;
      }
      var controller=typeof AbortController==='function'?new AbortController():null;
      var timer=global.setTimeout(function(){if(controller)controller.abort();},8500);
      global.fetch('/api/netease-lyrics?id='+encodeURIComponent(id),
        controller?{signal:controller.signal}:{})
        .then(function(res){if(!res.ok)throw new Error('歌词服务暂不可用');return res.json();})
        .then(function(data){
          if(!valid())return;
          renderLyricsResult(track,data);
        })
        .catch(function(){
          if(!valid())return;
          if(lyricsLinesEl)lyricsLinesEl.innerHTML='<div class="lyrics-empty">当前歌词暂不可用，你仍可以正常听歌</div>';
          setLyricsStatus('暂时无法取得歌词，可点击「刷新歌词」重试','warn');
        })
        .finally(function(){global.clearTimeout(timer);});
    };
    if(!sourceSupportsAction(state.source,'lyric'))return fallback();
    global.LXSourceManager.requestAction(state.source,'lyric',{
      musicInfo:buildMusicInfo(track,state.source)
    },function(err,result){
      if(!valid())return;
      if(err||!global.LXMusicLyrics.normalize(result).lyric){
        fallback(err);return;
      }
      renderLyricsResult(track,result);
    });
  }

  function syncLyrics() {
    if (!lyricsState || !lyricsState.lines || !lyricsState.lines.length) return;
    var audio = document.getElementById('audio');
    if (!audio || !lyricsLinesEl) return;
    var index = global.LXMusicLyrics.getActiveLine(lyricsState.lines,audio.currentTime);
    if(index===lyricsActiveIndex)return; // Only touch the two changed DOM nodes.
    var oldLine=lyricsLinesEl.querySelector('.lyrics-line.active');
    if(oldLine)oldLine.classList.remove('active');
    lyricsActiveIndex=index;
    if(index>=0){
      var newLine=lyricsLinesEl.querySelector('[data-lyric-index="'+index+'"]');
      if(newLine)newLine.classList.add('active');
    }
  }

  function musicKey(music) {
    if (!music) return '';
    // Always use the same identity as persistent library storage. This also
    // distinguishes KG recordings sharing an Audioid in shuffle, play-all,
    // next/previous navigation, playing-row highlights and lyric ownership.
    if (global.LXMusicLibrary && typeof global.LXMusicLibrary.keyOf === 'function')
      return global.LXMusicLibrary.keyOf(music);
    var source = String(music.source || '').toLowerCase();
    var id = String(music.id || music.songId || music.songmid || music.mid || music.hash || '');
    return source + ':' + id;
  }

  // A play-all session is independent of the 100-item persistent queue.
  // Fetch the next 50 songs only near a page boundary, keeping Via responsive
  // even for playlists with hundreds of tracks.
  function findPlaylistSongIndex(list, music) {
    var key = musicKey(music);
    if (!key) return -1;
    for (var i = 0; i < list.length; i += 1) {
      if (musicKey(list[i]) === key) return i;
    }
    return -1;
  }

  function ensurePlaylistQueueWindow(session, trackIndex) {
    if (!global.LXMusicLibrary || !global.LXMusicLibrary.replaceQueue) return;
    var queue = global.LXMusicLibrary.snapshot().queue;
    var needed = session.tracks[trackIndex];
    if (!needed) return;
    if (findPlaylistSongIndex(queue, needed) >= 0) return;
    // Preserve some previous tracks for Back, then leave room for the next
    // tracks. Only rewrite persistent storage when moving outside the window.
    var start = Math.max(0, trackIndex - 15);
    // Near the playlist tail, slide the window back to retain the last
    // hundred tracks instead of shrinking it to only a few songs.
    var maximumStart = Math.max(0, session.tracks.length - 100);
    if (start > maximumStart) start = maximumStart;
    global.LXMusicLibrary.replaceQueue(session.tracks.slice(start, start + 100));
  }

  function fetchMorePlaylistTracks(session) {
    if (!session || playlistPlayback !== session || !session.hasMore ||
        session.loading || typeof session.loadMore !== 'function') return;
    session.loading = true;
    session.loadMore(function (err, page) {
      if (playlistPlayback !== session) return;
      session.loading = false;
      if (err) {
        if (session.pendingNext) {
          session.pendingNext = false;
          setStatus('下一页歌曲加载失败：' + escapeHtml(err.message || err) + '。可再次点击下一首重试。', 'warn');
        }
        return;
      }
      page = page || {};
      var additions = page.songs instanceof Array ? page.songs : [];
      var seen = {};
      for (var i = 0; i < session.tracks.length; i += 1) {
        seen[musicKey(session.tracks[i])] = true;
      }
      for (var j = 0; j < additions.length; j += 1) {
        var song = additions[j], key = musicKey(song);
        if (song && key && key !== ':' && !seen[key]) {
          seen[key] = true;
          session.tracks.push(song);
        }
      }
      session.hasMore = page.hasMore === true;
      if (session.pendingNext) {
        session.pendingNext = false;
        playQueuedOffset(1);
      }
    });
  }

  function maybePrefetchPlaylist(session) {
    if (session && session.hasMore &&
        session.tracks.length - session.index <= 8) {
      fetchMorePlaylistTracks(session);
    }
  }

  function startPlaylistPlayback(items, options) {
    if (!(items instanceof Array) || !items.length ||
        !global.LXMusicLibrary || !global.LXMusicLibrary.replaceQueue) return false;
    var tracks = [];
    var seen = {};
    for (var i = 0; i < items.length; i += 1) {
      var track = items[i], key = musicKey(track);
      if (track && key && key !== ':' && !seen[key]) {
        seen[key] = true;
        tracks.push(track);
      }
    }
    if (!tracks.length) return false;
    options = options || {};
    var requestedIndex = Math.floor(Number(options.startIndex || 0));
    if (!isFinite(requestedIndex) || requestedIndex < 0 ||
        requestedIndex >= items.length) return false;
    var selectedTrack = items[requestedIndex];
    var startIndex = findPlaylistSongIndex(tracks, selectedTrack);
    if (startIndex < 0) return false;
    resetShuffleHistory(tracks[startIndex]);
    playlistPlayback = {
      tracks: tracks, index: startIndex,
      hasMore: options.hasMore === true,
      loadMore: options.loadMore,
      loading: false, pendingNext: false
    };
    // Starting halfway through an already-loaded long playlist must put
    // the requested song inside the bounded persistent queue as well.
    var windowStart = Math.max(0, startIndex - 15);
    var maximumStart = Math.max(0, tracks.length - 100);
    if (windowStart > maximumStart) windowStart = maximumStart;
    global.LXMusicLibrary.replaceQueue(tracks.slice(windowStart, windowStart + 100));
    renderLibrary();
    playLibraryMusic(tracks[startIndex]);
    maybePrefetchPlaylist(playlistPlayback);
    return true;
  }

  function playLibraryMusic(music) {
    var source = music && music.source ? String(music.source).toLowerCase() : '';
    var supported = getSupportedChannels();
    if (!source || supported.indexOf(source) < 0) {
      setStatus('当前渠道无法播放已保存歌曲：' + escapeHtml(music && music.name || '未知歌曲'), 'fail');
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
    var fragment=document.createDocumentFragment();

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      const row = document.createElement('div');
      row.className = 'library-row';
      if (playbackState && musicKey(playbackState.music) === musicKey(item)) {
        row.className += ' is-playing';
        row.setAttribute('aria-current','true');
      }

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

      main.setAttribute('role','button');
      main.tabIndex=0;
      main.setAttribute('aria-label','播放 '+String(item.name||'未知歌曲'));
      main.title='点击播放歌曲';
      row.onclick=function(event){
        if(event.target.closest('button,a,summary,details'))return;
        playLibraryMusic(item);
      };
      main.onkeydown=function(event){
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();event.stopPropagation();
          playLibraryMusic(item);
        }
      };
      row.classList.add('tap-to-play');
      row.appendChild(main);
      row.appendChild(actions);
      fragment.appendChild(row);
    }
    target.appendChild(fragment);
  }

  function renderLibrary() {
    if (!global.LXMusicLibrary) return;
    var data = global.LXMusicLibrary.snapshot();
    renderLibraryList(queueListEl, data.queue, 'queue');
    renderLibraryList(favoriteListEl, data.favorites, 'favorite');
    renderLibraryList(historyListEl, data.history, 'history');
    var counts={history:data.history.length,favorite:data.favorites.length,queue:data.queue.length};
    for (var section in counts) if (Object.prototype.hasOwnProperty.call(counts,section)) {
      var label=document.getElementById('library-count-'+section);
      if(label) label.textContent=String(counts[section]);
    }
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
        if (!forceProxy && (typeof LEGACY_NATIVE_MEDIA==='undefined' || !LEGACY_NATIVE_MEDIA || (typeof legacyPreferDirect!=='undefined' && legacyPreferDirect)) &&
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
      if (origin && !forceProxy && (typeof LEGACY_NATIVE_MEDIA==='undefined' || !LEGACY_NATIVE_MEDIA || (typeof legacyPreferDirect!=='undefined' && legacyPreferDirect)) && /^https:/i.test(value)) return value;
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
    // LX Music Desktop passes Migu songmid (the search API songId) and
    // copyrightId separately, without synthesizing a hash. Huibq's source
    // prefers a defined musicInfo.hash over musicInfo.songmid; an empty hash
    // to copyrightId changes the requested track ID and can break playback.
    // Our normalized search results always contain hash: '', so remove only
    // blank hashes to restore the desktop source's songmid fallback.
    if (source === 'mg' && !String(musicInfo.hash == null ? '' : musicInfo.hash).trim()) {
      delete musicInfo.hash;
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

  function updateExternalPlayerUrl(mediaUrl) {
    if (!LEGACY_NATIVE_MEDIA) return;
    var link = document.getElementById('legacy-external-player');
    if (!link) return;
    var ok = global.LXAndroidExternalAudio &&
      global.LXAndroidExternalAudio.attachLink(link, mediaUrl, 'audio/mpeg');
    link.textContent = ok ? '尝试交给 Android 系统播放器' : '系统播放器（等歌曲地址）';
  }

  function nativeAudioReady() {
    try {
      return !!(global.LXNativeAudio &&
        typeof global.LXNativeAudio.isAvailable === 'function' &&
        global.LXNativeAudio.isAvailable() === true);
    } catch (e) { return false; }
  }

  // The companion APK injects LXNativeAudio before loading the existing
  // LX Music Web. Audio bytes are downloaded and decoded natively; Via/Chrome
  // 30 HTML5 Audio is never used in this branch.
  // Chrome 30 rejects function declarations nested in an if block when
  // the enclosing IIFE is in strict mode. Keep the formatter at function scope.
  function formatNativeClock(ms) {
    var seconds = Math.floor(ms / 1000);
    return ('0' + Math.floor(seconds / 60)).slice(-2) +
      ':' + ('0' + seconds % 60).slice(-2);
  }

  function syncNativeTransportIcon(playing) {
    if (!NATIVE_COMPANION) return;
    var button = document.getElementById('player-toggle-btn');
    if (!button) return;
    var play = button.querySelector('.player-play-icon');
    var pause = button.querySelector('.player-pause-icon');
    if (play) { play.style.display = playing ? 'none' : 'block'; play.setAttribute('class', playing ? 'player-play-icon hidden' : 'player-play-icon'); }
    if (pause) { pause.style.display = playing ? 'block' : 'none'; pause.setAttribute('class', playing ? 'player-pause-icon' : 'player-pause-icon hidden'); }
    button.setAttribute('aria-label', playing ? '暂停' : '继续播放');
    button.title = playing ? '暂停' : '继续播放';
  }

  global.LXNativeAudioEvent = function (token, eventName, positionMs, durationMs) {
    if (!nativeAudioReady()) return;
    var state = playbackState;
    if (!state || Number(token) !== state.token || !state.nativePlayback) return;
    var elapsed = Math.max(0, Number(positionMs || 0));
    var total = Math.max(0, Number(durationMs || 0));
    if (eventName === 'playing' || eventName === 'progress') {
      state.waitingForAudio = false;
      state.playing = true;
      clearPlaybackConfirmTimer(state);
      clearMiguPlaybackDeadline(state);
      syncNativeTransportIcon(true);
      if (eventName === 'playing')
        setStatus('Android 原生 MediaPlayer 已开始播放；歌曲地址解析约 ' +
          (Number(state.addressResolveMs || 0) / 1000).toFixed(1) +
          ' 秒。播放进度以原生播放器为准。', 'ready');
      // The Phase-1 web progress controls are informational; use the
      // companion APK buttons for pause/resume until native controls sync.
      var current = document.getElementById('player-current-time');
      var duration = document.getElementById('player-duration');

      if (current) current.textContent = formatNativeClock(elapsed);
      if (duration && total) duration.textContent = formatNativeClock(total);
    } else if (eventName === 'loading') {
      setStatus('歌曲地址解析约 ' +
        (Number(state.addressResolveMs || 0) / 1000).toFixed(1) +
        ' 秒，正在完整下载音频……', 'warn');
    } else if (eventName === 'paused') {
      state.playing = false;
      syncNativeTransportIcon(false);
      setStatus('原生播放器已暂停；点击绿色播放按钮继续。', 'warn');
    } else if (eventName === 'completed') {
      state.playing = false;
      syncNativeTransportIcon(false);
      setStatus('Android 原生播放器已完成当前歌曲。', 'ready');
    } else if (eventName === 'error') {
      // Always end loading/playing on native failure, including failed HTTP
      // media proxies and unsupported codec contents. Do not resurrect old
      // multi-provider fallback or display a misleading "still playing" icon.
      state.playing = false;
      syncNativeTransportIcon(false);
      handleAudioError(state.token, state.url);
      if (NATIVE_COMPANION) {
        var errorId = Number(positionMs || 0);
        var extraId = Number(durationMs || 0);
        var detail = errorId || extraId ?
          '（MediaPlayer ' + errorId + ' / ' + extraId + '）' : '';
        setStatus('野花已返回播放地址，但音频下载或播放失败' + detail +
          '。请重试或换一首歌曲；不会切换其他音源。', 'fail');
      }
    }
  };

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
    // Android 4.4 companion's native bridge deliberately accepts only
    // first-party HTTPS audio endpoints. Always proxy an external resolver
    // URL, even after the user clicked the legacy "direct connection" button.
    // Desktop browsers and external-system-player links keep prior behavior.
    var usingNative = nativeAudioReady();
    var playableUrl = buildPlayableUrl(url, forceProxy === true || usingNative);
    if (playbackState && playbackState.confirmTimer) {
      try { global.clearTimeout(playbackState.confirmTimer); } catch (e) {}
      playbackState.confirmTimer = null;
    }
    playbackState.waitingForAudio = true;
    playbackState.manualPlaybackRequired = LEGACY_NATIVE_MEDIA;
    playbackState.url = playableUrl;
    playbackState.sourceUrl = url;
    var resolvedNow = Date.now ? Date.now() : new Date().getTime();
    playbackState.addressResolveMs = Math.max(0, resolvedNow - Number(playbackState.startedResolvingAtMs || resolvedNow));
    updateExternalPlayerUrl(playableUrl);
    playbackState.transport = playableUrl === String(url || '') ? 'direct' : 'proxy';
    playbackState.lastForceProxy = forceProxy === true || usingNative;

    playbackState.quality = quality;
    playbackState.resolver = viaLabel || 'LX source';
    playbackState.resolverProvider = viaProvider || 'lx-source';
    playbackState.expectedDuration = getExpectedDurationSeconds(music);
    // Diagnostics receives only safe metadata, NEVER an audio URL or signature.
    global.dispatchEvent(new CustomEvent('fymusic:url-resolved',{detail:{
      source:source,quality:quality,provider:playbackState.resolverProvider,
      transport:playbackState.transport
    }}));

    if (usingNative) {
      playbackState.nativePlayback = true;
      playbackState.manualPlaybackRequired = false;
      // Never call HTMLAudioElement.play() in Android 4.4 companion mode:
      // physical Via has failed direct, Blob, Data URI and local WAV modes.
      try { audio.pause(); audio.removeAttribute('src'); } catch (e) {}
      // Do not weaken Java's URL restriction when an input cannot be
      // canonicalized. This check prevents an attempted non-site native call.
      var origin = String(global.location.protocol || '') + '//' +
        String(global.location.host || '');
      if (playableUrl.indexOf(origin + '/api/proxy?url=') !== 0 &&
          playableUrl.indexOf(origin + '/api/legacy-audio?') !== 0) {
        setStatus('该歌曲未获得可交给原生播放器的本站安全音频地址。', 'fail');
        handleAudioError(token, playableUrl);
        return;
      }
      setStatus('原生播放组件已使用本站 HTTPS 安全代理，正在获取歌曲……', 'warn');
      try { global.LXNativeAudio.play(playableUrl, token); }
      catch (error) {
        setStatus('Android 原生桥未能启动：' + escapeHtml(String(error)), 'fail');
        handleAudioError(token, playableUrl);
      }
      return;
    }

    var playRequested = false;

    function requireManualPlayback(error) {
      if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
      // On Android 4.4, resolving a URL asynchronously consumes the original
      // tap gesture. The browser can reject the subsequent play() even for a
      // valid stream. Do not discard that valid URL and retry all resolvers.
      playbackState.manualPlaybackRequired = true;
      clearPlaybackConfirmTimer(playbackState);
      clearMiguPlaybackDeadline(playbackState);
      setStatus(
        (MODERN_WEB ? '浏览器阻止自动播放，请点击底部绿色播放按钮继续。' :
         '歌曲地址已获得，但旧版浏览器阻止自动播放。请直接点击下方播放器的 ▶ 播放按钮。') +
        (error && error.name === 'NotSupportedError' ? ' 如仍无法播放，请切换较低音质。' : ''),
        'warn'
      );
    }

    function startAudioPlayback() {
      if (playRequested) return;
      if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
      playRequested = true;

      try {
        var playResult = audio.play();
        if (playResult && typeof playResult.catch === 'function') {
          playResult.catch(function (error) {
            if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
            if (audio.error && settings.autoFallback) {
              playRequested = false;
              handleAudioError(token, playableUrl);
              return;
            }
            requireManualPlayback(error);
          });
        }
      } catch (e) {
        if (audio.error && settings.autoFallback) {
          playRequested = false;
          handleAudioError(token, playableUrl);
        } else requireManualPlayback(e);
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

      // Legacy Via/WebView requires a direct tap on its *native* media
      // controls. The metadata event runs asynchronously, and audio.play()
      // here cannot satisfy the Android 4.4 user-gesture restriction.
      if (LEGACY_NATIVE_MEDIA) {
        playbackState.manualPlaybackRequired = true;
        setStatus('歌曲地址已准备好。Android 4.4.2 请点击底部“原生音频播放”灰色控件里的 ▶；网页圆形播放键可能被系统限制。', 'warn');
        return;
      }
      if (!MODERN_WEB) startAudioPlayback();
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
    audio.preload = LEGACY_NATIVE_MEDIA ? 'metadata' : 'auto';
    audio.src = playableUrl;
    if (!LEGACY_NATIVE_MEDIA && typeof audio.load === 'function') audio.load();
    // Start streaming immediately instead of waiting for onloadedmetadata.
    if (MODERN_WEB) startAudioPlayback();

    // Start the real-media connection timeout when the URL is attached, not
    // only after a "playing" event. A stalled CDN can stop at loadstart forever
    // and otherwise bypass the fallback path completely.
    clearPlaybackConfirmTimer(playbackState);
    if (LEGACY_NATIVE_MEDIA) {
      // Do not abort a perfectly usable MP3 before the listener can tap the
      // native player. Explicit media errors still trigger normal fallback.
      setStatus('已找到歌曲播放地址。请使用底部原生音频控件手动点击 ▶ 开始播放。若无法播放，请先运行“旧设备音频自检”。', 'warn');
    } else playbackState.confirmTimer = global.setTimeout(function () {
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
      ' 已返回请求音质 ' + escapeHtml(quality) + ' 的播放地址' +
      (viaLabel ? '（' + escapeHtml(viaLabel) + '）' : '') +
      (LEGACY_NATIVE_MEDIA ? '，请点下方原生音频控件的 ▶ 播放键。' : '，正在验证媒体信息。'),
      LEGACY_NATIVE_MEDIA ? 'warn' : 'ready'
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

  function noteMiguPlaybackProgress(state, audio) {
    if (!state || state.source !== 'mg' || !audio) return;
    var current = Number(audio.currentTime || 0);
    if (!isFinite(current) || current < 0) return;
    if (current > Number(state.miguLastAudioTime || 0) + 0.025) {
      state.miguLastAudioTime = current;
      state.miguLastProgressAt = Date.now ? Date.now() : new Date().getTime();
    }
  }

  function isEstablishedMiguPlayback(state, audio) {
    if (!state || !audio || !state.playing || audio.ended ||
        audio.readyState < 2 || Number(audio.currentTime || 0) < MIGU_PLAYBACK_ESTABLISHED_SECONDS ||
        isSuspiciousPlaybackDuration(Number(audio.duration || 0), state.expectedDuration)) return false;
    // A user may pause genuine media manually. Otherwise it must still be
    // making audio progress near the original 25-second deadline.
    if (audio.paused) return true;
    var now = Date.now ? Date.now() : new Date().getTime();
    return Number(state.miguLastProgressAt || 0) > 0 &&
      now - state.miguLastProgressAt <= MIGU_PLAYBACK_PROGRESS_FRESH_MS;
  }

  function armMiguPlaybackDeadline(state) {
    if (!state || state.source !== 'mg') return;
    var token = state.token;
    clearMiguPlaybackDeadline(state);
    state.miguDeadlineTimer = global.setTimeout(function () {
      if (playbackState !== state || playbackToken !== token) return;
      // A quarter-second of progress can come from a transient/error stream.
      // Keep the original deadline alive until established audio is still
      // progressing, rather than canceling it on the first 'playing' event.
      var audio = document.getElementById('audio');
      if (isEstablishedMiguPlayback(state, audio)) {
        clearMiguPlaybackDeadline(state);
        return;
      }
      clearMiguPlaybackDeadline(state);
      clearPlaybackConfirmTimer(state);
      // Invalidate every pending LX-source/native/fallback callback. A stale
      // audio URL must never start after this attempt has finished.
      playbackToken += 1;
      state.waitingForAudio = false;
      state.playing = false;
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
  // v0.17 wrongly stopped Flower at 18 seconds even though L101 has
  // successfully resolved the same song in ~52 seconds. This is a single
  // Flower LX musicUrl deadline, not an invitation to try other providers.
  var FLOWER_NATIVE_RESOLVE_TIMEOUT_MS = 75000;

  // Offer an opt-in, channel-preserving retry rather than retrying suspended
  // fallback providers. The upstream Flower source passed live 4-channel
  // search+play browser checks, but still requires real KitKat validation.
  function offerFlowerRetry(music, source, token) {
    if (!LEGACY_NATIVE_MEDIA || ['kw','kg','tx','wy'].indexOf(source) < 0 ||
        !global.LXSourceManager || !music || token !== playbackToken) return;
    var manager = global.LXSourceManager;
    var active = manager.getActive();
    function isFlower(item) {
      return item && String(item.url || '').indexOf(
        'pdone/lx-music-source/main/flower/latest.js') >= 0;
    }
    if (isFlower(active) && active.inited) return;

    var button = document.createElement('button');
    button.type = 'button';
    button.id = 'flower-source-retry-btn';
    button.className = 'secondary';
    button.style.marginTop = '8px';
    button.textContent = '使用 Flower（野花）音源重新试听';
    statusEl.appendChild(button);

    button.onclick = function () {
      if (token !== playbackToken) return;
      button.disabled = true;
      var originalActive = String(manager.getActive() && manager.getActive().id || '');
      var installed = manager.getSources();
      var flower = null;
      for (var i=0;i<installed.length;i++) {
        if (isFlower(installed[i]) && installed[i].inited) {
          flower = installed[i]; break;
        }
      }
      function useFlower(err, candidate) {
        if (token !== playbackToken) return;
        if (err) {
          setStatus('Flower 音源导入失败：' + escapeHtml(err.message || err), 'fail');
          return;
        }
        // LX runtime.send('inited') dispatches on a Promise microtask.
        // installFromCode can invoke its callback synchronously, BEFORE that
        // microtask marks candidate.inited. Treat it as still initializing,
        // not as a failed import; otherwise a late green inited notification
        // masks a stopped retry and the original source stays selected.
        if (isFlower(candidate) && !candidate.inited && !candidate.error) {
          var waitStarted = Date.now ? Date.now() : new Date().getTime();
          setStatus('Flower 音源已下载，正在等待初始化完成后自动试听……', 'warn');
          var waitForFlowerInit = function () {
            if (token !== playbackToken) return;
            var selected = manager.getActive();
            var selectedId = String(selected && selected.id || '');
            if (selectedId !== originalActive &&
                selectedId !== String(candidate.id || '')) {
              setStatus('音源已由你手动切换，停止自动重试。', 'warn');
              return;
            }
            if (candidate.inited) { useFlower(null, candidate); return; }
            if (candidate.error) {
              setStatus('Flower 音源初始化失败：' + escapeHtml(candidate.error), 'fail');
              return;
            }
            var now = Date.now ? Date.now() : new Date().getTime();
            if (now - waitStarted >= 15000) {
              setStatus('Flower 音源已下载，但 15 秒内未完成初始化；没有启动歌曲播放。', 'fail');
              return;
            }
            global.setTimeout(waitForFlowerInit, 120);
          }
          global.setTimeout(waitForFlowerInit, 0);
          return;
        }
        var current = manager.getActive();
        var currentId = String(current && current.id || '');
        if (currentId !== originalActive &&
            !(candidate && currentId === String(candidate.id || ''))) {
          setStatus('音源已由你手动切换，停止自动重试。', 'warn');
          return;
        }
        if (!isFlower(candidate) || !candidate.inited ||
            !candidate.sources || !candidate.sources[source] ||
            !candidate.sources[source].actions ||
            candidate.sources[source].actions.indexOf('musicUrl') < 0) {
          setStatus('Flower 音源尚未提供当前渠道的可用播放功能。', 'fail');
          return;
        }
        var selected = manager.activate(candidate.id);
        if (!selected) {
          setStatus('Flower 音源选择失败，请在设置中手动切换。', 'fail');
          return;
        }
        setStatus('已切换为 Flower（野花）音源，重新解析 ' +
          escapeHtml(music.name || '当前歌曲') + '……', 'warn');
        testMusic(music, true);
      }
      if (flower) {
        useFlower(null,flower);
        return;
      }
      setStatus('正在导入 Flower（野花）原始 LX 音源并验证可用渠道……', 'warn');
      if (typeof manager.installVerifiedFlower !== 'function') {
        setStatus('Flower 导入入口不可用，请在设置里导入音源。', 'fail');
        return;
      }
      manager.installVerifiedFlower(useFlower);
    };
  }


  // Optional KG -> KW recovery requires TWO explicit user interactions.
  // No background cross-platform search or automatic playback substitution.
  function offerCrossPlatformAlternative(original,source,token){
    if(!MODERN_WEB||source!=='kg'||token!==playbackToken||
      selectedChannel!=='kg'||!playbackState||playbackState.token!==token||
      playbackState.source!=='kg'||!global.FyMusicCrossPlatformMatch||
      !global.LXMusicSearch||typeof global.LXMusicSearch.search!=='function')return;
    var active=global.LXSourceManager.getActive();
    var kw=active&&active.sources&&active.sources.kw;
    if(!active||!active.inited||!active.runtime||!kw||
      !Array.isArray(kw.actions)||kw.actions.indexOf('musicUrl')<0)return;
    var activeId=String(active.id||active.url||''),gate=global.FyMusicCrossPlatformMatch;
    var box=document.createElement('div');box.className='fymusic-alternate-offer';
    var description=document.createElement('p');
    description.className='fymusic-alternate-explanation';
    description.textContent='酷狗解析未成功。可手动查找酷我同曲版本；不会自动换平台。' +
      '候选须匹配歌名、歌手、时长及可核对的专辑，仍不能保证录音内容相同。';
    var button=document.createElement('button');
    button.type='button';button.className='secondary fymusic-alternate-search';
    button.textContent='查找酷我同曲（手动）';
    var results=document.createElement('div');
    results.className='fymusic-alternate-results';
    results.setAttribute('role','status');
    results.setAttribute('aria-live','polite');
    box.append(description,button,results);statusEl.appendChild(box);
    function current(){
      var a=global.LXSourceManager.getActive();
      return token===playbackToken&&playbackState&&
       playbackState.token===token&&playbackState.music===original&&
       playbackState.source==='kg'&&selectedChannel==='kg'&&
       String(a&&(a.id||a.url)||'')===activeId&&box.isConnected;
    }
    button.onclick=function(){
      if(!current())return;
      button.disabled=true;results.textContent='正在酷我搜索并核对同曲版本…';
      global.dispatchEvent(new CustomEvent('fymusic:alternate-search',{
        detail:{from:'kg',to:'kw'}
      }));
      var settled=false;
      var timer=global.setTimeout(function(){
        if(settled)return;settled=true;
        if(current()){button.disabled=false;results.textContent='搜索超时。未切换歌曲，可再次手动查找。';}
      },9000);
      try{
        global.LXMusicSearch.search('kw',
          String(original.name||'')+' '+String(original.singer||''),1,20,
          function(err,response){
            if(settled)return;settled=true;global.clearTimeout(timer);
            if(!current())return;
            button.disabled=false;results.replaceChildren();
            if(err){results.textContent='酷我搜索暂不可用。没有更改当前歌曲。';return;}
            var matches=gate.choices(original,response&&response.list,3);
            if(!matches.length){
              results.textContent='未找到歌名、歌手、时长与专辑校验通过的酷我版本。' +
                '没有切换歌曲，可自行通过搜索页面选择其他录音。';
              return;
            }
            var info=document.createElement('p');
            info.className='fymusic-alternate-explanation';
            info.textContent='以下为酷我候选（仅元数据匹配，并未验证音频指纹）。' +
              '必须再次确认具体版本才会尝试播放：';
            results.appendChild(info);
            matches.forEach(function(entry){
              var candidate=entry.item,row=document.createElement('div');
              row.className='fymusic-alternate-candidate';
              var label=document.createElement('span');
              label.textContent='酷我 · '+String(candidate.name||'')+' — '+
                String(candidate.singer||'')+' · '+String(candidate.interval||'')+
                (candidate.albumName?' · '+String(candidate.albumName).slice(0,70):'');
              var confirm=document.createElement('button');
              confirm.type='button';confirm.className='secondary fymusic-alternate-confirm';
              confirm.textContent='确认尝试此酷我版本';
              confirm.onclick=function(){
                if(!current()||!gate.inspect(original,candidate).accepted)return;
                var now=global.LXSourceManager.getActive();
                if(!now||!now.inited||!now.sources||!now.sources.kw||
                  !Array.isArray(now.sources.kw.actions)||
                  now.sources.kw.actions.indexOf('musicUrl')<0){
                  results.textContent='当前音源不再支持酷我解析，未切换歌曲。';return;
                }
                global.dispatchEvent(new CustomEvent('fymusic:alternate-approved',{
                  detail:{from:'kg',to:'kw',verified:'metadata_only'}
                }));
                // This explicit selection bypasses testMusic's KG search-tab
                // restriction but still uses regular KW source and quality plan.
                startPlayback(candidate,'kw');
                if(playbackState&&playbackState.source==='kw')
                  playbackState.manualAlternativeOrigin='kg';
              };
              row.append(label,confirm);results.appendChild(row);
            });
          });
      }catch(e){
        if(!settled){
          settled=true;global.clearTimeout(timer);
          if(current()){button.disabled=false;results.textContent='酷我搜索未能启动，未切换歌曲。';}
        }
      }
    };
  }

  function requestQuality(music, source, musicInfo, plan, index, token) {
    var active = global.LXSourceManager.getActive();
    var settings = getPlaySettings();
    if (token !== playbackToken) return;

    // Only one Flower quality per click on Android 4.4: no automatic
    // cross-source retries or repeated multibit-rate waterfalls.
    if (NATIVE_COMPANION && plan.length > 1) plan = [plan[0]];
    var quality = plan[index];
    // Compare the selected catalog row with what we actually pass to the
    // resolver. This does NOT verify the audio content or copyright.
    global.dispatchEvent(new CustomEvent('fymusic:catalog-identity',{detail:{
      expected:{name:music.name,singer:music.singer,source:source},
      candidate:{name:musicInfo.name,singer:musicInfo.singer,source:musicInfo.source}
    }}));
    global.dispatchEvent(new CustomEvent('fymusic:resolver-attempt',{detail:{
      source:source,quality:quality
    }}));
    playbackState.index = index;
    playbackState.quality = quality;
    playbackState.waitingForAudio = false;
    playbackState.playing = false;
    playbackState.url = '';
    playbackState.resolveAttemptId = Number(playbackState.resolveAttemptId || 0) + 1;

    var resolveAttemptId = playbackState.resolveAttemptId;
    var settled = false;
    var sourceTimer = null;
    var flowerProgressTimer = null;
    var fastRaceTimer = null;
    var fastRaceStarted = false;
    var flowerFailed = '';
    // Web playback is Flower-only. Native/Huibq/GD resolvers are DIFFERENT
    // providers even when they resolve the same search platform; never race
    // them silently or attribute their media to Flower.
    var fastEnabled = false;
    var activeSourceName=active&&active.name?String(active.name):'当前 LX 音源';

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
      if (flowerProgressTimer) {
        global.clearTimeout(flowerProgressTimer);
        flowerProgressTimer = null;
      }
      if (fastRaceTimer) {
        global.clearTimeout(fastRaceTimer);
        fastRaceTimer = null;
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

    function isFlowerOutage(reason) {
      return /Flower resolver unavailable|Flower fast resolver deadline|Flower resolver did not return a valid music address|FLOWER_(?:UPSTREAM_UNAVAILABLE|TIMEOUT)|野花音源上游不可用/i
        .test(String(reason || ''));
    }

    function runFallback(reason) {
      if (!isCurrentAttempt() || !finishAttempt()) return;
      // A failed resolver may never return an HTTP status (timeout/empty data).
      // Report only bounded classifications, not raw URLs or failure text.
      var diagnosticReason=String(reason||'');
      var reportedHttp=diagnosticReason.match(/\bHTTP[\s:_-]*([45][0-9]{2})\b/i);
      global.dispatchEvent(new CustomEvent('fymusic:resolver-error',{detail:{
        status:reportedHttp?Number(reportedHttp[1]):null,
        code:/timeout|超时|deadline|timed out/i.test(diagnosticReason)?'timeout':
          /network|socket|connect|econn|dns|网络/i.test(diagnosticReason)?'network':
          'unknown'
      }}));
      var sourceUnavailable = MODERN_WEB && isFlowerOutage(reason);

      // Downgrading bitrate cannot recover an unreachable Flower server;
      // preserve quality fallback for track/quality-specific failures.
      if (MODERN_WEB && settings.autoFallback && !sourceUnavailable && index + 1 < plan.length) {
        playbackState.qualityFallbackReason=String(reason||'高音质解析未成功').slice(0,110);
        setStatus('已请求 '+escapeHtml(quality)+'，但解析失败；现按允许降级的设置改试 '+
          escapeHtml(plan[index+1])+'。原因：'+escapeHtml(playbackState.qualityFallbackReason),'warn');
        return requestQuality(music,source,musicInfo,plan,index+1,token);
      }
      if (NATIVE_COMPANION || MODERN_WEB) {
        setStatus(sourceUnavailable
          ? '野花音源服务器当前无法返回播放地址（HTTP 502）。歌曲搜索仍可使用；本次已停止解析，不会擅自换用其他音源。'
          : '当前歌曲暂未取得播放地址：' + escapeHtml(reason || '解析失败') +
            (MODERN_WEB ? '。仅使用选中的 LX 音源“'+escapeHtml(activeSourceName)+'”，未自动切换其他播放源。' : '。'), 'fail');
        if (MODERN_WEB) {
          var retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'secondary';
          retry.textContent = sourceUnavailable ? '稍后重试' : '重试这首歌';
          retry.onclick = function(){ if(token===playbackToken) testMusic(music,false); };
          statusEl.appendChild(retry);
          offerCrossPlatformAlternative(music,source,token);
        }
        return;
      }
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
            setStatus(
              'musicUrl 备用解析失败（' + escapeHtml(quality) + '）：'
              + escapeHtml(
                (fallbackErr && (fallbackErr.message || fallbackErr))
                || '没有可用地址'
              ),
              'fail'
            );
            offerFlowerRetry(music,source,token);
            return;
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

    function startFastRace() {
      if (!fastEnabled || fastRaceStarted || settled || !isCurrentAttempt()) return;
      fastRaceStarted = true;
      setStatus('野花解析中，正在并行检查同平台可用地址……', 'warn');
      // Keep waiting for Flower's real musicUrl in parallel. Whichever valid
      // same-platform link arrives first wins. Late callbacks are ignored.
      global.LXMusicSearch.resolveMusicUrlFast(source, musicInfo, quality,
        function(error, result) {
          if (!isCurrentAttempt() || settled) return;
          if (!error && result && result.url &&
              (!global.LXMusicSearch.isPlayableUrlForSource ||
               global.LXMusicSearch.isPlayableUrlForSource(source, result.url))) {
            if (!finishAttempt()) return;
            useResolvedUrl(result.url, quality, token, music, source, musicInfo,
              settings, providerLabel(result.provider), result.provider);
            return;
          }
          // If Flower has already failed, stop immediately; otherwise
          // its own pending request can still deliver a valid URL.
          if (flowerFailed) runFallback(flowerFailed);
          else setStatus('备用解析暂不可用，仍在等待野花音源……', 'warn');
        });
    }

    setStatus(
      (index === 0 ? '正在请求' : '当前音质失败，正在自动切换')
      + ' ' + escapeHtml(quality) + '：' + escapeHtml(music.name) + '……'
    );

    // Flower's imported LX source is the only web playback resolver.
    // Search platform selection never grants permission to switch the
    // playback provider. Failure is reported, never replaced silently.
    if (!active || !active.inited || !active.runtime ||
        !active.sources || !active.sources[source]) {
      if (NATIVE_COMPANION || MODERN_WEB) {
        // First installation and Babel startup complete asynchronously.
        // Allow one bounded wait for Flower to be ready, with no fallback.
        var started = Date.now ? Date.now() : new Date().getTime();
        setStatus('正在准备当前选中的 LX 音源“'+escapeHtml(activeSourceName)+'”，初始化后解析歌曲……', 'warn');
        var pollFlower = function () {
          if (!isCurrentAttempt() || settled) return;
          var ready = global.LXSourceManager.getActive();
          if (ready && ready.inited && ready.runtime &&
              ready.sources && ready.sources[source]) {
            finishAttempt();
            var freshPlan=getQualityPlan(ready,source);
            // Some LX sources omit the quality list entirely. In that case
            // preserve the user's requested format and let the provider decide.
            if(!freshPlan.length){
              var declared=ready.sources[source].qualitys;
              if(Array.isArray(declared)&&declared.length){
                setStatus('野花音源已就绪，但不支持所选 '+escapeHtml(getPlaySettings().fixedQuality)+
                  ' 音质；不会自动改成128k。','fail');
                return;
              }
              freshPlan=[getPlaySettings().qualityMode==='fixed'?
                getPlaySettings().fixedQuality:'128k'];
            }
            playbackState.plan=freshPlan;
            var userQuality=getPlaySettings(),declaredNow=ready.sources[source].qualitys||[];
            var downgradedFromFixed=userQuality.qualityMode==='fixed'&&
              Array.isArray(declaredNow)&&declaredNow.length>0&&
              String(freshPlan[0]).toLowerCase()!==String(userQuality.fixedQuality).toLowerCase();
            playbackState.initialQuality=downgradedFromFixed?userQuality.fixedQuality:freshPlan[0];
            if(downgradedFromFixed)
              playbackState.qualityFallbackReason='音源未声明支持 '+userQuality.fixedQuality+'，允许降到128k';
            requestQuality(music,source,musicInfo,freshPlan,0,token);
            return;
          }
          if (ready && ready.error) {
            finishAttempt();
            setStatus('当前 LX 音源初始化失败：' + escapeHtml(ready.error) +
              '。可在设置中重新加载野花。', 'fail');
            return;
          }
          var now = Date.now ? Date.now() : new Date().getTime();
          if (now-started>=(MODERN_WEB ? 10000 : 25000)) {
            finishAttempt();
            setStatus('当前 LX 音源尚未准备好，请在设置中重新导入或选择音源。','fail');
            return;
          }
          global.setTimeout(pollFlower,200);
        };
        global.setTimeout(pollFlower,200);
        return;
      }
      runFallback('该渠道 LX 音源尚未就绪，正在尝试同平台备用解析……');
      return;
    }

    if (MODERN_WEB) {
      // Give Flower a 1.6s head start. In parallel, race same-platform
      // resolver endpoints only; never install another LX source script.
      if (fastEnabled) fastRaceTimer = global.setTimeout(startFastRace, 1600);
      // Entire two-quality flow is bounded to ~13.5 seconds, not 24s.
      var elapsed=(Date.now?Date.now():new Date().getTime())-Number(playbackState.startedResolvingAtMs||0);
      var left=Math.max(1200,13500-elapsed);
      var qualityWindow=index===0&&plan.length>1?Math.min(8500,left):Math.min(12000,left);
      sourceTimer = global.setTimeout(function(){
        if (!isCurrentAttempt() || settled) return;
        runFallback(flowerFailed || '音质解析超时');
      },qualityWindow);
    } else if (NATIVE_COMPANION) {
      sourceTimer = global.setTimeout(function(){
        if (!isCurrentAttempt() || settled) return;
        runFallback('野花解析超时');
      }, FLOWER_NATIVE_RESOLVE_TIMEOUT_MS);
    } else {
      sourceTimer = global.setTimeout(function(){
        if (!isCurrentAttempt() || settled) return;
        runFallback('音源请求超过 '+Math.round(SOURCE_RESOLVE_TIMEOUT_MS/1000)+' 秒');
      }, SOURCE_RESOLVE_TIMEOUT_MS);
    }

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
          // Never broadcast a source's raw error: it may contain signed URLs
          // or request metadata. Only safe status/code are observable.
          var diagnosticError=String(err && (err.message || err) || '');
          var diagnosticStatusMatch=diagnosticError.match(/\bHTTP[\s:_-]*(\d{3})\b/i);
          var diagnosticCode=/timeout|timed out|超时/i.test(diagnosticError)?'timeout':
            /network|socket|connect|econn|dns|failed to fetch|网络/i.test(diagnosticError)?'network':
            /invalid|undefined|unexpected|json|format|无效|缺少/i.test(diagnosticError)?'invalid':'unknown';
          global.dispatchEvent(new CustomEvent('fymusic:resolver-error',{detail:{
            status:diagnosticStatusMatch?Number(diagnosticStatusMatch[1]):null,
            code:diagnosticCode
          }}));
          flowerFailed=activeSourceName+'解析失败：'+String(err && (err.message || err) || '网络错误').slice(0,160);
          if (fastEnabled) { startFastRace(); return; }
          return runFallback(flowerFailed);
        }

        var url = typeof result === 'string'
          ? result
          : (result && (result.url || result.result));
        if (url != null) url = String(url).replace(/^\\s+|\\s+$/g, '');

        if (!url || !/^https?:/i.test(url)) {
          flowerFailed=activeSourceName+'没有返回有效的播放地址';
          if (fastEnabled) { startFastRace(); return; }
          return runFallback(flowerFailed);
        }

        if (
          global.LXMusicSearch &&
          typeof global.LXMusicSearch.isPlayableUrlForSource === 'function' &&
          !global.LXMusicSearch.isPlayableUrlForSource(source, url)
        ) {
          flowerFailed=activeSourceName+'返回了不属于当前渠道的链接';
          if (fastEnabled) { startFastRace(); return; }
          return runFallback(flowerFailed);
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
    lastRequestedPlayback = {music: music, source: source};
    var active = global.LXSourceManager.getActive();
    // The platform search and its fallback resolver work independently of
    // LX source bootstrap. Do not block a real user gesture on old Via.
    // A new click owns a new deadline; the previous track must not be able
    // to time out and overwrite its status.
    clearMiguPlaybackDeadline(playbackState);
    // Invalidate any earlier media/resolver callbacks BEFORE validation.
    // A new high-quality request can be unsupported: its error must not be
    // overwritten by the previous song's late "128k playing" confirmation.
    playbackToken += 1;
    playbackState = null;
    updateExternalPlayerUrl('');
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

    // The lyrics panel is independent of the route: stale lyrics must never
    // remain visible when the listener selects another track.
    clearLyrics();
    // The immersive screen receives the selected song immediately, even
    // while a third-party media URL is still resolving. Avoid polling app state.
    try {
      var nowPlayingTrack={
        id:String(music && (music.id || music.songId || music.songmid) || ''),
        name:String(music && music.name || ''),
        singer:String(music && (music.singer || music.artist) || ''),
        albumName:String(music && music.albumName || ''),
        image:String(music && (music.image || music.pic || music.img ||
          (music.raw && (music.raw.al && music.raw.al.picUrl || music.raw.album && music.raw.album.picUrl))) || ''),
        source:String(source || music && music.source || '')
      };
      global.__LXNowPlayingTrack=nowPlayingTrack;
      global.dispatchEvent(new CustomEvent('lx:trackchange',{detail:nowPlayingTrack}));
    }catch(e){}
    // Keep the visible playlist selection synchronized with the current
    // player when a row, Next, Previous or audio-ended starts a new track.
    if (global.OnlyTestingPlaylistUI &&
        typeof global.OnlyTestingPlaylistUI.onTrackChange === 'function') {
      global.OnlyTestingPlaylistUI.onTrackChange(music);
    }

    var plan = getQualityPlan(active, source);
    var qualityChoice=getPlaySettings();
    var advertisedQuality=active&&active.sources&&active.sources[source]&&
      active.sources[source].qualitys||[];
    var missingFixed=MODERN_WEB&&qualityChoice.qualityMode==='fixed'&&
      Array.isArray(advertisedQuality)&&advertisedQuality.length>0&&
      !advertisedQuality.some(function(q){
        return String(q||'').toLowerCase()===String(qualityChoice.fixedQuality||'').toLowerCase();
      });
    if (MODERN_WEB && !plan.length && active && active.inited &&
        active.sources && active.sources[source] &&
        Array.isArray(active.sources[source].qualitys) &&
        active.sources[source].qualitys.length) {
      var requested=getPlaySettings();
      var advertised=active.sources[source].qualitys||[];
      setStatus('当前野花渠道未声明支持 '+escapeHtml(requested.qualityMode==='fixed'?requested.fixedQuality:'所选音质')+
        '。可用：'+escapeHtml(advertised.join('、')||'未知')+'。未擅自改成128k。','fail');
      return;
    }
    if (!plan.length) {
      // Startup placeholder only: it MUST be recalculated after Flower
      // initialization, never become a permanent forced 128k selection.
      var savedSettings=getPlaySettings();
      plan=[MODERN_WEB&&savedSettings.qualityMode==='fixed'
        ?savedSettings.fixedQuality:'128k'];
    }
    if (LEGACY_NATIVE_MEDIA) {
      // MP3-compatible qualities first even when a device previously saved
      // a FLAC-only preference that cannot be decoded on Android 4.4.
      var legacyPlan = [], preferred = ['128k','192k','256k','320k'];
      for (var li=0;li<preferred.length;li++) {
        for (var pi=0;pi<plan.length;pi++) {
          if(String(plan[pi]).toLowerCase()===preferred[li] &&
             legacyPlan.indexOf(plan[pi])<0)legacyPlan.push(plan[pi]);
        }
      }
      if(legacyPlan.length)plan=legacyPlan;
    }

    if (NATIVE_COMPANION) {
      // Native MediaPlayer does not emit HTMLAudioElement metadata events.
      // Show the selected song immediately instead of "未播放" during playback.
      var songTitle = document.getElementById('player-title');
      var songArtist = document.getElementById('player-artist');
      if (songTitle) songTitle.textContent = String(music && music.name || '未知歌曲');
      if (songArtist) songArtist.textContent = String(music && (music.singer || music.artist) || '—');
      syncNativeTransportIcon(false);
    }
    var token = playbackToken;
    playbackState = {
      token: token,
      music: music,
      source: source,
      plan: plan,
      index: 0,
      quality: plan[0],
      initialQuality: missingFixed ? qualityChoice.fixedQuality : plan[0],
      qualityFallbackReason: missingFixed&&qualityChoice.autoFallback&&plan.length
        ? '音源未声明支持 '+qualityChoice.fixedQuality+'，已按允许降级设置选择128k'
        : '',
      url: '',
      waitingForAudio: false,
      playing: false,
      transport: '',
      sourceUrl: '',
      // Measurement only; do not persist any music URLs or credentials.
      startedResolvingAtMs: Date.now ? Date.now() : new Date().getTime(),
      addressResolveMs: -1,
      directProxyRetry: false,
      confirmTimer: null,
      miguDeadlineTimer: null,
      miguLastAudioTime: 0,
      miguLastProgressAt: 0,
      activeSourceId: String(active && (active.id || active.url) || ''),
      forceFullResolve: legacyFullResolveNext
    };
    legacyFullResolveNext = false;

    armMiguPlaybackDeadline(playbackState);
    if(missingFixed&&qualityChoice.autoFallback&&plan.length){
      setStatus('野花渠道不支持 '+escapeHtml(qualityChoice.fixedQuality)+
        '，已获你的允许，降到 '+escapeHtml(plan[0])+' 进行播放解析。','warn');
    }
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
    // For Migu keep the 25-second deadline until continuous, plausible
    // playback is established at that checkpoint (see Issue #13).
    if (state.source !== 'mg') clearMiguPlaybackDeadline(state);
    state.waitingForAudio = false;
    state.playing = true;
    if (global.LXMusicLibrary) {
      global.LXMusicLibrary.addHistory(state.music);
      renderLibrary();
    }
    var downgraded=state.initialQuality && state.initialQuality!==state.quality;
    var qualityMessage='请求 '+state.quality+
      (downgraded?'（由 '+state.initialQuality+' 降级；'+(state.qualityFallbackReason||'高音质不可用')+'）':'')+
      ' · 实际码率未经检测';
    setStatus((state.manualAlternativeOrigin==='kg' ? '已手动确认的酷我备用版本' :
      (CHANNEL_NAMES[state.source]||state.source.toUpperCase()))+
      ' 正在播放 · '+escapeHtml(qualityMessage),'ready');
    var playbackQualityNode=document.getElementById('inline-current-quality');
    if(playbackQualityNode)playbackQualityNode.textContent='本曲：'+qualityMessage;
    loadLyricsForState(state);
    return true;
  }

  function handleAudioPlaying(expectedToken, expectedUrl) {
    var state = playbackState;
    var audio = document.getElementById('audio');
    if (!state || state.token !== playbackToken || !audio) return;
    if (expectedToken != null && expectedToken !== state.token) return;
    if (expectedUrl && state.url !== expectedUrl) return;
    noteMiguPlaybackProgress(state, audio);
    if (!state.waitingForAudio) return;

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

    if (MODERN_WEB && settings.autoFallback && state.index+1<state.plan.length) {
      var lower=state.plan[state.index+1];
      state.qualityFallbackReason='高音质地址返回后无法播放';
      setStatus('请求 '+escapeHtml(failedQuality)+' 的链接无法播放，正在按设置降至 '+
        escapeHtml(lower)+'……','warn');
      return requestQuality(state.music,state.source,buildMusicInfo(state.music,state.source),
        state.plan,state.index+1,state.token);
    }
    if (NATIVE_COMPANION || MODERN_WEB) {
      setStatus(MODERN_WEB ? '音频播放连接失败。请重新点选歌曲。' :
        '野花已返回地址，但原生播放失败。', 'fail');
      return;
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

    if (addToQueue !== false) resetShuffleHistory(music);
    if (addToQueue !== false && global.LXMusicLibrary) {
      global.LXMusicLibrary.addQueue(music);
      renderLibrary();
    }
    startPlayback(music, source);
  }

  function getPlaybackMode() {
    return global.LXPlayerControls && global.LXPlayerControls.getMode ?
      global.LXPlayerControls.getMode() : 'sequence';
  }

  function resetShuffleHistory(music) {
    shuffleHistory = music ? [musicKey(music)] : [];
    shuffleCursor = shuffleHistory.length ? 0 : -1;
  }

  function moveToTrackInList(track, items) {
    if (!track) return;
    var session = playlistPlayback;
    if (session && session.tracks[session.index] &&
        musicKey(playbackState.music) === musicKey(session.tracks[session.index])) {
      var index = findPlaylistSongIndex(session.tracks, track);
      if (index >= 0) {
        session.index = index;
        ensurePlaylistQueueWindow(session, index);
        playLibraryMusic(session.tracks[index]);
        maybePrefetchPlaylist(session);
        return;
      }
    }
    playLibraryMusic(track);
  }

  function playShuffleOffset(offset) {
    if (!playbackState || !global.LXMusicLibrary) return;
    var session = playlistPlayback;
    var sessionCurrent = !!(session && session.tracks[session.index] &&
      musicKey(playbackState.music) === musicKey(session.tracks[session.index]));
    var list = sessionCurrent ? session.tracks : global.LXMusicLibrary.snapshot().queue;
    var currentKey = musicKey(playbackState.music);
    if (!shuffleHistory.length || shuffleHistory[shuffleCursor] !== currentKey) {
      resetShuffleHistory(playbackState.music);
    }
    if (offset < 0) {
      if (shuffleCursor <= 0) {
        setStatus('已经是随机播放记录中的第一首。', 'ready');
        return;
      }
      shuffleCursor -= 1;
    } else if (shuffleCursor + 1 < shuffleHistory.length) {
      shuffleCursor += 1;
    } else {
      if (list.length < 2) {
        if (sessionCurrent && session.hasMore) {
          session.pendingNext = true;
          fetchMorePlaylistTracks(session);
          return;
        }
        setStatus('播放队列中没有其他可随机播放的歌曲。', 'ready');
        return;
      }
      var currentIndex = findPlaylistSongIndex(list, playbackState.music);
      var nextIndex = Math.floor(Math.random() * (list.length - 1));
      if (currentIndex >= 0 && nextIndex >= currentIndex) nextIndex += 1;
      shuffleHistory = shuffleHistory.slice(0, shuffleCursor + 1);
      shuffleHistory.push(musicKey(list[nextIndex]));
      if (shuffleHistory.length > 200) shuffleHistory.shift();
      shuffleCursor = shuffleHistory.length - 1;
    }
    var key = shuffleHistory[shuffleCursor];
    for (var i = 0; i < list.length; i += 1) {
      if (musicKey(list[i]) === key) {
        moveToTrackInList(list[i], list);
        return;
      }
    }
    setStatus('随机播放记录中的歌曲暂不在当前队列。', 'warn');
  }

  function playQueuedOffset(offset) {
    if (!global.LXMusicLibrary || !playbackState) return;
    var mode = getPlaybackMode();
    if (mode === 'shuffle') return playShuffleOffset(offset);
    var session = playlistPlayback;
    if (session && session.tracks[session.index] &&
        musicKey(playbackState.music) === musicKey(session.tracks[session.index])) {
      var nextIndex = session.index + offset;
      if (nextIndex < 0) {
        if (mode === 'list-loop') nextIndex = session.tracks.length - 1;
        else {
          setStatus('已经是歌单第一首。', 'ready');
          return;
        }
      }
      if (nextIndex >= session.tracks.length) {
        if (offset > 0 && session.hasMore) {
          session.pendingNext = true;
          setStatus('正在读取歌单下一页歌曲……');
          fetchMorePlaylistTracks(session);
        } else if (mode === 'list-loop') nextIndex = 0;
        else {
          setStatus('已经是歌单最后一首。', 'ready');
          return;
        }
        if (session.hasMore) return;
      }
      session.index = nextIndex;
      ensurePlaylistQueueWindow(session, nextIndex);
      playLibraryMusic(session.tracks[nextIndex]);
      maybePrefetchPlaylist(session);
      return;
    }
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
      if (mode === 'list-loop') targetIndex = queue.length - 1;
      else {
        setStatus('已经是播放队列第一首。', 'ready');
        return;
      }
    }
    if (targetIndex >= queue.length) {
      if (mode === 'list-loop') targetIndex = 0;
      else {
        setStatus('已经是播放队列最后一首。', 'ready');
        return;
      }
    }
    playLibraryMusic(queue[targetIndex]);
  }

  function playNextQueued() {
    if (!playbackState) return;
    if (getPlaybackMode() === 'single-loop') {
      var audio = document.getElementById('audio');
      if (!audio || !playbackState.url) return;
      try {
        audio.currentTime = 0;
        var nextPlay = audio.play();
        playbackState.playing = true;
        if (nextPlay && typeof nextPlay.catch === 'function') {
          var state = playbackState;
          nextPlay.catch(function () {
            if (playbackState !== state) return;
            state.playing = false;
            setStatus('单曲循环需要手动启动，请点击播放器中的播放按钮。', 'warn');
          });
        }
      } catch (e) {
        playbackState.playing = false;
        setStatus('当前音频无法从头重新播放，请手动点击播放。', 'warn');
      }
      return;
    }
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
    if (NATIVE_COMPANION) {
      // The APK has exactly one playback source. Hide the old imports,
      // delete/switch-source controls and misleading diagnostics, but keep
      // the one useful Flower refresh action.
      var obsoleteIds=['install-btn','verified-install-btn','sixyin-install-btn',
        'clear-btn','source-url','runtime-info'];
      for (var oi=0;oi<obsoleteIds.length;oi++) {
        var oldControl=document.getElementById(obsoleteIds[oi]);
        if (oldControl) oldControl.style.display='none';
      }
      var sourceUrlLabel=document.querySelector('label[for="source-url"]');
      if (sourceUrlLabel) sourceUrlLabel.style.display='none';
      var flowerRefresh=document.getElementById('restore-default-sources-btn');
      if (flowerRefresh) flowerRefresh.textContent='重新加载野花音源';
    }
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
    if (LEGACY_NATIVE_MEDIA) {
      var manualPanel=document.getElementById('legacy-media-panel');
      if (manualPanel) manualPanel.className='legacy-media-panel';
      var proxyBtn=document.getElementById('legacy-proxy-btn');
      var directBtn=document.getElementById('legacy-direct-btn');
      var externalLink=document.getElementById('legacy-external-player');
      if (proxyBtn)proxyBtn.onclick=function(){retryLegacyStream(false);};
      if (directBtn)directBtn.onclick=function(){retryLegacyStream(true);};
      if (externalLink)externalLink.onclick=function(event){
        if (externalLink.getAttribute('aria-disabled')==='true') {
          if (event && event.preventDefault)event.preventDefault();
          setStatus('请先选择歌曲，等待音频地址解析完成。', 'warn');
          return false;
        }
        // Native handoff is outside browser control. A click is NOT proof
        // that Android launched an app, obtained media or played audio.
        setStatus('已尝试唤起 Android 系统播放器。若没有弹出应用选择器，请在“系统播放器测试”中使用直接音频地址尝试。', 'warn');
      };
    }
    if (audio) {
      if (global.LXPlayerControls) {
        global.LXPlayerControls.init(audio, {
          getState: function () { return playbackState; },
          onMessage: setStatus,
          onModeChange: function (mode) {
            if (mode === 'shuffle' && playbackState) resetShuffleHistory(playbackState.music);
            setStatus('播放模式已切换为：' +
              (mode === 'sequence' ? '顺序播放' :
               mode === 'list-loop' ? '列表循环' :
               mode === 'single-loop' ? '单曲循环' : '随机播放'), 'ready');
          }
        });
      }
      if (NATIVE_COMPANION) {
        var nativeToggle = document.getElementById('player-toggle-btn');
        if (nativeToggle) nativeToggle.onclick = function() {
          var current = playbackState;
          if (!current || !current.url || !current.nativePlayback) {
            setStatus('请先选择歌曲，等待音频下载完成后使用播放按钮。', 'warn');
            return;
          }
          try {
            if (current.playing) global.LXNativeAudio.pause();
            else global.LXNativeAudio.resume();
          } catch (e) { setStatus('原生播放控制暂时不可用。', 'fail'); }
        };
        syncNativeTransportIcon(false);
      }
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
      // The page's legacy inline script may replace ontimeupdate later;
      // keep synchronization attached as a durable event listener.
      audio.addEventListener('timeupdate',syncLyrics);
    }

    document.getElementById('verified-install-btn').onclick = function () {
      document.getElementById('source-url').value =
        'https://raw.githubusercontent.com/pdone/lx-music-source/main/huibq/latest.js';
      setStatus('正在获取并初始化 GitHub 上的 Huibq 原始音源……');
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
        setStatus('已导入 Huibq 原始 LX 音源：' + escapeHtml(item.name) + ' ' +
          escapeHtml(item.version || '') + '（实际播放能力依赖上游服务）', 'ready');
      });
    };

    document.getElementById('sixyin-install-btn').onclick = function () {
      document.getElementById('source-url').value =
        'https://raw.githubusercontent.com/pdone/lx-music-source/main/sixyin/latest.js';
      document.getElementById('install-btn').click();
    };

    var restoreSourcesButton = document.getElementById('restore-default-sources-btn');
    if (restoreSourcesButton) restoreSourcesButton.onclick = function () {
      restoreSourcesButton.disabled = true;
      setStatus(NATIVE_COMPANION ? '正在重新加载野花音源……' :
        '正在恢复 Flower 与 Huibq 默认音源，请稍候……');
      global.LXSourceManager.restoreDefaults(function (err) {
        restoreSourcesButton.disabled = false;
        if (err) setStatus('部分默认音源导入失败：' + escapeHtml(err.message || err), 'warn');
        else setStatus(NATIVE_COMPANION ?
          '已重新加载野花音源，初始化完成后可以继续播放。' :
          '默认音源已就绪。可在上方选择当前音源。', 'ready');
      });
    };

    document.getElementById('clear-btn').onclick = function () {
      global.LXSourceManager.clear();
      setCheck('check-storage', 'pending');
      setCheck('check-inited', 'pending');
      setStatus('已清空本地音源。');
    };

    document.getElementById('clear-queue-btn').onclick = function () {
      if (global.LXMusicLibrary) {
        playlistPlayback = null;
        resetShuffleHistory(null);
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
    var channel=selectedChannel,token=++searchToken;
    if(songSearchObserver){songSearchObserver.disconnect();songSearchObserver=null;}
    songSearchSession={
      keyword:keyword,channel:channel,token:token,page:0,
      loading:false,hasMore:true,seen:Object.create(null),count:0
    };
    global.dispatchEvent(new CustomEvent('fymusic:search-start',{detail:{
      id:token,source:channel
    }}));
    resultsEl.innerHTML='';
    global.__LXLastSearchResults=[];
    loadNextSongSearchPage();
  }

  function updateSongSearchFooter(message,finished) {
    var footer=document.getElementById('song-search-footer');
    if(!footer)return;
    footer.textContent=message;
    footer.hidden=false;
    footer.setAttribute('aria-busy',String(!finished));
    if(finished)footer.dataset.finished='1';else footer.dataset.finished='0';
  }

  function loadNextSongSearchPage() {
    var session=songSearchSession;
    if(!session||session.loading||!session.hasMore||
       session.token!==searchToken||session.channel!==selectedChannel)return;
    session.loading=true;
    var nextPage=session.page+1;
    updateSongSearchFooter(nextPage===1?'正在搜索歌曲…':'正在加载更多歌曲…',false);
    global.LXMusicSearch.search(session.channel,session.keyword,nextPage,20,function(err,result) {
      if(songSearchSession!==session||session.token!==searchToken||selectedChannel!==session.channel)return;
      session.loading=false;
      if(err){
        if(nextPage===1){
          var errorText=String(err&&err.message||err||'');
          var errorClass=/timeout|超时/i.test(errorText)?'timeout':
            /\bHTTP\s+[45][0-9][0-9]\b/i.test(errorText)?'http_error':
            /network|socket|网络|failed/i.test(errorText)?'network':'unknown';
          global.dispatchEvent(new CustomEvent('fymusic:search-error',{detail:{
            id:session.token,source:session.channel,code:errorClass
          }}));
          setStatus('搜索失败：'+escapeHtml(err.message||err)+'。可重新搜索。','fail');
          resultsEl.innerHTML='<div class="empty-note">网络或音源暂时不可用。<button type="button" id="retry-song-search">重新搜索</button></div>';
          var retry=document.getElementById('retry-song-search');
          if(retry)retry.onclick=function(){searchAndRender(session.keyword);};
        }
        updateSongSearchFooter('加载失败 · 向下滑动可重试',false);
        return;
      }
      var list=Array.isArray(result&&result.list)?result.list:[];
      var unique=[];
      for(var i=0;i<list.length;i++){
        var item=list[i];
        var key=String(item.source||session.channel)+':'+String(item.id||item.songmid||item.name||'')+
          ':'+String(item.singer||'');
        if(session.seen[key])continue;
        session.seen[key]=1;unique.push(item);
      }
      global.dispatchEvent(new CustomEvent('fymusic:search-page',{detail:{
        id:session.token,source:session.channel,page:nextPage,
        provider:String(result&&result.searchProvider||'unknown'),
        items:unique.slice(0,160).map(function(x){return {
          name:x.name,singer:x.singer,source:x.source||session.channel
        };})
      }}));
      session.page=nextPage;
      session.count+=unique.length;
      var counter=document.getElementById('song-result-counter');
      if(counter)counter.textContent='已加载 '+session.count+' 首';
      // Stop if a provider replays a full duplicate page. Do not burn
      // dozens of speculative requests for identical content.
      session.hasMore=list.length>=20&&unique.length>0&&nextPage<50&&session.count<1000;
      global.__LXLastSearchResults=global.__LXLastSearchResults.concat(unique);
      renderSearchResults(unique,true);
      setStatus('搜索结果：已加载 '+session.count+' 首歌曲。','ready');
      updateSongSearchFooter(session.hasMore?'继续向下滑动，加载更多歌曲':'已全部加载 · 共 '+session.count+' 首',!session.hasMore);
      // If the list does not fill the viewport, request another page
      // without waiting for a scroll event (bounded by page count).
      if(songSearchObserver) songSearchObserver.disconnect();
      var footer=document.getElementById('song-search-footer');
      if(footer&&session.hasMore&&typeof IntersectionObserver==='function'){
        songSearchObserver=new IntersectionObserver(function(entries){
          if(entries.some(function(x){return x.isIntersecting;})){
            if(songSearchObserver) songSearchObserver.disconnect();
            loadNextSongSearchPage();
          }
        },{root:null,rootMargin:'0px 0px 180px 0px',threshold:0});
        songSearchObserver.observe(footer);
      }
    });
  }

  function renderSearchResults(items,append) {
    if(!append)resultsEl.replaceChildren();
    var fragment=document.createDocumentFragment();
    var startIndex=resultsEl.querySelectorAll('.search-song-row').length;

    function actionButton(text,cls,aria,handler) {
      var button=document.createElement('button');
      button.type='button';button.className=cls;button.textContent=text;
      button.setAttribute('aria-label',aria);
      button.onclick=function(event){event.stopPropagation();handler(button);};
      return button;
    }

    for(let i=0;i<items.length;i++){
      const item=items[i]||{};
      const row=document.createElement('div');
      row.className='search-row search-song-row';
      var index=document.createElement('span');
      index.className='song-row-index';
      index.textContent=String(startIndex+i+1);
      var main=document.createElement('div');
      main.className='search-song-main';
      main.tabIndex=0;
      main.setAttribute('role','button');
      main.setAttribute('aria-label','播放 '+String(item.name||'未知歌曲'));
      main.title='点击播放歌曲';
      var name=document.createElement('b');name.className='song-title';
      name.textContent=String(item.name||'未知歌曲');
      var artist=document.createElement('span');artist.className='song-artist';
      artist.textContent=String(item.singer||'未知歌手');
      main.append(name,artist);
      // Kugou may return several recordings with identical title/artist.
      // Display the actual per-row album and duration so users can select
      // the intended version; never silently reorder or auto-select results.
      if(String(item.source||'').toLowerCase()==='kg'){
        var album=String(item.albumName||item.album||'').trim();
        var duration=String(item.interval||'').trim();
        var details=[];
        if(album)details.push('专辑：'+album.slice(0,64));
        if(/^\d{1,3}:\d{2}$/.test(duration))details.push(duration);
        if(details.length){
          var versionMeta=document.createElement('small');
          versionMeta.className='song-version-meta';
          versionMeta.textContent=details.join(' · ');
          var trackId=String(item.songmid||item.id||'');
          if(/^\d{1,20}$/.test(trackId))
            versionMeta.title='酷狗音频 ID：'+trackId;
          main.appendChild(versionMeta);
        }
      }
      var source=document.createElement('small');
      source.className='search-source';
      source.textContent=String(CHANNEL_NAMES[item.source]||item.source||'');
      var actions=document.createElement('div');actions.className='search-actions';
      const play=function(){
        global.dispatchEvent(new CustomEvent('fymusic:search-selection',{detail:{
          name:item.name,singer:item.singer,source:item.source||selectedChannel
        }}));
        testMusic(item,true);
      };
      main.onclick=play;
      main.onkeydown=function(event){
        if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();play();}
      };
      row.onclick=function(event){
        if(event.target.closest('button,summary,details,.search-song-main,a'))return;
        // The whitespace inside a music row is part of the play target.
        play();
      };
      row.classList.add('tap-to-play');
      actions.appendChild(actionButton('▶','song-action-play','播放 '+String(item.name||''),play));
      function addToQueue(){
        if(global.LXMusicLibrary)global.LXMusicLibrary.addQueue(item);
        renderLibrary();
        setStatus('已加入播放队列：'+escapeHtml(item.name),'ready');
      }
      function toggleFavorite(){
        if(global.LXMusicLibrary)global.LXMusicLibrary.toggleFavorite(item);
        renderLibrary();
        var favored=global.LXMusicLibrary&&global.LXMusicLibrary.isFavorite(item);
        var newText=favored?'取消收藏':'收藏';
        var buttons=row.querySelectorAll('.song-action-favorite');
        for(var j=0;j<buttons.length;j++){
          buttons[j].textContent=newText;
          buttons[j].setAttribute('aria-label',newText+' '+String(item.name||''));
        }
      }
      var favored=global.LXMusicLibrary&&global.LXMusicLibrary.isFavorite(item);
      var favoriteLabel=favored?'取消收藏':'收藏';
      actions.appendChild(actionButton('加入队列','song-action-queue','加入队列 '+String(item.name||''),addToQueue));
      actions.appendChild(actionButton(favoriteLabel,'song-action-favorite',favoriteLabel+' '+String(item.name||''),toggleFavorite));
      const more=document.createElement('details');more.className='song-more';
      var summary=document.createElement('summary');
      summary.textContent='···';summary.title='更多操作';
      summary.setAttribute('aria-label','更多操作 '+String(item.name||''));
      var menu=document.createElement('div');menu.className='song-more-menu';
      menu.appendChild(actionButton('加入队列','song-action-queue','加入队列 '+String(item.name||''),function(){
        addToQueue();more.open=false;
      }));
      menu.appendChild(actionButton(favoriteLabel,'song-action-favorite',favoriteLabel+' '+String(item.name||''),function(){
        toggleFavorite();more.open=false;
      }));
      more.append(summary,menu);actions.appendChild(more);
      row.append(index,main,source,actions);
      fragment.appendChild(row);
    }
    resultsEl.appendChild(fragment);
  }

  function retryLegacyStream(direct) {
    if (!LEGACY_NATIVE_MEDIA || !playbackState || !playbackState.sourceUrl) {
      setStatus('请先点选一首歌曲，等待播放地址返回，再选择传输线路。', 'warn');
      return;
    }
    // Direct CDN links are intentionally unsupported by the companion APK
    // native bridge. A manual "direct" retry must not bypass that boundary.
    var inCompanion = nativeAudioReady();
    legacyPreferDirect = direct === true && !inCompanion;
    var state = playbackState;
    var oldUrl = state.sourceUrl;
    var quality = state.quality;
    var source = state.source;
    // Do not redo musicUrl resolution: the signed source URL is already
    // available. Only switch whether the media bytes pass through our proxy.
    useResolvedUrl(oldUrl,quality,state.token,state.music,source,
      buildMusicInfo(state.music,source),getPlaySettings(),
      state.resolver,state.resolverProvider,!legacyPreferDirect);
    if (inCompanion) {
      setStatus('Android 4.4 原生播放器仅支持本站安全代理线路，已重新尝试播放。', 'warn');
    } else {
      setStatus('已切换至'+(legacyPreferDirect?'直接连接':'项目代理')+
        '线路。请再次点击下方原生音频控件中的 ▶。', 'warn');
    }
  }

  global.OnlyTestingMusicApp = {
    retryLegacyStream: retryLegacyStream,
    renderSources: renderSources,
    onSourceInited: onSourceInited,
    playPlaylist: startPlaylistPlayback,
    playMusic: function (music) {
      if (!music) return;
      playlistPlayback = null;
      resetShuffleHistory(music);
      var source = music.source ? String(music.source).toLowerCase() : '';
      if (source) selectedChannel = source;
      renderChannelSelectors();
      testMusic(music, true);
    },
    replayCurrentWithSettings: function(){
      var current=lastRequestedPlayback||
        (playbackState&&playbackState.music?{music:playbackState.music,source:playbackState.source}:null);
      if(!current)return false;
      var music=current.music,source=current.source;
      selectedChannel=source;
      renderChannelSelectors();
      startPlayback(music,source);
      return true;
    },
    addToQueue: function (music) {
      if (!music || !global.LXMusicLibrary) return;
      global.LXMusicLibrary.addQueue(music);
      renderLibrary();
    },
    renderLibraryListForExternal: renderLibraryList,
    onFlowerBootstrapError: function(error) {
      if (!NATIVE_COMPANION) return;
      setStatus('野花音源自动导入失败：' +
        escapeHtml(error && (error.message || error) || '网络连接失败') +
        '。请在设置中点击「重新加载野花」。', 'fail');
    }
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
