#!/bin/sh
# Builds Crossshare.app (ad-hoc signed) into apps/mac/build/.
set -e
cd "$(dirname "$0")"
swift build -c release
APP=build/Crossshare.app
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$(swift build -c release --show-bin-path)/Crossshare" "$APP/Contents/MacOS/Crossshare"
cp Info.plist "$APP/Contents/Info.plist"
codesign --force --sign - "$APP"
echo "Built $PWD/$APP"
