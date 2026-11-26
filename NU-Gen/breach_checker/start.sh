#!/bin/sh
cd "$(dirname "$0")"
node server.js &
sleep 1
if command -v xdg-open > /dev/null; then
  xdg-open http://localhost:3000
else
  open http://localhost:3000
fi
wait
