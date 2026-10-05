import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';

const code = fs.readFileSync(new URL('../src/music-lyrics.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(code, context, { filename: 'src/music-lyrics.js' });

const lyrics = context.window.LXMusicLyrics;
assert.ok(lyrics);

const normalizedString = lyrics.normalize('[00:01.50]测试');
assert.equal(normalizedString.lyric, '[00:01.50]测试');

const normalizedObject = lyrics.normalize({ data: { lyric: '[00:00.00]成都\n[00:02.50]你好', tlyric: 'translation' } });
assert.equal(normalizedObject.lyric, '[00:00.00]成都\n[00:02.50]你好');
assert.equal(normalizedObject.tlyric, 'translation');

const lines = lyrics.parseLrc('[00:02.50]第二句\n[00:00.00][00:01.00]第一句\n无时间轴');
assert.equal(lines.length, 3);
assert.equal(lines[0].time, 0);
assert.equal(lines[1].time, 1);
assert.equal(lines[2].time, 2.5);
assert.equal(lines[0].text, '第一句');

assert.equal(lyrics.getActiveLine(lines, 0), 0);
assert.equal(lyrics.getActiveLine(lines, 1.9), 1);
assert.equal(lyrics.getActiveLine(lines, 9), 2);
assert.equal(lyrics.getActiveLine([], 1), -1);

console.log('music lyrics tests: PASS');
