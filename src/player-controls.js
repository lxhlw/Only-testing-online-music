(function (global) {
  'use strict';

  // Simple ES5 transport controls. Android 4.4 / Via cannot rely on modern
  // pointer events or CSS custom properties for native range inputs.
  var STORAGE_MODE = 'only-testing-online-music.player-mode';
  var STORAGE_VOLUME = 'only-testing-online-music.player-volume';
  var MODES = {
    sequence: '顺序播放',
    'list-loop': '列表循环',
    'single-loop': '单曲循环',
    shuffle: '随机播放'
  };
  var mode = 'sequence';
  try {
    var savedMode = global.localStorage.getItem(STORAGE_MODE);
    if (Object.prototype.hasOwnProperty.call(MODES, savedMode)) mode = savedMode;
  } catch (e) {}
  var audio = null;
  var seek = null;
  var dragging = false;
  var settings = {};

  function get(id) { return document.getElementById(id); }
  function show(node) {
    if (!node) return;
    // SVGElement.className is SVGAnimatedString on many old WebViews.
    var classes = String(node.getAttribute('class') || '');
    node.setAttribute('class', classes.replace(/\bhidden\b/g, '').replace(/^\s+|\s+$/g, ''));
  }
  function hide(node) {
    if (!node) return;
    var classes = String(node.getAttribute('class') || '');
    if ((' ' + classes + ' ').indexOf(' hidden ') < 0)
      node.setAttribute('class', classes + ' hidden');
  }
  function timeString(seconds) {
    var value = Math.floor(Number(seconds) || 0);
    if (!isFinite(value) || value < 0) value = 0;
    var minutes = Math.floor(value / 60);
    var remainder = value % 60;
    return String(minutes) + ':' + (remainder < 10 ? '0' : '') + String(remainder);
  }
  function duration() {
    var d = audio ? Number(audio.duration) : 0;
    return isFinite(d) && d > 0 ? d : 0;
  }
  function playableState() {
    return typeof settings.getState === 'function' ? settings.getState() : null;
  }
  function updateSeekFill() {
    if (!seek) return;
    var percent = Math.max(0, Math.min(100, Number(seek.value || 0) / 10));
    seek.style.background = 'linear-gradient(to right, #50bd8a 0%, #50bd8a ' +
      percent + '%, #deeee4 ' + percent + '%, #deeee4 100%)';
  }
  function setPlayIcon(playing) {
    var button = get('player-toggle-btn');
    if (!button) return;
    button.setAttribute('aria-label', playing ? '暂停' : '播放');
    button.title = playing ? '暂停' : '播放';
    var playIcon = button.querySelector('.player-play-icon');
    var pauseIcon = button.querySelector('.player-pause-icon');
    // Keep both the CSS class AND the inline SVG display state in sync.
    // The explicit style is also understood by old Android 4.4 WebViews.
    if (playing) {
      hide(playIcon);
      show(pauseIcon);
      if (playIcon) playIcon.style.display = 'none';
      if (pauseIcon) pauseIcon.style.display = 'block';
      button.className = 'player-icon-btn player-main-toggle is-playing';
    } else {
      show(playIcon);
      hide(pauseIcon);
      if (playIcon) playIcon.style.display = 'block';
      if (pauseIcon) pauseIcon.style.display = 'none';
      button.className = 'player-icon-btn player-main-toggle';
    }
  }
  function refresh() {
    if (!audio || !seek) return;
    var total = duration();
    var state = playableState();
    var valid = !!(total && state && state.url && !state.waitingForAudio);
    seek.disabled = !valid;
    get('player-duration').textContent = total ? timeString(total) : '0:00';
    if (!dragging) {
      var current = valid ? Math.max(0, Math.min(total, Number(audio.currentTime || 0))) : 0;
      seek.value = total ? String(Math.round(current / total * 1000)) : '0';
      get('player-current-time').textContent = timeString(current);
      updateSeekFill();
    }
    setPlayIcon(!audio.paused && !audio.ended);
  }
  function previewSeek() {
    if (!seek) return;
    var total = duration();
    var sliderValue = Number(seek.value || 0);
    var seconds = total * sliderValue / 1000;
    dragging = true;
    get('player-current-time').textContent = timeString(seconds);
    var tip = get('player-seek-preview');
    tip.textContent = timeString(seconds);
    tip.style.left = Math.max(7, Math.min(93, sliderValue / 10)) + '%';
    show(tip);
    updateSeekFill();
  }
  function commitSeek() {
    if (!seek || !audio) return;
    var state = playableState();
    var total = duration();
    var target = total * Number(seek.value || 0) / 1000;
    dragging = false;
    hide(get('player-seek-preview'));
    if (!state || state.waitingForAudio || !state.url || !total) {
      refresh(); return;
    }
    // Some media URLs do not support byte-range seeking. Report a seek
    // failure without replacing the resolved source or changing the queue.
    try {
      audio.currentTime = Math.min(total, Math.max(0, target));
      refresh();
    } catch (error) {
      refresh();
      if (typeof settings.onMessage === 'function')
        settings.onMessage('当前音频地址不支持进度跳转，可换一首或稍后重试。', 'warn');
    }
  }
  function renderMode() {
    var button = get('player-mode-btn');
    if (!button) return;
    button.title = '播放模式：' + MODES[mode];
    button.setAttribute('aria-label', button.title);
    button.setAttribute('data-mode', mode);
    var items = document.querySelectorAll('#player-mode-menu button[data-mode]');
    for (var i = 0; i < items.length; i += 1) {
      var selected = items[i].getAttribute('data-mode') === mode;
      items[i].setAttribute('aria-checked', selected ? 'true' : 'false');
      items[i].className = selected ? 'is-selected' : '';
    }
  }
  function closeMenu() {
    hide(get('player-mode-menu'));
    var btn = get('player-mode-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  function setMode(nextMode) {
    if (!Object.prototype.hasOwnProperty.call(MODES, nextMode)) return;
    mode = nextMode;
    try { global.localStorage.setItem(STORAGE_MODE, mode); } catch (e) {}
    renderMode();
    closeMenu();
    if (typeof settings.onModeChange === 'function') settings.onModeChange(mode);
  }
  function init(target, options) {
    if (!target || audio) return;
    audio = target;
    settings = options || {};
    seek = get('player-seek');
    var toggle = get('player-toggle-btn');
    toggle.onclick = function () {
      var state = playableState();
      if (!state || !state.url) {
        if (typeof settings.onMessage === 'function')
          settings.onMessage('请先选择一首歌曲。', 'warn');
        return;
      }
      if (!audio.paused && !audio.ended) {
        audio.pause(); refresh(); return;
      }
      try {
        var result = audio.play();
        if (result && typeof result.catch === 'function') result.catch(function () {
          if (typeof settings.onMessage === 'function')
            settings.onMessage('浏览器未能开始播放，请检查音源和设备的媒体支持。', 'warn');
          refresh();
        });
      } catch (e) {
        if (typeof settings.onMessage === 'function')
          settings.onMessage('当前浏览器无法启动此音频。', 'warn');
      }
    };

    seek.oninput = function () {
      if (!seek.disabled) previewSeek();
    };
    seek.onchange = commitSeek;
    // Android 4.4 does not reliably dispatch input on all range taps,
    // but change on release reliably commits the selected position.
    audio.addEventListener('timeupdate', refresh, false);
    audio.addEventListener('loadedmetadata', refresh, false);
    audio.addEventListener('durationchange', refresh, false);
    audio.addEventListener('playing', refresh, false);
    audio.addEventListener('play', refresh, false);
    audio.addEventListener('pause', refresh, false);
    audio.addEventListener('ended', refresh, false);
    audio.addEventListener('emptied', refresh, false);

    var modeButton = get('player-mode-btn');
    var menu = get('player-mode-menu');
    modeButton.onclick = function (ev) {
      if (ev && ev.stopPropagation) ev.stopPropagation();
      if ((' ' + menu.className + ' ').indexOf(' hidden ') >= 0) {
        show(menu);
        modeButton.setAttribute('aria-expanded', 'true');
      } else closeMenu();
    };
    var choices = menu.querySelectorAll('button[data-mode]');
    for (var i = 0; i < choices.length; i += 1) {
      choices[i].onclick = function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        setMode(this.getAttribute('data-mode'));
      };
    }
    document.addEventListener('click', function (ev) {
      if (ev && ev.target && menu.contains(ev.target)) return;
      closeMenu();
    }, false);
    document.addEventListener('keydown', function (ev) {
      if (ev && (ev.key === 'Escape' || ev.keyCode === 27)) closeMenu();
    }, false);

    var volume = get('player-volume');
    var volumeButton = get('player-volume-btn');
    var level = 80;
    try {
      var storedValue = global.localStorage.getItem(STORAGE_VOLUME);
      if (storedValue !== null && storedValue !== '') {
        var stored = Number(storedValue);
        if (isFinite(stored) && stored >= 0 && stored <= 100) level = stored;
      }
    } catch (e) {}
    volume.value = String(level);
    try { audio.volume = level / 100; } catch (e) {}
    function syncVolume() {
      volumeButton.textContent = audio.muted || audio.volume === 0 ? '♪̸' : '♫';
      volumeButton.title = audio.muted || audio.volume === 0 ? '取消静音' : '静音';
      volumeButton.setAttribute('aria-label', volumeButton.title);
    }
    volume.oninput = volume.onchange = function () {
      var value = Math.max(0, Math.min(100, Number(volume.value || 0)));
      try { audio.volume = value / 100; audio.muted = false; } catch (e) {}
      try { global.localStorage.setItem(STORAGE_VOLUME, String(value)); } catch (e) {}
      syncVolume();
    };
    volumeButton.onclick = function () {
      audio.muted = !audio.muted;
      syncVolume();
    };
    syncVolume();
    renderMode();
    refresh();
  }
  global.LXPlayerControls = { init: init, refresh: refresh, getMode: function () { return mode; }, setMode: setMode, timeString: timeString };
})(window);
