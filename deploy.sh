#!/bin/sh
# Deploy project files directly to the router over SSH.
# Usage: ./deploy.sh [ssh-host]   (default: router)
#
# Uses rsync so only changed files are transferred.
# Does NOT touch /etc/config/bandwidthbydevice if it already exists on
# the router, so live settings (backup credentials etc.) are preserved.

set -e
HOST="${1:-router}"

echo "→ Deploying to $HOST"

# Ensure target directories exist
ssh "$HOST" "mkdir -p \
  /www/luci-static/resources/view/bandwidthbydevice \
  /www/luci-static/resources/bandwidthbydevice \
  /usr/share/luci/menu.d \
  /usr/share/rpcd/acl.d"

# JS views + static assets
rsync -az htdocs/luci-static/resources/view/bandwidthbydevice/ \
    "$HOST:/www/luci-static/resources/view/bandwidthbydevice/"
rsync -az htdocs/luci-static/resources/bandwidthbydevice/ \
    "$HOST:/www/luci-static/resources/bandwidthbydevice/"

# LuCI menu definition
rsync -az luasrc/menu.d/luci-app-bandwidthbydevice.json \
    "$HOST:/usr/share/luci/menu.d/"

# Backend scripts
rsync -az root/usr/bin/bbd-collector root/usr/bin/bbd-backup \
    "$HOST:/usr/bin/"
ssh "$HOST" "chmod +x /usr/bin/bbd-collector /usr/bin/bbd-backup"

# rpcd plugin + ACL
rsync -az root/usr/libexec/rpcd/bandwidthbydevice \
    "$HOST:/usr/libexec/rpcd/"
ssh "$HOST" "chmod +x /usr/libexec/rpcd/bandwidthbydevice"
rsync -az root/usr/share/rpcd/acl.d/luci-app-bandwidthbydevice.json \
    "$HOST:/usr/share/rpcd/acl.d/"

# init script (only if changed)
rsync -az root/etc/init.d/bandwidthbydevice \
    "$HOST:/etc/init.d/"
ssh "$HOST" "chmod +x /etc/init.d/bandwidthbydevice"

# UCI default config — skip if already present on the router so live
# settings (backup credentials etc.) are not overwritten
ssh "$HOST" "[ -f /etc/config/bandwidthbydevice ]" 2>/dev/null || \
    rsync -az root/etc/config/bandwidthbydevice \
        "$HOST:/etc/config/bandwidthbydevice"

# Restart services and clear LuCI module cache
ssh "$HOST" "
  /etc/init.d/rpcd restart 2>/dev/null
  /etc/init.d/bandwidthbydevice restart 2>/dev/null || true
  rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
"

echo "✓ Done — hard-refresh LuCI in your browser."
