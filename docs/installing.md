## Installing

These builds are not code-signed, so your operating system will warn you the first time you run the
app. This is expected — see
[ADR-0006](https://github.com/chriscorbell/PTSBuilder/blob/main/docs/adr/0006-ship-unsigned-builds.md).

**Windows** — SmartScreen shows "Windows protected your PC". Click **More info**, then **Run
anyway**. You will only see this once: later updates are applied by the app itself and do not warn.

**macOS** — macOS refuses to open the app. Open **System Settings › Privacy & Security**, scroll to
the message about PTSBuilder, and click **Open Anyway**. macOS builds do not update themselves —
check the releases page for new versions.

**Linux** — no warning. Make the AppImage executable (`chmod +x`) and run it, or install the Flatpak.
