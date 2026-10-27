package dev.lxmusic.legacy;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLSocketFactory;

/**
 * Secure, first-party HTTPS WebView resource loader for API19's obsolete CA
 * store. API19's shouldInterceptRequest has no request method or headers:
 * this interceptor handles public GET resources only; POST is not intercepted.
 *
 * Each response is still fetched with CA-chain and hostname validation.
 * No TLS bypass, localhost HTTP proxy, redirect or arbitrary URL forwarding.
 */
public final class ModernPageInterceptor {
    private static final String TAG = "LXMusicNative";
    private static final String HOST = "only-testing-online-music.pages.dev";
    private final SSLSocketFactory sockets;
    private final AssetManager appAssets;

    public ModernPageInterceptor(Context context) throws Exception {
        sockets = ModernTrust.create(context.getApplicationContext());
        appAssets = context.getApplicationContext().getAssets();
    }

    public SSLSocketFactory sockets() { return sockets; }

    public static boolean firstParty(String input) {
        if (input == null) return false;
        try {
            URL u = new URL(input);
            return "https".equalsIgnoreCase(u.getProtocol()) &&
                    HOST.equalsIgnoreCase(u.getHost()) && u.getPort() == -1 &&
                    u.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }

    private static int resourceLimit(String url) {
        if (url.contains("/api/proxy?") || url.contains("/api/legacy-audio?")) {
            return 30 * 1024 * 1024;
        }
        return 5 * 1024 * 1024;
    }

    private static String mime(String header, String url) {
        if (header != null && header.trim().length() > 0) {
            return header.split(";",2)[0].trim().toLowerCase(java.util.Locale.US);
        }
        String path = url.toLowerCase(java.util.Locale.US);
        if (path.endsWith(".js"))return "application/javascript";
        if (path.endsWith(".css"))return "text/css";
        if (path.endsWith(".png"))return "image/png";
        if (path.endsWith(".jpg") || path.endsWith(".jpeg"))return "image/jpeg";
        if (path.endsWith(".svg"))return "image/svg+xml";
        return "text/html";
    }

    /**
     * Use a pinned, audited copy of the website UI shipped with the installed
     * APK. The HTTPS origin remains first-party, but startup no longer depends
     * on Android KitKat fetching 16+ scripts reliably via its obsolete SSL
     * engine. API endpoints and downloaded music are NEVER served from assets.
     */
    private WebResourceResponse bundledUi(String target) {
        try {
            URL u = new URL(target);
            String path = u.getPath();
            if (path == null || path.length() == 0 || "/".equals(path)) path = "/index.html";
            String relative;
            if ("/index.html".equals(path)) relative = "index.html";
            else if ("/styles.css".equals(path)) relative = "styles.css";
            else if ("/vendor/forge.min.js".equals(path)) relative = "vendor/forge.min.js";
            else if (path.matches("^/src/[A-Za-z0-9._-]+\\\\.js$") &&
                    !path.contains("..")) relative = path.substring(1);
            else return null;
            InputStream resource = appAssets.open("web/" + relative);
            String type = relative.endsWith(".css") ? "text/css" :
                    relative.endsWith(".js") ? "application/javascript" : "text/html";
            Log.i(TAG, "APK UI asset " + relative);
            return new WebResourceResponse(type, "UTF-8", resource);
        } catch (java.io.IOException missing) {
            Log.w(TAG, "APK UI asset missing; verified HTTPS fallback", missing);
            return null;
        }
    }

    public WebResourceResponse intercept(String url) {
        if (!firstParty(url)) return null;
        WebResourceResponse local = bundledUi(url);
        if (local != null) return local;
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL(url).openConnection();
            connection.setSSLSocketFactory(sockets);
            // Keep the platform's strict default verifier, never override.
            connection.setConnectTimeout(14000);
            connection.setReadTimeout(14000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestMethod("GET");
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                Log.w(TAG, "Verified WebView GET HTTP " + status);
                return null;
            }
            int limit = resourceLimit(url);
            if (connection.getContentLength() > limit) return null;
            InputStream in = connection.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try {
                byte[] buffer = new byte[8192];
                int n;
                while ((n=in.read(buffer))!=-1) {
                    if (out.size()+n>limit)throw new java.io.IOException("resource size limit");
                    out.write(buffer,0,n);
                }
            } finally { in.close(); }
            byte[] data=out.toByteArray();
            String type=mime(connection.getContentType(),url);
            String encoding = type.startsWith("text/") ||
                    type.contains("javascript") || type.contains("json") ||
                    type.contains("xml") ? "UTF-8" : null;
            return new WebResourceResponse(type, encoding, new ByteArrayInputStream(data));
        } catch (Exception e) {
            Log.w(TAG,"Verified WebView GET failed ("+e.getClass().getSimpleName()+")",e);
            return null; // WebView's own TLS checks remain active on fallback.
        } finally {
            if (connection!=null)connection.disconnect();
        }
    }
}
