#!/bin/sh
set -e

PKG_NAME="luci-app-bandwidthbydevice"
PKG_VERSION="${1:-0.1.0}"
PKG_RELEASE="1"
PKG_ARCH="all"
PKG_FILENAME="${PKG_NAME}_${PKG_VERSION}-${PKG_RELEASE}_${PKG_ARCH}.ipk"

BUILDDIR=$(mktemp -d)
trap 'rm -rf "$BUILDDIR"' EXIT

# ---- data -------------------------------------------------------------------

install -d \
    "$BUILDDIR/data/usr/lib/lua/luci/controller" \
    "$BUILDDIR/data/usr/lib/lua/luci/view/bandwidthbydevice" \
    "$BUILDDIR/data/usr/share/luci/menu.d" \
    "$BUILDDIR/data/etc/init.d" \
    "$BUILDDIR/data/usr/bin" \
    "$BUILDDIR/data/www/luci-static/resources/bandwidthbydevice"

cp luasrc/controller/bandwidthbydevice.lua \
    "$BUILDDIR/data/usr/lib/lua/luci/controller/"
cp luasrc/view/bandwidthbydevice/*.htm \
    "$BUILDDIR/data/usr/lib/lua/luci/view/bandwidthbydevice/"
cp luasrc/menu.d/luci-app-bandwidthbydevice.json \
    "$BUILDDIR/data/usr/share/luci/menu.d/"
install -m 755 root/etc/init.d/bandwidthbydevice \
    "$BUILDDIR/data/etc/init.d/bandwidthbydevice"
install -m 755 root/usr/bin/bbd-collector \
    "$BUILDDIR/data/usr/bin/bbd-collector"
cp htdocs/luci-static/resources/bandwidthbydevice/* \
    "$BUILDDIR/data/www/luci-static/resources/bandwidthbydevice/"

# ---- control ----------------------------------------------------------------

install -d "$BUILDDIR/control"

cat > "$BUILDDIR/control/control" <<EOF
Package: $PKG_NAME
Version: $PKG_VERSION-$PKG_RELEASE
Architecture: $PKG_ARCH
Depends: luci-base, iptables, kmod-ipt-conntrack
Section: luci
Priority: optional
Description: Per-device bandwidth monitor for OpenWRT LuCI
EOF

cat > "$BUILDDIR/control/postinst" <<'EOF'
#!/bin/sh
[ "${IPKG_NO_SCRIPT}" = "1" ] && exit 0
[ -x /etc/init.d/bandwidthbydevice ] || exit 0
/etc/init.d/bandwidthbydevice enable
/etc/init.d/bandwidthbydevice start
exit 0
EOF

cat > "$BUILDDIR/control/prerm" <<'EOF'
#!/bin/sh
[ -x /etc/init.d/bandwidthbydevice ] || exit 0
/etc/init.d/bandwidthbydevice stop
/etc/init.d/bandwidthbydevice disable
exit 0
EOF

chmod 755 "$BUILDDIR/control/postinst" "$BUILDDIR/control/prerm"

# ---- assemble ---------------------------------------------------------------

printf '2.0\n' > "$BUILDDIR/debian-binary"

(cd "$BUILDDIR/data"    && tar -czf ../data.tar.gz    .)
(cd "$BUILDDIR/control" && tar -czf ../control.tar.gz .)

ar r "$PKG_FILENAME" \
    "$BUILDDIR/debian-binary" \
    "$BUILDDIR/control.tar.gz" \
    "$BUILDDIR/data.tar.gz" 2>/dev/null

echo "Built: $PKG_FILENAME"
