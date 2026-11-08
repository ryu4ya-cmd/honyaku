#!/bin/sh
# Builds honyaku-video.zip (the download on video.html) from this folder.
# dictionaries.js is shared with the web app, so copy the latest one in first.
set -e
cd "$(dirname "$0")"
cp ../dictionaries.js dictionaries.js
rm -f ../honyaku-video.zip
cd ..
mv extension honyaku-video
zip -qr honyaku-video.zip honyaku-video -x 'honyaku-video/build.sh'
mv honyaku-video extension
echo "built honyaku-video.zip"
