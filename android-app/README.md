# LX Music Web — Android 4.4 native audio companion (beta)

This is a separate, optional APK **for Android 4.4.2 / API 19**. It is not a
patch to Via and it does not install a browser extension. Desktop / modern
mobile web stays unchanged.

## Physical evidence leading to this implementation

On the L101 / Android 4.4.2 tablet, Via (Chromium 30) reads the complete MP3
(48,901 bytes) and WAV (176,444 bytes) via XHR, but HTML5 Audio reports
NOT_SUPPORTED (4) with both Blob / forced Data URI / offline WAV. Android's
*own music player successfully plays locally stored music*. An intent:
handoff in Via also failed to open any native player.

## Native pipeline

1. The APK embeds a restricted WebView at `https://only-testing-online-music.pages.dev/`.
   Its pages still provide music search, source selection, queue, and playlists.
2. When a track's music URL resolves, `src/android-native-media.js` uses the
   existing working browser XHR transfer path. Music URLs are first routed
   through the project's same-origin audio proxy where applicable.
3. The page sends <=8192-byte base64 chunks to `LXNativeBridge`, with max
   24 MiB, exact byte count checks and an audio signature check. Android
   writes the stream to its **private temporary cache** (never external storage).
4. `android.media.MediaPlayer` opens that local file and decodes it; the
   **APK's own bottom transport controls** play/pause and seek. JavaScript
   receives explicit native progress and completion notifications.
5. Old Via and ordinary browsers have no bridge object and continue using
   their current browser playback code.

For very large songs (>24 MiB), unusual file signatures, inaccessible media
links or DRM, this beta will reject the stream rather than hang or claim audio
is playing. Lyrics synchronization, Android background playback, playlist
next/previous hardware media controls and FLAC support are not yet accepted
as completed features.

## Install test build

After the Android CI workflow passes, open the workflow run's artifacts and
download **LXMusic-Android4.4-Native-Companion-Debug** on your PC. Extract its
`app-debug.apk` and copy it to the tablet using USB. Tap the APK on the tablet
to install (Android 4.4 may require enabling "Unknown sources" temporarily in
device security settings; turn this back off after installation). Launch
**LX Music Legacy** and search/play a song in the embedded webpage. The
APK's bottom controls are the native player; the webpage's old audio control
is intentionally disabled in the companion.

This is a **debug/test APK**, not a signed production distribution. The
first real Android 4.4.2 hardware check still needs to establish that its
WebView works, it can read the stream, and MediaPlayer can decode and emit
audio. A green GitHub Actions check cannot prove the tablet actually sounds.

## Security constraints

- JavaScript interfaces are deliberately restricted to bounded audio bytes,
  `stop`, and are exposed only in a WebView whose *top-level* navigation is
  pinned to the project's HTTPS origin; the WebView rejects TLS errors.
- Android WebView JavaScript interfaces can also be invoked by third-party
  code loaded **inside** a trusted origin or by iframes. The webpage uses
  downloadable source scripts, so this bridge is *not* a general-purpose
  trusted RPC channel. Never add file access, arbitrary network requests,
  shell execution, storage access, or Android intents to its methods.
- No broad storage permissions, accessibility permission or microphone.
- Media cache is app-private and deleted when replaced or when the activity
  shuts down; it cannot be treated as persistent downloads.
- New browser origin, embedded frame or third-party script security reviews
  are required before a production release.
