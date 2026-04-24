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
    "$BUILDDIR/data/usr/share/luci/menu.d" \
    "$BUILDDIR/data/usr/libexec/rpcd" \
    "$BUILDDIR/data/usr/share/rpcd/acl.d" \
    "$BUILDDIR/data/etc/config" \
    "$BUILDDIR/data/etc/init.d" \
    "$BUILDDIR/data/usr/bin" \
    "$BUILDDIR/data/www/luci-static/resources/view/bandwidthbydevice" \
    "$BUILDDIR/data/www/luci-static/resources/bandwidthbydevice"

cp luasrc/menu.d/luci-app-bandwidthbydevice.json \
    "$BUILDDIR/data/usr/share/luci/menu.d/"
cp root/etc/config/bandwidthbydevice \
    "$BUILDDIR/data/etc/config/bandwidthbydevice"
install -m 755 root/usr/libexec/rpcd/bandwidthbydevice \
    "$BUILDDIR/data/usr/libexec/rpcd/bandwidthbydevice"
cp root/usr/share/rpcd/acl.d/luci-app-bandwidthbydevice.json \
    "$BUILDDIR/data/usr/share/rpcd/acl.d/"
install -m 755 root/etc/init.d/bandwidthbydevice \
    "$BUILDDIR/data/etc/init.d/bandwidthbydevice"
install -m 755 root/usr/bin/bbd-collector \
    "$BUILDDIR/data/usr/bin/bbd-collector"
install -m 755 root/usr/bin/bbd-backup \
    "$BUILDDIR/data/usr/bin/bbd-backup"
cp htdocs/luci-static/resources/view/bandwidthbydevice/*.js \
    "$BUILDDIR/data/www/luci-static/resources/view/bandwidthbydevice/"
cp htdocs/luci-static/resources/bandwidthbydevice/chart.min.js \
    htdocs/luci-static/resources/bandwidthbydevice/style.css \
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
rm -rf /tmp/luci-indexcache* /tmp/luci-modulecache/
/etc/init.d/rpcd restart 2>/dev/null
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

(cd "$BUILDDIR/data"    && tar --owner=root --group=root -czf ../data.tar.gz    .)
(cd "$BUILDDIR/control" && tar --owner=root --group=root -czf ../control.tar.gz .)

tar -czf "$PKG_FILENAME" \
    -C "$BUILDDIR" \
    ./debian-binary ./control.tar.gz ./data.tar.gz

echo "Built: $PKG_FILENAME"
