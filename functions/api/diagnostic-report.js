// 24-hour, consent-only diagnostic inbox. No audio URLs, song data or raw
// User-Agent strings are accepted or saved. IDs are cryptographically random.
const TTL = 86400
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff'
}
function reply(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS })
}
function num(value) {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 && n <= 1e7 ? Math.round(n * 100) / 100 : null
}
function state(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  return {
    time: num(input.time),
    duration: num(input.duration),
    error: num(input.error),
    ready: num(input.ready),
    network: num(input.network),
    paused: Boolean(input.paused)
  }
}
function shortText(value) {
  // No arbitrary text, URLs or unbounded full diagnostic log can be stored.
  if (typeof value !== 'string') return ''
  return value.slice(0, 96).replace(/[\r\n<>]/g, ' ').replace(/https?:\/\/\S+/gi, '[omitted]')
}
function clean(raw) {
  if (!raw || raw.schema !== 1 || typeof raw !== 'object') throw new Error('Invalid diagnostic schema')
  const observed = raw.observed || {}
  return {
    schema: 1, version: 'v8', receivedAt: new Date().toISOString(),
    platform: { android: shortText(raw.platform?.android), chrome: shortText(raw.platform?.chrome) },
    audio: {
      mp3: state(raw.audio?.mp3), wav: state(raw.audio?.wav), local: state(raw.audio?.local)
    },
    transfer: {
      mp3: shortText(raw.transfer?.mp3), wav: shortText(raw.transfer?.wav),
      mp3Method: shortText(raw.transfer?.mp3Method), wavMethod: shortText(raw.transfer?.wavMethod)
    },
    features: {
      audioContext: Boolean(raw.features?.audioContext),
      blob: Boolean(raw.features?.blob), dataUri: Boolean(raw.features?.dataUri)
    },
    observed: { audible: observed.audible === true ? true : observed.audible === false ? false : null }
  }
}
function randomId() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
export async function onRequest(context) {
  const request = context.request
  const url = new URL(request.url)
  const kv = context.env && context.env.LX_DIAGNOSTICS
  if (request.method === 'GET' && url.searchParams.get('health') === '1') {
    return reply({ available: Boolean(kv), retentionHours: 24 })
  }
  if (request.method === 'GET') {
    const id = url.searchParams.get('id') || ''
    if (!/^[a-f0-9]{24}$/.test(id)) return reply({ error: 'Unknown report' }, 404)
    if (!kv) return reply({ error: 'Diagnostic storage is not configured' }, 503)
    const result = await kv.get('report:' + id)
    return result ? new Response(result, { status: 200, headers: JSON_HEADERS }) :
      reply({ error: 'Report not found or expired' }, 404)
  }
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405)
  if (!kv) return reply({ error: 'Diagnostic storage not configured. Use the photo summary.' }, 503)
  // Same-origin, explicit user-action client only; prevent cross-site form posts.
  const origin = request.headers.get('Origin')
  if (origin && origin !== url.origin) return reply({ error: 'Cross-origin upload refused' }, 403)
  if (request.headers.get('X-LX-Diagnostic') !== '1' ||
      !/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || '')) {
    return reply({ error: 'JSON diagnostic request required' }, 415)
  }
  const length = Number(request.headers.get('Content-Length') || 0)
  if (length > 3500) return reply({ error: 'Report too large' }, 413)
  let raw
  try {
    const body = await request.text()
    if (body.length > 3500) return reply({ error: 'Report too large' }, 413)
    raw = JSON.parse(body)
  } catch {
    return reply({ error: 'Invalid JSON' }, 400)
  }
  let report
  try { report = clean(raw) } catch { return reply({ error: 'Invalid diagnostic' }, 400) }
  // A coarse anonymous abuse limit. Only a one-way hash, never the IP, is
  // stored; no network headers or identity attributes enter reports.
  const ip = request.headers.get('CF-Connecting-IP') || ''
  if (ip) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip + ':lx-via-2026'))
    const key = Array.from(new Uint8Array(digest).slice(0, 12), b => b.toString(16).padStart(2,'0')).join('')
    const previous = Number(await kv.get('rate:' + key) || 0)
    if (previous >= 10) return reply({ error: 'Too many uploads; retry later or use the photo summary' }, 429)
    await kv.put('rate:' + key, String(previous + 1), { expirationTtl: 3600 })
  }
  const id = randomId()
  await kv.put('report:' + id, JSON.stringify(report), { expirationTtl: TTL })
  return reply({ id, url: url.origin + url.pathname + '?id=' + id, retentionHours: 24 }, 201)
}
