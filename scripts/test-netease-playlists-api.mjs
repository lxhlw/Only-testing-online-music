import assert from 'node:assert/strict'
import { onRequest } from '../functions/api/netease-playlists.js'

const originalFetch = globalThis.fetch
const state = { count: 51, failDetails: false, failSongs: false, preview: false, calls: [] }

function song(id) {
  return {
    id: Number(id),
    name: 'Track ' + id,
    ar: [{ name: 'Test Artist' }],
    al: { id: 1, name: 'Test Album', picUrl: '' },
    dt: 180000
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

globalThis.fetch = async (input) => {
  const url = new URL(String(input))
  state.calls.push(url.pathname)
  if (url.pathname === '/api/v6/playlist/detail') {
    if (state.failDetails) return json({ error: 'upstream unavailable' }, 503)
    const ids = Array.from({ length: state.count }, (_, i) => ({ id: i + 1 }))
    return json({
      code: 200,
      playlist: {
        id: 123,
        name: 'Fixture playlist',
        trackCount: state.count,
        trackIds: ids,
        tracks: state.preview ? ids.map(item => song(item.id)) : []
      }
    })
  }
  if (url.pathname === '/api/song/detail') {
    if (state.failSongs) return json({ error: 'songs unavailable' }, 503)
    const ids = JSON.parse(url.searchParams.get('ids') || '[]')
    return json({ songs: ids.map(song) })
  }
  throw new Error('Unexpected upstream request: ' + url)
}

async function get(offset, limit) {
  const params = new URLSearchParams({
    id: '123',
    offset: String(offset),
    limit: String(limit)
  })
  const response = await onRequest({
    request: new Request('https://music.example/api/netease-playlists?' + params.toString())
  })
  return { response, body: await response.json() }
}

try {
  let result = await get(0, 200)
  assert.equal(result.response.status, 200)
  assert.equal(result.body.songs.length, 50, 'Detail must cap oversized limit at 50')
  assert.equal(result.body.songs[0].id, '1')
  assert.equal(result.body.songs[49].id, '50')
  assert.equal(result.body.total, 51)
  assert.equal(result.body.nextOffset, 50)
  assert.equal(result.body.hasMore, true)
  assert.equal(state.calls.filter(x => x === '/api/song/detail').length, 1)
  console.log('PASS: first page clamps oversized limit and preserves track order')

  result = await get(50, 200)
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.body.songs.map(x => x.id), ['51'])
  assert.equal(result.body.hasMore, false)
  assert.equal(result.body.nextOffset, 51)
  console.log('PASS: last page returns remaining track without duplicates')

  state.count = 50
  result = await get(0, 50)
  assert.equal(result.body.songs.length, 50)
  assert.equal(result.body.hasMore, false)
  console.log('PASS: exact 50-item boundary')

  state.count = 0
  result = await get(0, 50)
  assert.equal(result.response.status, 200)
  assert.deepEqual(result.body.songs, [])
  assert.equal(result.body.hasMore, false)
  assert.equal(result.body.nextOffset, 0)
  console.log('PASS: empty playlist')

  state.count = 51
  state.preview = true
  state.failSongs = true
  result = await get(0, 50)
  assert.equal(result.response.status, 200)
  assert.equal(result.body.songs.length, 50)
  assert.equal(result.body.songs[0].id, '1')
  console.log('PASS: upstream song detail failure uses track previews')

  state.failDetails = true
  result = await get(0, 50)
  assert.equal(result.response.status, 502)
  assert.match(result.body.error, /request failed/i)
  console.log('PASS: playlist detail upstream failure returns explicit 502')
} finally {
  globalThis.fetch = originalFetch
}
