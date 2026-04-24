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
  params: ['protocol', 'host', 'port', 'username', 'password', 'remote_path']
});

var callRunBackup = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'run_backup'
});

var callRunRestore = rpc.declare({
  object: 'bandwidthbydevice',
  method: 'run_restore'
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

    var proto   = E('select', { 'id': 'bbd-proto',    'class': 'bbd-input' }, [
      E('option', { value: 'sftp', selected: cfg.protocol !== 'scp' ? '' : null }, 'SFTP (via curl)'),
      E('option', { value: 'scp',  selected: cfg.protocol === 'scp'  ? '' : null }, 'SCP (requires sshpass)')
    ]);
    var host    = E('input', { 'id': 'bbd-host',     'class': 'bbd-input', type: 'text',     value: cfg.host         || '', placeholder: 'e.g. 192.168.1.100 or nas.local' });
    var port    = E('input', { 'id': 'bbd-port',     'class': 'bbd-input', type: 'number',   value: cfg.port         || '22', min: 1, max: 65535 });
    var user    = E('input', { 'id': 'bbd-user',     'class': 'bbd-input', type: 'text',     value: cfg.username     || '', placeholder: 'username' });
    var pass    = E('input', { 'id': 'bbd-pass',     'class': 'bbd-input', type: 'password', value: '',               placeholder: cfg.username ? '(unchanged)' : 'password' });
    var rpath   = E('input', { 'id': 'bbd-rpath',    'class': 'bbd-input', type: 'text',     value: cfg.remote_path  || '/backup/bandwidthbydevice', placeholder: '/backup/bandwidthbydevice' });

    var saveBtn    = E('button', { 'class': 'bbd-btn' },           'Save Settings');
    var backupBtn  = E('button', { 'class': 'bbd-btn bbd-btn-primary' }, 'Backup Now');
    var restoreBtn = E('button', { 'class': 'bbd-btn bbd-btn-danger' },  'Restore from Backup');

    var statusEl = E('div', { 'class': 'bbd-backup-status bbd-status-' + status.status });
    setStatus(statusEl, status.status || 'never', status.message || 'No backup has been run yet', status.ts);

    saveBtn.addEventListener('click', function() {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';
      callSetConfig(
        proto.value,
        host.value,
        port.value,
        user.value,
        pass.value || undefined,
        rpath.value
      ).then(function() {
        saveBtn.textContent = 'Saved ✓';
        pass.placeholder = '(unchanged)';
        pass.value = '';
        setTimeout(function() {
          saveBtn.textContent = 'Save Settings';
          saveBtn.disabled = false;
        }, 2000);
      }).catch(function(err) {
        saveBtn.textContent = 'Error — try again';
        saveBtn.disabled = false;
      });
    });

    backupBtn.addEventListener('click', function() {
      backupBtn.disabled = true;
      backupBtn.textContent = 'Backing up…';
      setStatus(statusEl, 'running', 'Backup in progress…', null);
      callRunBackup().then(function(result) {
        setStatus(statusEl, result.status, result.message, result.ts);
        backupBtn.textContent = 'Backup Now';
        backupBtn.disabled = false;
      }).catch(function() {
        setStatus(statusEl, 'error', 'RPC call failed', null);
        backupBtn.textContent = 'Backup Now';
        backupBtn.disabled = false;
      });
    });

    restoreBtn.addEventListener('click', function() {
      ui.showModal('Restore from Backup', [
        E('p', 'This will overwrite all current bandwidth history with the data from the backup server. This cannot be undone.'),
        E('p', E('strong', 'Are you sure?')),
        E('div', { 'class': 'right' }, [
          E('button', {
            'class': 'btn',
            click: ui.hideModal
          }, 'Cancel'),
          E('button', {
            'class': 'btn cbi-button-negative',
            click: function() {
              ui.hideModal();
              restoreBtn.disabled = true;
              restoreBtn.textContent = 'Restoring…';
              setStatus(statusEl, 'running', 'Restore in progress…', null);
              callRunRestore().then(function(result) {
                setStatus(statusEl, result.status, result.message, result.ts);
                restoreBtn.textContent = 'Restore from Backup';
                restoreBtn.disabled = false;
              }).catch(function() {
                setStatus(statusEl, 'error', 'RPC call failed', null);
                restoreBtn.textContent = 'Restore from Backup';
                restoreBtn.disabled = false;
              });
            }
          }, 'Yes, Restore')
        ])
      ]);
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
    formDiv.appendChild(row('Protocol',    proto));
    formDiv.appendChild(row('Host',        host));
    formDiv.appendChild(row('Port',        port));
    formDiv.appendChild(row('Username',    user));
    formDiv.appendChild(row('Password',    pass));
    formDiv.appendChild(row('Remote Path', rpath));

    var hint = document.createElement('p');
    hint.className = 'bbd-hint';
    hint.textContent = 'Remote Path is the absolute path on the server where the backup file will be stored. The directory must exist. For SCP, sshpass must be installed on the router.';

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
    actionRow.appendChild(backupBtn);
    actionRow.appendChild(restoreBtn);

    var statusLabel = document.createElement('div');
    statusLabel.className = 'bbd-status-label';
    statusLabel.textContent = 'Last operation:';

    var backupSection = document.createElement('div');
    backupSection.className = 'bbd-section';
    var h3b = document.createElement('h3');
    h3b.textContent = 'Backup & Restore';
    var desc = document.createElement('p');
    desc.textContent = 'Backup saves all historical bandwidth data to the remote server as a single archive. Restore retrieves that archive and replaces current data.';
    backupSection.appendChild(h3b);
    backupSection.appendChild(desc);
    backupSection.appendChild(actionRow);
    backupSection.appendChild(statusLabel);
    backupSection.appendChild(statusEl);

    var page = document.createElement('div');
    var h2 = document.createElement('h2');
    h2.textContent = 'Bandwidth by Device — Backup & Restore';
    page.appendChild(h2);
    page.appendChild(settingsSection);
    page.appendChild(backupSection);
    return page;
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
