import { connect } from 'cloudflare:sockets';

async function readSocketBytes(socket) {
  var reader = socket.readable.getReader();
  var chunks = [];
  var total = 0;

  try {
    while (true) {
      var result = await reader.read();
      if (result.done) break;
      var value = result.value;
      if (!value) continue;
      total += value.length;
      if (total > 1024 * 1024) throw new Error('Flower resolver response exceeds 1 MiB');
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  var out = new Uint8Array(total);
  var offset = 0;
  for (var i = 0; i < chunks.length; i += 1) {
    out.set(chunks[i], offset);
    offset += chunks[i].length;
  }
  return out;
}

function decodeChunkedBody(text) {
  var offset = 0;
  var out = '';
  while (offset < text.length) {
    var end = text.indexOf('\r\n', offset);
    if (end < 0) break;
    var sizeText = text.slice(offset, end).split(';')[0].replace(/^\s+|\s+$/g, '');
    var size = parseInt(sizeText, 16);
    if (!isFinite(size) || size < 0) throw new Error('Invalid chunked Flower response');
    offset = end + 2;
    if (size === 0) break;
    out += text.slice(offset, offset + size);
    offset += size + 2;
  }
  return out;
}

async function fetchFlowerResolverViaDirectFetch(target, request) {
  try {
    var forwarded = pickForwardHeaders(request);
    var upstream = await fetch(target.toString(), {
      method: String(request.method || 'GET').toUpperCase(),
      headers: forwarded,
      redirect: 'follow'
    });

    var body = await upstream.text();
    var trimmed = String(body || '').replace(/^\s+|\s+$/g, '');

    if (upstream.status >= 200 && upstream.status < 300 &&
        /^(?:https?:\/\/|\{|\[)/i.test(trimmed)) {
      return new Response(trimmed, {
        status: upstream.status,
        statusText: upstream.statusText || 'OK',
        headers: new Headers({
          'Content-Type': upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store'
        })
      });
    }

    return new Response(JSON.stringify({
      error: 'Flower direct fetch returned no resolver data',
      message: 'HTTP ' + upstream.status + (trimmed ? ': ' + trimmed.slice(0, 180) : '')
    }), {
      status: 502,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Flower direct fetch failed',
      message: e && e.message ? e.message : 'Unknown fetch error'
    }), {
      status: 502,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }
}

async function fetchFlowerResolverViaHost(target, request) {
  var bases = [
    'http://ts.tempmusics.tk',
    'http://tm.tempmusics.tk',
    'https://ts.tempmusics.tk',
    'https://tm.tempmusics.tk'
  ];
  var forwarded = pickForwardHeaders(request);
  var lastError = null;

  for (var bi = 0; bi < bases.length; bi += 1) {
    var base = bases[bi];
    var paths = [];
    if (/^\/flower\/v1\/url\//.test(target.pathname)) {
      // Prefer the legacy LX resolver route exposed by tempmusics.tk.
      // Cloudflare cannot reliably fetch the raw Flower IP, while the
      // hostname-routed /url endpoint remains the compatible HTTP entrypoint.
      paths.push(target.pathname.replace(/^\/flower\/v1\/url\//, '/url/'));
      paths.push(target.pathname);
    } else {
      paths.push(target.pathname);
    }

    for (var pi = 0; pi < paths.length; pi += 1) {
      var endpoint = base + paths[pi] + target.search;
      try {
        var upstream = await fetch(endpoint, {
          method: String(request.method || 'GET').toUpperCase(),
          headers: forwarded,
          redirect: 'follow'
        });
        var body = await upstream.text();
        var trimmed = String(body || '').replace(/^\s+|\s+$/g, '');

        if (upstream.status >= 200 && upstream.status < 300 &&
            /^(?:https?:\/\/|\{|\[)/i.test(trimmed)) {
          return new Response(trimmed, {
            status: 200,
            statusText: 'OK',
            headers: new Headers({
              'Content-Type': upstream.headers.get('Content-Type') || 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store'
            })
          });
        }

        lastError = new Error(
          'Flower host HTTP ' + upstream.status + ' via ' + endpoint +
          (trimmed ? ': ' + trimmed.slice(0, 180) : '')
        );
      } catch (e) {
        lastError = e;
      }
    }
  }

  return new Response(JSON.stringify({
    error: 'Flower host resolver failed',
    message: lastError && lastError.message ? lastError.message : 'No Flower host response'
  }), {
    status: 502,
    headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
  });
}

async function fetchFlowerResolverViaSocket(target, request) {
  var hosts = [
    { hostname: '97.64.37.235', hostHeader: '97.64.37.235' },
    { hostname: 'ts.tempmusics.tk', hostHeader: 'ts.tempmusics.tk' },
    { hostname: 'tm.tempmusics.tk', hostHeader: 'tm.tempmusics.tk' }
  ];
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();
  var lastError = null;

  for (var hi = 0; hi < hosts.length; hi += 1) {
    var socket = null;
    try {
      socket = connect({ hostname: hosts[hi].hostname, port: 80 });
      await socket.opened;

      var forwarded = pickForwardHeaders(request);
      var requestLines = [
        String(request.method || 'GET').toUpperCase() + ' ' + target.pathname + target.search + ' HTTP/1.1',
        'Host: ' + hosts[hi].hostHeader,
        'Connection: close',
        'Accept-Encoding: identity'
      ];

      forwarded.forEach(function (value, key) {
        var lower = key.toLowerCase();
        if (lower === 'host' || lower === 'connection' || lower === 'content-length') return;
        requestLines.push(key + ': ' + value);
      });

      var writer = socket.writable.getWriter();
      await writer.write(encoder.encode(requestLines.join('\r\n') + '\r\n\r\n'));
      await writer.close();

      var bytes = await readSocketBytes(socket);
      var text = decoder.decode(bytes);
      var split = text.indexOf('\r\n\r\n');
      var separatorLength = 4;
      if (split < 0) {
        split = text.indexOf('\n\n');
        separatorLength = 2;
      }

      if (split < 0) {
        var bodyOnly = String(text || '').replace(/^\s+|\s+$/g, '');
        if (/^(?:https?:\/\/|\{|\[)/i.test(bodyOnly)) {
          return new Response(bodyOnly, {
            status: 200,
            statusText: 'OK',
            headers: new Headers({
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'no-store'
            })
          });
        }
        throw new Error(
          'Flower resolver returned an invalid HTTP response: ' +
          String(text || '').slice(0, 160)
        );
      }

      var headerText = text.slice(0, split);
      var bodyText = text.slice(split + separatorLength);
      var statusMatch = headerText.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/i);
      if (!statusMatch) throw new Error(
        'Flower resolver returned an invalid HTTP status: ' +
        headerText.slice(0, 160)
      );
      var status = Number(statusMatch[1]);

      var normalizedHeaders = headerText.replace(/\r/g, '');
      var contentTypeMatch = normalizedHeaders.match(/(?:^|\n)Content-Type:\s*([^\n]+)/i);
      var transferEncoding = /(?:^|\n)Transfer-Encoding:\s*chunked/i.test(normalizedHeaders);
      if (transferEncoding) bodyText = decodeChunkedBody(bodyText);

      var responseHeaders = new Headers();
      if (contentTypeMatch) responseHeaders.set('Content-Type', String(contentTypeMatch[1]).trim());
      responseHeaders.set('Cache-Control', 'no-store');

      if (status >= 200 && status < 300) {
        return new Response(bodyText, {
          status: status,
          statusText: 'OK',
          headers: responseHeaders
        });
      }

      lastError = new Error(
        'Flower TCP resolver HTTP ' + status + ' via Host ' + hosts[hi].hostHeader
      );
    } catch (e) {
      lastError = e;
    } finally {
      if (socket) {
        try { await socket.close(); } catch (e) {}
      }
    }
  }

  return new Response(JSON.stringify({
    error: 'Flower TCP resolver failed',
    message: lastError && lastError.message ? lastError.message : 'No Flower TCP response'
  }), {
    status: 502,
    headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
  });
}

function flowerResolverTargets(target) {
  var targets = [];

  function add(url) {
    if (!url) return;
    for (var i = 0; i < targets.length; i += 1) {
      if (targets[i] === url) return;
    }
    targets.push(url);
  }

  add(target.toString());

  if (/^\/flower\/v1\/url\//.test(target.pathname)) {
    var legacyPath = target.pathname.replace(/^\/flower\/v1\/url\//, '/url/');
    var bases = [
      'http://ts.tempmusics.tk',
      'http://tm.tempmusics.tk',
      'https://ts.tempmusics.tk',
      'https://tm.tempmusics.tk'
    ];

    for (var bi = 0; bi < bases.length; bi += 1) {
      add(bases[bi] + legacyPath + target.search);
      add(bases[bi] + target.pathname + target.search);
    }
  }

  return targets;
}

function extractFlowerResolverPayload(body) {
  var text = String(body || '').replace(/^\uFEFF\s*|\s+$/g, '');
  if (!text) return null;

  function findAudioUrl(value, depth) {
    if (depth > 6 || value == null) return '';

    if (typeof value === 'string') {
      var direct = value.replace(/^\s+|\s+$/g, '');
      if (/^https?:\/\//i.test(direct) &&
          /\.(?:mp3|m4a|flac|aac|ogg|wav)(?:[?#].*)?$/i.test(direct)) {
        return direct;
      }

      var matches = direct.match(/https?:\/\/[^\s"'<>]+/ig) || [];
      for (var mi = 0; mi < matches.length; mi += 1) {
        var candidate = matches[mi].replace(/[),.;]+$/g, '');
        if (/\.(?:mp3|m4a|flac|aac|ogg|wav)(?:[?#].*)?$/i.test(candidate)) {
          return candidate;
        }
      }
      return '';
    }

    if (Array.isArray(value)) {
      for (var ai = 0; ai < value.length; ai += 1) {
        var fromArray = findAudioUrl(value[ai], depth + 1);
        if (fromArray) return fromArray;
      }
      return '';
    }

    if (typeof value === 'object') {
      var preferred = [
        'url', 'play_url', 'playUrl', 'musicUrl', 'music_url',
        'audio', 'audioUrl', 'src'
      ];

      for (var pi = 0; pi < preferred.length; pi += 1) {
        if (Object.prototype.hasOwnProperty.call(value, preferred[pi])) {
          var fromPreferred = findAudioUrl(value[preferred[pi]], depth + 1);
          if (fromPreferred) return fromPreferred;
        }
      }

      for (var key in value) {
        if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
        var fromValue = findAudioUrl(value[key], depth + 1);
        if (fromValue) return fromValue;
      }
    }

    return '';
  }

  try {
    var parsed = JSON.parse(text);
    var parsedUrl = findAudioUrl(parsed, 0);
    if (parsedUrl) {
      return {
        body: text,
        contentType: 'application/json; charset=utf-8'
      };
    }
  } catch (e) {}

  var bodyUrl = findAudioUrl(text, 0);
  if (bodyUrl) {
    return {
      body: JSON.stringify({ url: bodyUrl }),
      contentType: 'application/json; charset=utf-8'
    };
  }

  return null;
}

async function fetchFlowerResolverViaHttpBridge(target, request) {
  var targets = flowerResolverTargets(target);
  var bridges = [
    function (targetUrl) {
      return 'https://r.jina.ai/' + targetUrl;
    },
    function (targetUrl) {
      return 'https://api.allorigins.win/raw?url=' + encodeURIComponent(targetUrl);
    },
    function (targetUrl) {
      return 'https://corsproxy.io/?url=' + encodeURIComponent(targetUrl);
    },
    function (targetUrl) {
      return 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(targetUrl);
    }
  ];

  var forwarded = pickForwardHeaders(request);
  var lastError = null;

  for (var ti = 0; ti < targets.length; ti += 1) {
    for (var bi = 0; bi < bridges.length; bi += 1) {
      var targetUrl = targets[ti];
      var bridgeUrl = bridges[bi](targetUrl);

      try {
        var bridgeHeaders = new Headers();
        forwarded.forEach(function (value, key) {
          var lower = key.toLowerCase();
          if (lower === 'host' || lower === 'content-length' || lower === 'connection') return;
          try { bridgeHeaders.set(key, value); } catch (e) {}
        });
        bridgeHeaders.set('Accept', 'application/json, text/plain, */*');

        var upstream = await fetch(bridgeUrl, {
          method: 'GET',
          headers: bridgeHeaders,
          redirect: 'follow'
        });

        var body = await upstream.text();
        var payload = extractFlowerResolverPayload(body);

        if (upstream.status >= 200 && upstream.status < 300 && payload) {
          return new Response(payload.body, {
            status: 200,
            statusText: 'OK',
            headers: new Headers({
              'Content-Type': payload.contentType,
              'Cache-Control': 'no-store'
            })
          });
        }

        lastError = new Error(
          'Flower HTTPS bridge HTTP ' + upstream.status +
          ' via ' + bridgeUrl +
          (body ? ': ' + body.slice(0, 180) : '')
        );
      } catch (e) {
        lastError = e;
      }
    }
  }

  return new Response(JSON.stringify({
    error: 'Flower HTTPS bridge failed',
    message: lastError && lastError.message ? lastError.message : 'No Flower HTTPS bridge response'
  }), {
    status: 502,
    headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
  });
}

function corsHeaders(request) {
  var origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, If-Range, If-None-Match, If-Modified-Since, X-LX-Headers',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function isPrivateHost(hostname) {
  var host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')
      || host === 'metadata.google.internal' || host.endsWith('.internal')) return true;

  var parts = host.split('.');
  if (parts.length === 4 && parts.every(function (part) { return /^\d+$/.test(part); })) {
    var a = Number(parts[0]), b = Number(parts[1]);
    var c = Number(parts[2]), d = Number(parts[3]);
    if ([a,b,c,d].some(function (n) { return n < 0 || n > 255; })) return true;
    if (a === 10 || a === 127 || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 168)
        || a === 0) return true;
  }

  if (host === '::1' || host.indexOf('fe80:') === 0 || host.indexOf('fc') === 0 || host.indexOf('fd') === 0) return true;
  return false;
}

function isTencentMediaHost(hostname) {
  var host = String(hostname || '').toLowerCase();
  return host === 'isure.stream.qqmusic.qq.com' ||
    host === 'ws.stream.qqmusic.qq.com' ||
    host === 'stream.qqmusic.qq.com' ||
    host === 'dl.stream.qqmusic.qq.com' ||
    host === 'streamoc.music.tc.qq.com' ||
    host === 'mobileoc.music.tc.qq.com' ||
    host === 'aqqmusic.tc.qq.com' ||
    host === 'amobile.music.tc.qq.com';
}

function getTencentMediaCandidateUrls(target) {
  var original = target.toString();
  if (!isTencentMediaHost(target.hostname) || target.pathname === '/') return [original];

  var preferred = [
    { protocol: 'http:', hostname: 'ws.stream.qqmusic.qq.com' },
    { protocol: 'http:', hostname: 'dl.stream.qqmusic.qq.com' },
    { protocol: 'http:', hostname: 'streamoc.music.tc.qq.com' },
    { protocol: 'https:', hostname: 'ws.stream.qqmusic.qq.com' },
    { protocol: 'https:', hostname: 'dl.stream.qqmusic.qq.com' },
    { protocol: 'https:', hostname: 'streamoc.music.tc.qq.com' },
    { protocol: 'https:', hostname: 'isure.stream.qqmusic.qq.com' }
  ];
  var candidates = [];

  function pushCandidate(protocol, hostname) {
    var copy = new URL(target.toString());
    copy.protocol = protocol;
    copy.hostname = hostname;
    copy.port = '';
    var value = copy.toString();
    for (var i = 0; i < candidates.length; i += 1) {
      if (candidates[i] === value) return;
    }
    candidates.push(value);
  }

  // Preserve the resolver's original target first. Then try the HTTP CDN
  // forms used by current QQ player implementations, followed by HTTPS
  // aliases. The vkey/path stays unchanged across these CDN hosts.
  pushCandidate(target.protocol, String(target.hostname || '').toLowerCase());
  for (var pi = 0; pi < preferred.length; pi += 1) {
    pushCandidate(preferred[pi].protocol, preferred[pi].hostname);
  }
  return candidates;
}

function pickForwardHeaders(request) {
  var out = new Headers();
  var requested = request.headers.get('X-LX-Headers');
  var data = null;
  if (requested) {
    try { data = JSON.parse(requested); } catch (e) { data = null; }
  }

  if (data && typeof data === 'object') for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    var lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'connection'
        || lower === 'cookie'
        || lower === 'access-control-request-method' || lower === 'access-control-request-headers') continue;
    var value = String(data[key]);
    if (value.length > 4096) continue;
    try { out.set(key, value); } catch (e) {}
  }
  var mediaHeaders = ['Range', 'If-Range', 'If-None-Match', 'If-Modified-Since', 'Accept', 'User-Agent'];
  for (var mi = 0; mi < mediaHeaders.length; mi += 1) {
    var mediaKey = mediaHeaders[mi];
    var mediaValue = request.headers.get(mediaKey);
    if (!mediaValue || mediaValue.length > 4096) continue;
    try { out.set(mediaKey, mediaValue); } catch (e) {}
  }
  return out;
}

function copyResponseHeaders(source, request) {
  var headers = new Headers();
  source.headers.forEach(function (value, key) {
    var lower = key.toLowerCase();
    if (lower === 'content-encoding' || lower === 'content-length' || lower === 'transfer-encoding'
        || lower === 'connection') return;
    headers.set(key, value);
  });
  var cors = corsHeaders(request);
  for (var key in cors) headers.set(key, cors[key]);
  return headers;
}

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequest(context) {
  var request = context.request;
  var url = new URL(request.url);

  if (url.pathname !== '/api/proxy') {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }

  var targetText = url.searchParams.get('url');
  if (!targetText) {
    return new Response(JSON.stringify({ error: 'Missing url' }), {
      status: 400,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }

  var target;
  try { target = new URL(targetText); } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid target URL' }), {
      status: 400,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return new Response(JSON.stringify({ error: 'Only HTTP(S) targets are allowed' }), {
      status: 400,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }

  if (isPrivateHost(target.hostname)) {
    return new Response(JSON.stringify({ error: 'Private or local targets are not allowed' }), {
      status: 403,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }

  var method = request.method.toUpperCase();
  var targetHeaders = pickForwardHeaders(request);

  // QQ Music CDN requests are stricter than the resolver APIs. A valid vkey
  // can still return 404 when the request does not look like a QQ player
  // request, so add the stable player headers unless the caller supplied them.
  if (isTencentMediaHost(target.hostname)) {
    if (!targetHeaders.has('Referer')) targetHeaders.set('Referer', 'https://y.qq.com/portal/player.html');
    if (!targetHeaders.has('Origin')) targetHeaders.set('Origin', 'https://y.qq.com');
    if (!targetHeaders.has('User-Agent')) {
      targetHeaders.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'
      );
    }
    if (!targetHeaders.has('Accept')) targetHeaders.set('Accept', 'audio/mpeg,audio/*;q=0.9,*/*;q=0.8');
  }

  var init = { method: method, headers: targetHeaders, redirect: 'follow' };
  if (method !== 'GET' && method !== 'HEAD') init.body = request.body;

  // Cloudflare rejects direct-IP requests with Error 1003. Flower publishes
  // its resolver on this IP, so try known DNS aliases for the same origin.
  if (target.hostname.toLowerCase() === '97.64.37.235'
      && /^\/flower\/v1\/url\//.test(target.pathname)) {
    // Route through a DNS hostname first. Cloudflare's raw-IP fetch can hit
    // Error 1003 even though the same resolver is reachable by Host routing.
    var flowerHostResponse = await fetchFlowerResolverViaHost(target, request);
    if (flowerHostResponse.status >= 200 && flowerHostResponse.status < 300) {
      return flowerHostResponse;
    }

    var flowerDirectResponse = await fetchFlowerResolverViaDirectFetch(target, request);
    if (flowerDirectResponse.status >= 200 && flowerDirectResponse.status < 300) {
      return flowerDirectResponse;
    }

    var flowerBridgeResponse = await fetchFlowerResolverViaHttpBridge(target, request);
    if (flowerBridgeResponse.status >= 200 && flowerBridgeResponse.status < 300) {
      return flowerBridgeResponse;
    }

    var flowerSocketResponse = await fetchFlowerResolverViaSocket(target, request);
    return flowerSocketResponse;
  }

  var candidateUrls = getTencentMediaCandidateUrls(target);

  var lastError = null;
  for (var ci = 0; ci < candidateUrls.length; ci += 1) {
    try {
      var upstream = await fetch(candidateUrls[ci], init);
      if (upstream.status >= 200 && upstream.status < 300) {
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: copyResponseHeaders(upstream, request)
        });
      }
      lastError = new Error('Upstream HTTP ' + upstream.status + ' from ' + candidateUrls[ci]);
      if (ci === candidateUrls.length - 1) {
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: copyResponseHeaders(upstream, request)
        });
      }
    } catch (e) {
      lastError = e;
    }
  }

  return new Response(JSON.stringify({
    error: 'Upstream request failed',
    message: lastError && lastError.message ? lastError.message : 'No upstream response'
  }), {
    status: 502,
    headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
  });
}