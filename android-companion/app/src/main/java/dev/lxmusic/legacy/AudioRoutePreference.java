package dev.lxmusic.legacy;

/**
 * Per-device preference for the previously verified secure browser-XHR audio
 * route. Never treats success as proof that HTTPS may be skipped: all media
 * still travels through the restricted same-origin /api/proxy endpoint.
 * If the browser route later fails, the caller retries the existing strictly
 * verified native connection and clears this hint.
 */
public final class AudioRoutePreference {
    private boolean previouslyVerifiedBrowserAudio;

    public AudioRoutePreference(boolean remembered) {
        previouslyVerifiedBrowserAudio = remembered;
    }

    public synchronized boolean browserFirst(boolean userSong, boolean trustedPageReady) {
        return previouslyVerifiedBrowserAudio && userSong && trustedPageReady;
    }

    public synchronized void succeededThroughBrowser() {
        previouslyVerifiedBrowserAudio = true;
    }

    public synchronized void browserFailed() {
        previouslyVerifiedBrowserAudio = false;
    }

    public synchronized boolean shouldPersistBrowserFirst() {
        return previouslyVerifiedBrowserAudio;
    }
}
