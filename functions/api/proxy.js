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
  var hosts = ['ts.tempmusics.tk', 'tm.tempmusics.tk'];
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();
  var lastError = null;

  for (var hi = 0; hi < hosts.length; hi += 1) {
    var socket = null;
    try {
      socket = connect({ hostname: '97.64.37.235', port: 80 });
      await socket.opened;

      var forwarded = pickForwardHeaders(request);
      var requestLines = [
        String(request.method || 'GET').toUpperCase() + ' ' + target.pathname + target.search + ' HTTP/1.0',
        'Host: ' + hosts[hi],
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
        'Flower TCP resolver HTTP ' + status + ' via Host ' + hosts[hi]
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
        || lower === 'referer' || lower === 'cookie'
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
  var init = { method: method, headers: pickForwardHeaders(request), redirect: 'follow' };
  if (method !== 'GET' && method !== 'HEAD') init.body = request.body;

  // Cloudflare rejects direct-IP requests with Error 1003. Flower publishes
  // its resolver on this IP, so try known DNS aliases for the same origin.
  if (target.hostname.toLowerCase() === '97.64.37.235'
      && /^\/flower\/v1\/url\//.test(target.pathname)) {
    return await fetchFlowerResolverViaSocket(target, request);
  }

  var candidateUrls = [target.toString()];

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