# BandwidthByDevice

An OpenWRT LuCI plugin for intuitive per-device bandwidth monitoring.

## Features

- **Live per-device bandwidth** — auto-discovers every device on the network via the ARP table and shows real-time up/down rates
- **Live graphs** — rolling 5-minute sparkline for each device, updated every 10 seconds
- **Historical stats** — daily totals stored persistently; view 24h / 7-day / 30-day bar charts per device
- **Summary stats** — total downloaded, total uploaded, peak download, and peak upload per device

## How it works

A background daemon (`bbd-collector`) installs `iptables` accounting rules for each device IP it discovers. Every 10 seconds it reads the byte counters, writes JSON to `/tmp/bandwidthbydevice/`, then zeroes the counters so each sample represents a true interval delta. Once per hour the daemon also flushes daily totals to `/etc/bandwidthbydevice/` for persistence across reboots.

The LuCI frontend polls three JSON API endpoints:

| Endpoint | Returns |
|---|---|
| `api/devices` | All devices with current interval bytes |
| `api/stats?mac=…` | Rolling ~360-sample buffer for one device |
| `api/history?mac=…` | Daily totals (up to 90 days) for one device |

## Installation

### From the OpenWRT package feed (once published)

```sh
opkg update
opkg install luci-app-bandwidthbydevice
```

### Manual / development install

```sh
# On your build machine:
git clone https://github.com/priestc/BandwidthByDevice
# Copy into your OpenWRT buildroot feeds/
# Then: make menuconfig → LuCI → Applications → luci-app-bandwidthbydevice

# Or copy files directly onto the router:
scp -r luasrc/  root@192.168.1.1:/usr/lib/lua/luci/
scp root/usr/bin/bbd-collector root@192.168.1.1:/usr/bin/
scp root/etc/init.d/bandwidthbydevice root@192.168.1.1:/etc/init.d/
scp -r htdocs/  root@192.168.1.1:/www/
chmod +x /usr/bin/bbd-collector /etc/init.d/bandwidthbydevice
/etc/init.d/bandwidthbydevice enable
/etc/init.d/bandwidthbydevice start
```

## Dependencies

- `iptables` (standard on OpenWRT)
- `kmod-ipt-conntrack`
- `luci-base`
- Chart.js (bundled — see note below)

> **Chart.js**: The `htdocs/.../chart.min.js` file is not included in this repo.
> Download it from the [Chart.js releases](https://github.com/chartjs/Chart.js/releases)
> and place it at `htdocs/luci-static/resources/bandwidthbydevice/chart.min.js`.

## License

MIT
