function corsHeaders(request) {
  return {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Range,If-Range,If-None-Match,If-Modified-Since,X-LX-Headers',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    'Vary': 'Origin'
  };
}

function jsonResponse(value, status, request) {
  return new Response(JSON.stringify(value), {
    status: status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }, corsHeaders(request))
  });
}

function buildTarget(keyword, offset, limit) {
  var target = new URL('https://music.163.com/api/cloudsearch/pc');
  target.searchParams.set('csrf_token', '');
  return target;
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequest(context) {
  var request = context.request;
  if (String(request.method || 'GET').toUpperCase() !== 'GET') {
    return jsonResponse({ error: 'Method Not Allowed' }, 405, request);
  }

  var url = new URL(request.url);
  var keyword = String(url.searchParams.get('s') || '').replace(/^\s+|\s+$/g, '');
  var offset = Number(url.searchParams.get('offset') || 0);
  var limit = Number(url.searchParams.get('limit') || 20);

  if (!keyword) return jsonResponse({ error: 'Missing search keyword' }, 400, request);
  if (!isFinite(offset) || offset < 0) offset = 0;
  if (!isFinite(limit) || limit < 1) limit = 20;
  limit = Math.min(Math.floor(limit), 30);

  var target = buildTarget(keyword, offset, limit);
  var body = new URLSearchParams();
  body.set('s', keyword);
  body.set('type', '1');
  body.set('offset', String(Math.floor(offset)));
  body.set('limit', String(limit));
  body.set('total', 'true');

  var controller = new AbortController();
  var timeoutId = setTimeout(function () {
    try { controller.abort(); } catch (e) {}
  }, 9000);

  try {
    var upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
        'Referer': 'https://music.163.com/',
        'Accept': 'application/json, text/plain, */*'
      },
      body: body.toString(),
      redirect: 'follow',
      signal: controller.signal
    });

    var text = await upstream.text();
    if (upstream.status < 200 || upstream.status >= 300) {
      return jsonResponse({
        error: 'NetEase upstream request failed',
        message: 'HTTP ' + upstream.status + (text ? ': ' + text.slice(0, 240) : '')
      }, 502, request);
    }

    var data;
    try {
      data = JSON.parse(String(text || '').replace(/^\uFEFF/, '').replace(/^\s+|\s+$/g, ''));
    } catch (e) {
      return jsonResponse({
        error: 'NetEase response is not JSON',
        message: 'Upstream returned a non-JSON search response'
      }, 502, request);
    }

    var root = data && data.result ? data.result : data;
    var songs = root && Array.isArray(root.songs) ? root.songs : [];
    if (!songs.length) {
      return jsonResponse({
        error: 'NetEase returned no songs',
        message: 'The upstream search response contained no usable songs'
      }, 502, request);
    }

    var slimSongs = [];
    for (var i = 0; i < songs.length && slimSongs.length < limit; i += 1) {
      var song = songs[i] || {};
      if (song.id == null || !song.name) continue;
      slimSongs.push({
        id: song.id,
        name: song.name,
        duration: song.duration || 0,
        artists: Array.isArray(song.artists) ? song.artists : [],
        album: song.album || {},
        privilege: song.privilege || {}
      });
    }

    if (!slimSongs.length) {
      return jsonResponse({
        error: 'NetEase returned no usable songs',
        message: 'The upstream search response contained no usable song records'
      }, 502, request);
    }

    return jsonResponse({
      result: {
        songCount: Number(root.songCount) || slimSongs.length,
        songs: slimSongs
      }
    }, 200, request);
  } catch (e) {
    return jsonResponse({
      error: 'NetEase search request failed',
      message: e && e.name === 'AbortError'
        ? 'NetEase search upstream timed out'
        : (e && e.message ? e.message : 'Unknown upstream error')
    }, 502, request);
  } finally {
    clearTimeout(timeoutId);
  }
}
