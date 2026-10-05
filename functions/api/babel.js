var BABEL_CDN_URLS = [
  'https://cdn.jsdelivr.net/npm/@babel/standalone@7.29.9/babel.min.js',
  'https://unpkg.com/@babel/standalone@7.29.9/babel.min.js'
];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

export async function onRequest() {
  var lastError = null;

  for (var i = 0; i < BABEL_CDN_URLS.length; i += 1) {
    var url = BABEL_CDN_URLS[i];
    try {
      var upstream = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/javascript,text/javascript,*/*',
          'User-Agent': 'Only-testing-online-music legacy Babel proxy'
        }
      });

      if (!upstream.ok) {
        lastError = new Error('Babel CDN HTTP ' + upstream.status);
        continue;
      }

      var headers = new Headers({
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=86400'
      });
      var cors = corsHeaders();
      for (var key in cors) headers.set(key, cors[key]);

      return new Response(upstream.body, {
        status: 200,
        headers: headers
      });
    } catch (e) {
      lastError = e;
    }
  }

  return new Response(
    'Babel proxy unavailable: ' +
      (lastError && lastError.message ? lastError.message : 'unknown error'),
    {
      status: 502,
      headers: Object.assign({
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store'
      }, corsHeaders())
    }
  );
}
