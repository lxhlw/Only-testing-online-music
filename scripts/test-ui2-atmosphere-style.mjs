import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync('src/ui2-preview.css','utf8');
const version=JSON.parse(readFileSync('version.json','utf8')).version;
const marker='/* FYMUSIC ATMOSPHERE DESIGN / v'+version+' CANDIDATE';
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
console.log('FYMUSIC_UI2_ATMOSPHERE_STYLE_PASS',{
  visualOnly:true,remoteAssets:false,continuousAnimation:false,
  themePair:true,reducedMotion:true,forcedColors:true
});
