# BandwidthByDevice

An OpenWRT LuCI plugin for intuitive per-device bandwidth monitoring.

## Features

- **Live per-device bandwidth** — auto-discovers every device on the network via ARP (IPv4) and NDP (IPv6) and shows real-time up/down rates
- **Live graphs** — rolling 5-minute sparkline for each device, updated every 10 seconds
- **Historical stats** — daily totals stored persistently; view 24h / 7-day / 30-day bar charts per device
- **Summary stats** — total downloaded, total uploaded, peak download, and peak upload per device
- **Remote persistence** — continuously ships bandwidth records to a remote server in a compact JSONL format, building a complete long-term archive

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

## Remote Persistence

### Philosophy

This project takes a **completionist** approach to bandwidth recording. Routers have limited flash storage, so on-device history is intentionally short — only enough to power the real-time UI. The router's job is not to be an archive; it is to be an accurate real-time sensor that continuously ships data off to a remote server where storage is cheap and unlimited.

The two purposes of this plugin are:
1. **Real-time view** — give an accurate, live picture of who is using bandwidth right now.
2. **Continuous recording** — ship that accurate data to another device for long-term browsing and analysis by an ingestion project.

### How records are persisted

Every hour, the router appends new records to a single growing file on the remote server: `BandwidthByDevice_OpenWRT.jsonl` (inside Remote Path if configured, otherwise in the SSH home directory). Nothing is ever deleted or summarised — every hour of activity is preserved in chronological order in one file, ready to be ingested by an external project for long-term browsing.

### Record format (JSONL)

Each line in every file is a self-contained JSON object representing one device's bandwidth for one hour:

```json
{"ts":1745589600,"period":"2026-04-25T13:00","mac":"aa:bb:cc:dd:ee:ff","hostname":"iPhone","bytes_in":12345678,"bytes_out":9876543}
```

| Field | Type | Description |
|---|---|---|
| `ts` | integer | Unix timestamp when the record was created |
| `period` | string | Start of the hour this record covers (ISO 8601, local time) |
| `mac` | string | Device MAC address |
| `hostname` | string | Hostname from DHCP leases, or IP address if no lease exists |
| `bytes_in` | integer | Bytes downloaded by this device during the hour |
| `bytes_out` | integer | Bytes uploaded by this device during the hour |

Devices with zero activity during an hour are omitted. Each `.jsonl` file can be read line-by-line; no JSON parsing of the whole file is required.

### Requirements

- `sshpass` on the router: `opkg install sshpass`
- SSH access with password auth to the remote server (SCP is used for transfers; SSH exec is used for the daily/monthly/yearly roll-up merges)

## Dependencies

- `nftables` / `nft` (standard on OpenWRT 21.02+)
- `luci-base`
- Chart.js (bundled — included in repo)

## License

MIT
