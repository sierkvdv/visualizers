#!/bin/sh
# Bouwt SamSo-DiscoClub.app naast index.html, met dezelfde app-schil als de Fractualizer (../../app/main.swift)
set -e
cd "$(dirname "$0")"
NAME="SamSo-DiscoClub"
APP="../$NAME.app"
T=$(mktemp -d)

# icoon: alleen opnieuw maken als het nog niet bestaat
if [ ! -f AppIcon.icns ]; then
  swiftc -O icon.swift -o "$T/icon"
  "$T/icon" "$T/icon.png"
  mkdir "$T/AppIcon.iconset"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$T/icon.png" --out "$T/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
    sips -z $((s * 2)) $((s * 2)) "$T/icon.png" --out "$T/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$T/AppIcon.iconset" -o AppIcon.icns
  sips -z 256 256 "$T/icon.png" --out icon-preview.png >/dev/null
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
# universeel: Apple Silicon + Intel
swiftc -O -target arm64-apple-macos13.0 ../../app/main.swift -o "$T/arm64"
swiftc -O -target x86_64-apple-macos13.0 ../../app/main.swift -o "$T/x86_64"
lipo -create "$T/arm64" "$T/x86_64" -output "$APP/Contents/MacOS/$NAME"
cp ../index.html AppIcon.icns "$APP/Contents/Resources/"
cp -R ../lib "$APP/Contents/Resources/lib"
# 3D-figuren, muurtexturen en de losse uitbreidingen (zaal 2, lichtregie, enz.)
for d in models tex z2 club; do [ -d "../$d" ] && rsync -a --exclude bron "../$d" "$APP/Contents/Resources/"; done
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$NAME</string>
  <key>CFBundleIdentifier</key><string>nl.debox.samso-discoclub</string>
  <key>CFBundleExecutable</key><string>$NAME</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.3</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>SamSoDevFolder</key><string>disco-club</string>
</dict>
</plist>
EOF
codesign --force --sign - --identifier nl.debox.samso-discoclub "$APP"

# zip om te delen: map met de app en de handleiding
mkdir "$T/$NAME"
ditto "$APP" "$T/$NAME/$NAME.app"
cp Handleiding.html "$T/$NAME/"
rm -f "../$NAME.zip"
ditto -c -k --keepParent "$T/$NAME" "../$NAME.zip"
rm -rf "$T"
echo "klaar: $APP en $NAME.zip"
