# BandwidthByDevice — Smart Home API

BandwidthByDevice can push live bandwidth data to a smart-home server every 10 seconds. This document describes the HTTP API that the server must implement to receive those pushes.

## Overview

When **Smart Home** mode is enabled in the Backup settings, the router's `bbd-collector` daemon fires an HTTP POST every 10 seconds to a URL you configure. The body contains the current bandwidth usage for every device that transferred at least one byte during that interval.

The push is fire-and-forget: the router does not retry on failure. If a push is missed (e.g. the server is briefly unreachable), that interval is simply lost. The router logs the HTTP response code for each attempt and displays the 20 most recent results in the LuCI UI.

## Request

```
POST <your configured URL>
Content-Type: application/json
Authorization: Bearer <token>   (only if a token is configured)
```

### Body

```json
{
  "ts": 1745589600,
  "devices": [
    {
      "mac": "aa:bb:cc:dd:ee:ff",
      "hostname": "iPhone",
      "down": 1482763,
      "up": 94021
    },
    {
      "mac": "bb:cc:dd:ee:ff:00",
      "hostname": "Laptop",
      "down": 204800,
      "up": 8192
    }
  ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `ts` | integer | Unix timestamp (seconds since epoch) when this snapshot was taken |
| `devices` | array | Devices that transferred at least 1 byte during this interval |
| `devices[].mac` | string | Device MAC address, lowercase colon-separated (`aa:bb:cc:dd:ee:ff`) |
| `devices[].hostname` | string | Hostname from DHCP leases, or the device's IP address if no lease exists |
| `devices[].down` | integer | Bytes **downloaded** by this device in the last ~10 seconds (LAN → device) |
| `devices[].up` | integer | Bytes **uploaded** by this device in the last ~10 seconds (device → WAN) |

### Key behaviours

- **Interval is approximately 10 seconds**, not exactly. The daemon sleeps 10 seconds between loop iterations but the actual wall-clock gap may be slightly longer due to processing time.
- **Only active devices are included.** A device with zero bytes in both directions during the interval is omitted from `devices`. The array may be empty (`[]`) if no device transferred any bytes.
- **IPv4 and IPv6 are combined.** A device that uses both (e.g. an Apple device making an IPv6 connection) has both counters summed into a single entry identified by MAC address.
- **`hostname` may change** if the device renews its DHCP lease with a different name, or if DHCP lease information is not yet available (in which case the IP address is used as the hostname).
- **`ts` is the router's local clock.** Ensure the router's time is synced (NTP) if you need accurate timestamps.

## Response

The router only checks whether the HTTP response status code is in the 2xx range. The response body is ignored entirely.

| Status | Router behaviour |
|---|---|
| 2xx (e.g. 200, 202, 204) | Logged as success |
| Any other status or network error | Logged as failure; no retry |

Return any 2xx status to acknowledge receipt. There is no handshake or session — each POST is independent.

## Authentication

If a Bearer token is configured in the LuCI settings, the router sends:

```
Authorization: Bearer <token>
```

If no token is configured, the `Authorization` header is omitted entirely. The token is stored in UCI config on the router and is never logged.

## Timeout

The router waits at most **8 seconds** for the server to respond. If the server does not respond within that window the request is abandoned and logged as an error (code 0). Since a new push fires every 10 seconds, a slow server will cause every other push to be dropped. Keep response times well under 1 second.

## Example implementations

### Home Assistant webhook

Create an automation triggered by a webhook, then use the configured webhook URL as the Server URL in BandwidthByDevice.

Home Assistant exposes webhooks at:
```
https://<your-ha-instance>/api/webhook/<webhook-id>
```

The automation trigger will receive the full JSON body. You can then use template actions to update `input_number` helpers or fire events based on `trigger.json.devices`.

### Minimal Python server (for testing)

```python
from http.server import HTTPServer, BaseHTTPRequestHandler
import json

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        print(f"ts={body['ts']} devices={body['devices']}")
        self.send_response(200)
        self.end_headers()

HTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
```

### Express (Node.js)

```js
const express = require('express');
const app = express();
app.use(express.json());

app.post('/bbd', (req, res) => {
  const { ts, devices } = req.body;
  for (const d of devices) {
    console.log(`${d.hostname} — ↓${d.down} ↑${d.up} bytes`);
  }
  res.sendStatus(200);
});

app.listen(8080);
```

## Setup on the router

1. In LuCI go to **Status → Bandwidth by Device → Backup**
2. Select **Smart Home** mode
3. Enter the **Server URL** (the full URL your server listens on)
4. Optionally enter a **Bearer Token** if your server requires authentication
5. Click **Save Settings**
6. Install curl if not already present: `opkg install curl`

The "Recent requests" log below the settings shows the timestamp and HTTP response code for the last 20 pushes, updated every 11 seconds.
