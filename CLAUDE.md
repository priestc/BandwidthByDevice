# BandwidthByDevice — development notes

OpenWRT LuCI plugin for per-device bandwidth monitoring. Targets modern
OpenWRT (21.02+) with the JavaScript-only LuCI frontend. No Lua runtime
required on the router.

## Quick deployment (preferred for active development)

```sh
chmod +x deploy.sh   # first time only
./deploy.sh
```

This uses `rsync` over SSH to push only changed files to the router and
restart the affected services. The router must be reachable as `router`
via `~/.ssh/config`. To target a different host:

```sh
./deploy.sh myrouterhostname
```

`/etc/config/bandwidthbydevice` on the router is never overwritten by
deploy.sh, so backup credentials and other live settings survive
repeated deploys.

After deploying, **hard-refresh** LuCI in the browser (Cmd+Shift+R /
Ctrl+Shift+R) — the browser caches JS views aggressively.

## File layout → router destinations

| Repo path | Router path |
|-----------|-------------|
| `htdocs/luci-static/resources/view/bandwidthbydevice/` | `/www/luci-static/resources/view/bandwidthbydevice/` |
| `htdocs/luci-static/resources/bandwidthbydevice/` | `/www/luci-static/resources/bandwidthbydevice/` |
| `luasrc/menu.d/` | `/usr/share/luci/menu.d/` |
| `root/usr/bin/bbd-collector` | `/usr/bin/bbd-collector` |
| `root/usr/bin/bbd-backup` | `/usr/bin/bbd-backup` |
| `root/usr/libexec/rpcd/bandwidthbydevice` | `/usr/libexec/rpcd/bandwidthbydevice` |
| `root/usr/share/rpcd/acl.d/` | `/usr/share/rpcd/acl.d/` |
| `root/etc/init.d/bandwidthbydevice` | `/etc/init.d/bandwidthbydevice` |
| `root/etc/config/bandwidthbydevice` | `/etc/config/bandwidthbydevice` (first deploy only) |

## When a service restart is required

| Changed file | What deploy.sh already does |
|---|---|
| `*.js` / `style.css` | Cache cleared — browser refresh is enough |
| `bbd-collector` | Service restarted automatically |
| `rpcd/bandwidthbydevice` or ACL | rpcd restarted automatically |
| `menu.d` JSON | LuCI module cache cleared — browser refresh is enough |
| `init.d/bandwidthbydevice` | Next manual start/stop picks it up |

## Cutting a release (for end-user installs via LuCI)

```sh
git tag v0.X.Y && git push origin v0.X.Y
```

GitHub Actions builds the `.ipk` and attaches it to the release. Users
install via LuCI → System → Software → "Download and install package"
with the release asset URL, or via SSH:

```sh
opkg install https://github.com/priestc/BandwidthByDevice/releases/download/vX.Y.Z/luci-app-bandwidthbydevice_X.Y.Z-1_all.ipk
```

## Architecture

- **bbd-collector** — shell daemon; discovers devices via `/proc/net/arp`,
  installs per-IP `iptables` rules in `BBD_IN`/`BBD_OUT` chains, samples
  byte counters every 10 s, writes JSON to `/tmp/bandwidthbydevice/`.
  Persists daily totals and a known-devices registry to `/etc/bandwidthbydevice/`.

- **rpcd plugin** (`/usr/libexec/rpcd/bandwidthbydevice`) — exposes
  `devices`, `stats`, `history`, and backup methods over ubus so LuCI JS
  views can call them via `rpc.declare()`.

- **LuCI views** — three JS views: `overview` (device list + badges),
  `device` (live chart + history), `backup` (SFTP/SCP backup & restore).

- **bbd-backup** — backup/restore script; uses a temp netrc file so
  credentials never appear in the process list.
