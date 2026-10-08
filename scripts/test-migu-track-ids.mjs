import assert from 'node:assert/strict'
import fs from 'node:fs'

const code = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8')
function extractFunction(name) {
  const start = code.indexOf('  function ' + name + '(')
  assert.ok(start >= 0, 'Missing ' + name)
  let depth = 0
  const brace = code.indexOf('{', start)
  for (let i = brace; i < code.length; i++) {
    if (code[i] === '{') depth++
    if (code[i] === '}') {
      depth--
      if (!depth) return code.slice(start, i + 1)
    }
  }
  throw new Error('Unterminated ' + name)
}
const build = new Function(extractFunction('buildMusicInfo') + ';return buildMusicInfo;')()
const unavailable = new Function(extractFunction('unavailablePlaybackMessage') + ';return unavailablePlaybackMessage;')()

const fixture = {
  id: 'fixture-search-id',
  copyrightId: '6005861N71E',
  name: '成都',
  hash: '',
  raw: { albumId: 'fixture-album', singer: '赵雷' }
}
let info = build(fixture, 'mg')
assert.equal(Object.prototype.hasOwnProperty.call(info, 'hash'), false,
  'LX Desktop Migu search does not invent hash=copyrightId; allow Huibq to use songmid')
assert.equal(info.songmid, 'fixture-search-id')
assert.equal(info.copyrightId, '6005861N71E')
assert.equal(info.albumId, 'fixture-album')
assert.equal(info.singer, '赵雷')
assert.equal(fixture.hash, '', 'The search result must not be mutated')
const huibqPreferredId = item => item.hash ?? item.songmid
assert.equal(huibqPreferredId(info), 'fixture-search-id',
  'Huibq must request the actual songId, not the distinct copyrightId')
console.log('PASS: Migu LX song information matches desktop and Huibq selects songmid')

info = build({ songmid: 'real-migu-key', hash: 'hash-already-present', id: 'raw-id' }, 'mg')
assert.equal(info.hash, 'hash-already-present', 'A real existing hash must not be overwritten')
info = build({ id: 'raw-id', copyright_id: 'second-copyright-id' }, 'mg')
assert.equal(Object.prototype.hasOwnProperty.call(info, 'hash'), false)
assert.equal(huibqPreferredId(info), 'raw-id')
info = build({ id: 'raw-id' }, 'mg')
assert.equal(Object.prototype.hasOwnProperty.call(info, 'hash'), false)
assert.equal(huibqPreferredId(info), 'raw-id')
console.log('PASS: genuine hashes preserved; blank hashes removed; songmid fallback safe')

info = build({ id: 'kw-id', hash: '' }, 'kw')
assert.equal(info.hash, '', 'Other platform fields must not be changed')
info = build({ id: 'kg-id', hash: 'kg-hash' }, 'kg')
assert.equal(info.hash, 'kg-hash')
console.log('PASS: non-Migu channel behavior is unchanged')

const error = unavailable('mg')
assert.match(error, /咪咕/)
assert.match(error, /暂无可用的播放地址/)
assert.match(error, /其他歌曲/)
assert.equal(unavailable('wy'), '')
console.log('PASS: player explains unavailable Migu media without claiming a usable URL')
