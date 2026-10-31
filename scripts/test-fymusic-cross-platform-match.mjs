import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../src/fymusic-cross-platform-match.js',import.meta.url),'utf8');
const win={};vm.runInNewContext(source,{window:win});
const gate=win.FyMusicCrossPlatformMatch;
assert.ok(gate,'cross-platform match gate must exist');

const kg={source:'kg',name:'开始懂了',singer:'孙燕姿',
 interval:'04:31',albumName:'我要的幸福'};
const kw={source:'kw',name:'开始懂了',singer:'孙燕姿',
 interval:'04:32',albumName:'我要的幸福',id:'kw-record'};
assert.equal(gate.inspect(kg,kw).accepted,true);
assert.equal(gate.inspect(kg,{...kw,interval:'04:35'}).accepted,false);
assert.equal(gate.inspect(kg,{...kw,name:'开始懂了（现场版）'}).accepted,false);
assert.equal(gate.inspect(kg,{...kw,singer:'另一位歌手'}).accepted,false);
assert.equal(gate.inspect(kg,{...kw,albumName:'另一张专辑'}).accepted,false);
assert.equal(gate.inspect(kg,{...kw,interval:''}).accepted,false);
assert.equal(gate.inspect(kg,{...kw,source:'kg'}).accepted,false);
assert.equal(gate.inspect({...kg,interval:null},kw).accepted,false);
assert.equal(gate.inspect({...kg,name:'开 始 懂 了'},kw).accepted,true);
assert.equal(gate.inspect({...kg,singer:'孙 燕 姿'},kw).accepted,true);
assert.equal(gate.durationSeconds({interval:'04:31'}),271);
assert.equal(gate.durationSeconds({interval:271}),271);
assert.equal(gate.durationSeconds({interval:'4:31:20'}),null);
assert.equal(gate.durationSeconds({interval:'0:04:31'}),271);
const options=gate.choices(kg,[{...kw,name:'其他歌曲'},kw,
 {...kw,interval:'04:34',id:'other-compatible'},
 {...kw,albumName:'冲突专辑',id:'bad'},kw],3);
assert.equal(options.length,2);
assert.equal(options[0].item.id,'kw-record');
assert.equal(options[1].item.id,'other-compatible');
assert.equal(options[0].verdict.reason,'metadata_match_only');
console.log('FYMUSIC_EXPLICIT_ALTERNATE_MATCH_GATE_PASS');
