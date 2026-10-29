import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'

const source = fs.readFileSync(new URL('../src/music-library.js', import.meta.url), 'utf8')

function createStorage() {
  const data = {}
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null },
    setItem(key, value) { data[key] = String(value) },
    removeItem(key) { delete data[key] }
  }
}

function createLibrary(storage) {
  const sandbox = {
    window: { localStorage: storage },
    localStorage: storage,
    JSON,
    String,
    Math,
    Object,
    Array,
    console
  }
  vm.runInNewContext(source, sandbox, { filename: 'music-library.js' })
  return sandbox.window.LXMusicLibrary
}

const storage = createStorage()
const library = createLibrary(storage)

const song1 = {
  id: '1',
  name: '成都',
  singer: '赵雷',
  source: 'tx',
  songmid: 'song-1',
  raw: { file: { media_mid: 'song-1' } }
}
const song2 = {
  id: '2',
  name: '成都 2',
  singer: '测试歌手',
  source: 'tx',
  songmid: 'song-2',
  raw: { file: { media_mid: 'song-2' } }
}

const initial = library.snapshot()
assert.deepEqual(Array.from(initial.queue), [])
assert.deepEqual(Array.from(initial.history), [])
assert.deepEqual(Array.from(initial.favorites), [])

assert.equal(library.addQueue(song1), true)
assert.equal(library.addQueue(song1), true)
assert.equal(library.snapshot().queue.length, 1)

assert.equal(library.addQueue(song2), true)
assert.deepEqual(Array.from(library.snapshot().queue.map(item => item.id)), ['1', '2'])

assert.equal(library.isFavorite(song1), false)
assert.equal(library.toggleFavorite(song1), true)
assert.equal(library.isFavorite(song1), true)
assert.equal(library.toggleFavorite(song1), false)
assert.equal(library.isFavorite(song1), false)

assert.equal(library.toggleFavorite(song1), true)
assert.equal(library.addHistory(song1), true)
assert.equal(library.addHistory(song2), true)
assert.deepEqual(Array.from(library.snapshot().history.map(item => item.id)), ['2', '1'])

assert.equal(library.removeQueue(song1), true)
assert.deepEqual(Array.from(library.snapshot().queue.map(item => item.id)), ['2'])

const reloaded = createLibrary(storage)
const restored = reloaded.snapshot()
assert.deepEqual(Array.from(restored.queue.map(item => item.id)), ['2'])
assert.deepEqual(Array.from(restored.history.map(item => item.id)), ['2', '1'])
assert.deepEqual(Array.from(restored.favorites.map(item => item.id)), ['1'])

let changeCount = 0
reloaded.onChange(() => { changeCount += 1 })
reloaded.clearQueue()
assert.equal(changeCount > 0, true)
assert.equal(reloaded.snapshot().queue.length, 0)

// Play all must keep the first song at index 0; a repeated song cannot be
// appended to the tail. Persistence is a single atomic queue update.
assert.equal(reloaded.replaceQueue([song1, song2, song1]), true)
assert.deepEqual(Array.from(reloaded.snapshot().queue.map(item => item.id)), ['1', '2'])
const bulk = Array.from({ length: 140 }, (_, i) => ({
  id: String(i + 1), source: 'wy', name: 'Song ' + (i + 1)
}))
reloaded.replaceQueue(bulk)
assert.equal(reloaded.snapshot().queue.length, 100, 'Queue window must remain small on Android 4.4')
assert.equal(reloaded.snapshot().queue[0].id, '1')
assert.equal(reloaded.snapshot().queue[99].id, '100')
assert.equal(createLibrary(storage).snapshot().queue[0].id, '1')
console.log('PASS: ordered atomic playlist queue keeps first 100 tracks and persists without reordering')

// Modern browser history retains a deeper collection, with a fixed bound.
const largeHistory = Array.from({length:340},(_,i)=>({
  id:'history-'+i,source:'wy',name:'History '+i,singer:'Singer'
}))
for (const song of largeHistory) reloaded.addHistory(song)
const recent = reloaded.snapshot().history
assert.equal(recent.length,300)
assert.equal(recent[0].id,'history-339')
assert.equal(recent[299].id,'history-40')
assert.equal(createLibrary(storage).snapshot().history.length,300)
console.log('PASS: modern 300-song listening history persists and evicts oldest first')

console.log('PASS: music library queue/history/favorites persistence')

{
  // Real catalog shape: same KG numeric ID, distinct 32-hex FileHash.
  // The two recordings must coexist in every persistent collection.
  const store = createStorage();
  const lib = createLibrary(store);
  const hashA = 'A'.repeat(32), hashB = 'B'.repeat(32);
  const a = {
    id:'778899',songmid:'778899',source:'kg',name:'成都',singer:'赵雷',
    albumName:'成都',interval:'05:28',_interval:328,
    hash:hashA,albumAudioId:'11',
    _types:{'128k':{hash:hashA,size:'4.00M'}},
    types:[{type:'128k',hash:hashA,size:'4.00M'}],typeUrl:{}
  };
  const b = {...a,hash:hashB,albumName:'无法长大',
    albumAudioId:'22',_types:{'128k':{hash:hashB,size:'4.00M'}},
    types:[{type:'128k',hash:hashB,size:'4.00M'}]};
  assert.notEqual(lib.keyOf(a),lib.keyOf(b));
  assert.equal(lib.keyOf(a),lib.keyOf({...a,hash:hashA.toLowerCase()}));
  assert.equal(lib.keyOf({...a,hash:''}),'kg:778899');
  assert.equal(lib.keyOf({...a,hash:'bad'}),'kg:778899');
  assert.equal(lib.keyOf({...a,source:'wy'}),'wy:778899');
  const oldSaved={id:'778899',songmid:'778899',source:'kg',
    raw:{hash:hashA}};
  assert.equal(lib.keyOf(oldSaved),lib.keyOf(a),
    'Pre-v0.4.21 saved KG items use raw.hash without destructive migration');

  lib.addQueue(a);lib.addQueue(b);
  assert.equal(lib.snapshot().queue.length,2);
  lib.addQueue(a);
  assert.equal(lib.snapshot().queue.length,2,'Exact same hash should deduplicate');
  assert.deepEqual(Array.from(lib.snapshot().queue,x=>x.hash),[hashB,hashA]);
  assert.equal(lib.snapshot().queue[0]._types['128k'].hash,hashB);
  assert.equal(lib.snapshot().queue[1].albumAudioId,'11');
  lib.addHistory(a);lib.addHistory(b);
  assert.equal(lib.snapshot().history.length,2);
  assert.equal(lib.toggleFavorite(a),true);
  assert.equal(lib.toggleFavorite(b),true);
  assert.equal(lib.isFavorite(a),true);
  assert.equal(lib.isFavorite(b),true);
  const restored=createLibrary(store);
  assert.equal(restored.snapshot().queue.length,2);
  assert.equal(restored.snapshot().history.length,2);
  assert.equal(restored.snapshot().favorites.length,2);
  assert.equal(restored.snapshot().favorites[0].hash,hashB);
  assert.equal(restored.snapshot().favorites[0]._types['128k'].hash,hashB);
  assert.equal(restored.removeQueue(a),true);
  assert.deepEqual(Array.from(restored.snapshot().queue,x=>x.hash),[hashB]);
  assert.equal(restored.toggleFavorite(a),false);
  assert.equal(restored.isFavorite(a),false);
  assert.equal(restored.isFavorite(b),true);
  restored.replaceQueue([a,b,a]);
  assert.deepEqual(Array.from(restored.snapshot().queue,x=>x.hash),
    [hashA,hashB],'Play-all retains both file variants and order');

  // Playback/UI navigation must share the same identity, not id-only.
  const appSource=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  const start=appSource.indexOf('  function musicKey(music) {');
  const finish=appSource.indexOf('\n  // A play-all session',start);
  assert.ok(start>=0&&finish>start);
  const appKey=new Function('global',appSource.slice(start,finish)+
    '\nreturn musicKey;')({LXMusicLibrary:restored});
  assert.equal(appKey(a),restored.keyOf(a));
  assert.equal(appKey(b),restored.keyOf(b));
  assert.notEqual(appKey(a),appKey(b));
  console.log('PASS KG distinct FileHash survives queue/favorites/history and playback identity');
}

