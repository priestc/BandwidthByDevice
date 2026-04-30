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
  params: ['host', 'port', 'username', 'password', 'remote_path', 'mode', 'smarthome_url', 'smarthome_token']
});

var callRunBackup = rpc.declare({
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

var callGetBackupData = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'get_backup_data'
});

var callGetSmarthomeLog = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'get_smarthome_log'
});

var callGetBackupLog = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'get_backup_log'
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

function setStatus(el, status, message, ts) {
  el.className = 'bbd-backup-status bbd-status-' + (status || 'never');
  el.innerHTML = '';
  var icon = { ok: '✓', error: '✗', running: '…', never: '—' }[status] || '—';
  el.appendChild(E('strong', icon + ' '));
  el.appendChild(document.createTextNode(message || ''));
  if (ts) el.appendChild(E('span', { 'class': 'bbd-status-ts' }, ' — ' + fmtTs(ts)));
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
    var mode    = cfg.mode || 'none';

    // ── Download button ────────────────────────────────────────────────────────

    var fileSizeEl = E('span', { 'class': 'bbd-hint' },
      'BandwidthByDevice.json · ' + fmtBytes(storage.file_bytes));

    var dlBtn = E('button', { 'class': 'bbd-btn bbd-btn-primary' }, '↓ Download Backup');

    dlBtn.addEventListener('click', function() {
      dlBtn.disabled = true;
      dlBtn.textContent = 'Generating…';
      callGetBackupData().then(function(result) {
        dlBtn.textContent = '↓ Download Backup';
        dlBtn.disabled = false;
        if (!result || !result.data) {
          ui.addNotification(null, E('p', 'Failed to generate backup file.'), 'error');
          return;
        }
        var content = JSON.stringify(result.data, null, 2);
        var blob = new Blob([content], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = result.filename || 'BandwidthByDevice.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        fileSizeEl.textContent = 'BandwidthByDevice.json · ' + fmtBytes(content.length);
      }).catch(function(err) {
        dlBtn.textContent = '↓ Download Backup';
        dlBtn.disabled = false;
        ui.addNotification(null,
          E('p', 'Download failed: ' + (err && err.message ? err.message : String(err))),
          'error');
      });
    });

    var downloadSection = E('div', { 'class': 'bbd-section' }, [
      E('h3', 'Backup File'),
      E('p', { 'class': 'bbd-hint' },
        'A snapshot of all device bandwidth history stored on this router. Contains daily totals for every known device.'),
      E('div', { 'class': 'bbd-action-row', 'style': 'align-items:center;gap:12px;' }, [
        dlBtn, fileSizeEl
      ])
    ]);

    // ── Backup Mode ────────────────────────────────────────────────────────────

    function makeRadio(id, value, label, checked) {
      var radio = E('input', {
        type: 'radio', name: 'bbd-mode', id: id, value: value,
        checked: checked ? '' : null
      });
      return E('label', {
        'for': id,
        'style': 'display:flex;align-items:center;gap:6px;cursor:pointer;'
      }, [radio, label]);
    }

    var modeSection = E('div', { 'class': 'bbd-section' }, [
      E('h3', 'Backup Mode'),
      E('div', { 'style': 'display:flex;flex-direction:column;gap:8px;' }, [
        makeRadio('bbd-mode-none',      'none',      'None',           mode === 'none'),
        makeRadio('bbd-mode-remote',    'remote',    'Auto Remote',    mode === 'remote'),
        makeRadio('bbd-mode-smarthome', 'smarthome', 'Smart Home',     mode === 'smarthome')
      ])
    ]);

    // ── Auto Remote Settings ───────────────────────────────────────────────────

    var hostInput  = E('input', { 'class': 'bbd-input', type: 'text',
      value: cfg.host || '', placeholder: 'e.g. 192.168.1.100 or nas.local' });
    var portInput  = E('input', { 'class': 'bbd-input', type: 'number',
      value: cfg.port || '22', min: 1, max: 65535 });
    var userInput  = E('input', { 'class': 'bbd-input', type: 'text',
      value: cfg.username || '', placeholder: 'username' });
    var passInput  = E('input', { 'class': 'bbd-input', type: 'password',
      value: '', placeholder: cfg.username ? '(unchanged)' : 'password' });
    var rpathInput = E('input', { 'class': 'bbd-input', type: 'text',
      value: cfg.remote_path || '', placeholder: '/ (home directory)' });

    var saveBtn  = E('button', { 'class': 'bbd-btn' }, 'Save Settings');
    var syncBtn  = E('button', { 'class': 'bbd-btn bbd-btn-primary' }, 'Sync Now');
    var statusEl = E('div', { 'class': 'bbd-backup-status bbd-status-' + (status.status || 'never') });
    setStatus(statusEl, status.status || 'never',
      status.message || 'Not synced yet', status.ts);

    var remoteSizeEl = E('span', { 'class': 'bbd-hint' },
      status.file_bytes ? 'Last file: ' + fmtBytes(status.file_bytes) : '');

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
    formDiv.appendChild(row('Host',        hostInput));
    formDiv.appendChild(row('Port',        portInput));
    formDiv.appendChild(row('Username',    userInput));
    formDiv.appendChild(row('Password',    passInput));
    formDiv.appendChild(row('Remote Path', rpathInput));

    saveBtn.addEventListener('click', function() {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      callSetConfig(
        hostInput.value, portInput.value, userInput.value,
        passInput.value || undefined, rpathInput.value, 'remote'
      ).then(function() {
        saveBtn.textContent = 'Saved ✓';
        passInput.placeholder = '(unchanged)';
        passInput.value = '';
        setTimeout(function() {
          saveBtn.textContent = 'Save Settings';
          saveBtn.disabled = false;
        }, 2000);
      }).catch(function(err) {
        saveBtn.textContent = 'Error — try again';
        saveBtn.disabled = false;
        ui.addNotification(null,
          E('p', 'Save failed: ' + (err && err.message ? err.message : String(err))),
          'error');
      });
    });

    var backupLogEl = E('div', { 'class': 'bbd-sm-log' },
      E('span', { 'class': 'bbd-hint' }, 'No syncs yet.'));

    function updateBackupLog() {
      callGetBackupLog().then(function(result) {
        var entries = (result && result.entries) || [];
        backupLogEl.innerHTML = '';
        if (!Array.isArray(entries) || entries.length === 0) {
          backupLogEl.appendChild(E('span', { 'class': 'bbd-hint' }, 'No syncs yet.'));
          return;
        }
        entries.slice().reverse().forEach(function(e) {
          var ok    = e.status === 'ok';
          var color = ok ? '#16a34a' : '#dc2626';
          var row = E('div', { 'class': 'bbd-sm-log-row' }, [
            E('span', { 'class': 'bbd-sm-log-ts' }, fmtTs(e.ts)),
            E('span', { 'style': 'color:#555;font-size:0.85em;padding:0 0.5em;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }, e.message || ''),
            E('span', { 'style': 'color:' + color + ';font-weight:600;white-space:nowrap;' }, ok ? 'ok' : 'error')
          ]);
          backupLogEl.appendChild(row);
        });
      }).catch(function(err) {
        ui.addNotification(null,
          E('p', 'Failed to load backup log: ' + (err && err.message ? err.message : String(err))),
          'error');
      });
    }

    syncBtn.addEventListener('click', function() {
      syncBtn.disabled = true;
      syncBtn.textContent = 'Syncing…';
      setStatus(statusEl, 'running', 'Syncing…', null);
      callRunBackup().then(function(result) {
        setStatus(statusEl, result.status, result.message, result.ts);
        if (result.file_bytes) {
          remoteSizeEl.textContent = 'Last file: ' + fmtBytes(result.file_bytes);
        }
        syncBtn.textContent = 'Sync Now';
        syncBtn.disabled = false;
        updateBackupLog();
      }).catch(function(err) {
        setStatus(statusEl, 'error',
          'RPC call failed: ' + (err && err.message ? err.message : String(err)), null);
        syncBtn.textContent = 'Sync Now';
        syncBtn.disabled = false;
      });
    });

    var remoteSection = E('div', {
      'class': 'bbd-section',
      'id': 'bbd-remote-section',
      'style': mode === 'remote' ? '' : 'display:none'
    }, [
      E('h3', 'Auto Remote Settings'),
      E('p', { 'class': 'bbd-hint' },
        'The backup file is pushed to the remote server every hour via SCP, replacing the previous copy. Requires sshpass (opkg install sshpass).'),
      formDiv,
      saveBtn,
      E('hr', { 'style': 'margin:16px 0;border:none;border-top:1px solid #e5e7eb;' }),
      E('div', { 'class': 'bbd-action-row', 'style': 'align-items:center;gap:12px;' }, [
        syncBtn, remoteSizeEl
      ]),
      E('h4', { 'style': 'margin:16px 0 6px;' }, 'Recent syncs'),
      backupLogEl
    ]);

    // ── Smart Home panel ───────────────────────────────────────────────────────

    var shUrlInput   = E('input', { 'class': 'bbd-input', type: 'text',
      value: cfg.smarthome_url   || '', placeholder: 'https://homeassistant.local/api/webhook/bbd' });
    var shTokenInput = E('input', { 'class': 'bbd-input', type: 'password',
      value: '',
      placeholder: cfg.smarthome_url ? '(unchanged)' : 'optional — leave blank if not needed' });

    var shSaveBtn  = E('button', { 'class': 'bbd-btn' }, 'Save Settings');
    var shLogEl    = E('div', { 'class': 'bbd-sm-log' },
      E('span', { 'class': 'bbd-hint' }, 'No requests sent yet.'));
    var shLogTimer = null;

    function updateSmarthomeLog() {
      callGetSmarthomeLog().then(function(result) {
        var entries = (result && result.entries) || [];
        shLogEl.innerHTML = '';
        if (!Array.isArray(entries) || entries.length === 0) {
          shLogEl.appendChild(E('span', { 'class': 'bbd-hint' }, 'No requests sent yet.'));
          return;
        }
        entries.slice().reverse().forEach(function(e) {
          var code = parseInt(e.code, 10) || 0;
          var ok   = code >= 200 && code < 300;
          var color = ok ? '#16a34a' : '#dc2626';
          var right = E('span', { 'style': 'color:' + color + ';font-weight:600;min-width:3em;text-align:right;' },
            code === 0 ? 'error' : String(code));
          var row = E('div', { 'class': 'bbd-sm-log-row' }, [
            E('span', { 'class': 'bbd-sm-log-ts' }, fmtTs(e.ts)),
            right
          ]);
          if (e.error) {
            var hint = E('span', { 'style': 'color:#6b7280;font-size:0.85em;padding-left:0.5em;' }, e.error);
            row.insertBefore(hint, right);
          }
          shLogEl.appendChild(row);
        });
      }).catch(function() { /* silent — log is best-effort */ });
    }

    shSaveBtn.addEventListener('click', function() {
      shSaveBtn.disabled = true;
      shSaveBtn.textContent = 'Saving…';
      callSetConfig(
        hostInput.value, portInput.value, userInput.value,
        passInput.value || undefined, rpathInput.value,
        'smarthome', shUrlInput.value, shTokenInput.value || undefined
      ).then(function() {
        shSaveBtn.textContent = 'Saved ✓';
        shTokenInput.placeholder = '(unchanged)';
        shTokenInput.value = '';
        setTimeout(function() {
          shSaveBtn.textContent = 'Save Settings';
          shSaveBtn.disabled = false;
        }, 2000);
      }).catch(function(err) {
        shSaveBtn.textContent = 'Error — try again';
        shSaveBtn.disabled = false;
        ui.addNotification(null,
          E('p', 'Save failed: ' + (err && err.message ? err.message : String(err))),
          'error');
      });
    });

    var smarthomeSection = E('div', {
      'class': 'bbd-section',
      'id': 'bbd-smarthome-section',
      'style': mode === 'smarthome' ? '' : 'display:none'
    }, [
      E('h3', 'Smart Home Integration'),
      E('p', { 'class': 'bbd-hint' },
        'POSTs active-device bandwidth to your smart-home server every 10 seconds. ' +
        'Payload: {"ts":…,"devices":[{"mac":…,"hostname":…,"down":…,"up":…}]}. ' +
        'Requires curl on the router (opkg install curl).'),
      (function() {
        var d = document.createElement('div');
        d.appendChild(row('Server URL',   shUrlInput));
        d.appendChild(row('Bearer Token', shTokenInput));
        return d;
      })(),
      shSaveBtn,
      E('h4', { 'style': 'margin:16px 0 6px;' }, 'Recent requests'),
      shLogEl
    ]);

    // ── Mode change handler ────────────────────────────────────────────────────

    modeSection.addEventListener('change', function(e) {
      if (e.target.name !== 'bbd-mode') return;
      var newMode = e.target.value;
      document.getElementById('bbd-remote-section').style.display =
        newMode === 'remote' ? '' : 'none';
      document.getElementById('bbd-smarthome-section').style.display =
        newMode === 'smarthome' ? '' : 'none';
      if (newMode === 'smarthome') {
        updateSmarthomeLog();
        if (!shLogTimer) shLogTimer = setInterval(updateSmarthomeLog, 11000);
      } else {
        clearInterval(shLogTimer);
        shLogTimer = null;
      }
      if (newMode === 'remote') {
        updateBackupLog();
      }
      callSetConfig(
        hostInput.value, portInput.value, userInput.value,
        undefined, rpathInput.value, newMode,
        shUrlInput.value, undefined
      ).catch(function(err) {
        ui.addNotification(null,
          E('p', 'Failed to save mode: ' + (err && err.message ? err.message : String(err))),
          'error');
      });
    });

    if (mode === 'smarthome') {
      updateSmarthomeLog();
      shLogTimer = setInterval(updateSmarthomeLog, 11000);
    }
    if (mode === 'remote') {
      updateBackupLog();
    }

    // ── Page assembly ──────────────────────────────────────────────────────────

    var page = document.createElement('div');
    var h2 = document.createElement('h2');
    h2.textContent = 'Bandwidth by Device — Backup';
    page.appendChild(h2);
    page.appendChild(downloadSection);
    page.appendChild(modeSection);
    page.appendChild(remoteSection);
    page.appendChild(smarthomeSection);
    return page;
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
