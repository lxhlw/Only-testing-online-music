import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const code=readFileSync('src/fymusic-cinematic-engine.js','utf8');
const analyzer=readFileSync('src/ui2-audio-visualizer.js','utf8');
const css=readFileSync('src/fymusic-cinematic.css','utf8');
for(const asset of ['src/fymusic-cinematic-engine.js?v=0.4.36',
 'src/fymusic-cinematic.css?v=0.4.36'])
 assert.ok(html.includes(asset),'Missing UI3 static asset: '+asset);
for(const feature of ['webgl2','#version 300 es','getShaderParameter','getProgramParameter',
 'createProgram','requestAnimationFrame','cancelAnimationFrame','webglcontextlost',
 'visibilitychange','u_scene','u_energy','u_mouse','u_light','u_time',
 'u_bands','u_impact','u_audio_live','uniform3f','audioReactive',
 'prefers-reduced-motion: reduce','forced-colors: active',
 'search:0','playlist:1','ranking:2','mylist:3','immersive:4'])
 assert.ok(code.includes(feature),'UI3 GPU scene contract missing: '+feature);
for(const feature of ['#view-search','#view-playlist','#view-ranking','#view-mylist',
 'fy3-scene-immersive','fy-ui2-light','forced-colors:active',
 'prefers-reduced-motion:reduce','height:170px'])
 assert.ok(css.includes(feature),'UI3 scene styling missing: '+feature);
for(const feature of ['FYMusic UI3 / STAGE C2','fy3-c2-record-drift',
 'fy3-c2-loading-breathe',':has(> .loading-note)',
 '#ranking-songs:empty','#history-list','prefers-reduced-motion:reduce',
 'forced-colors:active'])
 assert.ok(css.includes(feature),'Stage C2 editorial state missing: '+feature);
assert.ok(!/\bnew Audio\s*\(|createMediaElementSource\s*\(|audio\.src\s*=/i.test(code),
 'Cinematic renderer cannot own or reroute native music playback');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage\.setItem/i.test(code),
 'No network/telemetry/storage in cinematic renderer');
assert.ok(!/@import\b|url\(\s*["']?https?:/i.test(css),'No remote font/decor');
for(const feature of ['BANDS=64','fft.fftSize=2048','getByteFrequencyData',
 'getByteTimeDomainData','fy3-immersive-spectrum','envelope:()=>',
 '--fy-audio-low',
 '--fy-audio-mid','--fy-audio-high'])
 assert.ok(analyzer.includes(feature),'Missing Stage B1 real FFT contract: '+feature);
assert.ok(css.includes('#fy3-immersive-spectrum'),'Missing UI3 large spectrum style');
for(const name of ['STAGE C1','#view-search .search-inspiration:after',
 '#view-playlist #playlist-featured','grid-template-columns:repeat(12',
 '#view-ranking .ranking-layout','#view-mylist .music-library-workspace',
 '#lyrics-overlay .now-playing-cover-box','prefers-reduced-motion:reduce'])
 assert.ok(css.includes(name),'Distinct UI3 C1 editorial scene missing: '+name);
for(const name of ['sceneTransitions','overlayTransitions','section.animate',
 'syncOverlayEntrance','transitionCounts:'])
 assert.ok(code.includes(name),'Accessible WAAPI scene transition missing: '+name);
assert.ok(css.includes('#playlist-featured:not(:has(> .playlist-card))'),
 'Playlist empty-loading text must remain legible before cards arrive');
assert.ok(!/\.connect\((?:ac|context)\.destination\)/.test(analyzer),
 'Capture-only analyser cannot reroute native audio');
console.log('FYMUSIC_UI3_SCENE_STYLE_CONTRACT_PASS');