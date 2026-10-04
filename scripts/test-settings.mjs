import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const code = fs.readFileSync(new URL('../src/play-settings.js', import.meta.url), 'utf8');
const storage = {};
const window = {
  localStorage: {
    getItem: (key) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); }
  }
};
vm.runInNewContext(code, { window });

const api = window.LXPlaySettings;
assert.ok(api, 'LXPlaySettings must be exposed');

assert.deepEqual(api.normalizeQualityList(['128k', 'flac', '320k', '192k']), ['flac', '320k', '192k', '128k']);
assert.deepEqual(api.buildPlan(['128k', '320k', 'flac'], {
  qualityMode: 'highest',
  fixedQuality: '128k',
  autoFallback: true
}), ['flac', '320k', '128k']);

assert.deepEqual(api.buildPlan(['128k', '320k', 'flac'], {
  qualityMode: 'fixed',
  fixedQuality: '320k',
  autoFallback: true
}), ['320k', '128k']);

assert.deepEqual(api.buildPlan(['128k', '320k', 'flac'], {
  qualityMode: 'fixed',
  fixedQuality: '320k',
  autoFallback: false
}), ['320k']);

assert.deepEqual(api.save({
  qualityMode: 'highest',
  fixedQuality: '320k',
  autoFallback: true
}), {
  qualityMode: 'highest',
  fixedQuality: '320k',
  autoFallback: true
});
assert.equal(api.load().qualityMode, 'highest');
assert.equal(api.load().autoFallback, true);

console.log('Playback settings test: PASS');
console.log('Highest quality order: ' + api.normalizeQualityList(['128k', '320k', 'flac']).join(' -> '));
console.log('Fixed 320k fallback order: ' + api.buildPlan(['128k', '320k', 'flac'], {
  qualityMode: 'fixed',
  fixedQuality: '320k',
  autoFallback: true
}).join(' -> '));
