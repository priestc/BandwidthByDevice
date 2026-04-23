include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-bandwidthbydevice
PKG_VERSION:=0.1.0
PKG_RELEASE:=1

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-bandwidthbydevice
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=BandwidthByDevice - Per-device bandwidth monitor
  DEPENDS:=+luci-base +iptables +kmod-ipt-conntrack
  PKGARCH:=all
endef

define Package/luci-app-bandwidthbydevice/description
  A LuCI application that monitors per-device bandwidth usage on your
  OpenWRT router. Shows real-time graphs and historical statistics for
  every device on the network.
endef

define Build/Compile
endef

define Package/luci-app-bandwidthbydevice/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./luasrc/controller/bandwidthbydevice.lua \
		$(1)/usr/lib/lua/luci/controller/

	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/bandwidthbydevice
	$(INSTALL_DATA) ./luasrc/view/bandwidthbydevice/*.htm \
		$(1)/usr/lib/lua/luci/view/bandwidthbydevice/

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./luasrc/menu.d/luci-app-bandwidthbydevice.json \
		$(1)/usr/share/luci/menu.d/

	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./root/etc/init.d/bandwidthbydevice \
		$(1)/etc/init.d/bandwidthbydevice

	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/bbd-collector \
		$(1)/usr/bin/bbd-collector

	$(INSTALL_DIR) $(1)/www/luci-static/resources/bandwidthbydevice
	$(INSTALL_DATA) ./htdocs/luci-static/resources/bandwidthbydevice/* \
		$(1)/www/luci-static/resources/bandwidthbydevice/
endef

$(eval $(call BuildPackage,luci-app-bandwidthbydevice))
