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
cp Resources/AppIcon.icns Resources/MenuBarIcon.png Resources/MenuBarIcon@2x.png "$APP/Contents/Resources/"

# Share menu extension (Share › Crossshare). SwiftPM can't build .appex bundles, so use swiftc.
EXT="$APP/Contents/PlugIns/CrossshareShare.appex"
mkdir -p "$EXT/Contents/MacOS"
swiftc -O -application-extension -parse-as-library -module-name CrossshareShare \
  -target "$(uname -m)-apple-macos13.0" \
  -Xlinker -e -Xlinker _NSExtensionMain \
  ShareExtension/ShareViewController.swift -o "$EXT/Contents/MacOS/CrossshareShare"
cp ShareExtension/Info.plist "$EXT/Contents/Info.plist"
codesign --force --sign - --entitlements ShareExtension/Share.entitlements "$EXT"

codesign --force --sign - "$APP"

# Register the rebuilt extension and turn it on (macOS adds new share extensions switched off).
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREGISTER" -f "$PWD/$APP" && pluginkit -a "$PWD/$EXT" && pluginkit -e use -i com.shamilkotta.crossshare.mac.share || true
echo "Built $PWD/$APP"
