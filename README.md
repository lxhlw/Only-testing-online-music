# Only-testing-online-music

A lightweight web music player project for older Android devices.

## Project goal

This project is being built from scratch as a **Web implementation inspired by the workflow of LX Music Desktop**, with a special focus on legacy Android browsers such as the Via browser on Android 4.4.

The project does **not** use WhyMusic and does not modify the L101 Volume Float Android project.

### Core goals

- LX Music-style search, playlists, favorites, history, lyrics, player, and settings
- Import **original LX Music source JavaScript files directly**
- Do not convert an LX source into another plugin protocol
- Provide the standard `globalThis.lx` runtime expected by LX sources
- Keep the original source text unchanged in storage
- Build the browser layer around old-browser constraints first
- Use HTML5 Audio for playback
- Keep the frontend lightweight enough for legacy Android WebView / Via

## Current phase

Phase 1 establishes the browser shell and LX source loader/runtime.

It currently provides:

- Static HTML/CSS/JavaScript with no framework dependency
- Legacy-friendly syntax in the application code
- LX source URL installation
- LX source metadata parsing
- Original source text persistence in localStorage
- A browser-side `globalThis.lx` runtime
- `EVENT_NAMES`, `on()`, `send()`, and the callback-style `request()` entry point
- Initial `buffer` and `crypto` compatibility primitives
- Source initialization reporting

The network proxy, full cryptography/zlib compatibility, complete source actions, player, playlists, and production deployment will be implemented in later phases.

## LX compatibility target

The target contract follows the public LX Music custom-source API documentation:

- `globalThis.lx.version`
- `globalThis.lx.env`
- `globalThis.lx.currentScriptInfo`
- `globalThis.lx.EVENT_NAMES`
- `globalThis.lx.on()`
- `globalThis.lx.send()`
- `globalThis.lx.request()`
- `globalThis.lx.utils.buffer`
- `globalThis.lx.utils.crypto`
- `globalThis.lx.utils.zlib`

The long-term goal is to run ordinary LX custom sources directly. Where a source depends on a browser-incompatible Node/Electron host feature, the project will provide a Web equivalent where technically possible instead of changing the source protocol.

## Legacy browser target

Primary test target:

- Android 4.4.2
- Via browser
- Old Chromium-based Android WebView
- Touch UI
- 800x1280-class tablet screens

Modern APIs are treated as optional. The application shell is intentionally kept dependency-free so the first compatibility layer does not get hidden behind a large framework build.

## License / upstream relationship

This is an independent project. LX Music is the reference project for the compatible custom-source protocol and product workflow; this repository does not claim to be the official LX Music project.
