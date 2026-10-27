package dev.lxmusic.legacy;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URLDecoder;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocketFactory;

/**
 * Native HTTPS relay to the EXISTING same-origin Cloudflare /api/proxy.
 * API 19 WebView loses status or method when request interception is used.
 * Only three built-in playback resolver hosts are permitted. No general proxy,
 * cross-origin requests, redirects, credentials, storage or TLS bypass.
 */
public final class LegacyResolverProxy {
    private static final String ORIGIN = "https://only-testing-online-music.pages.dev";
    private static final int MAX_URL = 4096;
    private static final int MAX_BODY = 8192;
    private static final int MAX_HEADER = 8192;
    private static final int MAX_RESPONSE = 256 * 1024;
    private LegacyResolverProxy() {}

    public static final class Result {
        public final int status;
        public final String body;
        public final String type;
        Result(int code, String text, String mime) {
            status = code; body = text; type = mime;
        }
    }

    public static boolean allowed(String path, String method, String body, String packedHeaders) {
        if (path == null || path.length() < 20 || path.length() > MAX_URL ||
                method == null || !("GET".equals(method) || "POST".equals(method)) ||
                body == null || body.length() > MAX_BODY ||
                packedHeaders == null || packedHeaders.length() > MAX_HEADER) return false;
        if ("GET".equals(method) && body.length() > 0) return false;
        if (!path.startsWith("/api/proxy?url=") || path.indexOf('#') >= 0) return false;
        try {
            String query=path.substring("/api/proxy?url=".length());
            if(query.indexOf('&')>=0)return false;
            String decoded=URLDecoder.decode(query,"UTF-8");
            URL external = new URL(decoded);
            String host=external.getHost().toLowerCase(java.util.Locale.US);
            if(!"https".equalsIgnoreCase(external.getProtocol()) ||
                    external.getPort()!=-1 || external.getUserInfo()!=null) return false;
            return "lxmusicapi.onrender.com".equals(host) ||
                    "music-dl.sayqz.com".equals(host) ||
                    "music-api.gdstudio.xyz".equals(host) ||
                    "music.gdstudio.xyz".equals(host);
        } catch(Exception e){return false;}
    }

    public static Result fetch(SSLSocketFactory sockets, String path, String method,
                               String body, String packedHeaders) throws Exception {
        if (!allowed(path,method,body,packedHeaders))throw new SecurityException("Resolver request denied");
        URL dest = new URL(ORIGIN + path);
        HttpsURLConnection c=(HttpsURLConnection)dest.openConnection();
        try {
            c.setSSLSocketFactory(sockets);
            // Leave default Java hostname verification enabled.
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(14000);
            c.setReadTimeout(17000);
            c.setRequestMethod(method);
            c.setRequestProperty("Accept","application/json,text/plain,*/*");
            c.setRequestProperty("X-LX-Headers",packedHeaders);
            if("POST".equals(method)){
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type","application/x-www-form-urlencoded; charset=UTF-8");
                byte[] bytes=body.getBytes("UTF-8");
                if(bytes.length>MAX_BODY)throw new SecurityException("Body too long");
                c.setFixedLengthStreamingMode(bytes.length);
                OutputStream out=c.getOutputStream();
                try{out.write(bytes);}finally{out.close();}
            }
            int status=c.getResponseCode();
            if(status<100 || status>599)throw new java.io.IOException("Invalid upstream HTTP status");
            InputStream in=status>=400?c.getErrorStream():c.getInputStream();
            if(in==null)return new Result(status,"",c.getContentType());
            if(c.getContentLength()>MAX_RESPONSE)throw new java.io.IOException("Resolver response too large");
            ByteArrayOutputStream bytes=new ByteArrayOutputStream();
            try{
                byte[] buf=new byte[4096];int n;
                while((n=in.read(buf))!=-1){
                    if(bytes.size()+n>MAX_RESPONSE)throw new java.io.IOException("Resolver response too large");
                    bytes.write(buf,0,n);
                }
            }finally{in.close();}
            return new Result(status,new String(bytes.toByteArray(),"UTF-8"),c.getContentType());
        } finally {c.disconnect();}
    }
}
