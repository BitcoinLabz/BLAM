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

  B.views.settings = {
    importJson,
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
            <div class="li"><div class="li-ic">${UI.icon('info')}</div><div class="li-m"><div class="li-t">100% local</div><div class="li-s">No accounts, no cloud, no telemetry. The only network calls are anonymous price lookups.</div></div></div>
          </div>` })}
        </div>
        <div class="grid g2 mt">
          ${UI.card({ title: 'Your data', body: `<p class="muted" style="margin-top:0">${counts}</p><div id="data-info" class="muted" style="font-size:12.5px;margin-bottom:14px"></div>
            <div class="page-a">${UI.btn('Export backup', 'export', { icon: 'download', kind: 'primary' })}${UI.btn('Restore from file', 'import', { icon: 'upload' })}${window.blam ? UI.btn('Open data folder', 'folder', { icon: 'report' }) : ''}</div>
            <div id="backups" class="mt"></div>` })}
          ${UI.card({ title: 'Danger zone', body: `<div class="list">
            <div class="li"><div class="li-m"><div class="li-t">Load demo data</div><div class="li-s">Replaces everything with a realistic sample portfolio</div></div>${UI.btn('Load demo', 'demo')}</div>
            <div class="li"><div class="li-m"><div class="li-t">Erase everything</div><div class="li-s">Permanently deletes all data in BLAM (backups are kept)</div></div><button class="btn danger" data-act="erase">${UI.icon('trash', 15)} Erase</button></div>
          </div>` })}
        </div>
        <div class="mt">${UI.card({ body: `<div style="display:flex;align-items:center;gap:16px"><div class="brand-mark">B</div><div><b style="font-size:16px;letter-spacing:2px">BLAM</b> <span class="muted">· Bitcoin Labz Asset Manager</span><div class="muted" style="font-size:12.5px;margin-top:3px" id="ver">Local-first personal finance · MIT licensed · github.com/BitcoinLabz/BLAM</div></div></div>` })}</div>`;

      root.querySelectorAll('[data-s]').forEach((el) => el.addEventListener('change', () => {
        const k = el.dataset.s;
        const v = el.type === 'number' ? U.num(el.value) : el.value;
        if (k === 'currency') U.setCurrency(v);
        S.setting(k, v);
        UI.toast('Saved');
      }));
      root.querySelector('#priv').addEventListener('change', (e) => S.setting('privacy', e.target.checked));
      UI.bind(root, {
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
          UI.toast(window.blam ? 'All data erased · a safety copy was saved in your backups folder' : 'All data erased');
        },
        restore: async (d) => {
          if (!(await UI.confirm(`Restore the automatic backup from ${d.name.replace(/\D+/g, ' ').trim()}? Current data will be replaced.`, { ok: 'Restore', title: 'Restore backup' }))) return;
          const raw = await window.blam.restoreBackup(d.name);
          await S.replaceAll(JSON.parse(raw), 'restore');
          UI.toast('Backup restored'); B.go('dashboard');
        },
      });
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
