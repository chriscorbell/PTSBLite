# ADR-0006: Ship unsigned builds

- **Status:** Accepted
- **Date:** 2026-07-26

## Context

PTSBuilder ships installers for Windows, macOS, and Linux from a tag-triggered release workflow.
None are code-signed.

Signing is not one decision but two, with separate costs and separate vendors:

- **Windows.** An OV or EV code-signing certificate, renewed annually, at a few hundred dollars a
  year. Since the CA/Browser Forum tightened key-storage rules, the private key must live on a
  hardware token or in a cloud HSM, which adds setup and a step in the release pipeline.
- **macOS.** Apple Developer Program membership, around $100/year, plus notarization submission in
  the build. This is also the only route to self-updating macOS builds: Squirrel.Mac refuses to apply
  an update that is not signed with a Developer ID.

Set against that: the author is an independent solo developer, and the buyer is a single small
family-owned business. The entire benefit purchased is the removal of a one-time warning dialog.

The platforms are not affected equally. Windows is the client's platform, and there the cost is one
SmartScreen prompt at first install; in-app updates are applied by the already-installed app and
never re-warn. Linux has no signing expectation for AppImage or Flatpak. macOS is where it bites:
Gatekeeper blocks the app, recent macOS versions removed the right-click-to-open shortcut so the user
must go through System Settings, and there is no self-update at all.

## Decision

**Ship unsigned on every platform. Do not buy certificates.**

macOS builds continue to be produced. They are cheap to build, they work once past Gatekeeper, and
keeping the target means a Mac showing up later is a documentation problem rather than a release
engineering one.

The consequence is documented rather than hidden: the release notes on every download page explain
what the user will see and what to do about it, per platform.

## Consequences

- **Windows:** SmartScreen shows "Windows protected your PC" on first run. The user clicks *More
  info* then *Run anyway*. Once installed, `electron-updater` applies updates silently and this never
  recurs. SmartScreen reputation accrues with download volume, but at this project's volume it will
  not accrue meaningfully, so the first-run prompt should be treated as permanent.
- **macOS:** Gatekeeper refuses the app on first open. The user must approve it in System Settings ›
  Privacy & Security. There is **no automatic updating** — `autoUpdateSupported()` returns false on
  darwin, and the app instead checks GitHub and points the user at the download page. Mac users
  update by downloading a new build by hand, every time.
- **Linux:** unaffected. AppImage self-updates; Flatpak is managed by the host.
- Any support conversation that begins "it says it isn't safe" is expected behaviour, not a defect.
- The decision is reversible at any time and requires no code changes beyond adding credentials to
  the release workflow. Nothing is being built around its absence.

## Notes

Worth revisiting if any of these change: the software is sold to more than one customer; it is
distributed to end users outside a controlled install; a customer's IT policy blocks unsigned
executables outright; or macOS becomes a platform anyone actually uses daily, since the absence of
self-update there is a maintenance cost that grows with the number of installs.
