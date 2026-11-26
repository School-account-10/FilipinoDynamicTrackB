#!/bin/sh
folder="$(cd "$(dirname "$0")" && pwd)"
nodePath="$(command -v node)"

if [ -z "$nodePath" ]; then
  echo "Node.js was not found. Please install it first."
  exit 1
fi

unitFolder="$HOME/.config/systemd/user"
mkdir -p "$unitFolder"

systemctl --user disable --now osint-helper.service 2>/dev/null

cat > "$unitFolder/osint-helper.socket" << UNIT
[Unit]
Description=Local helper socket

[Socket]
ListenStream=127.0.0.1:3000

[Install]
WantedBy=sockets.target
UNIT

cat > "$unitFolder/osint-helper.service" << UNIT
[Unit]
Description=Local helper
Requires=osint-helper.socket

[Service]
WorkingDirectory=$folder
ExecStart=$nodePath $folder/server.js
UNIT

systemctl --user daemon-reload
systemctl --user enable --now osint-helper.socket

echo "Done. Opening http://localhost:3000 will now start the helper automatically."
