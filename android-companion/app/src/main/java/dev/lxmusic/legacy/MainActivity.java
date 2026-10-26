package dev.lxmusic.legacy;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
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
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
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
    private TextView status;
    private WebView web;
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
        shell.addView(actions);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setSavePassword(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (url.equals(ORIGIN) || url.startsWith(ORIGIN + "/") ||
                    url.startsWith(ORIGIN + "?") || url.startsWith(ORIGIN + "#")) return false;
                showStatus("已阻止跳往外部网页；仅允许加载 LX Music Web");
                return true;
            }
            @Override public void onReceivedSslError(WebView view,
                    SslErrorHandler handler, SslError error) {
                handler.cancel(); // Never disable TLS certificate verification.
                showStatus("HTTPS 证书校验失败；原生联网试听可能也受系统证书限制");
            }
            @Override public void onReceivedError(WebView view, int errorCode,
                    String description, String failingUrl) {
                showStatus("网页加载异常（" + errorCode + "），可先测试顶部本地试听");
            }
        });
        web.addJavascriptInterface(new NativeBridge(), "LXNativeAudio");
        shell.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(shell);
        ui.post(progressTick);
        web.loadUrl(ORIGIN + "/?native-companion=1");
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
                ("/api/proxy".equals(p) || "/api/legacy-audio".equals(p));
        } catch (Exception e) { return false; }
    }

    private void playLocalTone() {
        int g = generation.incrementAndGet();
        releasePlayer();
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
                    connection.setSSLSocketFactory(new Tls12Factory());
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
                } catch (final Exception e) {
                    part.delete();
                    ready.delete();
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
        downloads.shutdownNow();
        if (web != null) {
            web.removeJavascriptInterface("LXNativeAudio");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
