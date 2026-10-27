package dev.lxmusic.legacy;
import org.junit.Test;
import static org.junit.Assert.*;
import java.net.URLEncoder;

public class LegacyResolverProxyTest {
    private String p(String target) throws Exception {
        return "/api/proxy?url=" + URLEncoder.encode(target, "UTF-8");
    }
    @Test public void expectedPlaybackHostsAllowed() throws Exception {
        assertTrue(LegacyResolverProxy.allowed(p("https://lxmusicapi.onrender.com/url/wy/123/128k"),"GET","","{}"));
        assertTrue(LegacyResolverProxy.allowed(p("https://music-dl.sayqz.com/api/?source=netease&id=3"),"GET","","{}"));
        assertTrue(LegacyResolverProxy.allowed(p("https://music-api.gdstudio.xyz/api.php"),"POST","types=url&id=3","{}"));
        assertTrue(LegacyResolverProxy.allowed(p("https://music.gdstudio.xyz/time"),"GET","","{}"));
    }
    @Test public void hostileAndUnrelatedTargetsRejected() throws Exception {
        assertFalse(LegacyResolverProxy.allowed(p("http://music-api.gdstudio.xyz/api.php"),"GET","","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://music-api.gdstudio.xyz.evil.com/"),"GET","","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://127.0.0.1/"),"GET","","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://music.163.com/api/search"),"GET","","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://u:p@music-api.gdstudio.xyz/"),"GET","","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://music-api.gdstudio.xyz:8443/"),"GET","","{}"));
        assertFalse(LegacyResolverProxy.allowed("/api/proxy?url=bad&extra=true","GET","","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://music-api.gdstudio.xyz/"),"DELETE","","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://music-api.gdstudio.xyz/"),"GET","somebody","{}"));
        assertFalse(LegacyResolverProxy.allowed(p("https://music-api.gdstudio.xyz/"),"POST",new String(new char[9000]),"{}"));
    }
}