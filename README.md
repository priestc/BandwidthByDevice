# BandwidthByDevice

An OpenWRT LuCI plugin for intuitive per-device bandwidth monitoring.

## Features

- **Live per-device bandwidth** — auto-discovers every device on the network via ARP (IPv4) and NDP (IPv6) and shows real-time up/down rates
- **Live graphs** — rolling 5-minute sparkline for each device, updated every 10 seconds
- **Historical stats** — daily totals stored persistently; view 24h / 7-day / 30-day bar charts per device
- **Summary stats** — total downloaded, total uploaded, peak download, and peak upload per device
- **Backup & export** — download a full history snapshot as a single JSON file, or auto-push it hourly to a remote server via SCP
- **Smart Home integration** — pushes live per-device bandwidth to any HTTP endpoint every 10 seconds ([API docs](docs/smarthome-api.md))

## How it works

A background daemon (`bbd-collector`) installs `nftables` accounting rules for each device IP it discovers, using the `inet` family so IPv4 and IPv6 are both tracked in a single rule set without requiring `ip6tables` (not installed on many OpenWRT builds). IPv4 addresses are found via the ARP table; IPv6 global-unicast addresses are found via the NDP neighbor cache (`ip -6 neigh`). Both v4 and v6 byte counts are summed per device so traffic that travels over IPv6 (common with Apple devices and modern services) is fully captured. Every 10 seconds the daemon reads the cumulative byte counters, computes per-interval deltas, and writes JSON to `/tmp/bandwidthbydevice/`. Once per hour it also flushes daily totals to `/etc/bandwidthbydevice/` for persistence across reboots.

The LuCI frontend polls three JSON API endpoints:

| Endpoint | Returns |
|---|---|
| `api/devices` | All devices with current interval bytes |
| `api/stats?mac=…` | Rolling ~360-sample buffer for one device |
| `api/history?mac=…` | Daily totals (up to 90 days) for one device |

## Installation

### Via LuCI (recommended)

1. Download the latest `.ipk` from the [Releases](https://github.com/priestc/BandwidthByDevice/releases) page
2. In LuCI go to **System → Software**, paste the URL into **Download and install package**, and click **OK**

### Via opkg

```sh
opkg install https://github.com/priestc/BandwidthByDevice/releases/latest/download/luci-app-bandwidthbydevice_<version>-1_all.ipk
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

## Backup & Export

In LuCI go to **Status → Bandwidth by Device → Backup** to manage data export.

### Download

Click **Download Backup** to get a `BandwidthByDevice.json` snapshot containing daily totals for every known device. No server required.

### Auto Remote (hourly SCP)

Automatically push the backup file to a remote server once per hour via SCP. Requires `sshpass` on the router (`opkg install sshpass`) and SSH password auth on the remote server. The remote file is replaced each hour — it is always a current snapshot, not an append-only log.

### Smart Home (live push every 10 seconds)

Push live per-device bandwidth to any HTTP endpoint every 10 seconds. Useful for integrating with Home Assistant or any other home-automation platform. Requires `curl` on the router (`opkg install curl`).

See [docs/smarthome-api.md](docs/smarthome-api.md) for the full API specification.

## Dependencies

- `nftables` / `nft` (standard on OpenWRT 21.02+)
- `luci-base`
- Chart.js (bundled — included in repo)

## License

MIT
