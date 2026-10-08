// Diagnostics only: do not infer song copyright/entitlement from HTTP status.
// Never log signed URLs, raw song IDs, query strings or credentials.
export function endpointLabel(input) {
  try {
    const u = new URL(input)
    const h = u.hostname.toLowerCase(), p = u.pathname.toLowerCase()
    if (h.endsWith('gdstudio.xyz')) return p.includes('/time') ? 'gd-clock' : 'gd-resolver'
    if (h === 'lxmusicapi.onrender.com') return 'huibq-resolver'
    if (h.endsWith('migu.cn')) return p.includes('/search') ? 'migu-search' : 'migu-official'
    if (p.includes('/flower/v1/url/')) return 'flower-resolver'
    return 'other-upstream'
  } catch { return 'unclassified' }
}
function hostOfUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) return null
  try { return new URL(value).hostname.toLowerCase() } catch { return null }
}
export function summarizeResolver(status, contentType, body, target) {
  const out = { endpoint: endpointLabel(target), httpStatus: Number(status), signal: 'unclassified', businessCode: null, mediaHost: null, restrictionMetadataPresent: false }
  if (status >= 400) {
    out.signal = status === 403 && /just a moment|cf-chl-|cloudflare.*challenge/i.test(String(body || ''))
      ? 'upstream_access_challenge' : 'upstream_http_error'
    return out
  }
  if (!/json|text|html/i.test(String(contentType || ''))) {
    out.signal = 'non_json_content'; return out
  }
  let data
  try { data = JSON.parse(body) }
  catch { out.signal = 'non_json_content'; return out }
  if (!data || typeof data !== 'object') { out.signal = 'no_media_url'; return out }
  out.restrictionMetadataPresent = Boolean(data.data && typeof data.data === 'object' &&
    (data.data.cannotCode !== undefined || data.data.dialogInfo !== undefined || data.data.freeListenType !== undefined))
  if (data.code != null) out.businessCode = String(data.code).slice(0, 24)
  else if (data.status != null) out.businessCode = String(data.status).slice(0, 24)
  // Covers, artworks and URLs embedded in general search data are NOT media.
  for (const obj of [data, data.data, data.result, data.data?.data]) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue
    for (const key of ['url','playUrl','play_url','musicUrl','music_url','listenUrl','audioUrl']) {
      const host = hostOfUrl(obj[key])
      if (host) { out.mediaHost = host; break }
    }
    if (out.mediaHost) break
  }
  if (out.mediaHost && /(?:^|\.)(?:kuwo\.cn|kugou\.com|qq\.com|163\.com)$/.test(out.mediaHost)) {
    out.signal = 'cross_platform_media'
  } else if (out.mediaHost) {
    out.signal = 'media_url_returned_unverified'
  } else if (out.businessCode && !['0','200','000000','success'].includes(out.businessCode.toLowerCase())) {
    out.signal = 'upstream_business_rejection'
  } else {
    out.signal = 'no_media_url'
  }
  return out
}
export function classifyPlayback({ currentTime, readyState, paused, ended, duration, errorCode, outcomes = [] }) {
  const progress = Number(currentTime) || 0
  const d = Number(duration)
  if (!paused && !ended && Number(readyState) >= 2 && progress >= 1.2 &&
      (!Number.isFinite(d) || d === 0 || d >= 20)) return 'confirmed_audio_progress'
  if (outcomes.some(x => x.signal === 'upstream_access_challenge')) return 'upstream_access_challenge'
  if (outcomes.some(x => x.signal === 'cross_platform_media')) return 'cross_platform_fallback_rejected'
  if (outcomes.some(x => x.signal === 'upstream_business_rejection')) return 'upstream_business_rejection'
  if (errorCode) return 'media_load_error'
  if (outcomes.some(x => x.signal === 'no_media_url')) return 'upstream_no_audio_url'
  if (outcomes.some(x => x.signal === 'upstream_http_error')) return 'upstream_http_error'
  return 'playback_not_confirmed'
}
