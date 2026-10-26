package com.lxmusic.legacy;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.net.http.SslError;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Android 4.4 (API 19) companion shell. The website's XHR obtains audio bytes,
 * but MediaPlayer decodes from a bounded private cache file rather than the
 * broken WebView HTMLMediaElement. No file picker, native HTTP proxy, Java
 * reflection or arbitrary command execution is exposed to JavaScript.
 *
 * Security boundary: only the first-party HTTPS site may be the top-level
 * WebView document. The bridge remains callable by any script running on that
 * document (including third-party source scripts): keep its methods narrowly
 * limited to audio input and playback controls.
 */
public final class MainActivity extends Activity {
    private static final String HOME = "https://only-testing-online-music.pages.dev/";
    private static final String HOST = "only-testing-online-music.pages.dev";
    private static final int MAX_AUDIO = 24 * 1024 * 1024;
    private static final int MAX_CHUNK = 8192;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final AudioBridge bridge = new AudioBridge();
    private WebView web;
    private TextView status;
    private Button playButton;
    private SeekBar seek;
    private MediaPlayer player;
    private String playingId = "";
    private File playingFile;
    private boolean scrubbing;

    private static boolean trusted(String value) {
        try {
            android.net.Uri uri = android.net.Uri.parse(value);
            return "https".equalsIgnoreCase(uri.getScheme())
                && HOST.equalsIgnoreCase(uri.getHost())
                && uri.getUserInfo() == null && uri.getPort() == -1;
        } catch (Exception e) { return false; }
    }
    private void report(String message) {
        status.setText(message);
    }
    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setBuiltInZoomControls(false);
        settings.setSavePassword(false);
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                if (!trusted(url)) {
                    report("已拦截非本站页面跳转（原生播放接口只允许本站）");
                    return true;
                }
                return false;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                if (!trusted(url)) {
                    view.stopLoading();
                    report("已阻止非本站页面载入");
                }
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler h, SslError error) {
                // Never bypass invalid TLS certificates on a legacy tablet.
                h.cancel();
                report("HTTPS 证书校验失败。不会跳过安全验证。");
            }
        });
        // API 19 only; annotated methods are exposed, not reflection members.
        web.addJavascriptInterface(bridge, "LXNativeBridge");
        layout.addView(web, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        LinearLayout controls = new LinearLayout(this);
        controls.setPadding(dp(9), dp(5), dp(9), dp(7));
        controls.setOrientation(LinearLayout.VERTICAL);
        status = new TextView(this);
        status.setText("原生播放器就绪 · 请在网页中选择歌曲");
        status.setTextSize(13);
        controls.addView(status);
        LinearLayout buttons = new LinearLayout(this);
        buttons.setGravity(Gravity.CENTER_VERTICAL);
        playButton = new Button(this);
        playButton.setText("暂停/继续");
        playButton.setOnClickListener(v -> toggle());
        buttons.addView(playButton, new LinearLayout.LayoutParams(dp(105), dp(47)));
        seek = new SeekBar(this);
        seek.setMax(1000);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar bar,int progress,boolean fromUser) {}
            @Override public void onStartTrackingTouch(SeekBar bar) { scrubbing=true; }
            @Override public void onStopTrackingTouch(SeekBar bar) {
                scrubbing=false;
                if(player!=null) {
                    try { player.seekTo((int)((long)player.getDuration()*bar.getProgress()/1000)); }
                    catch (Exception ignored) {}
                }
            }
        });
        buttons.addView(seek, new LinearLayout.LayoutParams(0, dp(40), 1));
        controls.addView(buttons);
        layout.addView(controls, new LinearLayout.LayoutParams(-1,dp(94)));
        setContentView(layout);
        web.loadUrl(HOME);
        handler.postDelayed(new Runnable() {
            @Override public void run() {
                if (player!=null) {
                    try {
                        int total=player.getDuration();
                        int current=player.getCurrentPosition();
                        if (!scrubbing && total>0)seek.setProgress((int)((long)current*1000/total));
                        if (player.isPlaying()) push(playingId,"progress",current,total);
                    } catch(Exception ignored){}
                }
                handler.postDelayed(this,650);
            }
        },650);
    }
    private void push(String id,String event,int millis,int duration) {
        if(web==null || !trusted(web.getUrl() == null ? "" : web.getUrl()))return;
        String command="window.LXNativeAudioTransport&&window.LXNativeAudioTransport.notify("+
            JSONObject.quote(id)+","+JSONObject.quote(event)+","+millis+","+duration+");";
        web.evaluateJavascript(command,null); // API 19
    }
    private void clearPlayer() {
        if(player!=null) {
            try { player.reset();player.release(); } catch(Exception ignored){}
            player=null;
        }
        if(playingFile!=null){playingFile.delete();playingFile=null;}
        seek.setProgress(0);
    }
    private void loadAudio(final String id,final File file) {
        if(!id.equals(bridge.activeId)) {file.delete();return;}
        clearPlayer();
        playingId=id;
        playingFile=file;
        MediaPlayer next=new MediaPlayer();
        player=next;
        try {
            next.setAudioStreamType(AudioManager.STREAM_MUSIC);
            FileInputStream stream=new FileInputStream(file);
            try {next.setDataSource(stream.getFD());}
            finally{stream.close();}
            next.setOnPreparedListener(mp-> {
                if(player!=mp)return;
                try {
                    mp.start();
                    report("Android 原生播放器正在播放");
                    push(id,"prepared",0,mp.getDuration());
                } catch(Exception err) {report("原生播放器无法启动："+err.getClass().getSimpleName());push(id,"error",0,0);}
            });
            next.setOnCompletionListener(mp-> {
                if(player==mp){report("播放完成");push(id,"ended",mp.getDuration(),mp.getDuration());}
            });
            next.setOnErrorListener((mp,what,extra)-> {
                report("Android MediaPlayer 错误："+what+" / "+extra);
                push(id,"error",0,0);
                return true;
            });
            next.prepareAsync();
            report("原生播放器正在解析本地音频");
        } catch(Exception e) {
            report("原生音频载入失败："+e.getClass().getSimpleName());
            push(id,"error",0,0);
            clearPlayer();
        }
    }
    private void toggle() {
        if(player==null){report("请先在网页中选择歌曲");return;}
        try {
            if(player.isPlaying()){player.pause();report("已暂停");push(playingId,"paused",player.getCurrentPosition(),player.getDuration());}
            else {player.start();report("正在播放");push(playingId,"progress",player.getCurrentPosition(),player.getDuration());}
        }catch(Exception e){report("操作失败："+e.getClass().getSimpleName());}
    }

    /** The only methods visible to first-party website JavaScript. */
    private final class AudioBridge {
        private String activeId="";
        private int expected=0;
        private int received=0;
        private File pending;
        private FileOutputStream output;
        private void cleanPending() {
            try {if(output!=null)output.close();}catch(IOException ignored){}
            output=null;
            if(pending!=null)pending.delete();
            pending=null;
        }
        private boolean goodId(String id) {return id!=null && id.matches("^[0-9]{1,12}$");}
        @JavascriptInterface public synchronized boolean begin(String id,int length) {
            if(!goodId(id)||length<1024||length>MAX_AUDIO)return false;
            cleanPending();
            activeId=id;
            expected=length;
            received=0;
            try {
                pending=File.createTempFile("lx-audio-", ".bin",getCacheDir());
                output=new FileOutputStream(pending);
            }catch(IOException e){cleanPending();return false;}
            handler.post(()->{clearPlayer();report("接收音频字节中（无需 HTML5 Audio）");});
            return true;
        }
        @JavascriptInterface public synchronized boolean append(String id,String base64) {
            if(!activeId.equals(id)||output==null||base64==null||base64.length()>12000)return false;
            try {
                byte[] decoded=Base64.decode(base64,Base64.DEFAULT);
                if(decoded.length<1||decoded.length>MAX_CHUNK||received+decoded.length>expected) {
                    cleanPending();return false;
                }
                output.write(decoded);
                received+=decoded.length;
                return true;
            }catch(Exception e){cleanPending();return false;}
        }
        @JavascriptInterface public synchronized boolean finish(String id) {
            if(!activeId.equals(id)||output==null||received!=expected)return false;
            File completed=pending;
            try {
                output.close();
                output=null;
                pending=null;
                if(!AudioSignature.valid(completed)) {completed.delete();return false;}
                handler.post(()->loadAudio(id,completed));
                return true;
            }catch(IOException e){cleanPending();return false;}
        }
        @JavascriptInterface public synchronized void stop() {
            activeId="";
            cleanPending();
            handler.post(()->{clearPlayer();report("已停止原生播放");});
        }
    }
    @Override public void onBackPressed() {
        if (web.canGoBack())web.goBack();
        else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        bridge.stop();
        clearPlayer();
        if(web!=null){web.removeJavascriptInterface("LXNativeBridge");web.destroy();web=null;}
        super.onDestroy();
    }
}
