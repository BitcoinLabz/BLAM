/* BLAM — Settings, security & data management */
'use strict';
(function (B) {
  const { U, S, UI } = B;

  async function exportJson() {
    const p = await U.download(`blam-backup-${U.today()}.json`, JSON.stringify(S.state, null, 2), [{ name: 'BLAM backup', extensions: ['json'] }]);
    if (p) UI.toast('Backup exported');
  }

  async function importJson() {
    const f = await U.openFile('.json');
    if (!f) return;
    let data;
    try { data = JSON.parse(f.content); } catch (e) { UI.toast('That file is not valid JSON', 'error'); return; }
    if (!data || !Array.isArray(data.accounts) || !data.settings) { UI.toast('That does not look like a BLAM backup', 'error'); return; }
    if (!(await UI.confirm(`Replace ALL current data with "${f.name}"? Export a backup first if unsure.`, { title: 'Restore backup', ok: 'Restore' }))) return;
    await S.replaceAll(data, 'restore');
    UI.toast('Backup restored');
    B.go('dashboard');
  }

  function setPin() {
    UI.form({
      title: S.state.settings.pinHash ? 'Change PIN' : 'Set a PIN',
      intro: 'BLAM asks for this PIN at launch and when you click the lock icon. It is stored as a SHA-256 hash. If you forget it, delete the pinHash value in your data file.',
      fields: [{ key: 'pin', label: 'New PIN (4–12 digits)', type: 'password', col: 3, required: true }, { key: 'pin2', label: 'Confirm', type: 'password', col: 3, required: true }],
      onSave: async (v) => {
        if (!/^\d{4,12}$/.test(v.pin)) { UI.toast('PIN must be 4–12 digits', 'warn'); return false; }
        if (v.pin !== v.pin2) { UI.toast("PINs don't match", 'warn'); return false; }
        S.setting('pinHash', await U.sha256(v.pin));
        UI.toast('PIN set — BLAM will lock at launch');
      },
    });
  }

  /** Render the Updates card from the main-process updater state. */
  function updateCard(u) {
    const t = document.getElementById('upd-title');
    if (!t || !u) return;
    const sub = document.getElementById('upd-sub');
    const act = document.getElementById('upd-actions');
    const btn = (k, label, kind = 'ghost', icon) => `<button class="btn ${kind} sm" data-u="${k}">${icon ? UI.icon(icon, 14) : ''}<span>${label}</span></button>`;
    const checked = u.checkedAt ? ` · checked ${U.timeAgo(u.checkedAt)}` : '';
    t.textContent = `BLAM ${u.version}`;
    if (!u.supported) {
      sub.textContent = u.reason;
      act.innerHTML = btn('releases', 'Releases page', 'ghost', 'download');
      return;
    }
    const map = {
      idle: ['Up to date as far as we know', btn('check', 'Check for updates', 'ghost', 'refresh')],
      checking: ['Checking GitHub for a new version…', ''],
      current: [`You have the latest version${checked}`, btn('check', 'Check for updates', 'ghost', 'refresh')],
      downloading: [`Downloading BLAM ${U.esc(u.available?.version || '')}… ${u.progress || 0}%`, ''],
      ready: [`BLAM ${U.esc(u.available?.version || '')} is downloaded and ready`, btn('install', 'Restart & update', 'primary', 'refresh')],
      error: [`${U.esc(u.error || 'Update check failed')}${checked}`, `${btn('check', 'Try again', 'ghost', 'refresh')}${btn('releases', 'Releases page', 'ghost', 'download')}`],
    };
    const [text, actions] = map[u.status] || map.idle;
    sub.innerHTML = text;
    act.innerHTML = actions;
  }

  // ------------------------------------------------------------------ sync
  /** Show the sync key with copy / download, and require "I've saved it". */
  function recoveryKit(key, { first = false } = {}) {
    const pretty = B.Sync.formatKey(key);
    const m = UI.modal({
      title: first ? 'Save your sync key' : 'Your sync key',
      body: `<p style="margin:0 0 12px">${first ? 'Sync is on. This key is the <b>only</b> way to connect another device or restore your data if you delete BLAM everywhere.' : 'Use this key to connect another device.'} Nobody else has it, not even the people who make BLAM, so it can't be recovered if lost.</p>
        <div class="sync-key">${U.esc(pretty)}</div>
        <div class="page-a mt">${UI.btn('Copy key', 'copy', { icon: 'check', kind: 'primary' })}${UI.btn('Download recovery file', 'dl', { icon: 'download' })}</div>
        <ol class="steps mt"><li>Save it somewhere safe: a password manager, a printed copy, or a note only you can see.</li>
        <li>On your other device, open BLAM → <b>Settings → Sync → I have a sync key</b> and paste or type it.</li></ol>
        ${first ? '<label class="switch mt"><input type="checkbox" id="saved"><span></span><em>I\'ve saved my sync key</em></label>' : ''}`,
      footer: `<span class="grow"></span><button class="btn primary" data-done ${first ? 'disabled' : ''}>Done</button>`,
    });
    UI.bind(m.body, {
      copy: async () => UI.toast(await U.copy(pretty) ? 'Sync key copied' : 'Could not copy. Select the key and copy it by hand', 'ok'),
      dl: () => U.download('BLAM-sync-key.txt', `BLAM sync key\n\n${pretty}\n\nKeep this private. Anyone with this key can read your synced BLAM data.\nTo connect a device: BLAM → Settings → Sync → I have a sync key.\nCreated ${new Date().toLocaleString()}\n`, [{ name: 'Text', extensions: ['txt'] }]),
    });
    const done = m.foot.querySelector('[data-done]');
    m.body.querySelector('#saved')?.addEventListener('change', (e) => { done.disabled = !e.target.checked; });
    done.onclick = () => { if (first) { S.state.sync.keySaved = true; S.save(); } m.close(); syncCard(); };
  }

  function joinDialog() {
    const local = B.SyncMerge.hasUserData(S.state);
    const m = UI.modal({
      title: 'Connect this device',
      body: `<p style="margin:0 0 10px">Paste or type the sync key from your other device. It's 24 letters and numbers.</p>
        <input class="input sync-key-in" id="jk" placeholder="K7Q2-X9M4-…" autocomplete="off" autocapitalize="characters" spellcheck="false">
        ${local ? `<div class="field mt"><label>This device already has data</label>
          <label class="switch"><input type="radio" name="jm" value="merge" checked><span></span><em>Combine it with the synced data</em></label>
          <label class="switch"><input type="radio" name="jm" value="replace"><span></span><em>Replace it with the synced data</em></label></div>` : ''}
        <p class="muted" id="jmsg" style="margin:10px 0 0"></p>`,
      footer: '<span class="grow"></span><button class="btn ghost" data-c>Cancel</button><button class="btn primary" data-go>Connect</button>',
    });
    setTimeout(() => m.body.querySelector('#jk').focus(), 60);
    m.foot.querySelector('[data-c]').onclick = m.close;
    const go = m.foot.querySelector('[data-go]');
    go.onclick = async () => {
      const msg = m.body.querySelector('#jmsg');
      go.disabled = true; msg.textContent = 'Connecting…';
      try {
        const mode = local ? m.body.querySelector('input[name="jm"]:checked').value : 'replace';
        await B.Sync.join(m.body.querySelector('#jk').value, mode);
        m.close();
        UI.toast('This device is connected. Your data is in sync');
        B.go('dashboard');
      } catch (e) { msg.innerHTML = `<span class="neg">${U.esc(e.message)}</span>`; go.disabled = false; }
    };
  }

  function turnOffDialog() {
    const m = UI.modal({
      title: 'Turn off sync?',
      body: `<p style="margin:0 0 10px">This device keeps all its data and stops syncing.</p>
        <label class="switch"><input type="checkbox" id="del"><span></span><em>Also delete my encrypted data from the sync server</em></label>
        <p class="muted" style="margin:8px 0 0;font-size:12.5px">Only tick this if you're turning sync off on <b>all</b> your devices. Your other devices keep their own copies either way.</p>`,
      footer: '<span class="grow"></span><button class="btn ghost" data-c>Cancel</button><button class="btn danger" data-go>Turn off sync</button>',
    });
    m.foot.querySelector('[data-c]').onclick = m.close;
    m.foot.querySelector('[data-go]').onclick = async () => {
      try { await B.Sync.disable({ deleteServer: m.body.querySelector('#del').checked }); m.close(); UI.toast(m.body.querySelector('#del').checked ? 'Sync turned off and server copy deleted' : 'Sync turned off on this device'); syncCard(); } catch (e) { UI.toast(e.message, 'error', 5000); }
    };
  }

  /** (Re)draw the sync card in place. */
  function syncCard() {
    const host = document.getElementById('sync-card');
    if (!host) return;
    const sy = S.state.sync || {};
    const st = S.state.settings;
    const adv = `<details class="mt"><summary class="muted" style="cursor:pointer;font-size:12.5px">Advanced</summary>
      <div class="field mt" style="max-width:520px"><label>Sync server (optional)</label><input class="input" id="sync-srv" placeholder="Default: BLAM's free server" value="${U.esc(st.syncServer || '')}"><small class="help">Leave blank unless you run your own BLAM sync server.</small></div></details>`;
    if (!sy.on) {
      host.innerHTML = `<div class="list">
        <div class="li"><div class="li-ic">${UI.icon('lock')}</div><div class="li-m"><div class="li-t">Private by design</div><div class="li-s">Everything is encrypted on this device before it leaves. The server only stores scrambled data it can't read. No email, no password.</div></div></div>
        <div class="li"><div class="li-ic">${UI.icon('refresh')}</div><div class="li-m"><div class="li-t">Automatic</div><div class="li-s">Add a transaction on your PC and it's on your phone the next time you open BLAM (and the other way round).</div></div></div>
      </div>
      <div class="page-a mt">${UI.btn('Turn on sync', 'sync-on', { icon: 'check', kind: 'primary' })}${UI.btn('I have a sync key', 'sync-join', { icon: 'lock' })}</div>
      ${sy.lastError ? `<div class="callout warn mt">${UI.icon('info')}<div>${U.esc(sy.lastError)}</div></div>` : ''}${adv}`;
    } else {
      const ok = !sy.lastError;
      host.innerHTML = `<div class="list">
        <div class="li"><div class="li-ic" style="color:${ok ? 'var(--pos)' : 'var(--warn)'}">${UI.icon(ok ? 'check' : 'info')}</div><div class="li-m"><div class="li-t">${ok ? 'Sync is on' : 'Sync is on, last attempt failed'}</div><div class="li-s">${sy.lastSync ? `Last synced ${U.timeAgo(sy.lastSync)}` : 'Not synced yet'}${sy.lastError ? ` · ${U.esc(sy.lastError)}` : ''}</div></div>${UI.btn('Sync now', 'sync-now', { icon: 'refresh' })}</div>
        ${sy.keySaved ? '' : `<div class="callout warn" style="margin:10px 0">${UI.icon('info')}<div><b>Save your sync key.</b> It's the only way to restore your data if you delete BLAM everywhere. ${UI.btn('Show key', 'sync-key')}</div></div>`}
        <div class="li"><div class="li-ic">${UI.icon('lock')}</div><div class="li-m"><div class="li-t">Connect another device</div><div class="li-s">Show your sync key, then enter it on the other device under Settings → Sync.</div></div>${UI.btn('Show sync key', 'sync-key')}</div>
        <div class="li"><div class="li-ic">${UI.icon('x')}</div><div class="li-m"><div class="li-t">Turn off sync</div><div class="li-s">Keeps your data on this device. Optionally deletes the encrypted copy from the server.</div></div><button class="btn danger" data-act="sync-off">Turn off</button></div>
      </div>
      <p class="muted" style="margin:10px 0 0;font-size:12px">Synced data no device has opened for 12 months is deleted from the server automatically.</p>${adv}`;
    }
    host.querySelector('#sync-srv')?.addEventListener('change', (e) => { S.setting('syncServer', e.target.value.trim()); S.state.sync.serverAt = 0; UI.toast('Saved'); });
  }

  B.views.settings = {
    syncCard,
    importJson,
    updateCard,
    async render(root) {
      const st = S.state.settings;
      const counts = ['accounts', 'transactions', 'holdings', 'properties', 'loans', 'metals', 'recurring', 'goals'].map((k) => `${S.state[k].length} ${k}`).join(' · ');
      root.innerHTML = `
        ${UI.pageHead('Settings & Data', 'Your data lives only on this computer.')}
        <div class="grid g2">
          ${UI.card({ title: 'Profile', body: `<div class="fgrid">
            <div class="field" style="grid-column:span 3"><label>Your name</label><input data-s="userName" value="${U.esc(st.userName)}" placeholder="Shown on the dashboard"></div>
            <div class="field" style="grid-column:span 3"><label>Currency</label><select data-s="currency">${['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'MXN', 'JPY', 'CHF'].map((c) => `<option ${st.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select><small class="help">Display only — live prices are quoted in USD.</small></div>
            <div class="field" style="grid-column:span 3"><label>Expected investment return</label><div class="inwrap has-post"><input type="number" step="0.5" data-s="expectedReturn" value="${st.expectedReturn}"><span class="adorn r">%</span></div></div>
            <div class="field" style="grid-column:span 3"><label>Safe withdrawal rate</label><div class="inwrap has-post"><input type="number" step="0.25" data-s="safeWithdrawalRate" value="${st.safeWithdrawalRate}"><span class="adorn r">%</span></div></div>
          </div>` })}
          ${UI.card({ title: 'Security & privacy', body: `<div class="list">
            <div class="li"><div class="li-ic">${UI.icon('lock')}</div><div class="li-m"><div class="li-t">PIN lock</div><div class="li-s">${st.pinHash ? 'Enabled — required at launch' : 'Off'}</div></div>${st.pinHash ? UI.btn('Remove', 'rmPin', { kind: 'ghost' }) : ''}${UI.btn(st.pinHash ? 'Change' : 'Set PIN', 'pin')}</div>
            <div class="li"><div class="li-ic">${UI.icon('eyeoff')}</div><div class="li-m"><div class="li-t">Privacy mode</div><div class="li-s">Blurs every dollar amount (hover to reveal). Toggle anytime from the top bar.</div></div><label class="switch"><input type="checkbox" id="priv" ${st.privacy ? 'checked' : ''}><span></span></label></div>
            <div class="li"><div class="li-ic">${UI.icon('info')}</div><div class="li-m"><div class="li-t">100% local</div><div class="li-s">No accounts, no cloud, no telemetry. The only network calls are anonymous price lookups and update checks to GitHub (which you can turn off below).</div></div></div>
          </div>` })}
        </div>
        <div class="mt">${UI.card({ title: 'Sync across your devices', sub: 'Free and end-to-end encrypted: your PC and phone stay in step, and only your devices can read your data.', actions: '<span class="tag" style="--tc:#14b8a6">Optional</span>', body: '<div id="sync-card"></div>' })}</div>
        <div class="grid g2 mt">
          ${UI.card({ title: 'Your data', body: `<p class="muted" style="margin-top:0">${counts}</p><div id="data-info" class="muted" style="font-size:12.5px;margin-bottom:14px"></div>
            <div class="page-a">${UI.btn('Export backup', 'export', { icon: 'download', kind: 'primary' })}${UI.btn('Restore from file', 'import', { icon: 'upload' })}${window.blam ? UI.btn('Open data folder', 'folder', { icon: 'report' }) : ''}</div>
            <div id="backups" class="mt"></div>` })}
          ${UI.card({ title: 'Danger zone', body: `<div class="list">
            <div class="li"><div class="li-m"><div class="li-t">Load demo data</div><div class="li-s">Replaces everything with a realistic sample portfolio</div></div>${UI.btn('Load demo', 'demo')}</div>
            <div class="li"><div class="li-m"><div class="li-t">Erase everything</div><div class="li-s">Permanently deletes all data in BLAM (backups are kept)</div></div><button class="btn danger" data-act="erase">${UI.icon('trash', 15)} Erase</button></div>
          </div>` })}
        </div>
        ${window.blam?.updateState ? `<div class="mt">${UI.card({ title: 'Updates', body: `<div class="list">
          <div class="li"><div class="li-ic">${UI.icon('download')}</div><div class="li-m"><div class="li-t" id="upd-title">Checking version…</div><div class="li-s" id="upd-sub"></div></div><div class="page-a" id="upd-actions"></div></div>
          <div class="li"><div class="li-m"><div class="li-t">Automatically check for updates</div><div class="li-s">When BLAM opens and every 2 hours. Updates download in the background from GitHub and install when you restart.</div></div><label class="switch"><input type="checkbox" id="upd-auto" ${st.autoUpdate !== false ? 'checked' : ''}><span></span></label></div>
        </div>` })}</div>` : ''}
        <div class="mt">${UI.card({ body: `<div style="display:flex;align-items:center;gap:16px"><div class="brand-mark">B</div><div><b style="font-size:16px;letter-spacing:2px">BLAM</b> <span class="muted">· Bitcoin Labz Asset Manager</span><div class="muted" style="font-size:12.5px;margin-top:3px" id="ver">Local-first personal finance · MIT licensed · github.com/BitcoinLabz/BLAM</div></div></div>` })}</div>`;

      root.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('change', () => {
        const k = el.dataset.s;
        const v = el.type === 'number' ? U.num(el.value) : el.value;
        if (k === 'currency') U.setCurrency(v);
        S.setting(k, v);
        UI.toast('Saved');
      }));
      root.querySelector('#priv').addEventListener('change', (e) => S.setting('privacy', e.target.checked));
      if (window.blam?.updateState) {
        root.querySelector('#upd-auto').addEventListener('change', async (e) => {
          S.setting('autoUpdate', e.target.checked);
          updateCard(await window.blam.updateSetAuto(e.target.checked));
          UI.toast(e.target.checked ? 'Automatic updates on' : 'Automatic updates off');
        });
        root.querySelector('#upd-actions').addEventListener('click', async (e) => {
          const a = e.target.closest('[data-u]')?.dataset.u;
          if (a === 'check') { updateCard({ ...(B.updateState || {}), status: 'checking' }); updateCard(await window.blam.updateCheck()); }
          if (a === 'install') window.blam.updateInstall();
          if (a === 'releases') window.blam.openReleases();
        });
        window.blam.updateState().then(updateCard);
      }
      syncCard();
      UI.bind(root, {
        'sync-on': async (d, el) => {
          el.disabled = true;
          try { const key = await B.Sync.enable(); recoveryKit(key, { first: true }); } catch (e) { UI.toast(e.message, 'error', 6000); } finally { el.disabled = false; syncCard(); }
        },
        'sync-join': joinDialog,
        'sync-now': () => B.Sync.run({ quiet: false }),
        'sync-key': async () => { const k = await B.Sync.key(); if (k) recoveryKit(k, { first: !S.state.sync.keySaved }); else UI.toast('No sync key on this device', 'warn'); },
        'sync-off': turnOffDialog,
        pin: setPin,
        rmPin: async () => { if (await UI.confirm('Remove the PIN lock?', { ok: 'Remove' })) S.setting('pinHash', null); },
        export: exportJson,
        import: importJson,
        folder: () => window.blam.openDataFolder(),
        demo: async () => { if (await UI.confirm('Replace all data with demo data?', { ok: 'Load demo' })) { await S.replaceAll(B.sampleData(), 'demo'); B.sampleBackfill(); B.go('dashboard'); B.A.refreshPrices({ quiet: true }); } },
        erase: async () => {
          if (!(await UI.confirm('This permanently deletes every account, transaction, holding and setting.', { title: 'Erase all data?', ok: 'Erase everything' }))) return;
          await S.replaceAll(S.blank(), 'erase');
          B.go('dashboard');
          UI.toast(window.blam || B.Web ? 'All data erased · a safety copy was saved in your backups' : 'All data erased');
        },
        restore: async (d) => {
          if (!(await UI.confirm(`Restore the automatic backup from ${d.name.replace(/\D+/g, ' ').trim()}? Current data will be replaced.`, { ok: 'Restore', title: 'Restore backup' }))) return;
          const raw = window.blam ? await window.blam.restoreBackup(d.name) : await B.Web.restoreBackup(d.name);
          await S.replaceAll(JSON.parse(raw), 'restore');
          UI.toast('Backup restored'); B.go('dashboard');
        },
      });
      if (!window.blam && B.Web) {
        const [list, est, persisted] = await Promise.all([B.Web.backups(), B.Web.estimate(), B.Web.persist()]);
        const di = root.querySelector('#data-info');
        if (!di) return;
        di.innerHTML = `Stored on this device in the browser's app storage${est ? ` · ${(est.usage / 1024).toFixed(0)} KB used` : ''} · ${persisted ? '<span class="pos">protected from automatic clean-up</span>' : '<span class="warn-t">the browser may clear it if storage runs low. Install BLAM to your Home Screen and export backups regularly</span>'}`;
        root.querySelector('#backups').innerHTML = list.length ? `<div class="muted" style="font-size:12px;margin-bottom:6px">Automatic backups on this device — click to restore</div><div class="chip-row">${list.slice(0, 12).map((b) => `<span class="chip" data-act="restore" data-name="${U.esc(b)}">${U.esc(b.startsWith('before-') ? `before ${b.replace(/^before-([a-z]+)-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})\d{2}$/i, '$1 · $2 $3:$4')}` : b.replace('backup-', ''))}</span>`).join('')}</div>` : '';
        const ver = root.querySelector('#ver');
        if (ver && window.BLAM_WEB_VERSION) ver.textContent = `Version ${window.BLAM_WEB_VERSION} · phone / web app · Local-first personal finance · MIT licensed`;
      }
      if (window.blam) {
        const info = await window.blam.info();
        const di = root.querySelector('#data-info');
        if (!di) return;
        di.innerHTML = `Data file: <code>${U.esc(info.dataFile)}</code> · ${(info.size / 1024).toFixed(1)} KB`;
        root.querySelector('#ver').textContent = `Version ${info.version} · ${info.platform} · Local-first personal finance · MIT licensed`;
        root.querySelector('#backups').innerHTML = info.backups.length ? `<div class="muted" style="font-size:12px;margin-bottom:6px">Automatic backups — click to restore</div><div class="chip-row">${info.backups.slice(0, 12).map((b) => `<span class="chip" data-act="restore" data-name="${U.esc(b)}" title="${U.esc(b)}">${U.esc(b.startsWith('blam-before-') ? `before ${b.replace(/^blam-before-([a-z]+)-(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})\d{2}\.json$/i, '$1 · $2 $3:$4')}` : b.replace('blam-backup-', '').replace('.json', ''))}</span>`).join('')}</div>` : '';
      }
    },
  };
})(window.BLAM);
