import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync('src/ui2-preview.css','utf8');
const html=readFileSync('index.html','utf8');
for(const label of [
 'UI 2.0 / PHASE 2','search-inspiration','playlist-card',
 'ranking-layout','music-library-workspace','settings-section',
 'mobile-shell-ready','now-playing-cover-box','search-song-row',
 'prefers-reduced-motion:reduce'
])assert.ok(css.includes(label),'Missing Phase 2 presentation: '+label);
assert.match(css,/@media\(max-width:740px\)/);
assert.match(css,/@media \(min-width: ?741px\)/);
assert.match(html,/ui2-preview\.css\?v=0\.4\.34/);
assert.equal((html.match(/<audio\b/g)||[]).length,1);
assert.ok(!css.includes('@import'),'No remote font or CSS fetches');
assert.ok(!css.includes('animation-iteration-count:infinite'),'No indefinite animations');
console.log('FYMUSIC_UI2_PHASE2_STYLE_CONTRACT_PASS');
