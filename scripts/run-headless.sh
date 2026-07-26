#!/bin/bash
#
# Run the built app on a throwaway X display and screenshot it.
#
#   pnpm run build && scripts/run-headless.sh [WIDTH] [HEIGHT] [OUT.png]
#
# For looking at the real renderer on a machine with no desktop session to put a
# window on — CI, an SSH shell, or an agent. `pnpm dev` remains the way to use
# the app; this is for seeing it.
#
# Four things have to be right or the app starts and never shows a window:
#
#   --ozone-platform=x11   Electron's Ozone layer prefers Wayland when a Wayland
#                          session exists, and then ignores DISPLAY completely —
#                          so the window opens on the desktop session instead of
#                          the Xvfb one, and nothing appears here.
#   --no-sandbox           Ubuntu 24.04+ sets
#                          kernel.apparmor_restrict_unprivileged_userns=1, which
#                          denies Chromium the user namespace its sandbox needs.
#                          The zygote then fails and the GPU process follows it.
#   SwiftShader            Xvfb has no DRI3 and Mesa cannot open the real GPU
#                          from a non-session process, so WebGL needs a software
#                          rasteriser. Without it the viewport never initialises,
#                          the window never reaches ready-to-show, and the app
#                          sits there running with nothing on screen.
#   LIBGL_ALWAYS_SOFTWARE  Keeps Xvfb's own GLX off the GPU it cannot open.
#
set -euo pipefail

W=${1:-1440}
H=${2:-900}
OUT=${3:-/tmp/ptsbuilder.png}
DISP=${PTSB_DISPLAY:-:78}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

[ -f "$ROOT/out/main/main.cjs" ] || { echo "No build found. Run: pnpm run build" >&2; exit 1; }
command -v Xvfb >/dev/null || { echo "Xvfb not installed (apt install xvfb)" >&2; exit 1; }
command -v import >/dev/null || { echo "ImageMagick not installed (apt install imagemagick)" >&2; exit 1; }

unset WAYLAND_DISPLAY
export XDG_SESSION_TYPE=x11
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe
export DISPLAY=$DISP

for pid in $(pgrep -x Xvfb 2>/dev/null || true); do
  tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | grep -q -- "$DISP " && kill "$pid" || true
done
sleep 1
rm -f "/tmp/.X${DISP#:}-lock"

Xvfb "$DISP" -screen 0 "${W}x${H}x24" +extension GLX +extension RENDER +extension RANDR \
  -nolisten tcp >/dev/null 2>&1 &
XVFB=$!
trap 'kill $XVFB 2>/dev/null || true' EXIT
sleep 3

env -u ELECTRON_RUN_AS_NODE "$ROOT/node_modules/.bin/electron" "$ROOT" \
  --ozone-platform=x11 \
  --no-sandbox --disable-gpu-sandbox \
  --use-angle=swiftshader --use-gl=angle --enable-unsafe-swiftshader \
  >/tmp/ptsbuilder-headless.log 2>&1 &
APP=$!

for _ in $(seq 1 40); do
  sleep 1
  xdotool search --name PTSBuilder >/dev/null 2>&1 && break
  kill -0 $APP 2>/dev/null || { echo "app exited; see /tmp/ptsbuilder-headless.log" >&2; exit 1; }
done
sleep 4

import -window root "$OUT"
echo "$OUT ($(stat -c%s "$OUT") bytes, ${W}x${H})"

kill $APP 2>/dev/null || true
