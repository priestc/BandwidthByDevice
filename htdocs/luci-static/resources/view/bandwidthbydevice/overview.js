'use strict';
'require view';
'require rpc';
'require poll';

var callDevices = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'devices'
});

function injectCSS() {
  if (document.getElementById('bbd-styles')) return;
  var link = document.createElement('link');
  link.id = 'bbd-styles';
  link.rel = 'stylesheet';
  link.href = L.resource('bandwidthbydevice/style.css');
  document.head.appendChild(link);
}

// Thresholds are in Mbps (download). Order matters — first match wins.
var BW_TIERS = [
  { mbps: 50,   label: '8K Video',    key: '8k'        },
  { mbps: 20,   label: '4K Video',    key: '4k'        },
  { mbps: 8,    label: 'Full HD',     key: 'fhd'       },
  { mbps: 4,    label: 'HD Video',    key: 'hd'        },
  { mbps: 1.5,  label: 'SD Video',   key: 'sd'        },
  { mbps: 0.25, label: 'Music',       key: 'audio'     },
  { mbps: 0.04, label: 'Browsing',    key: 'web'       },
  { mbps: 0,    label: 'Idle',        key: 'idle'      }
];

function classifyBandwidth(downBytes, upBytes, intervalSec) {
  var downMbps = (downBytes / intervalSec) * 8 / 1e6;
  var upMbps   = (upBytes   / intervalSec) * 8 / 1e6;

  // Symmetric traffic where both sides are substantial → video call
  if (downMbps >= 0.5 && upMbps >= 0.5 && upMbps / downMbps > 0.4)
    return { label: 'Video Call', key: 'videocall' };

  for (var i = 0; i < BW_TIERS.length; i++)
    if (downMbps >= BW_TIERS[i].mbps) return BW_TIERS[i];

  return BW_TIERS[BW_TIERS.length - 1];
}

// Per-device rolling window: keep last 30 samples (5 min at 10 s/interval).
// Peak classification uses only the most recent 6 (60 s) so bursty traffic
// doesn't snap the badge back to Idle the instant a burst ends.
// The full 30-sample window is used to compute the 5-minute average rate
// shown while idle_secs < 300.
var sampleHistory = {};
var PEAK_SIZE = 6;
var AVG_SIZE  = 30;

function peakBytes(mac, downBytes, upBytes) {
  if (!sampleHistory[mac]) sampleHistory[mac] = [];
  sampleHistory[mac].push({ d: downBytes || 0, u: upBytes || 0 });
  if (sampleHistory[mac].length > AVG_SIZE) sampleHistory[mac].shift();
  var recent = sampleHistory[mac].slice(-PEAK_SIZE);
  return recent.reduce(function(m, s) {
    return { d: Math.max(m.d, s.d), u: Math.max(m.u, s.u) };
  }, { d: 0, u: 0 });
}

function avgBytes5min(mac) {
  var hist = sampleHistory[mac] || [];
  var totD = 0, totU = 0;
  hist.forEach(function(s) { totD += s.d; totU += s.u; });
  return { d: totD, u: totU, secs: hist.length * 10 };
}

var idleTicker  = null;
var poller      = null;

function fmtIdleTime(ms) {
  var s = Math.floor(ms / 1000);
  if (s < 60) return s + 's';
  var m = Math.floor(s / 60);
  s = s % 60;
  if (m < 60) return m + 'm ' + s + 's';
  return Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

function makeBadge(dev) {
  if (!dev.active) {
    delete sampleHistory[dev.mac];
    return E('span', { 'class': 'bbd-bw-badge bbd-bw-offline' }, 'Offline');
  }
  var peak = peakBytes(dev.mac, dev.down_bytes, dev.up_bytes);
  var tier = classifyBandwidth(peak.d, peak.u, 10);
  if (tier.key === 'idle') {
    if ((dev.idle_secs || 0) < 300) {
      var avg = avgBytes5min(dev.mac);
      if (avg.secs > 0) {
        return E('span', { 'class': 'bbd-bw-badge bbd-bw-idle' },
          '↓ ' + fmtRate(avg.d, avg.secs) + '  ↑ ' + fmtRate(avg.u, avg.secs));
      }
    }
    var idleBase = Date.now() - (dev.idle_secs || 0) * 1000;
    return E('span', {
      'class': 'bbd-bw-badge bbd-bw-idle',
      'data-idle-base': String(idleBase)
    }, 'Idle ' + fmtIdleTime(Date.now() - idleBase));
  }
  return E('span', { 'class': 'bbd-bw-badge bbd-bw-' + tier.key }, tier.label);
}

function fmtRate(bytesPerInterval, intervalSec) {
  var bps = (bytesPerInterval / intervalSec) * 8;
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps';
  if (bps >= 1e6) return (bps / 1e6).toFixed(2) + ' Mbps';
  if (bps >= 1e3) return (bps / 1e3).toFixed(2) + ' Kbps';
  return bps.toFixed(0) + ' bps';
}

function renderDevices(container, devices) {
  while (container.firstChild) container.removeChild(container.firstChild);

  if (!devices || !devices.length) {
    container.appendChild(E('p', 'No devices detected yet. Make sure the bbd-collector service is running.'));
    return;
  }

  devices.sort(function(a, b) {
    return (b.hourly_down + b.hourly_up) - (a.hourly_down + a.hourly_up);
  });

  var maxBw = Math.max.apply(null, devices.map(function(d) {
    return d.down_bytes + d.up_bytes;
  })) || 1;

  devices.forEach(function(dev) {
    var barPct = Math.round(((dev.down_bytes + dev.up_bytes) / maxBw) * 100);
    container.appendChild(E('div', { 'class': 'bbd-device-card' + (dev.active ? '' : ' bbd-inactive') }, [
      E('div', { 'class': 'bbd-card-header' }, [
        E('a', {
          'class': 'bbd-device-name',
          'href': L.url('admin/status/bandwidthbydevice/device') + '?mac=' + encodeURIComponent(dev.mac)
        }, dev.hostname || dev.ip),
        makeBadge(dev)
      ]),
      E('span', { 'class': 'bbd-device-ip' }, dev.ip),
      E('span', { 'class': 'bbd-device-mac' }, dev.mac),
      E('div', { 'class': 'bbd-rate-row' }, [
        E('span', { 'class': 'bbd-down' }, '↓ ' + fmtRate(dev.down_bytes, 10)),
        E('span', { 'class': 'bbd-up'   }, '↑ ' + fmtRate(dev.up_bytes,   10))
      ]),
      E('div', { 'class': 'bbd-bar-track' }, [
        E('div', { 'class': 'bbd-bar-fill', 'style': 'width:' + barPct + '%' })
      ])
    ]));
  });
}

return view.extend({
  render: function() {
    injectCSS();

    var container = E('div', { 'id': 'bbd-device-list' }, [
      E('p', { 'class': 'bbd-loading' }, 'Loading devices...')
    ]);

    var cpuValEl      = E('span', { 'class': 'bbd-cpu-val' }, '—');
    var intervalValEl = E('span', { 'class': 'bbd-interval-val' }, '10s');

    var slider = E('input', {
      'type':  'range',
      'min':   '1',
      'max':   '10',
      'value': '10',
      'class': 'bbd-interval-slider'
    });

    function startPoller(sec) {
      if (poller) poll.remove(poller);
      poller = function() {
        return callDevices().then(function(res) {
          res = res || {};
          if (res.cpu_pct != null) cpuValEl.textContent = res.cpu_pct + '%';
          renderDevices(container, res.devices || []);
        });
      };
      poll.add(poller, sec);
    }

    slider.addEventListener('input', function() {
      var sec = parseInt(this.value, 10);
      intervalValEl.textContent = sec + 's';
      startPoller(sec);
    });

    startPoller(10);

    if (!idleTicker) {
      idleTicker = setInterval(function() {
        document.querySelectorAll('.bbd-bw-idle[data-idle-base]').forEach(function(el) {
          var base = parseInt(el.getAttribute('data-idle-base'), 10);
          el.textContent = 'Idle ' + fmtIdleTime(Date.now() - base);
        });
      }, 1000);
    }

    return E('div', {}, [
      E('h2', 'Bandwidth by Device'),
      E('div', { 'id': 'bbd-controls' }, [
        E('label', { 'class': 'bbd-interval-label' }, [
          'Update: 1s', slider, intervalValEl
        ]),
        E('span', { 'class': 'bbd-cpu' }, ['CPU: ', cpuValEl])
      ]),
      container
    ]);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
