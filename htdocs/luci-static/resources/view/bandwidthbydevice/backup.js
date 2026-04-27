'use strict';
'require view';
'require rpc';
'require ui';

var callGetConfig = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'get_backup_config'
});

var callSetConfig = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'set_backup_config',
  params: ['host', 'port', 'username', 'password', 'remote_path', 'auto_backup']
});

var callRunPersist = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'run_backup'
});

var callGetStatus = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'get_backup_status'
});

var callGetStorageInfo = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'get_storage_info'
});

var callSetInterval = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'set_interval',
  params: ['interval']
});

function injectCSS() {
  if (document.getElementById('bbd-styles')) return;
  var link = document.createElement('link');
  link.id = 'bbd-styles';
  link.rel = 'stylesheet';
  link.href = L.resource('bandwidthbydevice/style.css');
  document.head.appendChild(link);
}

function fmtTs(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleString();
}

function fmtBytes(b) {
  b = b || 0;
  if (b >= 1073741824) return (b / 1073741824).toFixed(2) + ' GB';
  if (b >= 1048576)    return (b / 1048576).toFixed(2) + ' MB';
  if (b >= 1024)       return (b / 1024).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtInterval(secs) {
  secs = parseInt(secs, 10) || 10;
  if (secs < 60) return secs + ' second' + (secs === 1 ? '' : 's');
  var m = Math.floor(secs / 60), s = secs % 60;
  if (s === 0) return m + ' minute' + (m === 1 ? '' : 's');
  return m + 'm ' + s + 's';
}

function fmtDuration(secs) {
  if (secs < 60)   return secs + 's';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ' + (secs % 60) + 's';
  var h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h + 'h ' + m + 'm';
}

function setStatus(el, status, message, ts) {
  el.className = 'bbd-backup-status bbd-status-' + status;
  el.innerHTML = '';
  var icon = { ok: '✓', error: '✗', running: '…', never: '—' }[status] || '—';
  el.appendChild(E('strong', icon + ' '));
  el.appendChild(document.createTextNode(message));
  if (ts) el.appendChild(E('span', { 'class': 'bbd-status-ts' }, ' — ' + fmtTs(ts)));
}

function renderStorageInfo(info) {
  info = info || {};
  var YEAR = 365 * 24 * 3600;

  var elapsed = (info.buf_end_ts || 0) - (info.buf_start_ts || 0);
  var hasRate  = elapsed >= 60 && (info.buf_size || 0) > 0;

  var rawYearEl, rawRateEl, sumYearEl;

  if (hasRate) {
    var bps = info.buf_size / elapsed;                    // bytes/sec fill rate
    rawYearEl = fmtBytes(Math.round(bps * YEAR));

    var flushSec = (info.buf_limit_kb * 1024) / bps;     // seconds between flushes
    var flushesPerYear = YEAR / flushSec;
    var entryBytes = 60;                                  // ~60 B per summary entry
    sumYearEl = Math.round(flushesPerYear) + ' entries/device (~' +
      fmtBytes(Math.round(flushesPerYear * entryBytes)) + '/device)';

    var ratePerHour = bps * 3600;
    rawRateEl = fmtBytes(Math.round(ratePerHour)) + '/hr  ·  ' +
      'flush every ~' + fmtDuration(Math.round(flushSec));
  } else {
    rawYearEl = sumYearEl = 'insufficient data for projection';
    rawRateEl = '—';
  }

  function stat(label, value) {
    return E('div', { 'class': 'bbd-storage-stat' }, [
      E('span', { 'class': 'bbd-storage-label' }, label),
      E('span', { 'class': 'bbd-storage-value' }, value)
    ]);
  }

  var bufSince = info.buf_start_ts
    ? new Date(info.buf_start_ts * 1000).toLocaleTimeString() +
      ' (' + fmtDuration(Math.round(Date.now() / 1000 - info.buf_start_ts)) + ' ago)'
    : '—';

  return E('div', { 'class': 'bbd-storage-grid' }, [
    E('div', { 'class': 'bbd-storage-col' }, [
      E('h4', 'Raw 10-second buffer (RAM → remote)'),
      stat('Current size',    fmtBytes(info.buf_size) + '  ·  ' + (info.buf_lines || 0).toLocaleString() + ' records'),
      stat('Accumulating since', bufSince),
      stat('Fill rate',       rawRateEl),
      stat('Projected annual remote size', rawYearEl)
    ]),
    E('div', { 'class': 'bbd-storage-col' }, [
      E('h4', 'Interval summaries (flash)'),
      stat('Current size',    fmtBytes(info.summary_size) + '  ·  ' + (info.summary_count || 0) + ' device file' + ((info.summary_count === 1) ? '' : 's')),
      stat('Max on-device',   '500 entries × ~60 B ≈ ' + fmtBytes(500 * 60) + ' per device'),
      stat('Projected annual growth', sumYearEl)
    ])
  ]);
}

return view.extend({
  load: function() {
    return Promise.all([
      callGetConfig().catch(function() { return {}; }),
      callGetStatus().catch(function() { return {}; }),
      callGetStorageInfo().catch(function() { return {}; })
    ]);
  },

  render: function(data) {
    injectCSS();

    var cfg     = (data && data[0]) || {};
    var status  = (data && data[1]) || {};
    var storage = (data && data[2]) || {};

    // ── Server Settings ───────────────────────────────────────────────────────

    var host       = E('input', { 'id': 'bbd-host',  'class': 'bbd-input', type: 'text',     value: cfg.host         || '', placeholder: 'e.g. 192.168.1.100 or nas.local' });
    var port       = E('input', { 'id': 'bbd-port',  'class': 'bbd-input', type: 'number',   value: cfg.port         || '22', min: 1, max: 65535 });
    var user       = E('input', { 'id': 'bbd-user',  'class': 'bbd-input', type: 'text',     value: cfg.username     || '', placeholder: 'username' });
    var pass       = E('input', { 'id': 'bbd-pass',  'class': 'bbd-input', type: 'password', value: '',               placeholder: cfg.username ? '(unchanged)' : 'password' });
    var rpath      = E('input', { 'id': 'bbd-rpath', 'class': 'bbd-input', type: 'text',     value: cfg.remote_path  || '', placeholder: '/ (home directory)' });
    var autoBackup = E('input', { 'id': 'bbd-auto',  'class': 'bbd-input', type: 'checkbox', checked: cfg.auto_backup === '1' ? '' : null });

    var saveBtn    = E('button', { 'class': 'bbd-btn' },              'Save Settings');
    var persistBtn = E('button', { 'class': 'bbd-btn bbd-btn-primary' }, 'Persist Now');

    var statusEl = E('div', { 'class': 'bbd-backup-status bbd-status-' + (status.status || 'never') });
    setStatus(statusEl, status.status || 'never', status.message || 'No data has been persisted yet', status.ts);

    saveBtn.addEventListener('click', function() {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      callSetConfig(host.value, port.value, user.value, pass.value || undefined,
        rpath.value, autoBackup.checked ? '1' : '0')
      .then(function() {
        saveBtn.textContent = 'Saved ✓';
        pass.placeholder = '(unchanged)';
        pass.value = '';
        setTimeout(function() { saveBtn.textContent = 'Save Settings'; saveBtn.disabled = false; }, 2000);
      }).catch(function() { saveBtn.textContent = 'Error — try again'; saveBtn.disabled = false; });
    });

    persistBtn.addEventListener('click', function() {
      persistBtn.disabled = true;
      persistBtn.textContent = 'Persisting…';
      setStatus(statusEl, 'running', 'Persisting current hour…', null);
      callRunPersist().then(function(result) {
        setStatus(statusEl, result.status, result.message, result.ts);
        persistBtn.textContent = 'Persist Now';
        persistBtn.disabled = false;
      }).catch(function() {
        setStatus(statusEl, 'error', 'RPC call failed', null);
        persistBtn.textContent = 'Persist Now';
        persistBtn.disabled = false;
      });
    });

    function row(labelText, inputEl) {
      var d = document.createElement('div');
      d.className = 'bbd-form-row';
      var l = document.createElement('label');
      l.className = 'bbd-form-label';
      l.textContent = labelText;
      d.appendChild(l);
      d.appendChild(inputEl);
      return d;
    }

    var formDiv = document.createElement('div');
    formDiv.appendChild(row('Host',                  host));
    formDiv.appendChild(row('Port',                  port));
    formDiv.appendChild(row('Username',              user));
    formDiv.appendChild(row('Password',              pass));
    formDiv.appendChild(row('Remote Path',           rpath));
    formDiv.appendChild(row('Auto-persist (hourly)', autoBackup));

    var hint = E('p', { 'class': 'bbd-hint' },
      'Remote Path is the root directory for persisted data. Leave blank to use the SSH home directory. sshpass must be installed (opkg install sshpass).');

    var settingsSection = E('div', { 'class': 'bbd-section' }, [
      E('h3', 'Server Settings'),
      formDiv, hint, saveBtn
    ]);

    var persistSection = E('div', { 'class': 'bbd-section' }, [
      E('h3', 'Remote Persistence'),
      E('p', {}, 'Appends a per-device bandwidth record for the current hour to BandwidthByDevice_OpenWRT.jsonl on the remote server. Raw 10-second data flushes automatically to BandwidthByDevice_OpenWRT_raw.jsonl when the buffer limit is reached.'),
      E('div', { 'class': 'bbd-action-row' }, [persistBtn]),
      E('div', { 'class': 'bbd-status-label' }, 'Last operation:'),
      statusEl
    ]);

    // ── Sampling Interval ─────────────────────────────────────────────────────

    var intervalInput = E('input', {
      'class': 'bbd-input bbd-interval-input',
      'type': 'number',
      'min': '1', 'max': '1800',
      'value': String(storage.interval || 10)
    });
    var intervalLabel = E('span', { 'class': 'bbd-interval-hint' },
      fmtInterval(storage.interval || 10));
    var intervalSaveBtn = E('button', { 'class': 'bbd-btn bbd-btn-primary' }, 'Set');

    intervalInput.addEventListener('input', function() {
      intervalLabel.textContent = fmtInterval(this.value);
    });

    var intervalErrEl = E('span', { 'class': 'bbd-hint', 'style': 'color:#dc2626;margin-left:8px;' }, '');

    intervalSaveBtn.addEventListener('click', function() {
      var v = parseInt(intervalInput.value, 10);
      if (isNaN(v) || v < 1 || v > 1800) return;
      intervalSaveBtn.disabled = true;
      intervalSaveBtn.textContent = 'Saving…';
      intervalErrEl.textContent = '';
      callSetInterval(String(v)).then(function(res) {
        if (res && res.result === 'ok') {
          intervalSaveBtn.textContent = 'Set ✓';
          setTimeout(function() { intervalSaveBtn.textContent = 'Set'; intervalSaveBtn.disabled = false; }, 2000);
        } else {
          intervalSaveBtn.textContent = 'Set';
          intervalSaveBtn.disabled = false;
          intervalErrEl.textContent = 'Error: ' + (res && res.message ? res.message : JSON.stringify(res));
        }
      }).catch(function(err) {
        intervalSaveBtn.textContent = 'Set';
        intervalSaveBtn.disabled = false;
        intervalErrEl.textContent = 'Error: ' + (err && err.message ? err.message : String(err));
      });
    });

    var samplingSection = E('div', { 'class': 'bbd-section' }, [
      E('h3', 'Sampling Interval'),
      E('p', { 'class': 'bbd-hint' },
        'How often the collector samples bandwidth. Shorter intervals give finer data but fill the raw buffer faster and increase router CPU load. Range: 1 second – 30 minutes.'),
      E('div', { 'class': 'bbd-form-row' }, [
        E('label', { 'class': 'bbd-form-label' }, 'Sample every'),
        E('div', { 'style': 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' }, [
          intervalInput,
          E('span', { 'class': 'bbd-form-label', 'style': 'width:auto;color:#555;' }, 'seconds'),
          intervalLabel,
          intervalSaveBtn,
          intervalErrEl
        ])
      ])
    ]);

    // ── Storage Info ──────────────────────────────────────────────────────────

    var storageSection = E('div', { 'class': 'bbd-section' }, [
      E('h3', 'Storage'),
      renderStorageInfo(storage)
    ]);

    // ── Page assembly ─────────────────────────────────────────────────────────

    var page = document.createElement('div');
    var h2 = document.createElement('h2');
    h2.textContent = 'Bandwidth by Device — Remote Persistence';
    page.appendChild(h2);
    page.appendChild(settingsSection);
    page.appendChild(persistSection);
    page.appendChild(samplingSection);
    page.appendChild(storageSection);
    return page;
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
