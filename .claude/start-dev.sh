#!/bin/sh
export PATH="/usr/local/bin:$PATH"
cd "/Users/garrettschmidt/Desktop/RELIC web portal/relicbuilt-website"
exec /usr/local/bin/node node_modules/.bin/next dev
