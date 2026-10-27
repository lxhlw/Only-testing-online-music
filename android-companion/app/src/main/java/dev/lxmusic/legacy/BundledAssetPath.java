package dev.lxmusic.legacy;

/** Pure Java path routing; unit-tested without Android runtime. */
public final class BundledAssetPath {
    private BundledAssetPath() {}

    public static String resolve(String path) {
        if (path == null || path.length() == 0 || "/".equals(path) ||
                "/index.html".equals(path)) return "index.html";
        if ("/styles.css".equals(path)) return "styles.css";
        if ("/vendor/forge.min.js".equals(path)) return "vendor/forge.min.js";
        if ("/vendor/babel.min.js".equals(path)) return "vendor/babel.min.js";
        if ("/vendor/core-js.min.js".equals(path)) return "vendor/core-js.min.js";
        // Avoid fragile escaped regex dots; [.] means a literal period.
        if (path.matches("^/src/[A-Za-z0-9._-]+[.]js$") &&
                path.indexOf("..") < 0) {
            return path.substring(1);
        }
        return null;
    }
}
