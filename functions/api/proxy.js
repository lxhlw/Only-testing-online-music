function corsHeaders(request) {
  var origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-LX-Headers',
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
  if (!requested) return out;
  var data;
  try { data = JSON.parse(requested); } catch (e) { return out; }
  if (!data || typeof data !== 'object') return out;

  for (var key in data) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    var lower = key.toLowerCase();
    if (lower === 'host' || lower === 'content-length' || lower === 'connection'
        || lower === 'origin' || lower === 'referer' || lower === 'cookie'
        || lower === 'access-control-request-method' || lower === 'access-control-request-headers') continue;
    var value = String(data[key]);
    if (value.length > 4096) continue;
    try { out.set(key, value); } catch (e) {}
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
  var candidateUrls = [target.toString()];
  if (target.hostname.toLowerCase() === '97.64.37.235') {
    candidateUrls = [];
    var flowerAliases = ['ts.tempmusic.tk', 'tm.tempmusic.tk'];
    for (var fi = 0; fi < flowerAliases.length; fi += 1) {
      try {
        var alias = new URL(target.toString());
        alias.hostname = flowerAliases[fi];
        candidateUrls.push(alias.toString());
      } catch (e) {}
    }
    candidateUrls.push(target.toString());
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
      if (ci === candidateUrls.length - 1) {
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: copyResponseHeaders(upstream, request)
        });
      }
      lastError = new Error('Upstream HTTP ' + upstream.status + ' from ' + candidateUrls[ci]);
    } catch (e) {
      lastError = e;
    }
  }

  if (lastError) throw lastError;
    return new Response(JSON.stringify({
      error: 'Upstream request failed',
      message: e && e.message ? e.message : String(e)
    }), {
      status: 502,
      headers: Object.assign({'Content-Type': 'application/json; charset=utf-8'}, corsHeaders(request))
    });
  }
}
