package dev.lxmusic.legacy;

import org.junit.Test;
import static org.junit.Assert.*;

public final class BundledAssetPathTest {
    @Test public void classicScriptsResolveToExactBundledResources() {
        assertEquals("index.html",BundledAssetPath.resolve("/"));
        assertEquals("index.html",BundledAssetPath.resolve("/index.html"));
        assertEquals("styles.css",BundledAssetPath.resolve("/styles.css"));
        assertEquals("vendor/forge.min.js",BundledAssetPath.resolve("/vendor/forge.min.js"));
        assertEquals("vendor/babel.min.js",BundledAssetPath.resolve("/vendor/babel.min.js"));
        assertEquals("src/app.js",BundledAssetPath.resolve("/src/app.js"));
        assertEquals("src/music-search.js",BundledAssetPath.resolve("/src/music-search.js"));
        assertEquals("src/source-manager.js",BundledAssetPath.resolve("/src/source-manager.js"));
        assertEquals("src/android-native-xhr-fallback.js",BundledAssetPath.resolve("/src/android-native-xhr-fallback.js"));
    }
    @Test public void unknownOrUnsafePathsCannotAccessAssets() {
        assertNull(BundledAssetPath.resolve("/src/../../secret.js"));
        assertNull(BundledAssetPath.resolve("/src/evil.js/../app.js"));
        assertNull(BundledAssetPath.resolve("/functions/api.js"));
        assertNull(BundledAssetPath.resolve("/src/app.jsx"));
        assertNull(BundledAssetPath.resolve("/vendor/another.js"));
        assertNull(BundledAssetPath.resolve("/api/proxy"));
        assertNull(BundledAssetPath.resolve("/src/a+b.js"));
    }
}
