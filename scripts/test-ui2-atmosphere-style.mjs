import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync('src/ui2-preview.css','utf8');
const version=JSON.parse(readFileSync('version.json','utf8')).version;
const marker='/* FYMUSIC ATMOSPHERE DESIGN / v'+version+' CANDIDATE';
const professionalMarker='/* FYMUSIC / STAGE 4 — REAL WEB PRODUCT DESIGN REPAIR';
const screenshotFix='/* FYMUSIC / STAGE 4.1 — CROSS-VIEW SCREENSHOT DEFECT FIX';
const playerComposition='/* FYMUSIC / STAGE 4.2 — PLAYER COMPOSITION & SEARCH FOCUS';
const visualCorrection='/* FYMUSIC / STAGE 4.2B — ACTUAL SCREENSHOT REVIEW CORRECTIONS';
assert.ok(css.includes(visualCorrection),'Missing screenshot-corrected lyric width and mute contrast');
const correction=css.slice(css.indexOf(visualCorrection));
for(const term of ['max-width:100%!important','#player-volume-btn','fy-ui2-light','forced-colors:active'])
 assert.ok(correction.includes(term),'Missing Stage 4.2B contrast/width rule: '+term);
assert.ok(css.includes(playerComposition),'Missing actual focused-search and music player implementation');
const playerLayer=css.slice(css.indexOf(playerComposition));
for(const part of [
 '#global-search-input:focus-visible','.global-search:focus-within',
 '#global-search-btn','.player-center','.player-volume-btn',
 '#player-lyric','.player-extras','fy-ui2-light',
 'prefers-reduced-motion:reduce','forced-colors:active'
])assert.ok(playerLayer.includes(part),'Stage 4.2 source style contract missing: '+part);
assert.ok(!/backdrop-filter\s*:|animation-iteration-count\s*:\s*infinite|\@import\b/i.test(playerLayer),
 'Performance budget prohibits blur, indefinite loops and remote fonts');
assert.ok(css.includes(screenshotFix),'Actual browser screenshot corrections missing');
const screenshotLayer=css.slice(css.indexOf(screenshotFix));
for(const item of [
 '#view-playlist>.playlist-filter-stack>.sub-toolbar',
 '#view-playlist>.playlist-filter-stack>.category-row',
 '#view-ranking #ranking-songs:empty::after',
 'fy-ui2-light','forced-colors:active'
])assert.ok(screenshotLayer.includes(item),'Screenshot regression contract absent: '+item);
assert.ok(css.includes(professionalMarker),'Missing Stage 4 implementation');
const professional=css.slice(css.indexOf(professionalMarker));
for(const token of [
 'background-size:contain!important','view-ranking #ranking-title',
 'library-list:empty::after','global-search-btn',
 'player-volume-wrap','player-lyric','min-width:741px',
 'fy-ui2-light','prefers-reduced-motion:reduce','forced-colors:active'
])assert.ok(professional.includes(token),'Missing Stage 4 design/UX contract: '+token);
assert.ok(!/\@import\b|backdrop-filter\s*:|animation-iteration-count\s*:\s*infinite/i.test(professional),
 'No remote font pulls, heavy blur or indefinite animation');
assert.ok(css.includes(marker),'Atmosphere theme is missing');
const addition=css.slice(css.indexOf(marker));
for(const token of [
  '--fy-spatial-edge','STAGE 3 — SPATIAL MUSIC POLISH',
  'now-playing-cover-box','player-main-toggle','playlist-card:hover',
  '--fy-atmosphere-accent','search-inspiration::after',
  'repeating-radial-gradient','player-bar','playlist-card',
  'fy-ui2-light','(max-width:740px)',
  'prefers-reduced-motion:reduce','forced-colors:active',
  'hover:none','pointer:coarse'
])assert.ok(addition.includes(token),'Missing design/accessibility contract: '+token);
assert.equal(/@import\b|backdrop-filter\s*:|animation-iteration-count\s*:|url\(\s*['"]?https?:/i.test(addition),false,
  'No remote fonts/imagery, backdrop-filter or continuous animations');
assert.equal(/width:\s*100vw|overflow:\s*hidden\s*!important/i.test(addition),false,
  'Do not introduce clipping or force viewport-width overflow');
assert.match(addition,/\.fy-ui2-light[\s\S]+\.search-inspiration/);
assert.ok(css.indexOf(marker)>css.indexOf('Stage 6 narrow phone review'),
  'Design layer must follow the existing 320px reachability fix');

const breathingMarker='/* FYMUSIC / STAGE 5.1 — BREATHING LANDSCAPE & MUSIC SCENE';
assert.ok(css.includes(breathingMarker),'Stage 5.1 scenery layer missing');
const breathing=css.slice(css.indexOf(breathingMarker));
for(const part of ['.nav-rail::after','.nav-rail::before','.view-header::after','#view-ranking #ranking-title',
 '.library-list,#playlist-favorite-list','data:image/svg+xml','fy-ui2-light',
 'fy-scene-breathe','fy-scene-mist','prefers-reduced-motion:reduce','forced-colors:active'])
 assert.ok(breathing.includes(part),'Stage 5.1 scenic contract missing '+part);
assert.equal(/@import\b|backdrop-filter\s*:|url\(\s*['"]?https?:/i.test(breathing),false,
 'Stage 5.1 must not add network artwork, CSS imports or backdrop filters');
assert.equal(/width:\s*100vw|overflow:\s*hidden\s*!important/i.test(breathing),false,
 'Stage 5.1 cannot clip or force viewport overflow');
assert.equal((breathing.match(/animation:fy-scene-/g)||[]).length,2,
 'Only two compositor-friendly background breathing animations allowed');


const visualizerSource=readFileSync('src/ui2-preview.js','utf8');
const vizMarker='/* FYMUSIC STAGE 5.2 — CAPTURE-ONLY AUDIO VISUALIZER';
const vizStyleMarker='/* FYMUSIC / STAGE 5.2 — SAFE LIVE AUDIO SPECTRUM';
assert.ok(visualizerSource.includes(vizMarker)&&css.includes(vizStyleMarker),
 'Stage 5.2 capture-only visualizer and presentation layer missing');
const viz=visualizerSource.slice(visualizerSource.indexOf(vizMarker));
const vizCss=css.slice(css.indexOf(vizStyleMarker));
for(const term of ['captureStream','createMediaStreamSource','createAnalyser','getByteFrequencyData',
 'requestAnimationFrame','cancelAnimationFrame','prefers-reduced-motion: reduce',
 'forced-colors: active','visibilitychange','loadstart','pagehide',
 'playing','pause','ui2-audio-spectrum','fy-ui2-audio-live','originalAudio'])
 assert.ok(viz.includes(term),'Visual lifecycle contract missing: '+term);
for(const term of ['ui2-audio-spectrum','fy-album-breath','fy-ui2-light',
 'max-width:1100px','prefers-reduced-motion:reduce','forced-colors:active'])
 assert.ok(vizCss.includes(term),'Visualization design/accessibility contract missing: '+term);
assert.ok(!viz.includes('createMediaElementSource') || 
 viz.includes('Never call createMediaElementSource'),
 'Do not reroute the existing native media element through Web Audio');
assert.equal(/\\.connect\\(\\s*(?:ac|context)\\.destination/.test(viz),false,
 'Visualization audio graph must never connect to output destination');
assert.equal(/(?:audio\\.(?:src|crossOrigin|volume)\\s*=|new Audio\\()/i.test(viz),false,
 'Visualizer cannot replace native media, change CORS, or change volume');
assert.equal(/@import\b|backdrop-filter\s*:|url\(\s*['"]?https?:/i.test(vizCss),false,
 'No remote assets / heavy backdrop for Stage 5.2');

console.log('FYMUSIC_UI2_ATMOSPHERE_STYLE_PASS',{
  visualOnly:true,remoteAssets:false,continuousAnimation:false,
  themePair:true,reducedMotion:true,forcedColors:true
});
