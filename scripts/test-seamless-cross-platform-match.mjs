import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const sandbox={window:{}};
const file=fs.readFileSync(new URL('../src/fymusic-cross-platform-match.js',import.meta.url),'utf8');
vm.runInNewContext(file,sandbox,{filename:'src/fymusic-cross-platform-match.js'});
const match=sandbox.window.FyMusicCrossPlatformMatch;
const base={source:'kg',id:'kg-1',name:'开始懂了',singer:'孙燕姿',
 albumName:'我要的幸福',interval:257};
const other={source:'kw',id:'440613',name:'开始懂了',singer:'孙燕姿',
 albumName:'我要的幸福',interval:258};
assert.equal(match.equivalent(base,other,'audio').accepted,true);
assert.equal(match.equivalent(base,other,'lyrics').accepted,true);
for(const bad of [
 {...other,name:'开始懂了 Live'},
 {...other,singer:'另一歌手'},
 {...other,interval:270},
 {...other,albumName:'演唱会专辑'},
 {...other,source:'kg'}
])assert.equal(match.equivalent(base,bad,'audio').accepted,false,
 'Unsafe metadata should never be substituted: '+JSON.stringify(bad));
assert.equal(match.equivalent({...base,interval:''},other,'audio').accepted,false);
assert.equal(match.equivalent({...base,interval:''},other,'lyrics').accepted,true,
 'Lyrics may match known exact album when one duration is unavailable');
assert.equal(match.equivalent({...base,interval:'',albumName:''},other,'lyrics').accepted,false);
assert.equal(match.inspect(base,other).accepted,true,
 'The previous explicitly approved KG/KW matcher remains compatible');
const daoxiang={source:'kg',id:'kg-daoxiang-edit',name:'稻香',singer:'周杰伦',
 albumName:'魔杰座',interval:'03:18'};
const kuwoDaoxiang={source:'kw',id:'kw-daoxiang',name:'稻香',singer:'周杰伦',
 albumName:'魔杰座',interval:'03:43'};
assert.equal(match.equivalent(daoxiang,kuwoDaoxiang,'audio').accepted,false,
 'Strict recording duration match remains narrow');
assert.equal(match.compatibleAudio(daoxiang,kuwoDaoxiang).accepted,true,
 'Playback may use a bounded same-song short edit, 03:18 to 03:43');
assert.equal(match.compatibleAudio(daoxiang,kuwoDaoxiang).tier,'compatible_edit');
assert.equal(match.equivalent(daoxiang,kuwoDaoxiang,'lyrics').accepted,false,
 'Never use a shortened recording as synchronized LRC substitute');
for(const unsafe of [
 {...kuwoDaoxiang,name:'稻香 (Live)'},
 {...kuwoDaoxiang,singer:'不同歌手'},
 {...kuwoDaoxiang,albumName:'演唱会专辑'},
 {...kuwoDaoxiang,interval:'02:31'},
 {...kuwoDaoxiang,interval:''}
])assert.equal(match.compatibleAudio(daoxiang,unsafe).accepted,false,
 'Daoxiang fallback must reject unrelated versions: '+JSON.stringify(unsafe));
console.log('FYMUSIC_DAOXIANG_SHORT_EDIT_MATCH_SECURITY_PASS');
console.log('FYMUSIC_SEAMLESS_METADATA_MATCH_SECURITY_PASS');
