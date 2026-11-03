import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('src/ui2-preview.css','utf8');
const js=fs.readFileSync('src/ui2-preview.js','utf8');
assert.match(html,/src\/ui2-preview\.css\?v=0\.4\.33/);
assert.match(html,/src\/ui2-preview\.js\?v=0\.4\.33/);
assert.match(css,/@media \(min-width: ?741px\)/);
assert.match(css,/prefers-reduced-motion:reduce/);
assert.match(css,/ui2-artwork-ambient/);
assert.match(css,/player-bar/);
assert.match(css,/lyrics-line\.active/);
assert.match(js,/params\.get\('ui2'\)!=='1'/);
assert.match(js,/insertBefore\(ambient,sheet\.firstChild\)/);
assert.match(js,/document\.hidden/);
assert.match(js,/MutationObserver/);
for(const forbidden of ['audio.play(', 'audio.pause(', 'audio.currentTime =', 'fetch(', 'setInterval(', 'requestAnimationFrame(']){
 assert.ok(!js.includes(forbidden),'Presentation layer must not own playback or background polling: '+forbidden);
}
assert.equal((html.match(/<audio\b/g)||[]).length,1);
console.log('FYMUSIC_UI2_PRESENTATION_CONTRACT_PASS');
