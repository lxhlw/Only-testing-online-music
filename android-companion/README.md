# LX Music Android 4.4 Companion — Phase 1 and TLS fix 0.2

## Android 4.4 native TLS handshake fix (0.2 beta)

Physical test: on the L101 Android 4.4.2 tablet, **本地试听 is audible**. This
confirms Android `MediaPlayer` can decode/output the generated PCM WAV.
**联网试听 throws `SSLHandshakeException`** in Java `HttpsURLConnection`.
The root cause could be an outdated trust store, incompatible cipher suite,
SNI or intermediate certificate; TLS 1.2 enablement alone is insufficient.

Version 0.2 keeps native HTTPS as the primary path and, **only after an
`SSLException`**, attempts to retrieve media using the embedded WebView's
own independently certificate-verified HTTPS XHR transport (not HTML5 Audio).
Audio is copied in bounded 4096-byte Base64 chunks to app-private cache,
validated against announced HTTP length and checked for audio signature,
then played by native `MediaPlayer`. The companion can therefore work if
its WebView networking succeeds even though Android Java TLS does not.

No SSL trust-all factory, certificate bypass, HTTP downgrade, or arbitrary
third-party URL handoff is permitted. WebView must successfully load the
first-party HTTPS page; if it cannot, the fallback will fail clearly. This
fallback has automated byte-transfer tests but **has not yet been confirmed
audible on physical Android 4.4 hardware**.

Get prerelease `android44-tlsfix-test-20261027` and download
`LXMusic-Android44-TLSFix.apk`. On Windows with ADB:

```bat
adb install -r "LXMusic-Android44-TLSFix.apk"
adb shell am start -n dev.lxmusic.legacy/.MainActivity
```

If `INSTALL_FAILED_UPDATE_INCOMPATIBLE` occurs, debug signing keys may
have changed between CI builds. Run `adb uninstall dev.lxmusic.legacy`,
then install again (this clears the app's data). Click 本地试听, 联网试听,
and a searched song. Send a photo of the app's concise status on failure,
rather than copying logs. ADB additional debug option:

```bat
adb logcat -d -s LXMusicNative:W AndroidRuntime:E
```



This independent APK uses the existing LX Music Web pages for search, playlists and song resolution, but routes resolved audio to a native Android `MediaPlayer` instead of the Android 4.4 / Via HTML5 media pipeline.

## Physical-device baseline

The user's Android 4.4.2 system music player can play stored audio. Via/Chrome 30 successfully retrieves MP3 and WAV data, but fails all webpage playback modes with MEDIA_ERR_SRC_NOT_SUPPORTED (4). Via also did not dispatch external ACTION_VIEW intent links.

## Install and first check

1. Open the **Build Android 4.4 Native Companion APK** GitHub Actions run for the latest main commit.
2. Download the `LX-Music-Android-4.4-Phase1-APK` artifact on a PC; unzip and copy the `app-debug.apk` to the Android tablet.
3. On the tablet, enable installation from **Unknown sources** for this test build. Install the APK and open **LX Music Android 4.4**.
4. Tap **本地试听** at the top. This generates a two-second 523 Hz WAV in the app's private cache and plays it with native MediaPlayer. No Internet, TLS, WebView or third-party audio source is needed. Confirm whether sound is audible.
5. Tap **联网试听**. This downloads the site-owned four-second MP3 test file over HTTPS, validates size/type, then plays its local cached file through native MediaPlayer. This isolates Android 4.4 HTTPS/TLS/certificate/network behavior from decoding.
6. Use the embedded LX Music Web search and choose a track. Once a playable URL is resolved, the site calls the annotated `LXNativeAudio.play(url,token)` bridge, downloading audio to a private cache and playing natively.
7. Use the **播放/暂停** button at the top of the APK for Phase 1. The bottom site's HTML5 media controls and full seek/queue state synchronization are deferred to Phase 2.

You only need to report: **local tone audible? / online tone audible? / searched track audible?** A photo of the small status strip is enough. Do not copy diagnostic text.

## Build notes

- minSdk 19, targetSdk 28, Java, no AndroidX dependency; compiles with Android Gradle Plugin 8.7.3, Gradle 8.9, JDK 17 and Android compile SDK 35.
- APK is a **debug build signed with a CI debug key**. Not a production release; keys may change across builds, so Android may require uninstalling the previous debug APK before installing a later build.
- GitHub Actions keeps artifacts for 30 days. Main Cloudflare Pages site remains available and unchanged for desktop usage.
- Restricted JavaScript interface: accepts only HTTPS URLs on `only-testing-online-music.pages.dev` under `/api/proxy` and `/api/legacy-audio`, no arbitrary file access, no externally callable Activities, no unsafe TLS trust-all workaround. The bridge is exposed to all WebView frames on older Android: do not add untrusted HTML/iframes or expose further privileged commands.
- Audio downloaded to app-private cache is bounded to 30 MiB. Native MediaPlayer plays by file descriptor. Old system TLS/certificate trust could still block HTTPS; we **do not bypass certificate verification**.
- APK needs manual installation; existing Via browser cannot inject this JavaScript bridge into itself.
- On Android 4.4, JavaScript WebView remains legacy; site interface load and source scripts still need independent testing.

## Status and limitations

Phase 1 **has not been verified on the physical tablet**. Android test automation can compile and check browser integration, not prove sound output on hardware. This is not a system-wide player integration. Background service, lockscreen media notification, offline library, native seek/volume/track queue synchronization and resilient streaming without a full download are deliberately not implemented yet.

## Next development gate

- Local tone fails: investigate AudioManager/MediaPlayer API19 setup, device permissions and actual decoder support.
- Local works / online fails: investigate TLS/certificate chain, authorized CDN access, response type, cache-download behavior; do not change the audio decoder blindly.
- Online works / songs fail: inspect real resolved audio format, temporary URLs and proxy transport, or MediaPlayer capability.
- All pass: proceed to Phase 2 native playback control and progress/queue synchronization.
