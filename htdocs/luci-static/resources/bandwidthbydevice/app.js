const BBD = (() => {
  let cfg = {};
  let pollTimer = null;
  let liveChart = null;
  let histChart = null;

  // ---- formatting -----------------------------------------------------------

  function fmtBytes(b) {
    if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
    if (b >= 1048576)    return (b / 1048576).toFixed(2)    + ' MB';
    if (b >= 1024)       return (b / 1024).toFixed(2)       + ' KB';
    return b + ' B';
  }

  function fmtRate(bytesPerInterval, intervalSec) {
    const bps = (bytesPerInterval / intervalSec) * 8;
    if (bps >= 1e9)  return (bps / 1e9).toFixed(2)  + ' Gbps';
    if (bps >= 1e6)  return (bps / 1e6).toFixed(2)  + ' Mbps';
    if (bps >= 1e3)  return (bps / 1e3).toFixed(2)  + ' Kbps';
    return bps.toFixed(0) + ' bps';
  }

  function fmtTime(ts) {
    const d = new Date(ts * 1000);
    return d.getHours().toString().padStart(2,'0') + ':' +
           d.getMinutes().toString().padStart(2,'0') + ':' +
           d.getSeconds().toString().padStart(2,'0');
  }

  // ---- API ------------------------------------------------------------------

  async function apiFetch(endpoint, params) {
    const url = new URL(cfg.apiBase + '/' + endpoint, window.location.origin);
    if (params) Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  }

  // ---- overview mode --------------------------------------------------------

  function renderOverview(data) {
    const container = document.getElementById('bbd-device-list');
    if (!data.devices || !data.devices.length) {
      container.innerHTML = '<p>No devices detected yet.</p>';
      return;
    }

    // Sort by combined bandwidth descending
    data.devices.sort((a, b) => (b.down_bytes + b.up_bytes) - (a.down_bytes + a.up_bytes));

    container.innerHTML = data.devices.map(dev => {
      const href = `device?mac=${encodeURIComponent(dev.mac)}`;
      const downRate = fmtRate(dev.down_bytes, 10);
      const upRate   = fmtRate(dev.up_bytes, 10);
      const barMax   = Math.max(...data.devices.map(d => d.down_bytes + d.up_bytes), 1);
      const barPct   = Math.round(((dev.down_bytes + dev.up_bytes) / barMax) * 100);
      return `
        <div class="bbd-device-card">
          <a href="${href}" class="bbd-device-name">${dev.hostname}</a>
          <span class="bbd-device-ip">${dev.ip}</span>
          <span class="bbd-device-mac">${dev.mac}</span>
          <div class="bbd-rate-row">
            <span class="bbd-down">&#8595; ${downRate}</span>
            <span class="bbd-up">&#8593; ${upRate}</span>
          </div>
          <div class="bbd-bar-track"><div class="bbd-bar-fill" style="width:${barPct}%"></div></div>
        </div>`;
    }).join('');

    document.getElementById('bbd-last-updated').textContent =
      'Updated: ' + new Date().toLocaleTimeString();
  }

  function pollOverview() {
    apiFetch('devices').then(renderOverview).catch(console.error);
  }

  // ---- device detail mode ---------------------------------------------------

  function initLiveChart() {
    const ctx = document.getElementById('bbd-live-chart').getContext('2d');
    liveChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          { label: 'Download', data: [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 },
          { label: 'Upload',   data: [], borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)',  fill: true, tension: 0.3 }
        ]
      },
      options: {
        animation: false,
        scales: {
          x: { ticks: { maxTicksLimit: 10 } },
          y: { beginAtZero: true, ticks: {
            callback: v => fmtBytes(v)
          }}
        },
        plugins: { legend: { position: 'top' } }
      }
    });
  }

  function updateLiveChart(samples) {
    // Keep last 30 samples
    const slice = samples.slice(-30);
    liveChart.data.labels = slice.map(s => fmtTime(s.ts));
    liveChart.data.datasets[0].data = slice.map(s => s.down);
    liveChart.data.datasets[1].data = slice.map(s => s.up);
    liveChart.update();
  }

  function initHistChart() {
    const ctx = document.getElementById('bbd-history-chart').getContext('2d');
    histChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: [], datasets: [
        { label: 'Download', data: [], backgroundColor: 'rgba(59,130,246,0.7)' },
        { label: 'Upload',   data: [], backgroundColor: 'rgba(245,158,11,0.7)' }
      ]},
      options: {
        scales: {
          y: { beginAtZero: true, ticks: { callback: v => fmtBytes(v) } }
        },
        plugins: { legend: { position: 'top' } }
      }
    });
  }

  function updateHistChart(daily, range) {
    const now = new Date();
    let days = range === 'week' ? 7 : range === 'month' ? 30 : 1;
    const cutoff = new Date(now - days * 86400 * 1000).toISOString().slice(0,10);
    const filtered = daily.filter(d => d.date >= cutoff);
    histChart.data.labels = filtered.map(d => d.date);
    histChart.data.datasets[0].data = filtered.map(d => d.down);
    histChart.data.datasets[1].data = filtered.map(d => d.up);
    histChart.update();
  }

  function updateSummary(daily) {
    const totalDown = daily.reduce((s, d) => s + (d.down || 0), 0);
    const totalUp   = daily.reduce((s, d) => s + (d.up   || 0), 0);
    const peakDown  = Math.max(...daily.map(d => d.down || 0), 0);
    const peakUp    = Math.max(...daily.map(d => d.up   || 0), 0);
    document.getElementById('bbd-total-down').textContent = fmtBytes(totalDown);
    document.getElementById('bbd-total-up').textContent   = fmtBytes(totalUp);
    document.getElementById('bbd-peak-down').textContent  = fmtBytes(peakDown);
    document.getElementById('bbd-peak-up').textContent    = fmtBytes(peakUp);
  }

  function pollDevice(mac) {
    apiFetch('stats', { mac }).then(data => {
      updateLiveChart(data.samples || []);
    }).catch(console.error);
  }

  function loadHistory(mac, range) {
    apiFetch('history', { mac }).then(data => {
      const daily = data.daily || [];
      updateHistChart(daily, range);
      updateSummary(daily);
    }).catch(console.error);
  }

  function loadDeviceMeta(mac) {
    apiFetch('devices').then(data => {
      const dev = (data.devices || []).find(d => d.mac === mac);
      if (!dev) return;
      document.getElementById('bbd-device-name').textContent = dev.hostname;
      document.getElementById('bbd-device-meta').textContent =
        `${dev.mac}  ·  ${dev.ip}`;
    }).catch(console.error);
  }

  // ---- public init ----------------------------------------------------------

  function init(options) {
    cfg = options;

    if (cfg.mode === 'overview') {
      const sel = document.getElementById('bbd-interval');
      const startPolling = () => {
        if (pollTimer) clearInterval(pollTimer);
        const ms = parseInt(sel.value);
        pollOverview();
        if (ms > 0) pollTimer = setInterval(pollOverview, ms);
      };
      sel.addEventListener('change', startPolling);
      startPolling();

    } else if (cfg.mode === 'device') {
      if (!cfg.mac) {
        document.getElementById('bbd-device-header').innerHTML = '<p>No device specified.</p>';
        return;
      }
      initLiveChart();
      initHistChart();
      loadDeviceMeta(cfg.mac);
      loadHistory(cfg.mac, 'day');
      pollDevice(cfg.mac);
      pollTimer = setInterval(() => pollDevice(cfg.mac), 10000);

      document.querySelectorAll('.bbd-tab').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.bbd-tab').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          loadHistory(cfg.mac, btn.dataset.range);
        });
      });
    }
  }

  return { init };
})();
