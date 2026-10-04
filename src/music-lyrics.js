(function (global) {
  'use strict';

  function cleanText(value) {
    return String(value == null ? '' : value)
      .replace(/^\uFEFF/, '')
      .replace(/\r/g, '');
  }

  function unwrap(value, depth) {
    if (depth > 4 || value == null) return value;
    if (typeof value === 'string') return value;
    if (typeof value !== 'object') return '';
    if (value.lyric != null) return value;
    if (value.lrc != null) return { lyric: value.lrc, tlyric: value.tlyric || value.translation || null };
    if (value.data != null) return unwrap(value.data, depth + 1);
    if (value.body != null) return unwrap(value.body, depth + 1);
    if (value.result != null) return unwrap(value.result, depth + 1);
    return value;
  }

  function normalize(value) {
    var unwrapped = unwrap(value, 0);
    if (typeof unwrapped === 'string') {
      return { lyric: cleanText(unwrapped), tlyric: null, rlyric: null, lxlyric: null };
    }
    if (!unwrapped || typeof unwrapped !== 'object') {
      return { lyric: '', tlyric: null, rlyric: null, lxlyric: null };
    }

    return {
      lyric: cleanText(unwrapped.lyric || unwrapped.lrc || ''),
      tlyric: cleanText(unwrapped.tlyric || unwrapped.translation || ''),
      rlyric: cleanText(unwrapped.rlyric || unwrapped.romaji || ''),
      lxlyric: cleanText(unwrapped.lxlyric || '')
    };
  }

  function parseTimestamp(text) {
    var value = Number(text);
    return isNaN(value) ? 0 : value;
  }

  function parseLrc(text) {
    var source = cleanText(text);
    var lines = [];
    var rawLines = source.split('\n');

    for (var i = 0; i < rawLines.length; i += 1) {
      var raw = rawLines[i];
      var match;
      var timestamps = [];
      var re = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,3}))?\]/g;

      while ((match = re.exec(raw))) {
        var minute = parseTimestamp(match[1]);
        var second = parseTimestamp(match[2]);
        var fraction = match[3] ? Number('0.' + match[3]) : 0;
        timestamps.push(minute * 60 + second + fraction);
      }

      var content = raw.replace(/\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?\]/g, '').replace(/^\s+|\s+$/g, '');
      if (!timestamps.length) continue;

      for (var t = 0; t < timestamps.length; t += 1) {
        if (!content) continue;
        lines.push({ time: timestamps[t], text: content });
      }
    }

    lines.sort(function (a, b) {
      return a.time - b.time;
    });
    return lines;
  }

  function getActiveLine(lines, currentSeconds) {
    if (!(lines instanceof Array) || !lines.length) return -1;
    var time = Number(currentSeconds);
    if (!isFinite(time) || time < 0) time = 0;

    var active = -1;
    for (var i = 0; i < lines.length; i += 1) {
      if (lines[i].time <= time) active = i;
      else break;
    }
    return active;
  }

  global.LXMusicLyrics = {
    normalize: normalize,
    parseLrc: parseLrc,
    getActiveLine: getActiveLine
  };
})(window);
