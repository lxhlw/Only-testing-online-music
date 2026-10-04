(function (global) {
  'use strict';

  var STORAGE_KEY = 'only-testing-online-music.play-settings';

  var DEFAULTS = {
    qualityMode: 'highest',
    fixedQuality: '320k',
    autoFallback: true
  };

  var QUALITY_RANK = {
    'flac32bit': 700,
    'flac24bit': 650,
    '24bit': 650,
    'flac': 600,
    '320k': 500,
    '256k': 400,
    '192k': 300,
    '128k': 100
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
    if (value.qualityMode === 'highest' || value.qualityMode === 'fixed') {
      result.qualityMode = value.qualityMode;
    }
    if (value.fixedQuality) result.fixedQuality = String(value.fixedQuality);
    if (value.autoFallback !== undefined) result.autoFallback = value.autoFallback !== false;
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

  function getQualityRank(value) {
    var key = String(value || '').toLowerCase();
    return QUALITY_RANK[key] || 0;
  }

  function normalizeQualityList(list) {
    var input = list instanceof Array ? list : [];
    var result = [];
    var seen = {};
    for (var i = 0; i < input.length; i += 1) {
      var value = String(input[i] || '');
      if (!value || seen[value]) continue;
      seen[value] = true;
      result.push(value);
    }
    result.sort(function (a, b) {
      var rankDiff = getQualityRank(b) - getQualityRank(a);
      if (rankDiff) return rankDiff;
      return a.localeCompare(b);
    });
    return result;
  }

  function buildPlan(available, settings) {
    var list = normalizeQualityList(available);
    if (!list.length) return [];

    var config = settings || load();
    if (config.qualityMode !== 'fixed') return list;

    var preferred = String(config.fixedQuality || '');
    var plan = [];
    if (list.indexOf(preferred) >= 0) {
      plan.push(preferred);
      for (var i = 0; i < list.length; i += 1) {
        if (list[i] === preferred) continue;
        if (getQualityRank(list[i]) < getQualityRank(preferred)) plan.push(list[i]);
      }
      if (!config.autoFallback) return [preferred];
      return plan;
    }

    if (!config.autoFallback) return [list[0]];
    return list;
  }

  function getPreferredQuality(available, settings) {
    var plan = buildPlan(available, settings);
    return plan.length ? plan[0] : null;
  }

  function getLabel(settings) {
    var config = settings || load();
    if (config.qualityMode === 'fixed') {
      return '固定音质：' + config.fixedQuality + (config.autoFallback ? '（失败自动降级）' : '');
    }
    return '最高音质优先' + (config.autoFallback ? '（失败自动降级）' : '');
  }

  global.LXPlaySettings = {
    defaults: cloneDefaults,
    load: load,
    save: save,
    qualityRank: getQualityRank,
    normalizeQualityList: normalizeQualityList,
    buildPlan: buildPlan,
    getPreferredQuality: getPreferredQuality,
    getLabel: getLabel,
    storageKey: STORAGE_KEY
  };
})(window);
