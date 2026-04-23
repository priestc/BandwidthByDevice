'use strict';
'require view';
'require rpc';
'require poll';

var callDevices = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'devices',
  expect: { devices: [] }
});

function injectCSS() {
  if (document.getElementById('bbd-styles')) return;
  var link = document.createElement('link');
  link.id = 'bbd-styles';
  link.rel = 'stylesheet';
  link.href = L.resource('bandwidthbydevice/style.css');
  document.head.appendChild(link);
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
    return (b.down_bytes + b.up_bytes) - (a.down_bytes + a.up_bytes);
  });

  var maxBw = Math.max.apply(null, devices.map(function(d) {
    return d.down_bytes + d.up_bytes;
  })) || 1;

  devices.forEach(function(dev) {
    var barPct = Math.round(((dev.down_bytes + dev.up_bytes) / maxBw) * 100);
    container.appendChild(E('div', { 'class': 'bbd-device-card' }, [
      E('a', {
        'class': 'bbd-device-name',
        'href': L.url('admin/status/bandwidthbydevice/device') + '?mac=' + encodeURIComponent(dev.mac)
      }, dev.hostname || dev.ip),
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

    poll.add(function() {
      return callDevices().then(function(devices) {
        renderDevices(container, devices);
      });
    }, 10);

    return E('div', {}, [
      E('h2', 'Bandwidth by Device'),
      container
    ]);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
