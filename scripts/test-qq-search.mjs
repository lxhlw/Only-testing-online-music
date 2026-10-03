import assert from 'node:assert/strict'

const keyword = '成都'
const endpoint = 'https://u.y.qq.com/cgi-bin/musics.fcg'
const part1 = [23, 14, 6, 36, 16, 40, 7, 19]
const part2 = [16, 1, 32, 12, 19, 27, 8, 5]
const scramble = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

function rol(value, bits) {
  return (value << bits) | (value >>> (32 - bits))
}

function sha1(input) {
  const text = Buffer.from(String(input), 'utf8')
  const bytes = [...text]
  const bitLength = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  const high = Math.floor(bitLength / 0x100000000)
  const low = bitLength >>> 0
  for (let i = 3; i >= 0; i--) bytes.push((high >>> (i * 8)) & 255)
  for (let i = 3; i >= 0; i--) bytes.push((low >>> (i * 8)) & 255)

  let h0 = 0x67452301
  let h1 = 0xEFCDAB89
  let h2 = 0x98BADCFE
  let h3 = 0x10325476
  let h4 = 0xC3D2E1F0

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const w = []
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4
      w[i] = ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) | 0
    }
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)

    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      let f, k
      if (i < 20) {
        f = (b & c) | ((~b) & d)
        k = 0x5A827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ED9EBA1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8F1BBCDC
      } else {
        f = b ^ c ^ d
        k = 0xCA62C1D6
      }
      const temp = (rol(a, 5) + f + e + k + w[i]) | 0
      e = d
      d = c
      c = rol(b, 30)
      b = a
      a = temp
    }

    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }

  const hex = value => (value >>> 0).toString(16).padStart(8, '0')
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4)
}

function zzcSign(text) {
  const hash = sha1(text)
  const a = part1.map(index => hash[index]).join('')
  const b = part2.map(index => hash[index]).join('')
  const middle = Buffer.from(
    scramble.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))
  ).toString('base64').replace(/[\\/+=]/g, '')
  return ('zzc' + a + middle + b).toLowerCase()
}

const body = {
  comm: {
    _channelid: '0',
    _os_version: '6.2.9200-2',
    ct: '19',
    cv: '2151',
    guid: '1F70E520B2EAA7D25E11760783C53CA9',
    patch: '118',
    psrf_access_token_expiresAt: 0,
    psrf_qqaccess_token: '',
    psrf_qqopenid: '',
    psrf_qqunionid: '',
    tmeAppID: 'qqmusic',
    tmeLoginType: 0,
    uin: '0',
    wid: '7223299733393904640'
  },
  'music.search.SearchCgiService': {
    module: 'music.search.SearchCgiService',
    method: 'DoSearchForQQMusicDesktop',
    param: {
      grp: 1,
      num_per_page: 20,
      page_num: 1,
      query: keyword,
      remoteplace: 'txt.newclient.top',
      search_type: 0,
      searchid: String(Date.now())
    }
  }
}

const sign = zzcSign(JSON.stringify(body))
const response = await fetch(endpoint + '?sign=' + encodeURIComponent(sign), {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'User-Agent': 'QQMusic 14090508(android 12)'
  },
  body: JSON.stringify(body)
})

assert.equal(response.ok, true, 'QQ HTTP response failed: ' + response.status)
const data = await response.json()
const service = data?.['music.search.SearchCgiService']
assert.equal(data?.code, 0, 'QQ top-level code != 0')
assert.equal(service?.code, 0, 'QQ service code != 0')

const list = service?.data?.body?.song?.list ?? []
assert.ok(list.length > 0, 'QQ search returned no songs')

const usable = list.filter(item => item?.file?.media_mid)
assert.ok(usable.length > 0, 'QQ search returned no usable songs')

console.log('PASS: QQ search for 成都')
console.log('Results:', list.length)
console.log('Usable:', usable.length)
console.log('First:', usable[0].title, '-', (usable[0].singer ?? []).map(item => item.name).join('、'))
