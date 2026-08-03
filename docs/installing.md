## Installing

PTSBuilderLite needs no installation — it runs in a desktop browser. What follows applies to
PTSBuilder, the desktop app.

**These instructions describe releases that are not currently being published.** Desktop artifact
builds are paused while PTSBuilderLite is the focus; see
[ADR-0010](https://github.com/chriscorbell/PTSBuilder/blob/main/docs/adr/0010-one-codebase-two-products.md).
They are kept because they are correct for the builds that already exist, and will be correct again.


**Windows** — these builds are not code-signed, so SmartScreen shows "Windows protected your PC" the
first time you run the installer. Click **More info**, then **Run anyway**. You will only see this
once: later updates are applied by the app itself and do not warn. See
[ADR-0006](https://github.com/chriscorbell/PTSBuilder/blob/main/docs/adr/0006-ship-unsigned-builds.md).

**macOS** — signed and notarized by Apple. Open the `.dmg` and drag PTSBuilder to Applications. The
first launch shows the standard "downloaded from the Internet — are you sure?" confirmation that
macOS shows for any downloaded app; click **Open**. Updates install themselves.

**Linux** — no warning. Make the AppImage executable (`chmod +x`) and run it, or install the Flatpak.
AppImage builds update themselves; Flatpak is managed by your package manager.
