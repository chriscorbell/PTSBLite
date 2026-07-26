# ADR-0006: Code signing — unsigned on Windows, signed on macOS

> The filename reflects the original decision. The macOS half was reversed the same day;
> see the amendment at the end. Kept at this path so existing links resolve.

- **Status:** Accepted, amended
- **Date:** 2026-07-26
- **Amended:** 2026-07-26 — macOS is now signed and notarized. The cost analysis below priced an
  Apple Developer membership the author already holds. Windows remains unsigned. See "Amendment".

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

## Amendment — macOS is signed after all

The reasoning above priced signing as one decision. It is two, with different vendors, different
prices, and — the part that was wrong — different value.

**Apple Developer membership was already held**, for unrelated reasons. Notarization is included in
it at no extra charge. So the marginal cost of signing macOS was never $99; it was zero, plus an
afternoon of setup. The analysis above compared the wrong number against the benefit.

That inverts the conclusion for one platform, because the value is inverted too:

| | Recurring cost | What signing buys |
|---|---|---|
| Windows | A few hundred a year, plus hardware-token or cloud-HSM key storage | Removes one SmartScreen prompt. Auto-update already worked without it |
| macOS | Already paid | Removes a Gatekeeper block **and** enables self-update, which is otherwise impossible |

macOS was simultaneously the cheaper half and the one where the benefit was larger. Continuing to
ship unsigned macOS builds was also the least coherent of the available options: it spent release
time producing artifacts with the worst install experience of the three platforms and no update path
at all. At zero marginal cost, that middle position is dominated by both alternatives — sign them, or
stop building them.

**Windows stays unsigned.** Nothing about its analysis changed: a real annual cost, key-storage
hassle, and the only benefit is removing a single first-run dialog from a working auto-update path.

### What this required

No native modules, which is why this was low-risk: `npmRebuild: false`, one pure-JS production
dependency, and no `.node` binaries, so the only Mach-O objects in the bundle are Electron's own
framework and helpers. Most notarization failures come from unsigned nested native binaries.

- `build/entitlements.mac.plist` — Hardened Runtime entitlements. Only the two V8 requires;
  `disable-library-validation` is deliberately omitted, since it exists to permit unsigned dynamic
  libraries and there are none.
- `mac.hardenedRuntime`, `mac.entitlements`, `mac.entitlementsInherit`, `mac.notarize` in
  `electron-builder.yml`.
- Credentials exported in the release workflow **only on the macOS runner**. `CSC_LINK` is also read
  for Windows signing, and handing a Developer ID certificate to the Windows build would fail it.
- The `darwin` early return in `autoUpdateSupported()` removed.

The existing `zip` target was already a precondition and stays: electron-updater fetches it to apply
macOS updates, while the `dmg` is what a human downloads. The release asset-pruning job already
preserved `latest*.yml`, so `latest-mac.yml` reaches the update feed.

### Repository secrets

Five, all scoped to the macOS runner. Produce them once:

```sh
# Developer ID Application certificate, exported from Keychain Access as .p12
base64 -i certificate.p12 | tr -d '\n'      # -> MACOS_CERTIFICATE_BASE64
                                            # -> MACOS_CERTIFICATE_PASSWORD (the export password)

# App Store Connect API key (.p8), created under Users and Access › Integrations
base64 -i AuthKey_XXXXXXXXX.p8 | tr -d '\n' # -> APPLE_API_KEY_BASE64
                                            # -> APPLE_API_KEY_ID  (the XXXXXXXXX in the filename)
                                            # -> APPLE_API_ISSUER  (the issuer UUID on that page)
```

Both values must be single-line, hence `tr -d '\n'` — a newline in a secret breaks the `GITHUB_ENV`
export that passes it to electron-builder.

An App Store Connect API key rather than an Apple ID and app-specific password: the key does not
break when the account password or 2FA changes.

The workflow fails loudly if any secret is missing. That is deliberate — the alternative is silently
publishing an unsigned macOS build whose advertised self-update would then fail on every user's
machine. `fail-fast: false` in the matrix means a macOS signing failure does not block the Windows
and Linux releases.

### Consequences that replace the macOS row above

- First launch shows the ordinary "downloaded from the Internet" confirmation macOS shows for any
  downloaded app, not a Gatekeeper refusal.
- macOS self-updates, on the same path as Windows.
- Release builds are slower by roughly 5–15 minutes while Apple's notarization queue runs.
- The membership must stay current. If it lapses, macOS releases fail at the notarization step —
  loudly, which is the intent.
