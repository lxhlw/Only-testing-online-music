import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const code=readFileSync('src/fymusic-cinematic-engine.js','utf8');
const css=readFileSync('src/fymusic-cinematic.css','utf8');
for(const asset of ['src/fymusic-cinematic-engine.js?v=0.4.36',
 'src/fymusic-cinematic.css?v=0.4.36'])
 assert.ok(html.includes(asset),'Missing UI3 static asset: '+asset);
for(const feature of ['webgl2','#version 300 es','getShaderParameter','getProgramParameter',
 'createProgram','requestAnimationFrame','cancelAnimationFrame','webglcontextlost',
 'visibilitychange','u_scene','u_energy','u_mouse','u_light','u_time',
 'prefers-reduced-motion: reduce','forced-colors: active',
 'search:0','playlist:1','ranking:2','mylist:3','immersive:4'])
 assert.ok(code.includes(feature),'UI3 GPU scene contract missing: '+feature);
for(const feature of ['#view-search','#view-playlist','#view-ranking','#view-mylist',
 'fy3-scene-immersive','fy-ui2-light','forced-colors:active',
 'prefers-reduced-motion:reduce','height:170px'])
 assert.ok(css.includes(feature),'UI3 scene styling missing: '+feature);
assert.ok(!/\bnew Audio\s*\(|createMediaElementSource\s*\(|audio\.src\s*=/i.test(code),
 'Cinematic renderer cannot own or reroute native music playback');
assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage\.setItem/i.test(code),
 'No network/telemetry/storage in cinematic renderer');
assert.ok(!/@import\b|url\(\s*["']?https?:/i.test(css),'No remote font/decor');
console.log('FYMUSIC_UI3_SCENE_STYLE_CONTRACT_PASS');