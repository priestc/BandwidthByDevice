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
    return Promise.all([ callGetConfig(), callGetStatus() ]);
  },

  render: function(data) {
    injectCSS();

    var cfg    = data[0] || {};
    var status = data[1] || {};

    var proto   = E('select', { 'id': 'bbd-proto',    'class': 'bbd-input' }, [
      E('option', { value: 'sftp', selected: cfg.protocol !== 'scp' ? '' : null }, 'SFTP (via curl)'),
      E('option', { value: 'scp',  selected: cfg.protocol === 'scp'  ? '' : null }, 'SCP (requires sshpass)')
    ]);
    var host    = E('input', { 'id': 'bbd-host',     'class': 'bbd-input', type: 'text',     value: cfg.host         || '', placeholder: 'e.g. 192.168.1.100 or nas.local' });
    var port    = E('input', { 'id': 'bbd-port',     'class': 'bbd-input', type: 'number',   value: cfg.port         || '22', min: 1, max: 65535 });
    var user    = E('input', { 'id': 'bbd-user',     'class': 'bbd-input', type: 'text',     value: cfg.username     || '', placeholder: 'username' });
    var pass    = E('input', { 'id': 'bbd-pass',     'class': 'bbd-input', type: 'password', value: '',               placeholder: cfg.username ? '(unchanged)' : '' });
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

    return E('div', {}, [
      E('h2', 'Bandwidth by Device — Backup & Restore'),

      E('div', { 'class': 'bbd-section' }, [
        E('h3', 'Server Settings'),
        E('table', { 'class': 'bbd-form-table' }, [
          E('tr', [ E('td', E('label', 'Protocol')),     E('td', proto)   ]),
          E('tr', [ E('td', E('label', 'Host')),         E('td', host)    ]),
          E('tr', [ E('td', E('label', 'Port')),         E('td', port)    ]),
          E('tr', [ E('td', E('label', 'Username')),     E('td', user)    ]),
          E('tr', [ E('td', E('label', 'Password')),     E('td', pass)    ]),
          E('tr', [ E('td', E('label', 'Remote Path')),  E('td', rpath)   ])
        ]),
        E('p', { 'class': 'bbd-hint' }, 'Remote Path is the absolute path on the server where the backup file will be stored. The directory must exist. For SCP, sshpass must be installed on the router.'),
        saveBtn
      ]),

      E('div', { 'class': 'bbd-section' }, [
        E('h3', 'Backup & Restore'),
        E('p', 'Backup saves all historical bandwidth data to the remote server as a single archive. Restore retrieves that archive and replaces current data.'),
        E('div', { 'class': 'bbd-action-row' }, [ backupBtn, restoreBtn ]),
        E('div', { 'class': 'bbd-status-label' }, 'Last operation:'),
        statusEl
      ])
    ]);
  },

  handleSaveApply: null,
  handleSave: null,
  handleReset: null
});
