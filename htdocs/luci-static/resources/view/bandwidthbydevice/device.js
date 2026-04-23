'use strict';
'require view';
'require rpc';
'require poll';

var callDevices = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'devices',
  expect: { devices: [] }
});

var callStats = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'stats',
  params: ['mac'],
  expect: { samples: [] }
});

var callHistory = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'history',
  params: ['mac'],
  expect: { daily: [] }
});

function injectCSS() {
  if (document.getElementById('bbd-styles')) return;
  var link = document.createElement('link');
  link.id = 'bbd-styles';
  link.rel = 'stylesheet';
  link.href = L.resource('bandwidthbydevice/style.css');
  document.head.appendChild(link);
}

function loadChartJS() {
  return new Promise(function(resolve) {
    if (window.Chart) { resolve(); return; }
    var s = document.createElement('script');
    s.src = L.resource('bandwidthbydevice/chart.min.js');
    s.onload = resolve;
    document.head.appendChild(s);
  });
}

function fmtBytes(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(2)    + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(2)       + ' KB';
  return b + ' B';
}

function fmtTime(ts) {
  var d = new Date(ts * 1000);
  return d.getHours().toString().padStart(2, '0') + ':' +
         d.getMinutes().toString().padStart(2, '0') + ':' +
         d.getSeconds().toString().padStart(2, '0');
}

return view.extend({
  __mac: null,
  __liveChart: null,
  __histChart: null,
  __histRange: 'day',

  load: function() {
    this.__mac = new URLSearchParams(window.location.search).get('mac');
    return loadChartJS();
  },

  render: function() {
    injectCSS();

    var self = this;
    var mac  = this.__mac;

    if (!mac) {
      return E('p', 'No device specified. Go back to the overview and click a device.');
    }

    var nameEl     = E('h3',  { 'id': 'bbd-dev-name'    }, mac);
    var metaEl     = E('p',   { 'id': 'bbd-dev-meta'    }, '');
    var liveCanvas = E('canvas', { 'height': '120' });
    var histCanvas = E('canvas', { 'height': '120' });
    var tdEl = E('span', { 'class': 'bbd-stat-value', 'id': 'bbd-total-down' }, '-');
    var tuEl = E('span', { 'class': 'bbd-stat-value', 'id': 'bbd-total-up'   }, '-');
    var pdEl = E('span', { 'class': 'bbd-stat-value', 'id': 'bbd-peak-down'  }, '-');
    var puEl = E('span', { 'class': 'bbd-stat-value', 'id': 'bbd-peak-up'    }, '-');

    var tabs = ['day', 'week', 'month'].map(function(range) {
      var btn = E('button', { 'class': 'bbd-tab' + (range === 'day' ? ' active' : '') }, {
        day: '24 Hours', week: '7 Days', month: '30 Days'
      }[range]);
      btn.addEventListener('click', function() {
        document.querySelectorAll('.bbd-tab').forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        self.__histRange = range;
        callHistory(mac).then(function(data) { self.__updateHist(data.daily || []); });
      });
      return btn;
    });

    var wrapper = E('div', {}, [
      E('p', {}, E('a', { 'href': L.url('admin/status/bandwidthbydevice') }, '← Back to overview')),
      nameEl, metaEl,
      E('div', { 'class': 'bbd-chart-section' }, [
        E('h4', 'Live Bandwidth (last 5 minutes)'),
        liveCanvas
      ]),
      E('div', { 'class': 'bbd-chart-section' }, [
        E('h4', 'Historical Usage'),
        E('div', { 'id': 'bbd-history-tabs' }, tabs),
        histCanvas
      ]),
      E('div', { 'class': 'bbd-stat-grid' }, [
        E('div', { 'class': 'bbd-stat' }, [ E('span', { 'class': 'bbd-stat-label' }, 'Total Downloaded'), tdEl ]),
        E('div', { 'class': 'bbd-stat' }, [ E('span', { 'class': 'bbd-stat-label' }, 'Total Uploaded'  ), tuEl ]),
        E('div', { 'class': 'bbd-stat' }, [ E('span', { 'class': 'bbd-stat-label' }, 'Peak Download'   ), pdEl ]),
        E('div', { 'class': 'bbd-stat' }, [ E('span', { 'class': 'bbd-stat-label' }, 'Peak Upload'     ), puEl ])
      ])
    ]);

    // Charts need the canvases to be in the DOM first
    setTimeout(function() {
      self.__liveChart = new Chart(liveCanvas.getContext('2d'), {
        type: 'line',
        data: { labels: [], datasets: [
          { label: 'Download', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 },
          { label: 'Upload',   data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',  fill: true, tension: 0.3 }
        ]},
        options: {
          animation: false,
          scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return fmtBytes(v); } } } },
          plugins: { legend: { position: 'top' } }
        }
      });

      self.__histChart = new Chart(histCanvas.getContext('2d'), {
        type: 'bar',
        data: { labels: [], datasets: [
          { label: 'Download', data: [], backgroundColor: 'rgba(59,130,246,0.7)' },
          { label: 'Upload',   data: [], backgroundColor: 'rgba(245,158,11,0.7)' }
        ]},
        options: {
          scales: { y: { beginAtZero: true, ticks: { callback: function(v) { return fmtBytes(v); } } } },
          plugins: { legend: { position: 'top' } }
        }
      });

      callDevices().then(function(devices) {
        var dev = (devices || []).find(function(d) { return d.mac === mac; });
        if (!dev) return;
        nameEl.textContent = dev.hostname || dev.ip;
        metaEl.textContent = dev.mac + '  ·  ' + dev.ip;
      });

      callHistory(mac).then(function(data) {
        self.__updateHist(data.daily || []);
      });
    }, 0);

    poll.add(function() {
      return callStats(mac).then(function(data) {
        if (!self.__liveChart) return;
        var samples = (data.samples || []).slice(-30);
        self.__liveChart.data.labels             = samples.map(function(s) { return fmtTime(s.ts); });
        self.__liveChart.data.datasets[0].data   = samples.map(function(s) { return s.down; });
        self.__liveChart.data.datasets[1].data   = samples.map(function(s) { return s.up; });
        self.__liveChart.update();
      });
    }, 10);

    return wrapper;
  },

  __updateHist: function(daily) {
    if (!this.__histChart) return;
    var days   = this.__histRange === 'week' ? 7 : this.__histRange === 'month' ? 30 : 1;
    var cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 10);
    var slice  = daily.filter(function(d) { return d.date >= cutoff; });

    this.__histChart.data.labels           = slice.map(function(d) { return d.date; });
    this.__histChart.data.datasets[0].data = slice.map(function(d) { return d.down; });
    this.__histChart.data.datasets[1].data = slice.map(function(d) { return d.up;   });
    this.__histChart.update();

    var totalDown = daily.reduce(function(s, d) { return s + (d.down || 0); }, 0);
    var totalUp   = daily.reduce(function(s, d) { return s + (d.up   || 0); }, 0);
    var peakDown  = Math.max.apply(null, daily.map(function(d) { return d.down || 0; }).concat([0]));
    var peakUp    = Math.max.apply(null, daily.map(function(d) { return d.up   || 0; }).concat([0]));

    document.getElementById('bbd-total-down').textContent = fmtBytes(totalDown);
    document.getElementById('bbd-total-up'  ).textContent = fmtBytes(totalUp);
    document.getElementById('bbd-peak-down' ).textContent = fmtBytes(peakDown);
    document.getElementById('bbd-peak-up'   ).textContent = fmtBytes(peakUp);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
