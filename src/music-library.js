(function (global) {
  'use strict';

  var STORAGE_KEY = 'only-testing-online-music.library';
  var MAX_QUEUE = 100;
  var MAX_HISTORY = 50;
  var MAX_FAVORITES = 200;

  function loadState() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var value = raw ? JSON.parse(raw) : null;
      if (!value || typeof value !== 'object') throw new Error('invalid library');
      return {
        queue: value.queue instanceof Array ? value.queue : [],
        history: value.history instanceof Array ? value.history : [],
        favorites: value.favorites instanceof Array ? value.favorites : []
      };
    } catch (e) {
      return { queue: [], history: [], favorites: [] };
    }
  }

  var state = loadState();
  var listeners = [];

  function persist() {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
    notify();
  }

  function notify() {
    for (var i = 0; i < listeners.length; i += 1) {
      try { listeners[i](snapshot()); } catch (e) {}
    }
  }

  function snapshot() {
    return {
      queue: state.queue.slice(),
      history: state.history.slice(),
      favorites: state.favorites.slice()
    };
  }

  function keyOf(music) {
    if (!music) return '';
    var source = String(music.source || '').toLowerCase();
    var id = String(music.id || music.songId || music.songmid || music.mid || music.hash || '');
    return source + ':' + id;
  }

  function normalizeMusic(music) {
    if (!music || typeof music !== 'object') return null;
    var item = {};
    var fields = [
      'id', 'name', 'singer', 'source', 'albumName', 'interval',
      'songmid', 'mediaMid', 'albumId', 'image', 'lyricId', 'meta', 'raw'
    ];
    for (var i = 0; i < fields.length; i += 1) {
      var key = fields[i];
      if (music[key] !== undefined && music[key] !== null) item[key] = music[key];
    }
    if (!item.id && !item.songmid && !item.raw) return null;
    item.source = String(item.source || '').toLowerCase();
    item.name = String(item.name || '');
    item.singer = String(item.singer || '');
    return item;
  }

  function findIndex(list, music) {
    var key = keyOf(music);
    if (!key) return -1;
    for (var i = 0; i < list.length; i += 1) {
      if (keyOf(list[i]) === key) return i;
    }
    return -1;
  }

  function addUnique(list, music, limit, atFront) {
    var item = normalizeMusic(music);
    if (!item) return false;
    var old = findIndex(list, item);
    if (old >= 0) list.splice(old, 1);
    if (atFront) list.unshift(item);
    else list.push(item);
    while (list.length > limit) list.pop();
    return true;
  }

  function addQueue(music) {
    var changed = addUnique(state.queue, music, MAX_QUEUE, false);
    if (changed) persist();
    return changed;
  }

  function removeQueue(music) {
    var index = findIndex(state.queue, music);
    if (index < 0) return false;
    state.queue.splice(index, 1);
    persist();
    return true;
  }

  function clearQueue() {
    if (!state.queue.length) return;
    state.queue = [];
    persist();
  }

  function addHistory(music) {
    var changed = addUnique(state.history, music, MAX_HISTORY, true);
    if (changed) persist();
    return changed;
  }

  function clearHistory() {
    if (!state.history.length) return;
    state.history = [];
    persist();
  }

  function isFavorite(music) {
    return findIndex(state.favorites, music) >= 0;
  }

  function toggleFavorite(music) {
    var item = normalizeMusic(music);
    if (!item) return false;
    var index = findIndex(state.favorites, item);
    if (index >= 0) {
      state.favorites.splice(index, 1);
      persist();
      return false;
    }
    state.favorites.unshift(item);
    while (state.favorites.length > MAX_FAVORITES) state.favorites.pop();
    persist();
    return true;
  }

  function onChange(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    return function () {
      for (var i = listeners.length - 1; i >= 0; i -= 1) {
        if (listeners[i] === listener) listeners.splice(i, 1);
      }
    };
  }

  global.LXMusicLibrary = {
    snapshot: snapshot,
    addQueue: addQueue,
    removeQueue: removeQueue,
    clearQueue: clearQueue,
    addHistory: addHistory,
    clearHistory: clearHistory,
    isFavorite: isFavorite,
    toggleFavorite: toggleFavorite,
    onChange: onChange,
    storageKey: STORAGE_KEY
  };
})(window);
