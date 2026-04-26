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

function setStatus(el, status, message, ts) {
  el.className = 'bbd-backup-status bbd-status-' + status;
  el.innerHTML = '';
  var icon = { ok: '✓', error: '✗', running: '…', never: '—' }[status] || '—';
  el.appendChild(E('strong', icon + ' '));
  el.appendChild(document.createTextNode(message));
  if (ts) el.appendChild(E('span', { 'class': 'bbd-status-ts' }, ' — ' + fmtTs(ts)));
}

return view.extend({
  load: function() {
    return Promise.all([
      callGetConfig().catch(function() { return {}; }),
      callGetStatus().catch(function() { return {}; })
    ]);
  },

  render: function(data) {
    injectCSS();

    var cfg    = (data && data[0]) || {};
    var status = (data && data[1]) || {};

    var host       = E('input', { 'id': 'bbd-host',       'class': 'bbd-input', type: 'text',     value: cfg.host         || '', placeholder: 'e.g. 192.168.1.100 or nas.local' });
    var port       = E('input', { 'id': 'bbd-port',       'class': 'bbd-input', type: 'number',   value: cfg.port         || '22', min: 1, max: 65535 });
    var user       = E('input', { 'id': 'bbd-user',       'class': 'bbd-input', type: 'text',     value: cfg.username     || '', placeholder: 'username' });
    var pass       = E('input', { 'id': 'bbd-pass',       'class': 'bbd-input', type: 'password', value: '',               placeholder: cfg.username ? '(unchanged)' : 'password' });
    var rpath      = E('input', { 'id': 'bbd-rpath',      'class': 'bbd-input', type: 'text',     value: cfg.remote_path  || '', placeholder: '/ (home directory)' });
    var autoBackup = E('input', { 'id': 'bbd-auto-backup','class': 'bbd-input', type: 'checkbox', checked: cfg.auto_backup === '1' ? '' : null });

    var saveBtn    = E('button', { 'class': 'bbd-btn' },              'Save Settings');
    var persistBtn = E('button', { 'class': 'bbd-btn bbd-btn-primary' }, 'Persist Now');

    var statusEl = E('div', { 'class': 'bbd-backup-status bbd-status-' + status.status });
    setStatus(statusEl, status.status || 'never', status.message || 'No data has been persisted yet', status.ts);

    saveBtn.addEventListener('click', function() {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      callSetConfig(
        host.value,
        port.value,
        user.value,
        pass.value || undefined,
        rpath.value,
        autoBackup.checked ? '1' : '0'
      ).then(function() {
        saveBtn.textContent = 'Saved ✓';
        pass.placeholder = '(unchanged)';
        pass.value = '';
        setTimeout(function() {
          saveBtn.textContent = 'Save Settings';
          saveBtn.disabled = false;
        }, 2000);
      }).catch(function() {
        saveBtn.textContent = 'Error — try again';
        saveBtn.disabled = false;
      });
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

    var hint = document.createElement('p');
    hint.className = 'bbd-hint';
    hint.textContent = 'Remote Path is the root directory for persisted data on the server. Leave blank to use the SSH home directory. sshpass must be installed on the router (opkg install sshpass).';

    var settingsSection = document.createElement('div');
    settingsSection.className = 'bbd-section';
    var h3a = document.createElement('h3');
    h3a.textContent = 'Server Settings';
    settingsSection.appendChild(h3a);
    settingsSection.appendChild(formDiv);
    settingsSection.appendChild(hint);
    settingsSection.appendChild(saveBtn);

    var actionRow = document.createElement('div');
    actionRow.className = 'bbd-action-row';
    actionRow.appendChild(persistBtn);

    var statusLabel = document.createElement('div');
    statusLabel.className = 'bbd-status-label';
    statusLabel.textContent = 'Last operation:';

    var persistSection = document.createElement('div');
    persistSection.className = 'bbd-section';
    var h3b = document.createElement('h3');
    h3b.textContent = 'Remote Persistence';
    var desc = document.createElement('p');
    desc.textContent = 'Appends a per-device bandwidth record for the current hour to BandwidthByDevice_OpenWRT.jsonl on the remote server. When auto-persist is enabled this runs every hour, building a complete, ever-growing history file.';
    persistSection.appendChild(h3b);
    persistSection.appendChild(desc);
    persistSection.appendChild(actionRow);
    persistSection.appendChild(statusLabel);
    persistSection.appendChild(statusEl);

    var page = document.createElement('div');
    var h2 = document.createElement('h2');
    h2.textContent = 'Bandwidth by Device — Remote Persistence';
    page.appendChild(h2);
    page.appendChild(settingsSection);
    page.appendChild(persistSection);
    return page;
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
