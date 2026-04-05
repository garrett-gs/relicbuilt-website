#!/bin/sh
export PATH="/usr/local/bin:$PATH"
cd "/Users/garrettschmidt/Desktop/RELIC web portal/relicbuilt-website"
rm -rf .next
exec /usr/local/bin/node node_modules/next/dist/bin/next dev --webpack
