        }
      }
    }
    musicInfo.source = source;
    musicInfo.songId = musicInfo.songId || music.id;
    if (!musicInfo.songmid && !musicInfo.hash && music.id != null) {
      musicInfo.songmid = String(music.id);
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
    if (!isFinite(actual) || actual <= 0 || !isFinite(expected) || expected <= 0) return false;
    if (expected >= 120) return actual < Math.max(30, expected * 0.45);
    if (expected >= 60) return actual < Math.max(20, expected * 0.45);
    if (expected >= 30) return actual < Math.max(15, expected * 0.40);
    return actual < Math.max(8, expected * 0.30);
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
    viaProvider
  ) {
    if (token !== playbackToken) return;

    var audio = document.getElementById('audio');
    var playableUrl = buildPlayableUrl(url);
    playbackState.waitingForAudio = true;
    playbackState.quality = quality;
    playbackState.url = playableUrl;
    playbackState.sourceUrl = url;
    playbackState.resolver = viaLabel || 'LX source';
    playbackState.resolverProvider = viaProvider || 'lx-source';
    playbackState.expectedDuration = getExpectedDurationSeconds(music);

    audio.onerror = function () {
      handleAudioError(token, playableUrl);
    };
    audio.onplaying = function () {
      handleAudioPlaying(token, playableUrl);
    };
    audio.onloadedmetadata = function () {
      if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
      var duration = Number(audio.duration || 0);
      if (isSuspiciousPlaybackDuration(duration, playbackState.expectedDuration)) {
        setStatus(
          '返回的 ' + escapeHtml(quality) + ' 地址疑似为错误/短音频（' +
          Math.round(duration) + ' 秒），正在自动更换解析器……',
          'warn'
        );
        handleAudioError(token, playableUrl);
      }
    };
    audio.preload = 'auto';
    audio.src = playableUrl;
    if (typeof audio.load === 'function') audio.load();

    document.getElementById('player-title').innerHTML = escapeHtml(music.name);
    document.getElementById('player-artist').innerHTML = escapeHtml(music.singer);
    setStatus(
      (CHANNEL_NAMES[source] || source.toUpperCase()) +
      ' 已返回 ' + escapeHtml(quality) + ' 播放地址' +
      (viaLabel ? '（' + escapeHtml(viaLabel) + '）' : '') +
      '，正在尝试播放。',
      'ready'
    );

    try {
      var playResult = audio.play();
      if (playResult && typeof playResult.catch === 'function') {
        playResult.catch(function () {
          if (token !== playbackToken || !playbackState || playbackState.url !== playableUrl) return;
          if (audio.error && settings.autoFallback) {
            handleAudioError(token, playableUrl);
            return;
          }
          setStatus(
            '已返回 ' + escapeHtml(quality) +
            ' 播放地址，但浏览器拒绝自动播放。可点击播放器播放。',
            'warn'
          );
        });
      }
    } catch (e) {
      if (audio.error && settings.autoFallback) {
        handleAudioError(token, playableUrl);
      } else {
        setStatus(
          '已返回 ' + escapeHtml(quality) +
          ' 播放地址，但浏览器未能自动播放。可点击播放器播放。',
          'warn'
        );
      }
    }
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
        if (global.LXMusicSearch && typeof global.LXMusicSearch.resolveMusicUrl === 'function') {
          return global.LXMusicSearch.resolveMusicUrl(source, musicInfo, quality, function (fallbackErr, fallbackResult) {
            if (token !== playbackToken) return;
            if (!fallbackErr && fallbackResult && fallbackResult.url) {
              return useResolvedUrl(
                fallbackResult.url,
                quality,
                token,
                music,
                source,
                musicInfo,
                settings,
                fallbackResult.provider === 'huibq'
                  ? 'Huibq 平台兜底'
                  : (fallbackResult.provider === 'tune-free' ? 'TuneHub 平台兜底' : 'GD Studio 平台兜底'),
                fallbackResult.provider
              );
            }
            if (settings.autoFallback && index + 1 < plan.length) {
              return requestQuality(music, source, musicInfo, plan, index + 1, token);
            }
            return setStatus('musicUrl 失败（' + escapeHtml(quality) + '）：'
              + escapeHtml(err.message || err)
              + (fallbackErr ? '；平台兜底也失败：' + escapeHtml(fallbackErr.message || fallbackErr) : ''),
              'fail');
          });
        }

        if (settings.autoFallback && index + 1 < plan.length) {
          return requestQuality(music, source, musicInfo, plan, index + 1, token);
        }
        return setStatus('musicUrl 失败（' + escapeHtml(quality) + '）：'
          + escapeHtml(err.message || err), 'fail');
      }

      var url = typeof result === 'string' ? result : (result && (result.url || result.result));
      if (url != null) url = String(url).replace(/^\s+|\s+$/g, '');
      if (!url || !/^https?:/i.test(url)) {
        if (global.LXMusicSearch && typeof global.LXMusicSearch.resolveMusicUrl === 'function') {
          return global.LXMusicSearch.resolveMusicUrl(source, musicInfo, quality, function (fallbackErr, fallbackResult) {
            if (token !== playbackToken) return;
            if (!fallbackErr && fallbackResult && fallbackResult.url) {
              return useResolvedUrl(
                fallbackResult.url,
                quality,
                token,
                music,
                source,
                musicInfo,
                settings,
                fallbackResult.provider === 'huibq'
                  ? 'Huibq 平台兜底'
                  : (fallbackResult.provider === 'tune-free' ? 'TuneHub 平台兜底' : 'GD Studio 平台兜底'),
                fallbackResult.provider
              );
            }
            if (settings.autoFallback && index + 1 < plan.length) {
              return requestQuality(music, source, musicInfo, plan, index + 1, token);
            }
            return setStatus('musicUrl 在 ' + escapeHtml(quality) + ' 下返回了无效结果。'
              + (fallbackErr ? '；平台兜底也失败：' + escapeHtml(fallbackErr.message || fallbackErr) : ''),
              'fail');
          });
        }
        if (settings.autoFallback && index + 1 < plan.length) {
          return requestQuality(music, source, musicInfo, plan, index + 1, token);
        }
        return setStatus('musicUrl 在 ' + escapeHtml(quality) + ' 下返回了无效结果。', 'fail');
      }

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