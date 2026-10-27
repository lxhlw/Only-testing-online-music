package dev.lxmusic.legacy;

import org.junit.Test;
import static org.junit.Assert.*;

public final class AudioRoutePreferenceTest {
    @Test public void firstAttemptAlwaysRetainsVerifiedNativeRoute() {
        AudioRoutePreference hint = new AudioRoutePreference(false);
        assertFalse(hint.browserFirst(true, true));
    }

    @Test public void onlyPreviouslyVerifiedAndTrustedSongsUseFastPath() {
        AudioRoutePreference hint = new AudioRoutePreference(false);
        hint.succeededThroughBrowser();
        assertTrue(hint.browserFirst(true, true));
        assertFalse(hint.browserFirst(false, true)); // Native test tone remains unchanged
        assertFalse(hint.browserFirst(true, false)); // Untrusted or incomplete page blocked
        assertTrue(hint.shouldPersistBrowserFirst());
    }

    @Test public void failedBrowserFastPathImmediatelyReenablesNative() {
        AudioRoutePreference hint = new AudioRoutePreference(true);
        assertTrue(hint.browserFirst(true, true));
        hint.browserFailed();
        assertFalse(hint.browserFirst(true, true));
        assertFalse(hint.shouldPersistBrowserFirst());
        hint.succeededThroughBrowser();
        assertTrue(hint.browserFirst(true, true));
    }
}
