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


async function fetchFlowerResolverViaSocket(target, request) {
  if (!target || target.protocol !== 'http:' ||
      String(target.hostname || '').toLowerCase() !== '97.64.37.235') {
    return new Response(JSON.stringify({
      error: 'Flower socket resolver skipped',
      message: 'Target is not the canonical Flower HTTP origin'
    }), {
      status: 400,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }

  var socket = null;
  var writer = null;
  var timeoutId = null;

  try {
    var method = String(request.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      throw new Error('Flower socket resolver only supports GET/HEAD');
    }

    socket = connect({
      hostname: target.hostname,
      port: Number(target.port || 80)
    });

    writer = socket.writable.getWriter();

    var forwarded = pickForwardHeaders(request);
    var requestHeaders = [
      'Host: ' + target.hostname,
      'Connection: close',
      'Accept: application/json, text/plain, */*',
      'Accept-Encoding: identity'
    ];

    forwarded.forEach(function (value, key) {
      var lower = String(key || '').toLowerCase();
      if (lower === 'host' || lower === 'content-length' || lower === 'connection' ||
          lower === 'accept-encoding') return;
      requestHeaders.push(String(key) + ': ' + String(value));
    });

    var encoder = new TextEncoder();
    var path = target.pathname + target.search;
    await writer.write(encoder.encode(
      method + ' ' + path + ' HTTP/1.1\r\n' +
      requestHeaders.join('\r\n') + '\r\n\r\n'
    ));
    await writer.close();
    writer = null;

    var responsePromise = readSocketBytes(socket);
    var timeoutPromise = new Promise(function (_, reject) {
      timeoutId = setTimeout(function () {
        reject(new Error('Flower socket resolver timed out'));
      }, 7000);
    });

    var bytes = await Promise.race([responsePromise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    var text = new TextDecoder('utf-8').decode(bytes);
    var headerEnd = text.indexOf('\r\n\r\n');
    if (headerEnd < 0) throw new Error('Flower socket response missing HTTP headers');

    var head = text.slice(0, headerEnd);
    var body = text.slice(headerEnd + 4);
    var lines = head.split('\r\n');
    var statusMatch = lines[0].match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})\b/i);
    var status = statusMatch ? Number(statusMatch[1]) : 0;

    var responseHeaders = {};
    for (var hi = 1; hi < lines.length; hi += 1) {
      var separator = lines[hi].indexOf(':');
      if (separator < 0) continue;
      var headerName = lines[hi].slice(0, separator).replace(/^\s+|\s+$/g, '');
      var headerValue = lines[hi].slice(separator + 1).replace(/^\s+|\s+$/g, '');
      if (headerName) responseHeaders[headerName.toLowerCase()] = headerValue;
    }

    var transferEncoding = String(responseHeaders['transfer-encoding'] || '').toLowerCase();
    if (transferEncoding.indexOf('chunked') >= 0) {
      body = decodeChunkedBody(body);
    } else {
      var contentLength = Number(responseHeaders['content-length']);
      if (isFinite(contentLength) && contentLength >= 0) {
        body = body.slice(0, contentLength);
      }
    }

    var payload = extractFlowerResolverPayload(body);
    if (status >= 200 && status < 300 && payload) {
      return new Response(payload.body, {
        status: 200,
        statusText: 'OK',
        headers: new Headers({
          'Content-Type': payload.contentType,
          'Cache-Control': 'no-store'
        })
      });
    }

    throw new Error(
      'Flower socket HTTP ' + String(status || 'unknown') +
      (body ? ': ' + String(body).slice(0, 180) : '')
    );
  } catch (e) {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    if (writer) {
      try { writer.releaseLock(); } catch (ignore) {}
      writer = null;
    }

    var message = e && e.message ? e.message : 'Unknown Flower socket error';
    return new Response(JSON.stringify({
      error: 'Flower socket resolver failed',
      message: message
    }), {
      status: 502,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (socket) {
      try { await socket.close(); } catch (ignore) {}
    }
  }
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
    'http://ts.tempmusic.tk',
    'http://tm.tempmusic.tk',
    'https://ts.tempmusic.tk',
    'https://tm.tempmusic.tk',
    'http://97-64-37-235.sslip.io',
    'http://97-64-37-235.nip.io',
    'https://97-64-37-235.sslip.io',
    'https://97-64-37-235.nip.io'
  ];
  var forwarded = pickForwardHeaders(request);
  var lastError = null;

  for (var bi = 0; bi < bases.length; bi += 1) {
    var base = bases[bi];
    var paths = [target.pathname];
    if (/^\/flower\/v1\/url\//.test(target.pathname)) {
      paths.unshift(target.pathname.replace(/^\/flower\/v1\/url\//, '/url/'));
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
          'Flower wildcard DNS HTTP ' + upstream.status + ' via ' + endpoint +
          (trimmed ? ': ' + trimmed.slice(0, 180) : '')
        );
      } catch (err) {
        lastError = err;
      }
    }
  }

  return new Response(JSON.stringify({
    error: 'Flower wildcard DNS resolver failed',
    message: lastError && lastError.message ? lastError.message : 'No wildcard DNS response'
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

  // Keep the canonical raw-IP endpoint, then try the current LX Music
  // resolver host aliases before wildcard-DNS fallbacks.
  var path = target.pathname + target.search;
  add(target.toString());
  add('http://ts.tempmusic.tk' + path.replace(/^\/flower\/v1\//, '/'));
  add('http://tm.tempmusic.tk' + path.replace(/^\/flower\/v1\//, '/'));
  add('http://ts.tempmusic.tk' + path);
  add('http://tm.tempmusic.tk' + path);
  add('http://97-64-37-235.sslip.io' + path);
  add('http://97-64-37-235.nip.io' + path);
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
    var parsedData = parsed && parsed.data;
    var parsedCode = parsed && parsed.code;
    if ((parsedCode === 0 || String(parsedCode) === '0') &&
        typeof parsedData === 'string' &&
        /^https?:\/\//i.test(parsedData.trim())) {
      return {
        body: text,
        contentType: 'application/json; charset=utf-8'
      };
    }

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
    // Public CORS relay for small resolver responses.
    function (targetUrl) {
      return 'https://cors.io/?url=' + encodeURIComponent(targetUrl);
    },
    // Secondary server-side reader bridge.
    function (targetUrl) {
      return 'https://r.jina.ai/' + targetUrl;
    },
    // Thingproxy explicitly supports forwarding HTTP APIs through HTTPS.
    function (targetUrl) {
      return 'https://thingproxy.freeboard.io/fetch/' + targetUrl;
    },
    // Independent URL-parameter relay for small text/JSON responses.
    function (targetUrl) {
      return 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(targetUrl);
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

function getPreferredUpstreamUrls(target) {
  var original = target.toString();
  var host = String(target.hostname || '').toLowerCase();

  // Several legacy LX sources still publish plain HTTP search URLs. The
  // HTTP endpoints can stall behind modern proxy/runner networks even when
  // their HTTPS equivalents are healthy. Prefer HTTPS for known search hosts,
  // then retain the original HTTP form as a fallback.
  var httpsFirstHosts = {
    'search.kuwo.cn': true,
    'songsearch.kugou.com': true,
    'u.y.qq.com': true,
    'c.y.qq.com': true
  };

  if (target.protocol !== 'http:' || !httpsFirstHosts[host]) return [original];

  var secure = new URL(target.toString());
  secure.protocol = 'https:';
  return [secure.toString(), original];
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

var MIGU_H5_V24_HOST = 'c.musicapp.migu.cn';
var MIGU_H5_V24_PATH = '/strategy/listen-url/h5/v2.4';
var MIGU_SEARCH_V10_HOST = 'c.musicapp.migu.cn';
var MIGU_SEARCH_V10_PATH = '/v1.0/content/search_all.do';
var MIGU_PC_V20_HOST = 'app.c.nf.migu.cn';
var MIGU_PC_V20_PATH = '/strategy/pc/listen/v2.0';
var MIGU_H5_V24_KEY = new TextEncoder().encode('Jk8qzuePiJ1qE3mDYhLQ3T73DtDoAhLP');

function decodeMiguH5V24(bytes, signedResponse) {
  var raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  var hasMagicHeader = raw.length >= 4 &&
    raw[0] === 0xab && raw[1] === 0xcd && raw[2] === 0x01;
  var hasSignedHeader = signedResponse === true || String(signedResponse || '').trim() === '1';

  // Current Migu H5 clients mark encrypted responses either with the AB CD 01
  // payload prefix or with response header "signature: 1". Both forms use the
  // same four-byte seed envelope; the signed form may omit the magic prefix.
  if (!hasMagicHeader && !hasSignedHeader) {
    return new TextDecoder('utf-8').decode(raw);
  }

  if (raw.length < 4) {
    return new TextDecoder('utf-8').decode(raw);
  }

  var seed = raw[3];
  var decoded = new Uint8Array(raw.length - 4);
  for (var i = 4; i < raw.length; i += 1) {
    decoded[i - 4] =
      (raw[i] + seed - MIGU_H5_V24_KEY[(i - 4) % MIGU_H5_V24_KEY.length]) & 0xff;
  }
  return new TextDecoder('utf-8').decode(decoded);
}

async function fetchMiguH5V24(target, request) {
  var targetHeaders = pickForwardHeaders(request);
  var method = String(request.method || 'GET').toUpperCase();
  var init = { method: method, headers: targetHeaders, redirect: 'follow' };
  if (method !== 'GET' && method !== 'HEAD') init.body = request.body;

  try {
    var upstream = await fetch(target.toString(), init);
    if (upstream.status < 200 || upstream.status >= 300) {
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: copyResponseHeaders(upstream, request)
      });
    }

    var signatureHeader = upstream.headers.get('signature') || '';
    var decodedText = decodeMiguH5V24(
      new Uint8Array(await upstream.arrayBuffer()),
      String(signatureHeader).trim() === '1'
    );
    var parsed;
    try {
      parsed = JSON.parse(decodedText);
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'Migu H5 v2.4 response decode failed',
        message: 'The upstream response was not valid JSON after decryption'
      }), {
        status: 502,
        headers: Object.assign({
          'Content-Type': 'application/json; charset=utf-8'
        }, corsHeaders(request))
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: upstream.status,
      headers: Object.assign({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }, corsHeaders(request))
    });
  } catch (e) {
    return new Response(JSON.stringify({
      error: 'Migu H5 v2.4 request failed',
      message: e && e.message ? e.message : 'Unknown upstream error'
    }), {
      status: 502,
      headers: Object.assign({
        'Content-Type': 'application/json; charset=utf-8'
      }, corsHeaders(request))
    });
  }
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

  if (
    (target.hostname.toLowerCase() === MIGU_H5_V24_HOST &&
      target.pathname === MIGU_H5_V24_PATH) ||
    (target.hostname.toLowerCase() === MIGU_PC_V20_HOST &&
      target.pathname === MIGU_PC_V20_PATH) ||
    (target.hostname.toLowerCase() === MIGU_SEARCH_V10_HOST &&
      target.pathname === MIGU_SEARCH_V10_PATH)
  ) {
    return await fetchMiguH5V24(target, request);
  }

  // Cloudflare rejects direct-IP requests with Error 1003. Flower publishes
  // its resolver on this IP, so try known DNS aliases for the same origin.
  if (target.hostname.toLowerCase() === '97.64.37.235'
      && /^\/flower\/v1\/url\//.test(target.pathname)) {
    // Cloudflare's ordinary fetch path rejects this public HTTP IP. Use the
    // Workers Socket API first so the canonical Flower resolver can still be
    // reached without changing the imported LX source URL.
    var flowerSocketResponse = await fetchFlowerResolverViaSocket(target, request);
    if (flowerSocketResponse.status >= 200 && flowerSocketResponse.status < 300) {
      return flowerSocketResponse;
    }

    // If the socket route is unavailable, retain the existing hostname and
    // HTTPS bridge fallbacks as secondary compatibility paths.
    var flowerHostResponse = await fetchFlowerResolverViaHost(target, request);
    if (flowerHostResponse.status >= 200 && flowerHostResponse.status < 300) {
      return flowerHostResponse;
    }

    var flowerBridgeResponse = await fetchFlowerResolverViaHttpBridge(target, request);
    if (flowerBridgeResponse.status >= 200 && flowerBridgeResponse.status < 300) {
      return flowerBridgeResponse;
    }

    var flowerDirectResponse = await fetchFlowerResolverViaDirectFetch(target, request);
    if (flowerDirectResponse.status >= 200 && flowerDirectResponse.status < 300) {
      return flowerDirectResponse;
    }

    // Do not use the legacy TCP socket fallback here. Cloudflare Workers
    // can reject public HTTP socket connections, and the old socket fallback
    // was the source of Worker 1101 crashes. Return a normal 502 instead so
    // the browser-side playback layer can activate native platform fallback.
    return new Response(JSON.stringify({
      error: 'Flower resolver unavailable',
      message: 'All Flower HTTP resolver routes failed'
    }), {
      status: 502,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }

  var candidateUrls = target.protocol === 'http:'
    ? getPreferredUpstreamUrls(target)
    : [target.toString()];

  if (isTencentMediaHost(target.hostname)) {
    candidateUrls = getTencentMediaCandidateUrls(target);
  }

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