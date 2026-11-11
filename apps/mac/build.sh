#!/bin/sh
set -e
cd "$(dirname "$0")"

CHANNEL="${CROSSHARE_CHANNEL:-stable}"
if [ "$CHANNEL" = nightly ]; then
  NAME="Crosshare (Nightly)"
  BUNDLE_ID=studio.shudio.crosshare.nightly
else
  NAME=Crosshare
  BUNDLE_ID=studio.shudio.crosshare
fi
EXT_ID="$BUNDLE_ID.share"

if [ "${CROSSHARE_UNIVERSAL:-}" = 1 ]; then
  ARCHS="arm64 x86_64"
  SWIFT_ARCH_FLAGS="--arch arm64 --arch x86_64"
else
  ARCHS="$(uname -m)"
  SWIFT_ARCH_FLAGS=""
fi

swift build -c release $SWIFT_ARCH_FLAGS
APP="build/$NAME.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$(swift build -c release $SWIFT_ARCH_FLAGS --show-bin-path)/Crosshare" "$APP/Contents/MacOS/Crosshare"
cp Info.plist "$APP/Contents/Info.plist"
cp Resources/AppIcon.icns Resources/MenuBarIcon.png Resources/MenuBarIcon@2x.png "$APP/Contents/Resources/"

# Share menu extension (Share › Crosshare). SwiftPM can't build .appex bundles, so use swiftc.
EXT="$APP/Contents/PlugIns/CrosshareShare.appex"
mkdir -p "$EXT/Contents/MacOS"
SLICES=""
for arch in $ARCHS; do
  out="build/CrosshareShare-$arch"
  swiftc -O -application-extension -parse-as-library -module-name CrosshareShare \
    -target "$arch-apple-macos13.0" \
    -Xlinker -e -Xlinker _NSExtensionMain \
    ShareExtension/ShareViewController.swift -o "$out"
  SLICES="$SLICES $out"
done
lipo -create $SLICES -output "$EXT/Contents/MacOS/CrosshareShare"
rm -f $SLICES
cp ShareExtension/Info.plist "$EXT/Contents/Info.plist"

PB=/usr/libexec/PlistBuddy
"$PB" -c "Set :CFBundleName $NAME" -c "Set :CFBundleDisplayName $NAME" \
  -c "Set :CFBundleIdentifier $BUNDLE_ID" -c "Set :CFBundleURLTypes:0:CFBundleURLName $BUNDLE_ID" \
  -c "Set :NSServices:0:NSPortName $NAME" "$APP/Contents/Info.plist"
"$PB" -c "Set :CFBundleDisplayName $NAME" -c "Set :CFBundleIdentifier $EXT_ID" "$EXT/Contents/Info.plist"
for plist in "$APP/Contents/Info.plist" "$EXT/Contents/Info.plist"; do
  [ -n "${CROSSHARE_VERSION:-}" ] && "$PB" -c "Set :CFBundleShortVersionString $CROSSHARE_VERSION" "$plist"
  [ -n "${CROSSHARE_BUILD:-}" ] && "$PB" -c "Set :CFBundleVersion $CROSSHARE_BUILD" "$plist"
done

if [ -n "${CROSSHARE_SIGN_IDENTITY:-}" ]; then
  codesign --force --sign "$CROSSHARE_SIGN_IDENTITY" --options runtime --timestamp \
    --entitlements ShareExtension/Share.entitlements "$EXT"
  codesign --force --sign "$CROSSHARE_SIGN_IDENTITY" --options runtime --timestamp \
    --entitlements Crosshare.entitlements "$APP"
  codesign --verify --strict --deep "$APP"
  echo "Built $PWD/$APP"
  exit 0
fi

codesign --force --sign - --entitlements ShareExtension/Share.entitlements "$EXT"
codesign --force --sign - --entitlements Crosshare.entitlements "$APP"

# Register the rebuilt extension and turn it on (macOS adds new share extensions switched off).
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREGISTER" -f "$PWD/$APP" && pluginkit -a "$PWD/$EXT" && pluginkit -e use -i "$EXT_ID" || true
echo "Built $PWD/$APP"
