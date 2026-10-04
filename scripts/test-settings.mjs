import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const settingsHtml = fs.readFileSync(new URL('../settings.html', import.meta.url), 'utf8');

assert.equal((settingsHtml.match(/<input[^>]+type="radio"[^>]+name="play-quality"/g) || []).length, 8);
assert.ok(settingsHtml.includes('value="highest"'));
assert.ok(settingsHtml.includes('id="auto-fallback"'));
assert.ok(settingsHtml.includes('renderQualityChoices'));
assert.equal(settingsHtml.includes('id="quality-mode"'), false);
assert.equal(settingsHtml.includes(':has('), false);

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

assert.deepEqual(
  Array.from(api.normalizeQualityList(['128k', 'flac', '320k', '192k'])),
  ['flac', '320k', '192k', '128k']
);

assert.deepEqual(
  Array.from(api.normalizeQualityList(['128k', 'flac24bit', 'flac', '320k', '128k'])),
  ['flac24bit', 'flac', '320k', '128k']
);

assert.deepEqual(
  Array.from(api.normalizeQualityList(['128k', 'master', 'hires', 'flac24bit', 'flac', '320k'])),
  ['master', 'hires', 'flac24bit', 'flac', '320k', '128k']
);

assert.deepEqual(
  Array.from(api.buildPlan(['128k', '320k', 'flac'], {
    qualityMode: 'highest',
    fixedQuality: '128k',
    autoFallback: true
  })),
  ['flac', '320k', '128k']
);

assert.deepEqual(
  Array.from(api.buildPlan(['128k', '320k', 'flac'], {
    qualityMode: 'highest',
    fixedQuality: '128k',
    autoFallback: false
  })),
  ['flac']
);

assert.deepEqual(
  Array.from(api.buildPlan(['128k', '320k', 'flac'], {
    qualityMode: 'fixed',
    fixedQuality: '320k',
    autoFallback: true
  })),
  ['320k', '128k']
);

assert.deepEqual(
  Array.from(api.buildPlan(['128k', '320k', 'flac'], {
    qualityMode: 'fixed',
    fixedQuality: '320k',
    autoFallback: false
  })),
  ['320k']
);

assert.deepEqual(
  Array.from(api.buildPlan(['128k', '320k', 'flac'], {
    qualityMode: 'fixed',
    fixedQuality: '256k',
    autoFallback: true
  })),
  ['flac', '320k', '128k']
);

assert.deepEqual(
  Array.from(api.buildPlan(['128k', '320k', 'flac'], {
    qualityMode: 'fixed',
    fixedQuality: '256k',
    autoFallback: false
  })),
  ['flac']
);

const saved = api.save({
  qualityMode: 'highest',
  fixedQuality: '320k',
  autoFallback: true
});
assert.equal(saved.qualityMode, 'highest');
assert.equal(saved.fixedQuality, '320k');
assert.equal(saved.autoFallback, true);

const loaded = api.load();
assert.equal(loaded.qualityMode, 'highest');
assert.equal(loaded.fixedQuality, '320k');
assert.equal(loaded.autoFallback, true);

assert.equal(api.getQualityLabel('flac24bit'), 'FLAC 24bit');
assert.equal(api.getQualityLabel('unknown'), 'unknown');

console.log('Playback settings test: PASS');
console.log('Highest quality order: ' + Array.from(api.normalizeQualityList(['128k', '320k', 'flac'])).join(' -> '));
console.log('Fixed 320k fallback order: ' + Array.from(api.buildPlan(['128k', '320k', 'flac'], {
  qualityMode: 'fixed',
  fixedQuality: '320k',
  autoFallback: true
})).join(' -> '));
console.log('Highest-only order with fallback disabled: ' + Array.from(api.buildPlan(['128k', '320k', 'flac'], {
  qualityMode: 'highest',
  fixedQuality: '320k',
  autoFallback: false
})).join(' -> '));
