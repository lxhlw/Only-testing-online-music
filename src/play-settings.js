(function (global) {
  'use strict';

  var STORAGE_KEY = 'only-testing-online-music.play-settings';

  var DEFAULTS = {
    qualityMode: 'highest',
    fixedQuality: '320k',
    autoFallback: true
  };

  // Keep the canonical LX Music quality order and add common custom-source
  // extensions used by newer/third-party sources.
  var QUALITY_RANK = {
    'master': 900,
    'atmos_plus': 850,
    'atmos': 840,
    'hires': 820,
    'flac32bit': 800,
    'flac24bit': 750,
    '24bit': 740,
    'flac': 700,
    'wav': 650,
    'ape': 640,
    '320k': 500,
    '256k': 400,
    '192k': 300,
    '128k': 100
  };

  var QUALITY_LABELS = {
    '128k': '128k',
    '192k': '192k',
    '256k': '256k',
    '320k': '320k',
    'flac': 'FLAC',
    'flac24bit': 'FLAC 24bit',
    'flac32bit': 'FLAC 32bit',
    '24bit': '24bit',
    'wav': 'WAV',
    'ape': 'APE',
    'hires': 'Hi-Res',
    'atmos': 'Atmos',
    'atmos_plus': 'Atmos+',
    'master': 'Master'
  };

  function cloneDefaults() {
    return {
      qualityMode: DEFAULTS.qualityMode,
      fixedQuality: DEFAULTS.fixedQuality,
      autoFallback: DEFAULTS.autoFallback
    };
  }

  function sanitize(value) {
    var result = cloneDefaults();
    if (!value || typeof value !== 'object') return result;

    // New UI writes qualityMode/fixedQuality. Keep this permissive so older
    // stored settings remain usable after future UI changes.
    if (value.qualityMode === 'highest' || value.qualityMode === 'fixed') {
      result.qualityMode = value.qualityMode;
    }
    if (value.fixedQuality != null && String(value.fixedQuality)) {
      result.fixedQuality = String(value.fixedQuality);
    }
    if (value.autoFallback !== undefined) {
      result.autoFallback = value.autoFallback !== false;
    }
    return result;
  }

  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      return sanitize(raw ? JSON.parse(raw) : null);
    } catch (e) {
      return cloneDefaults();
    }
  }

  function save(value) {
    var next = sanitize(value);
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {}
    return next;
  }

  function getQualityKey(value) {
    return String(value || '').toLowerCase();
  }

  function getQualityRank(value) {
    var key = getQualityKey(value);
    return QUALITY_RANK[key] || 0;
  }

  function getQualityLabel(value) {
    var key = getQualityKey(value);
    return QUALITY_LABELS[key] || String(value || '');
  }

  function normalizeQualityList(list) {
    var input = Array.isArray(list) ? list : [];
    var result = [];
    var seen = {};

    for (var i = 0; i < input.length; i += 1) {
      var value = String(input[i] || '');
      var key = getQualityKey(value);
      if (!key || seen[key]) continue;
      seen[key] = true;
      result.push({
        value: value,
        rank: getQualityRank(value),
        sourceIndex: i
      });
    }

    result.sort(function (a, b) {
      var rankDiff = b.rank - a.rank;
      if (rankDiff) return rankDiff;
      return a.sourceIndex - b.sourceIndex;
    });

    var normalized = [];
    for (var j = 0; j < result.length; j += 1) {
      normalized.push(result[j].value);
    }
    return normalized;
  }

  function buildPlan(available, settings) {
    var list = normalizeQualityList(available);
    if (!list.length) return [];

    var config = settings || load();

    // Highest means: choose the best quality the current source declares.
    // With fallback disabled, request only that quality.
    if (config.qualityMode !== 'fixed') {
      return config.autoFallback ? list : [list[0]];
    }

    var preferred = String(config.fixedQuality || '');
    var preferredKey = getQualityKey(preferred);
    var preferredIndex = -1;
    for (var i = 0; i < list.length; i += 1) {
      if (getQualityKey(list[i]) === preferredKey) {
        preferredIndex = i;
        break;
      }
    }

    // Requested quality is unavailable. The safest fallback is the current
    // source's highest available quality, not a guessed quality key.
    if (preferredIndex < 0) {
      return config.autoFallback ? list : [list[0]];
    }

    // LX Music-style behavior: selected quality first, then only lower
    // quality levels. This avoids accidentally jumping back upward.
    if (!config.autoFallback) return [preferred];
    return list.slice(preferredIndex);
  }

  function getPreferredQuality(available, settings) {
    var plan = buildPlan(available, settings);
    return plan.length ? plan[0] : null;
  }

  function getLabel(settings) {
    var config = settings || load();
    if (config.qualityMode === 'fixed') {
      return '固定音质：' + getQualityLabel(config.fixedQuality) +
        (config.autoFallback ? '（失败自动降级）' : '');
    }
    return '最高音质优先' + (config.autoFallback ? '（失败自动降级）' : '');
  }

  global.LXPlaySettings = {
    defaults: cloneDefaults,
    load: load,
    save: save,
    qualityRank: getQualityRank,
    qualityLabel: getQualityLabel,
    normalizeQualityList: normalizeQualityList,
    buildPlan: buildPlan,
    getPreferredQuality: getPreferredQuality,
    getLabel: getLabel,
    storageKey: STORAGE_KEY
  };
})(window);
