/* BLAM — Bank Sync screen (SimpleFIN): connect, link accounts, sync status */
'use strict';
(function (B) {
  const { U, S, UI } = B;

  function linkOptions(l) {
    const s = S.state;
    const taken = new Set(s.syncLinks.filter((x) => x !== l && x.targetId).map((x) => x.targetId));
    const cur = l.target === 'account' || l.target === 'loan' ? `${l.target}:${l.targetId}` : l.target || '';
    const opt = (v, label) => `<option value="${U.esc(v)}" ${v === cur ? 'selected' : ''}>${U.esc(label)}</option>`;
    return [
      opt('', '— not linked —'),
      opt('new', '+ Create a new BLAM account'),
      opt('ignore', "Don't sync this account"),
      `<optgroup label="Banks & cards">${s.accounts.filter((a) => !a.archived && (!taken.has(a.id) || `account:${a.id}` === cur)).map((a) => opt(`account:${a.id}`, `${a.name} · ${S.ACCOUNT_TYPES[a.type]?.label || a.type}`)).join('')}</optgroup>`,
      s.loans.length ? `<optgroup label="Loans (balance only)">${s.loans.filter((x) => !x.archived && (!taken.has(x.id) || `loan:${x.id}` === cur)).map((x) => opt(`loan:${x.id}`, x.name)).join('')}</optgroup>` : '',
    ].join('');
  }

  function connectCard(st) {
    const insecure = B.Sync.status && B.Sync.status.keychain === false;
    return UI.card({
      title: 'Connect your banks',
      sub: 'Automatic balances and transactions from thousands of US banks, credit unions, credit cards and brokerages via SimpleFIN Bridge',
      body: `
        <ol class="steps">
          <li><b>Create a SimpleFIN Bridge account</b> at <a href="#" data-act="ext" data-url="https://bridge.simplefin.org/">bridge.simplefin.org</a> (about $15/year, paid to SimpleFIN — BLAM stays free) and connect your banks there.</li>
          <li>In your SimpleFIN account, create a new app connection and copy its <b>setup token</b>.</li>
          <li>Paste it below. BLAM claims it once, saves the resulting access key in your computer's secure keychain, and pulls in your accounts.</li>
        </ol>
        ${insecure ? `<div class="callout warn mt">${UI.icon('info')}<div>No OS keychain was found on this computer (common on Linux without GNOME Keyring or KWallet). BLAM will ask before saving the access key without one. Install a keyring for full protection.</div></div>` : ''}
        <div class="field mt"><label for="sf-token">SimpleFIN setup token</label><textarea id="sf-token" rows="3" placeholder="aHR0cHM6Ly9icmlkZ2Uuc2ltcGxlZmluLm9yZy9zaW1wbGVmaW4vY2xhaW0v…" spellcheck="false" autocomplete="off"></textarea>
          <small class="help">Read-only: SimpleFIN can't move money. You can revoke access anytime in SimpleFIN or with <b>Disconnect</b> here.</small></div>
        <div class="page-a mt">${UI.btn('Connect', 'connect', { icon: 'check', kind: 'primary' })}<span class="muted" id="sf-msg"></span></div>
        ${st.lastBankSyncResult && !st.lastBankSyncResult.ok ? `<div class="callout warn mt">${UI.icon('info')}<div>${U.esc(st.lastBankSyncResult.error)}</div></div>` : ''}`,
    });
  }

  B.views.banksync = {
    async render(root) {
      const s = S.state, st = s.settings;
      const connected = !!st.bankSyncConnected;
      const r = st.lastBankSyncResult;
      const links = s.syncLinks;
      const synced = s.transactions.filter((t) => t.extId).length;
      const nameOf = (l) => (l.target === 'loan' ? S.get('loans', l.targetId)?.name : S.get('accounts', l.targetId)?.name) || '';

      if (!window.blam?.syncFetch) {
        root.innerHTML = `${UI.pageHead('Bank Sync', 'Automatic bank & card syncing')}${UI.card({ body: UI.empty('bank', 'Desktop app required', 'Bank sync runs in the BLAM desktop app so your credentials stay in the OS keychain.') })}`;
        return;
      }

      root.innerHTML = `
        ${UI.pageHead('Bank Sync', 'Every bank, card and brokerage balance — updated automatically.', connected ? `${UI.btn('Sync now', 'sync', { icon: 'refresh', kind: 'primary' })}` : '')}
        ${connected ? `
        <div class="grid g4">
          ${UI.kpi({ label: 'Status', icon: 'bolt', accent: r && !r.ok ? '#f45b72' : '#2ecf8f', value: r && !r.ok ? 'Needs attention' : 'Connected', sub: `<span id="sf-host">SimpleFIN</span>` })}
          ${UI.kpi({ label: 'Last sync', icon: 'refresh', accent: '#5b9cff', value: st.lastBankSync ? U.timeAgo(st.lastBankSync) : 'Never', sub: +st.bankSyncHours ? `Automatic every ${st.bankSyncHours}h while BLAM is open` : 'Automatic sync off' })}
          ${UI.kpi({ label: 'Linked accounts', icon: 'bank', accent: '#14b8a6', value: links.filter((l) => l.target === 'account' || l.target === 'loan').length, sub: `${links.filter((l) => !l.target).length} need review · ${links.filter((l) => l.target === 'ignore').length} ignored` })}
          ${UI.kpi({ label: 'Synced transactions', icon: 'list', accent: '#f7931a', value: synced.toLocaleString(), sub: r?.ok ? `${r.added} new last sync${r.matched ? ` · ${r.matched} matched` : ''}` : '' })}
        </div>
        ${r && !r.ok ? `<div class="callout warn mt">${UI.icon('info')}<div><b>Last sync failed:</b> ${U.esc(r.error)}${['revoked', 'locked'].includes(r.code) ? ' Paste a new setup token below to reconnect.' : ''}</div></div>` : ''}
        ${r?.ok && r.errors?.length ? `<div class="callout warn mt">${UI.icon('info')}<div><b>Message from your bank connection:</b> ${r.errors.map(U.esc).join(' · ')} <a href="#" data-act="ext" data-url="https://bridge.simplefin.org/">Fix in SimpleFIN →</a></div></div>` : ''}
        <div class="mt">${UI.card({
          title: 'Accounts from your banks', sub: 'Choose where each one goes in BLAM. Transactions import into linked accounts, balances match the bank, and loans update their balance.', cls: 'flush',
          body: links.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Bank account</th><th class="r">Bank balance</th><th style="width:34%">Syncs into</th><th>Last synced</th></tr></thead><tbody>
            ${links.map((l) => `<tr>
              <td><b>${U.esc(l.remoteName)}</b><div class="sub">${U.esc(l.org || '')}</div></td>
              <td class="r"><b>${U.m(l.bankBalance)}</b>${l.balanceDate ? `<div class="sub">as of ${U.fmtDate(l.balanceDate, { month: 'short', day: 'numeric' })}</div>` : ''}</td>
              <td><select class="input" data-link="${U.esc(l.remoteId)}">${linkOptions(l)}</select>${!l.target ? '<div class="sub warn-t">Not linked — choose where this goes</div>' : ''}</td>
              <td class="muted">${l.lastSync ? U.timeAgo(l.lastSync) : '—'}</td></tr>`).join('')}
          </tbody></table></div>` : UI.empty('bank', 'No accounts yet', 'Click Sync now to load your accounts from SimpleFIN.', UI.btn('Sync now', 'sync', { icon: 'refresh', kind: 'primary' })),
        })}</div>
        <div class="grid g2 mt">
          ${UI.card({ title: 'Sync settings', body: `<div class="list">
            <div class="li"><div class="li-m"><div class="li-t">Automatic sync</div><div class="li-s">While BLAM is open. SimpleFIN refreshes banks about once a day and allows ~24 requests a day.</div></div><select class="input" data-set="bankSyncHours" style="width:150px">${[[0, 'Off'], [3, 'Every 3 hours'], [6, 'Every 6 hours'], [12, 'Every 12 hours'], [24, 'Daily']].map(([v, l]) => `<option value="${v}" ${+st.bankSyncHours === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="li"><div class="li-m"><div class="li-t">History for new accounts</div><div class="li-s">How far back to import when an account is first linked</div></div><select class="input" data-set="bankSyncDays" style="width:150px">${[30, 45, 90].map((v) => `<option value="${v}" ${+st.bankSyncDays === v ? 'selected' : ''}>${v} days${v > 45 ? ' (2 requests)' : ''}</option>`).join('')}</select></div>
            <div class="li"><div class="li-m"><div class="li-t">Duplicates</div><div class="li-s">Bank transactions are matched by their bank ID, and to anything you already entered or imported from CSV (same account, amount, within 3 days).</div></div><span class="pos">${UI.icon('check')}</span></div>
          </div>` })}
          ${UI.card({ title: 'Connection & security', body: `<div class="list">
            <div class="li"><div class="li-ic">${UI.icon('lock')}</div><div class="li-m"><div class="li-t" id="sf-sec-t">Access key stored in your OS keychain</div><div class="li-s" id="sf-sec">Encrypted with Electron safeStorage. It never leaves this computer except to talk to SimpleFIN, and is never written to your BLAM data file or backups.</div></div></div>
            <div class="li"><div class="li-ic">${UI.icon('refresh')}</div><div class="li-m"><div class="li-t">Reconnect</div><div class="li-s">Paste a new setup token if access expired or you moved to a new computer.</div></div>${UI.btn('Reconnect', 'reconnect')}</div>
            <div class="li"><div class="li-ic">${UI.icon('x')}</div><div class="li-m"><div class="li-t">Disconnect</div><div class="li-s">Deletes the access key. Synced accounts and transactions stay in BLAM.</div></div><button class="btn danger" data-act="disconnect">Disconnect</button></div>
          </div>` })}
        </div>
        <div id="sf-reconnect"></div>` : connectCard(st)}`;

      const bindConnect = (host) => {
        const btn = host.querySelector('[data-act="connect"]');
        if (!btn) return;
        btn.addEventListener('click', async () => {
          const token = host.querySelector('#sf-token').value;
          const msg = host.querySelector('#sf-msg');
          btn.disabled = true; msg.textContent = 'Connecting to SimpleFIN…';
          try {
            const res = await B.Sync.connect(token, { allowPlain: host.dataset.allowPlain === '1' });
            if (!res.ok) {
              msg.innerHTML = `<span class="neg">${U.esc(res.error)}</span>`;
              btn.disabled = false;
              if (res.code === 'no_secure_storage' && !host.querySelector('[data-act="plain"]')) {
                msg.insertAdjacentHTML('afterend', `<div class="callout warn mt">${UI.icon('info')}<div>Without a keychain, BLAM can still save the access key in a file that only your user account can read. Anyone with access to your account could read it, and it's read-only access to balances and transactions. <button class="btn sm" data-act="plain" style="margin-left:6px">Save without keychain</button></div></div>`);
                host.querySelector('[data-act="plain"]').addEventListener('click', () => { host.dataset.allowPlain = '1'; btn.click(); });
              }
              return;
            }
            UI.toast(`Connected · ${res.accounts.length} account${res.accounts.length === 1 ? '' : 's'} found`);
            B.rerender();
          } catch (e) { msg.innerHTML = `<span class="neg">${U.esc(e.message)}</span>`; btn.disabled = false; }
        });
      };
      bindConnect(root);

      root.querySelectorAll('[data-link]').forEach((el) => el.addEventListener('change', () => {
        const l = B.Sync.link(el.dataset.link);
        const prev = l.target ? nameOf(l) : '';
        B.Sync.setLink(el.dataset.link, el.value);
        UI.toast(el.value === 'ignore' ? `${l.remoteName} will not sync` : prev ? `Moved ${l.remoteName} from ${prev} — syncing…` : `Linked ${l.remoteName} — syncing…`);
        if (el.value !== 'ignore' && el.value !== '') B.Sync.run({ quiet: true });
      }));
      root.querySelectorAll('[data-set]').forEach((el) => el.addEventListener('change', () => { S.setting(el.dataset.set, U.num(el.value)); UI.toast('Saved'); }));

      UI.bind(root, {
        sync: () => B.Sync.run(),
        ext: (d) => window.blam.openExternal(d.url),
        reconnect: () => { const h = root.querySelector('#sf-reconnect'); h.innerHTML = `<div class="mt">${connectCard({})}</div>`; bindConnect(h); h.querySelector('#sf-token').focus(); },
        disconnect: async () => {
          if (!(await UI.confirm('BLAM will delete its SimpleFIN access key. Accounts and transactions already synced stay in BLAM. To stop SimpleFIN entirely, also revoke the app in your SimpleFIN account.', { title: 'Disconnect bank sync?', ok: 'Disconnect' }))) return;
          await B.Sync.disconnect();
          UI.toast('Bank sync disconnected');
        },
      });

      const status = await B.Sync.refreshStatus();
      const hostEl = root.querySelector('#sf-host');
      if (hostEl && status.host) hostEl.textContent = status.host;
      const sec = root.querySelector('#sf-sec');
      if (sec && status.connected && status.secure === false) {
        root.querySelector('#sf-sec-t').textContent = 'Access key stored without a keychain';
        sec.innerHTML = '<span class="warn-t">Saved in a file only your user account can read, because no OS keychain is available. Install GNOME Keyring or KWallet, then Reconnect, for full protection.</span>';
      }
      if (connected !== !!status.connected) B.rerender();
    },
  };
})(window.BLAM);
