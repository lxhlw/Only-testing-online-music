package dev.lxmusic.legacy;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.util.Base64;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceResponse;
import android.webkit.ValueCallback;
import android.graphics.Color;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import javax.net.ssl.SSLException;
import javax.net.ssl.HttpsURLConnection;

public final class MainActivity extends Activity {
    // No arbitrary URL input: only the trusted Pages origin and two narrowly
    // defined media endpoints can be used by the JavaScript interface.
    private static final String ORIGIN = "https://only-testing-online-music.pages.dev";
    private static final String TONE_URL = ORIGIN + "/api/legacy-audio?type=mp3&v=native1";
    private static final int MAX_AUDIO_BYTES = 30 * 1024 * 1024;
    private final Handler ui = new Handler();
    private final ExecutorService downloads = Executors.newSingleThreadExecutor();
    private final AtomicInteger generation = new AtomicInteger();
    private final AtomicInteger xhrFallbackGeneration = new AtomicInteger(-1);
    private final NativeBridge nativeBridge = new NativeBridge();
    private static final String LOG_TAG = "LXMusicNative";
    private File xhrPart;
    private FileOutputStream xhrOutput;
    private int xhrExpected, xhrReceived, xhrGeneration = -1;
    private TextView status;
    private WebView web;
    private String lastWebScriptError = "";
    private int webScriptErrorCount = 0;
    private ModernPageInterceptor secureWeb;
    private String trustInitProblem;
    private volatile boolean webPageFinished = false;
    private volatile boolean webTopPageError = false;
    private volatile String webPageErrorDetail = "";
    private String bundledXhrScript;
    private static final int MAX_WEB_READY_POLLS = 25;
    private MediaPlayer player;
    private File activeFile;
    private int activeToken = -1;
    private boolean prepared;
    private final Runnable progressTick = new Runnable() {
        @Override public void run() {
            if (player != null && prepared) {
                try {
                    sendEvent(activeToken, "progress", player.getCurrentPosition(),
                            player.getDuration());
                } catch (Exception ignored) {}
            }
            ui.postDelayed(this, 1000);
        }
    };

    @Override @SuppressLint("SetJavaScriptEnabled")
    public void onCreate(Bundle saved) {
        super.onCreate(saved);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setBackgroundColor(Color.rgb(242, 250, 246));
        status = new TextView(this);
        status.setTextSize(13);
        status.setTextColor(Color.rgb(31, 92, 61));
        status.setPadding(12, 10, 12, 10);
        status.setText("Android 4.4 原生播放器 / Phase 1：未测试");
        shell.addView(status, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout actions = new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        actions.addView(button("本地试听", new View.OnClickListener() {
            @Override public void onClick(View v) { playLocalTone(); }
        }), new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(button("联网试听", new View.OnClickListener() {
            @Override public void onClick(View v) { playRemote(TONE_URL, -1); }
        }), new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(button("播放/暂停", new View.OnClickListener() {
            @Override public void onClick(View v) { togglePause(); }
        }), new LinearLayout.LayoutParams(0, -2, 1));
        actions.addView(button("检查按钮", new View.OnClickListener() {
            @Override public void onClick(View v) { inspectWebButtons(true); }
        }), new LinearLayout.LayoutParams(0, -2, 1));
        shell.addView(actions);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // Bundled first-party scripts must not be replaced by WebView's old
        // v0.5 HTTP cache after an APK upgrade. Keep localStorage untouched.
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.clearCache(true);
        settings.setAllowFileAccess(false);
        settings.setSavePassword(false);
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage item) {
                if (item != null && item.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    String msg = item.message() == null ? "" : item.message();
                    webScriptErrorCount++;
                    String script = item.sourceId() == null ? "unknown" : item.sourceId();
                    if (script.length() > 75) script = script.substring(script.length() - 75);
                    lastWebScriptError = script + ":" + item.lineNumber() + " " +
                            msg.substring(0, Math.min(135, msg.length()));
                    Log.e(LOG_TAG, "WebView JS " + lastWebScriptError);
                }
                return super.onConsoleMessage(item);
            }
        });
        try {
            secureWeb = new ModernPageInterceptor(this);
            Log.i(LOG_TAG, "Modern CA roots initialized for strict verified native HTTPS");
        } catch (Exception trustError) {
            trustInitProblem = trustError.getClass().getSimpleName();
            Log.e(LOG_TAG, "Unable to initialize modern CA roots", trustError);
            showStatus("新的证书库初始化失败：" + trustInitProblem);
        }
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
                if (secureWeb != null && ModernPageInterceptor.firstParty(url)) {
                    return secureWeb.intercept(url);
                }
                return null;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                webPageFinished = false;
                webTopPageError = false;
                webPageErrorDetail = "";
            }
            @Override public void onPageFinished(WebView view, String url) {
                webPageFinished = true;
                Log.i(LOG_TAG, "WebView finished; first-party=" + isTrustedPageUrl(url) +
                        ", topPageError=" + webTopPageError);
                ui.postDelayed(new Runnable() {
                    @Override public void run() { inspectWebButtons(false); }
                }, 1200);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.equals(ORIGIN) || url.startsWith(ORIGIN + "/") ||
                    url.startsWith(ORIGIN + "?") || url.startsWith(ORIGIN + "#")) return false;
                showStatus("已阻止跳往外部网页；仅允许加载 LX Music Web");
                return true;
            }
            @Override public void onReceivedSslError(WebView view,
                    SslErrorHandler handler, SslError error) {
                handler.cancel(); // Never disable TLS certificate verification.
                String failing = error == null ? "" : String.valueOf(error.getUrl());
                if (isTopLevelHomeUrl(failing)) {
                    webTopPageError = true;
                    webPageErrorDetail = "WebView SSL "+(error == null ? "unknown" : error.getPrimaryError());
                }
                Log.w(LOG_TAG, "WebView SSL error code=" +
                        (error == null ? -1 : error.getPrimaryError()));
                showStatus("网页 HTTPS 证书校验失败；原生联网试听可能也受系统证书限制");
            }
            @Override public void onReceivedError(WebView view, int errorCode,
                    String description, String failingUrl) {
                if (isTopLevelHomeUrl(failingUrl)) {
                    webTopPageError = true;
                    webPageErrorDetail = "WebView load "+errorCode;
                }
                Log.w(LOG_TAG, "WebView resource error " + errorCode);
                showStatus("网页加载异常（" + errorCode + "），可先测试顶部本地试听");
            }
        });
        web.addJavascriptInterface(nativeBridge, "LXNativeAudio");
        shell.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(shell);
        ui.post(progressTick);
        web.loadUrl(ORIGIN + "/?native-companion=1&apk-webui=6");
    }

    private void inspectWebButtons(final boolean manual) {
        if (web == null || !webPageFinished || !isTrustedPageUrl(web.getUrl())) {
            if (manual) showStatus("网页尚未加载完成，按钮暂时无法检测");
            return;
        }
        // All checks are read-only and ES5; the interface may be visible
        // even if its JavaScript resources or event handlers did not load.
        final String probe = "(function(){var a=document.getElementById('install-btn');" +
                "var b=document.getElementById('global-search-btn');" +
                "return 'app='+typeof window.OnlyTestingMusicApp+" +
                "',source='+typeof window.LXSourceManager+" +
                "',import='+(a?typeof a.onclick:'missing')+" +
                "',search='+(b?typeof b.onclick:'missing')+" +
                "',navigate='+typeof window.OnlyTestingNavigate;})()";
        web.evaluateJavascript(probe, new ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                String summary = String.valueOf(value);
                Log.i(LOG_TAG, "APK UI readiness probe: " + summary);
                boolean ready = summary.contains("app=object") &&
                        summary.contains("source=object") &&
                        summary.contains("import=function") &&
                        summary.contains("search=function") &&
                        summary.contains("navigate=function");
                if (ready) {
                    if (manual) showStatus("网页按钮已绑定，请再尝试搜索/导入音源");
                } else {
                    String cause = lastWebScriptError.length() > 0 ?
                            (" | JS异常：" + lastWebScriptError) : "";
                    showStatus("网页按钮未就绪：" + summary +
                            " | 错误数=" + webScriptErrorCount + cause);
                }
            }
        });
    }

    private Button button(String label, View.OnClickListener onClick) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(12);
        b.setOnClickListener(onClick);
        return b;
    }

    private void showStatus(final String value) {
        ui.post(new Runnable() { @Override public void run() { status.setText(value); }});
    }

    // Receives JavaScript requests only from our WebView. The bridge is
    // exposed to frames on old Android, so methods do not accept file paths,
    // code or unrestricted network URLs.
    public final class NativeBridge {
        @JavascriptInterface public boolean isAvailable() { return true; }
        @JavascriptInterface public void play(final String url, final int token) {
            ui.post(new Runnable() { @Override public void run() {
                playRemote(url, token);
            }});
        }
        // All methods are limited to bounded audio bytes in an explicitly
        // armed playback generation, not arbitrary files, URLs or intents.
        @JavascriptInterface public boolean beginXhr(int g, int length) {
            return MainActivity.this.beginBrowserTransfer(g, length);
        }
        @JavascriptInterface public boolean appendXhr(int g, String chunk) {
            return MainActivity.this.appendBrowserTransfer(g, chunk);
        }
        @JavascriptInterface public boolean finishXhr(int g) {
            return MainActivity.this.finishBrowserTransfer(g);
        }
        @JavascriptInterface public void failXhr(int g, String message) {
            MainActivity.this.failBrowserTransfer(g, message);
        }
        @JavascriptInterface public void pause() {
            ui.post(new Runnable() { @Override public void run() { pauseCurrent(); }});
        }
        @JavascriptInterface public void resume() {
            ui.post(new Runnable() { @Override public void run() { resumeCurrent(); }});
        }
        @JavascriptInterface public void seek(final int milliseconds) {
            ui.post(new Runnable() { @Override public void run() {
                if (player != null && prepared && milliseconds >= 0) {
                    try { player.seekTo(Math.min(milliseconds, player.getDuration())); }
                    catch (Exception ignored) {}
                }
            }});
        }
    }

    private static boolean allowedUrl(String value) {
        if (value == null || value.length() > 4096 || value.indexOf('#') >= 0) return false;
        try {
            URL u = new URL(value);
            String p = u.getPath();
            return "https".equalsIgnoreCase(u.getProtocol()) &&
                "only-testing-online-music.pages.dev".equalsIgnoreCase(u.getHost()) &&
                u.getPort() == -1 &&
                ("/api/proxy".equals(p) || "/api/legacy-audio".equals(p));
        } catch (Exception e) { return false; }
    }

    private void playLocalTone() {
        int g = generation.incrementAndGet();
        releasePlayer();
        discardBrowserTransfer();
        activeToken = -1;
        try {
            File f = new File(getCacheDir(), "android44-local-tone.wav");
            createSineWave(f);
            prepareCached(f, g, -1);
        } catch (Exception e) { showStatus("本地原生测试失败：" + e.getClass().getSimpleName()); }
    }

    private void playRemote(final String url, final int token) {
        final int g = generation.incrementAndGet();
        releasePlayer();
        discardBrowserTransfer();
        activeToken = token;
        if (!allowedUrl(url)) {
            showStatus("原生播放已拒绝非本站 HTTPS 音频地址");
            sendEvent(token, "error", 0, 0);
            return;
        }
        showStatus("原生引擎下载音频中（可能受旧系统 TLS/证书限制）");
        sendEvent(token, "loading", 0, 0);
        downloads.execute(new Runnable() {
            @Override public void run() {
                File part = new File(getCacheDir(), "audio-" + g + ".part");
                File ready = new File(getCacheDir(), "audio-" + g + ".bin");
                HttpsURLConnection connection = null;
                try {
                    connection = (HttpsURLConnection)new URL(url).openConnection();
                    // Android 4.4 supports TLS1.2, but its default client
                    // socket settings may disable it.
                    if (secureWeb == null) {
                        throw new IOException("Modern CA trust store unavailable: " + trustInitProblem);
                    }
                    connection.setSSLSocketFactory(secureWeb.sockets());
                    connection.setConnectTimeout(14000);
                    connection.setReadTimeout(14000);
                    connection.setInstanceFollowRedirects(false);
                    connection.setRequestProperty("Accept", "audio/*,application/octet-stream");
                    int code = connection.getResponseCode();
                    if (code != 200) throw new IOException("HTTP " + code);
                    String type = String.valueOf(connection.getContentType()).toLowerCase();
                    if (!type.startsWith("audio/") && !type.startsWith("application/octet-stream"))
                        throw new IOException("服务器未返回音频");
                    int announced = connection.getContentLength();
                    if (announced > MAX_AUDIO_BYTES) throw new IOException("音频超过30 MB");
                    InputStream input = connection.getInputStream();
                    OutputStream out = new FileOutputStream(part);
                    byte[] buf = new byte[8192];
                    int count, total = 0;
                    try {
                        while ((count = input.read(buf)) != -1) {
                            if (g != generation.get()) throw new IOException("已切换歌曲");
                            total += count;
                            if (total > MAX_AUDIO_BYTES) throw new IOException("音频超过30 MB");
                            out.write(buf, 0, count);
                        }
                    } finally { out.close(); input.close(); }
                    if (total < 1024 || (announced >= 0 && total != announced))
                        throw new IOException("音频不完整");
                    if (!part.renameTo(ready)) throw new IOException("保存音频缓存失败");
                    final File downloaded = ready;
                    ui.post(new Runnable() { @Override public void run() {
                        if (g == generation.get()) prepareCached(downloaded, g, token);
                        else downloaded.delete();
                    }});
                } catch (final SSLException ssl) {
                    part.delete();
                    ready.delete();
                    Log.w(LOG_TAG, "Native HTTPS handshake failed: " + ssl.getClass().getSimpleName(), ssl);
                    if (g == generation.get()) ui.post(new Runnable() {
                        @Override public void run() {
                            startBrowserFallback(g, token, url, ssl);
                        }
                    });
                } catch (final Exception e) {
                    part.delete();
                    ready.delete();
                    Log.w(LOG_TAG, "Native audio download failed", e);
                    if (g == generation.get()) ui.post(new Runnable() {
                        @Override public void run() {
                            showStatus("原生联网播放失败：" + e.getClass().getSimpleName() +
                                "（HTTPS / 音源可能不兼容）");
                            sendEvent(token, "error", 0, 0);
                        }
                    });
                } finally { if (connection != null) connection.disconnect(); }
            }
        });
    }


    private static boolean isTrustedPageUrl(String url) {
        if (url == null) return false;
        try {
            android.net.Uri uri = android.net.Uri.parse(url);
            return "https".equalsIgnoreCase(uri.getScheme()) &&
                    "only-testing-online-music.pages.dev".equalsIgnoreCase(uri.getHost()) &&
                    uri.getPort() == -1 && uri.getUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }

    private static boolean isTopLevelHomeUrl(String url) {
        if (!isTrustedPageUrl(url)) return false;
        try {
            String path = android.net.Uri.parse(url).getPath();
            return path == null || path.length() == 0 || "/".equals(path);
        } catch(Exception ignored) { return false; }
    }

    // The script is compiled into this APK; never fetch executable JS from an
    // extra HTTPS resource when the whole reason for fallback is old-device TLS.
    private synchronized String getBundledXhrScript() throws IOException {
        if (bundledXhrScript != null) return bundledXhrScript;
        InputStream in = getAssets().open("android-native-xhr-fallback.js");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try {
            byte[] b = new byte[2048];
            int n;
            while ((n = in.read(b)) != -1) {
                if (out.size() + n > 16000) throw new IOException("asset too large");
                out.write(b, 0, n);
            }
        } finally { in.close(); }
        bundledXhrScript = new String(out.toByteArray(), "UTF-8");
        return bundledXhrScript;
    }

    private void startBrowserFallback(int g, int token, String url, SSLException cause) {
        if (g != generation.get() || web == null) return;
        xhrFallbackGeneration.set(g);
        Log.w(LOG_TAG, "Using bundled XHR fallback after " + cause.getClass().getSimpleName());
        waitForTrustedWebPage(g, token, url, 0);
    }

    private void waitForTrustedWebPage(final int g, final int token,
                                       final String url, final int attempts) {
        if (g != generation.get() || xhrFallbackGeneration.get() != g || web == null) return;
        if (!webPageFinished) {
            if (attempts < MAX_WEB_READY_POLLS) {
                showStatus("原生 TLS 失败：等待 LX 网页加载，以便启用安全 XHR…");
                ui.postDelayed(new Runnable() { @Override public void run() {
                    waitForTrustedWebPage(g, token, url, attempts + 1);
                }}, 500);
            } else {
                failBrowserTransfer(g, "WebView 页面加载超时，无法启动网页备用通道");
            }
            return;
        }
        if (!isTrustedPageUrl(web.getUrl()) || webTopPageError) {
            failBrowserTransfer(g, webTopPageError ?
                    ("网页 HTTPS 未就绪：" + webPageErrorDetail) :
                    "WebView 未处于 LX Music 的可信 HTTPS 页面");
            return;
        }
        try {
            // Use the APK's own audited ES5 script even if the website's
            // <script src> was cached, omitted, or blocked on old Chromium.
            final String source = getBundledXhrScript();
            final String cmd = "(function(){try{" + source +
                    "\nif(!window.LXNativeXhrFallback||" +
                    "typeof window.LXNativeXhrFallback.fetchBytes!=='function')" +
                    "return 'BOOTSTRAP_MISSING';" +
                    "window.LXNativeXhrFallback.fetchBytes(" + g + "," + JSONObject.quote(url) + ");" +
                    "return 'XHR_STARTED';" +
                    "}catch(e){return 'BOOTSTRAP_ERROR:'+String(e.message||e).slice(0,90);}})()";
            showStatus("已从 APK 内加载备用脚本，正在尝试 WebView 安全 XHR…");
            web.evaluateJavascript(cmd, new ValueCallback<String>() {
                @Override public void onReceiveValue(String value) {
                    if (g != generation.get() || xhrFallbackGeneration.get() != g) return;
                    String response = String.valueOf(value);
                    if (response.indexOf("XHR_STARTED") >= 0) return;
                    Log.w(LOG_TAG, "Bundled XHR bootstrap result " + response);
                    failBrowserTransfer(g, "备用脚本启动异常：" + response);
                }
            });
        } catch (IOException e) {
            Log.e(LOG_TAG, "Cannot load bundled XHR asset", e);
            failBrowserTransfer(g, "APK 中的备用脚本丢失："+e.getClass().getSimpleName());
        }
    }

    private synchronized void discardBrowserTransfer() {
        try { if (xhrOutput != null) xhrOutput.close(); } catch (IOException ignored) {}
        xhrOutput = null;
        if (xhrPart != null) xhrPart.delete();
        xhrPart = null;
        xhrGeneration = -1;
        xhrExpected = xhrReceived = 0;
        xhrFallbackGeneration.set(-1);
    }

    private synchronized boolean beginBrowserTransfer(int g, int length) {
        if (g != generation.get() || xhrFallbackGeneration.get() != g ||
                length < 1024 || length > MAX_AUDIO_BYTES) return false;
        if (xhrOutput != null) return false;
        try {
            xhrPart = File.createTempFile("lx-xhr-", ".part", getCacheDir());
            xhrOutput = new FileOutputStream(xhrPart);
            xhrExpected = length;
            xhrReceived = 0;
            xhrGeneration = g;
            return true;
        } catch (IOException e) {
            discardBrowserTransfer();
            return false;
        }
    }

    private synchronized boolean appendBrowserTransfer(int g, String encoded) {
        if (g != generation.get() || g != xhrGeneration ||
                xhrOutput == null || encoded == null || encoded.length() > 6000) return false;
        try {
            byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
            if (bytes.length < 1 || bytes.length > 4096 ||
                    xhrReceived + bytes.length > xhrExpected) return false;
            xhrOutput.write(bytes);
            xhrReceived += bytes.length;
            return true;
        } catch (Exception e) { return false; }
    }

    private static boolean looksLikeAudio(File file) {
        try {
            FileInputStream in = new FileInputStream(file);
            byte[] b = new byte[12];
            try { if (in.read(b) != 12) return false; }
            finally { in.close(); }
            boolean mp3 = (b[0] == 'I' && b[1] == 'D' && b[2] == '3') ||
                          ((b[0] & 255) == 255 && (b[1] & 224) == 224);
            boolean wav = b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F' &&
                          b[8] == 'W' && b[9] == 'A' && b[10] == 'V' && b[11] == 'E';
            boolean ogg = b[0] == 'O' && b[1] == 'g' && b[2] == 'g' && b[3] == 'S';
            boolean flac = b[0] == 'f' && b[1] == 'L' && b[2] == 'a' && b[3] == 'C';
            return mp3 || wav || ogg || flac;
        } catch (IOException ignored) { return false; }
    }

    private synchronized boolean finishBrowserTransfer(final int g) {
        if (g != generation.get() || g != xhrGeneration ||
                xhrOutput == null || xhrReceived != xhrExpected) return false;
        try {
            xhrOutput.close();
            xhrOutput = null;
            if (!looksLikeAudio(xhrPart)) {
                discardBrowserTransfer();
                return false;
            }
            final File complete = new File(getCacheDir(), "audio-" + g + "-xhr.bin");
            if (complete.exists())complete.delete();
            if (!xhrPart.renameTo(complete)) {
                discardBrowserTransfer();
                return false;
            }
            xhrPart = null;
            xhrGeneration = -1;
            xhrFallbackGeneration.set(-1);
            ui.post(new Runnable() {
                @Override public void run() {
                    if (g == generation.get()) {
                        showStatus("安全 XHR 已取得完整音频，由 Android 原生解码");
                        prepareCached(complete, g, activeToken);
                    } else complete.delete();
                }
            });
            return true;
        } catch (IOException e) {
            discardBrowserTransfer();
            return false;
        }
    }

    private void failBrowserTransfer(final int g, final String reason) {
        if (g != generation.get() || g != xhrFallbackGeneration.get()) return;
        discardBrowserTransfer();
        ui.post(new Runnable() {
            @Override public void run() {
                if (g != generation.get()) return;
                String detail = reason == null ? "" : reason.replaceAll("[\\r\\n]", " ");
                showStatus("安全 XHR 备用通道失败：" + detail.substring(0, Math.min(95, detail.length())));
                sendEvent(activeToken, "error", 0, 0);
            }
        });
    }

    private void prepareCached(final File file, final int gen, final int token) {
        if (gen != generation.get()) return;
        releasePlayer();
        activeFile = file;
        activeToken = token;
        prepared = false;
        try {
            player = new MediaPlayer();
            player.setAudioStreamType(AudioManager.STREAM_MUSIC);
            player.setOnPreparedListener(new MediaPlayer.OnPreparedListener() {
                @Override public void onPrepared(MediaPlayer mp) {
                    if (gen != generation.get()) return;
                    prepared = true;
                    try {
                        mp.start();
                        showStatus(token < 0 ? "原生测试音播放中，请听是否有声音" : "原生播放器：已开始播放");
                        sendEvent(token, "playing", mp.getCurrentPosition(), mp.getDuration());
                    } catch (Exception e) { showStatus("原生播放启动失败"); sendEvent(token, "error", 0, 0); }
                }
            });
            player.setOnErrorListener(new MediaPlayer.OnErrorListener() {
                @Override public boolean onError(MediaPlayer mp, int what, int extra) {
                    if (gen == generation.get()) {
                        prepared = false;
                        showStatus("原生 MediaPlayer 错误 " + what + " / " + extra);
                        sendEvent(token, "error", what, extra);
                    }
                    return true;
                }
            });
            player.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                @Override public void onCompletion(MediaPlayer mp) {
                    if (gen == generation.get()) {
                        showStatus(token < 0 ? "本地/联网测试音已结束，确认是否听见声音" : "当前歌曲播放结束");
                        sendEvent(token, "completed", mp.getDuration(), mp.getDuration());
                    }
                }
            });
            FileInputStream in = new FileInputStream(file);
            try { player.setDataSource(in.getFD()); }
            finally { in.close(); }
            player.prepareAsync();
            showStatus("已取得音频文件，正在等待原生 MediaPlayer 解码");
        } catch (Exception e) {
            showStatus("原生媒体解码失败：" + e.getClass().getSimpleName());
            sendEvent(token, "error", 0, 0);
            releasePlayer();
        }
    }

    private void pauseCurrent() {
        if (player != null && prepared) {
            try {
                player.pause();
                showStatus("原生播放器：已暂停");
                sendEvent(activeToken, "paused", player.getCurrentPosition(), player.getDuration());
            } catch (Exception ignored) {}
        }
    }
    private void resumeCurrent() {
        if (player != null && prepared) {
            try {
                player.start();
                showStatus("原生播放器：正在播放");
                sendEvent(activeToken, "playing", player.getCurrentPosition(), player.getDuration());
            } catch (Exception ignored) {}
        }
    }
    private void togglePause() {
        if (player == null || !prepared) {
            showStatus("请先试听本地音频或在网页选择歌曲"); return;
        }
        try {
            if (player.isPlaying()) pauseCurrent(); else resumeCurrent();
        } catch (Exception ignored) {}
    }

    private void sendEvent(int token, String event, int position, int duration) {
        if (token < 0 || web == null) return;
        final String js = "javascript:if(window.LXNativeAudioEvent)window.LXNativeAudioEvent(" +
            token + "," + JSONObject.quote(event) + "," + position + "," + duration + ");";
        ui.post(new Runnable() { @Override public void run() {
            if (web != null) web.loadUrl(js);
        }});
    }

    private void releasePlayer() {
        prepared = false;
        if (player != null) {
            try { player.reset(); player.release(); } catch (Exception ignored) {}
            player = null;
        }
        if (activeFile != null && !"android44-local-tone.wav".equals(activeFile.getName()))
            activeFile.delete();
        activeFile = null;
    }

    private static void write16(OutputStream out, int x) throws IOException {
        out.write(x & 255); out.write((x >> 8) & 255);
    }
    private static void write32(OutputStream out, int x) throws IOException {
        write16(out, x & 65535); write16(out, (x >> 16) & 65535);
    }
    private static void createSineWave(File file) throws IOException {
        final int rate = 22050, frames = 44100;
        OutputStream out = new FileOutputStream(file);
        try {
            out.write(new byte[]{'R','I','F','F'});
            write32(out, 36 + frames * 2);
            out.write(new byte[]{'W','A','V','E','f','m','t',' '});
            write32(out, 16); write16(out, 1); write16(out, 1);
            write32(out, rate); write32(out, rate * 2);
            write16(out, 2); write16(out, 16);
            out.write(new byte[]{'d','a','t','a'});
            write32(out, frames * 2);
            for (int i = 0; i < frames; i++) {
                double ramp = Math.min(1.0, Math.min(i / 900.0, (frames - i - 1) / 900.0));
                short sample = (short)(Math.sin(2 * Math.PI * 523.25 * i / rate) * 7000 * Math.max(0,ramp));
                write16(out, sample);
            }
        } finally { out.close(); }
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        generation.incrementAndGet();
        ui.removeCallbacks(progressTick);
        releasePlayer();
        discardBrowserTransfer();
        downloads.shutdownNow();
        if (web != null) {
            web.removeJavascriptInterface("LXNativeAudio");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
