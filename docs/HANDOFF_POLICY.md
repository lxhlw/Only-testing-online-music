# FyMusic — Handoff Workflow & Privacy Policy

**Read this before performing a new operation.** This document lives in a PUBLIC repository. Do not treat a hidden branch, unpublished PR, obscure path, or Git history as private storage.

## Every operation: mandatory handoff contract

1. **BEFORE changes**: read `HANDOFF_CURRENT.md` and recent `HANDOFF_LOG.md`, then verify `main` HEAD and latest Actions results. Check for outstanding work and conflicts.
2. **DO the requested scoped operation** on a development branch or isolated preview, unless the user explicitly requests a safe direct change. Never infer test results. Separate code-implemented from browser-verified from production-deployed.
3. **AFTER changes**: update `HANDOFF_CURRENT.md` with the latest known version/commit (or a clearly labeled baseline), completed work, exact tests/status, new or unresolved risks, current task state, and next numbered target. Append a dated entry to `HANDOFF_LOG.md` with `Goal / Changes / Tests / Evidence / Not done / Next`.
4. **COMMIT/check**: stage the handoff changes alongside the associated code operation whenever possible; run `node scripts/check-handoff-privacy.mjs`, inspect diffs and verify the GitHub SHA/URL. If CI is still pending, label it pending—do not claim success.
5. **REPORT in chat**: summarize the completed step, what evidence exists, remaining steps, and exact next action; provide GitHub link to checkpoint commit. User may copy the new-chat recovery message from CURRENT.
6. **If a crash/context limit intervenes**: start from current GitHub state and CI, not remembered assistant assertions. Reconcile unmerged branches and last recorded operation, then continue from the latest safe step.
7. **Time**: date/time in ISO format, with timezone when operationally relevant. Never use unchecked relative dates for facts. 
8. **Scope**: every material task, bugfix, deploy, test cycle, review or design milestone requires a checkpoint. Minor read-only tool calls can be grouped into one milestone; avoid noisy empty commits.

## PUBLIC-safe content: allowed

- Already public repository filenames, general architecture, verified version numbers, public CI/PR/commit links, sanitized summaries of defects and fixes, generalized test cases, documented roadmap and non-sensitive design goals.
- Third-party external facts only when public, necessary and relevant to the project; write no raw third-party API responses that could contain signed query parameters.

## Prohibited in this public handoff

- Chat transcripts, user identity or contact details, personal profile, private preferences unrelated to code, connected-app contents, internal account or billing data.
- GitHub/Cloudflare/API tokens, secrets, session cookies, passwords, OAuth, signing keys, headers with authorization, raw signed music playback URLs, proxy URL query strings, debug traces containing request credentials.
- Private design/file access IDs and private Figma URLs, screenshots of private dashboards, local paths exposing usernames, raw env files, personal addresses or sensitive private assets.
- Unverified results presented as facts.

**Important:** Static scans are a defense in depth, not an absolute guarantee of confidentiality. A file in this public repo, including deleted commits in Git history, must always be considered world-readable.

## Confidential continuity (not yet configured)

The available GitHub repos were public at the protocol creation date. No connector action is currently available here to create a PRIVATE repository. If confidential notes are needed, create a separate **private** GitHub repository using GitHub's web interface; authorize the GitHub connector to it before storing private material. Keep the current public handoff sanitized. Do not copy these documents into an unverified repository and assume privacy; check `visibility: private`, access rights and branch rules first.

A private repository would protect access according to its membership, not provide end-to-end encryption. For highly sensitive credentials, use a proper secret manager, never a handoff document.
