#!/bin/sh
# Deploy project files directly to the router over SSH.
# Usage: ./deploy.sh [ssh-host]   (default: router)
#
# Uses ssh+cat pipes — requires no extra binaries on the router
# (no rsync, no sftp-server needed).
#
# Does NOT touch /etc/config/bandwidthbydevice if it already exists on
# the router, so live settings (backup credentials etc.) are preserved.

set -e
HOST="${1:-router}"

# Push a single file: push <local-path> <remote-path>
push() {
    cat "$1" | ssh "$HOST" "cat > $2"
}

echo "→ Deploying to $HOST"

# Ensure target directories exist
ssh "$HOST" "mkdir -p \
  /www/luci-static/resources/view/bandwidthbydevice \
  /www/luci-static/resources/bandwidthbydevice \
  /usr/share/luci/menu.d \
  /usr/share/rpcd/acl.d"

# JS views
push htdocs/luci-static/resources/view/bandwidthbydevice/overview.js \
     /www/luci-static/resources/view/bandwidthbydevice/overview.js
push htdocs/luci-static/resources/view/bandwidthbydevice/device.js \
     /www/luci-static/resources/view/bandwidthbydevice/device.js
push htdocs/luci-static/resources/view/bandwidthbydevice/backup.js \
     /www/luci-static/resources/view/bandwidthbydevice/backup.js

# Static assets
push htdocs/luci-static/resources/bandwidthbydevice/style.css \
     /www/luci-static/resources/bandwidthbydevice/style.css
push htdocs/luci-static/resources/bandwidthbydevice/chart.min.js \
     /www/luci-static/resources/bandwidthbydevice/chart.min.js

# LuCI menu
push luasrc/menu.d/luci-app-bandwidthbydevice.json \
     /usr/share/luci/menu.d/luci-app-bandwidthbydevice.json

# Backend scripts
push root/usr/bin/bbd-collector /usr/bin/bbd-collector
push root/usr/bin/bbd-backup    /usr/bin/bbd-backup
ssh "$HOST" "chmod +x /usr/bin/bbd-collector /usr/bin/bbd-backup"

# rpcd plugin + ACL
push root/usr/libexec/rpcd/bandwidthbydevice /usr/libexec/rpcd/bandwidthbydevice
ssh "$HOST" "chmod +x /usr/libexec/rpcd/bandwidthbydevice"
push root/usr/share/rpcd/acl.d/luci-app-bandwidthbydevice.json \
     /usr/share/rpcd/acl.d/luci-app-bandwidthbydevice.json

# init script
push root/etc/init.d/bandwidthbydevice /etc/init.d/bandwidthbydevice
ssh "$HOST" "chmod +x /etc/init.d/bandwidthbydevice"

# UCI default config — skip if already present so live settings survive
ssh "$HOST" "[ -f /etc/config/bandwidthbydevice ]" 2>/dev/null || \
    push root/etc/config/bandwidthbydevice /etc/config/bandwidthbydevice

# Restart services and clear LuCI cache
ssh "$HOST" "
  /etc/init.d/rpcd restart 2>/dev/null
  /etc/init.d/bandwidthbydevice restart 2>/dev/null || true
  rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
"

echo "✓ Done — hard-refresh LuCI in your browser."
