/* BLAM — application shell: navigation, routing, lock screen, global actions. */
'use strict';
(function (B) {
  const { U, S, UI, A } = B;
  B.views = B.views || {};

  const NAV = [
    { g: 'Overview' },
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'reports', label: 'Net Worth & Reports', icon: 'networth' },
    { g: 'Cash Flow' },
    { id: 'accounts', label: 'Banks & Cards', icon: 'bank' },
    { id: 'transactions', label: 'Transactions', icon: 'list' },
    { id: 'budget', label: 'Budget & Spending', icon: 'budget' },
    { id: 'recurring', label: 'Bills & Recurring', icon: 'repeat' },
    { g: 'Wealth' },
    { id: 'investments', label: 'Crypto & Stocks', icon: 'bitcoin' },
    { id: 'income', label: 'Dividends & Passive', icon: 'coins' },
    { id: 'realestate', label: 'Real Estate', icon: 'home' },
    { id: 'metals', label: 'Precious Metals', icon: 'gem' },
    { id: 'assets', label: 'Other Assets', icon: 'leaf' },
    { g: 'Debt & Planning' },
    { id: 'loans', label: 'Loans & Payoff', icon: 'loan' },
    { id: 'goals', label: 'Goals & FIRE', icon: 'target' },
    { g: 'System' },
    { id: 'automation', label: 'Automation', icon: 'bolt' },
    { id: 'settings', label: 'Settings & Data', icon: 'gear' },
  ];

  let current = null;
  let currentParams = {};

  function renderNav() {
    const nav = document.getElementById('nav');
    nav.innerHTML = NAV.map((n) => n.g
      ? `<div class="nav-g">${n.g}</div>`
      : `<a href="#/${n.id}" data-id="${n.id}" class="${n.id === current ? 'active' : ''}">${UI.icon(n.icon)}<span>${n.label}</span></a>`).join('');
  }

  function updateChrome() {
    const t = S.totals();
    document.getElementById('side-nw').textContent = U.money(t.netWorth, 0);
    document.getElementById('side-nw').className = `amt ${t.netWorth < 0 ? 'neg' : ''}`;
    const ps = priceStatus();
    const stamp = document.getElementById('price-stamp');
    stamp.textContent = ps.text;
    stamp.parentElement.title = ps.title;
    document.querySelector('.live-dot').style.background = ps.color;
    document.body.classList.toggle('privacy', !!S.state.settings.privacy);
    document.querySelector('[data-act="privacy"]').innerHTML = UI.icon(S.state.settings.privacy ? 'eyeoff' : 'eye');
  }

  /** What the top-bar price indicator should say, based on what actually happened last refresh. */
  function priceStatus() {
    const st = S.state.settings;
    const last = st.lastPriceStatus;
    const okAgo = st.lastPriceSuccess ? U.timeAgo(st.lastPriceSuccess) : null;
    if (navigator.onLine === false) return { text: okAgo ? `Offline · prices ${okAgo}` : 'Offline', color: 'var(--neg)', title: 'No network connection. Prices will refresh when you reconnect.' };
    if (!st.lastPriceRefresh) return { text: 'Prices: not yet', color: 'var(--faint)', title: 'Click refresh to load live prices' };
    if (last && last.ok === 0 && last.fail > 0) return { text: okAgo ? `Prices offline · last ${okAgo}` : 'Prices offline', color: 'var(--neg)', title: `Last attempt ${U.timeAgo(last.at)} failed for every price source.` };
    if (last && last.fail > 0) return { text: `Prices ${okAgo || U.timeAgo(last.at)} · ${last.fail} unavailable`, color: 'var(--warn)', title: `${last.ok} updated, ${last.fail} unavailable — see Crypto & Stocks for details.` };
    if (!okAgo) return { text: 'Prices: not yet', color: 'var(--faint)', title: '' };
    return { text: `Prices ${okAgo}`, color: '', title: `Live prices updated ${new Date(st.lastPriceSuccess).toLocaleString()}` };
  }

  function route() {
    const hash = location.hash.replace(/^#\/?/, '') || 'dashboard';
    const [id, q] = hash.split('?');
    const params = Object.fromEntries(new URLSearchParams(q || ''));
    const view = B.views[id] ? id : 'dashboard';
    const changed = view !== current;
    current = view; currentParams = params;
    renderNav();
    const item = NAV.find((n) => n.id === view);
    document.getElementById('crumb').textContent = item ? item.label : '';
    const host = document.getElementById('view');
    const fresh = host.cloneNode(false); // drop old listeners
    host.replaceWith(fresh);
    try {
      if (!S.state.settings.onboarded && view === 'dashboard' && !hasData()) B.views.welcome.render(fresh, params);
      else B.views[view].render(fresh, params);
    } catch (e) {
      console.error(e);
      fresh.innerHTML = `<div class="callout warn">${UI.icon('info')}<div>Something went wrong rendering this page: ${U.esc(e.message)}</div></div>`;
    }
    if (changed) document.getElementById('content').scrollTop = 0;
    updateChrome();
  }
  B.rerender = () => {
    const sc = document.getElementById('content').scrollTop;
    route();
    document.getElementById('content').scrollTop = sc;
  };
  B.go = (path) => { location.hash = `#/${path}`; };

  const hasData = () => {
    const s = S.state;
    return s.accounts.length || s.holdings.length || s.properties.length || s.loans.length || s.transactions.length || s.metals.length;
  };

  // ------------------------------------------------------------- welcome
  B.views.welcome = {
    render(root) {
      const feat = [
        ['bitcoin', 'Crypto, stocks & ETFs', 'Live prices from CoinGecko & Yahoo Finance, gain/loss, allocation and 24h moves.'],
        ['home', 'Real estate & rentals', 'Equity, LTV, cap rate, cash-on-cash, DSCR, tenants and lease expirations.'],
        ['loan', 'Loan payoff engine', 'Full amortization, extra-payment simulator, avalanche vs snowball debt plans.'],
        ['budget', 'Budgets & spending', 'Every bank and card, monthly budgets by category, CSV import with auto-categorize.'],
        ['coins', 'Dividends & passive', 'Dividend sync, payout calendar, projected yearly income from every source.'],
        ['bolt', 'Automation', 'Auto-posting bills & paychecks, loan payments that amortize themselves, reminders.'],
      ];
      root.innerHTML = `<div class="welcome">
        <div class="brand-mark">B</div>
        <h1>Welcome to <span>BLAM</span></h1>
        <p>Your private command center for everything you own and owe. All data stays on this computer — no accounts, no cloud, no tracking.</p>
        <div class="page-a" style="justify-content:center">
          <button class="btn primary" data-act="start">${UI.icon('plus', 15)} Start fresh</button>
          <button class="btn" data-act="demo">${UI.icon('dashboard', 15)} Explore with demo data</button>
          <button class="btn ghost" data-act="import">${UI.icon('upload', 15)} Restore a backup</button>
        </div>
        <div class="welcome-grid">${feat.map(([i, t, d]) => `<div class="card">${UI.icon(i, 22)}<h4>${t}</h4><p>${d}</p></div>`).join('')}</div>
      </div>`;
      UI.bind(root, {
        start: () => { S.setting('onboarded', true); B.go('accounts'); setTimeout(() => B.views.accounts.add(), 150); },
        demo: async () => { await S.replaceAll(B.sampleData()); S.setting('onboarded', true); B.sampleBackfill(); B.rerender(); UI.toast('Demo data loaded — clear it any time in Settings'); A.refreshPrices({ quiet: true }); },
        import: () => B.views.settings.importJson(),
      });
    },
  };

  // ------------------------------------------------------------- quick add
  function quickAdd() {
    const opts = [
      ['list', 'Transaction', () => B.views.transactions.add()],
      ['bank', 'Bank / Card', () => B.views.accounts.add()],
      ['bitcoin', 'Crypto / Stock', () => B.views.investments.add()],
      ['home', 'Property', () => B.views.realestate.add()],
      ['loan', 'Loan', () => B.views.loans.add()],
      ['repeat', 'Recurring bill / income', () => B.views.recurring.add()],
      ['gem', 'Metals', () => B.views.metals.add()],
      ['coins', 'Passive income asset', () => B.views.income.addPassive()],
      ['target', 'Goal', () => B.views.goals.add()],
    ];
    const m = UI.modal({
      title: 'Quick add',
      body: `<div class="grid g3">${opts.map(([i, l], k) => `<button class="btn" style="justify-content:flex-start;padding:14px" data-k="${k}">${UI.icon(i)}<span>${l}</span></button>`).join('')}</div>`,
    });
    m.body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { m.close(); setTimeout(opts[+b.dataset.k][2], 200); }));
  }

  // ------------------------------------------------------------- lock
  function showLock() {
    if (!S.state.settings.pinHash) { UI.toast('Set a PIN in Settings to enable locking', 'warn'); return; }
    const el = document.createElement('div');
    el.className = 'lock-screen';
    el.innerHTML = `<div class="lock-box"><div class="brand-mark">B</div><h2>BLAM</h2><p>Enter your PIN to unlock</p>
      <input type="password" class="input" inputmode="numeric" maxlength="12" autofocus></div>`;
    document.body.appendChild(el);
    const input = el.querySelector('input');
    setTimeout(() => input.focus(), 50);
    input.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      if (await U.sha256(input.value) === S.state.settings.pinHash) el.remove();
      else { input.value = ''; input.classList.remove('shake'); void input.offsetWidth; input.classList.add('shake'); }
    });
  }
  B.lock = showLock;

  // ------------------------------------------------------------- boot
  async function boot() {
    await S.load();
    const tb = document.querySelector('.topbar');
    tb.querySelector('[data-act="refresh"]').innerHTML = UI.icon('refresh');
    tb.querySelector('[data-act="lock"]').innerHTML = UI.icon('lock');
    tb.querySelector('[data-act="quickadd"]').innerHTML = `${UI.icon('plus', 15)}<span>Add</span>`;
    UI.bind(tb, {
      refresh: () => A.refreshPrices(),
      privacy: () => { S.setting('privacy', !S.state.settings.privacy); updateChrome(); },
      lock: showLock,
      quickadd: quickAdd,
    });
    // re-render active view whenever state changes (debounced)
    S.on(U.debounce(() => B.rerender(), 30));
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', (e) => {
      if (document.querySelector('.lock-screen')) return; // no shortcuts while locked
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); quickAdd(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r' && e.shiftKey) { e.preventDefault(); A.refreshPrices(); }
    });
    if (S.state.settings.pinHash) showLock();
    route();
    if (S.loadProblem) {
      UI.modal({
        title: S.loadProblem.recovered ? 'Data restored from backup' : 'Your data could not be loaded',
        body: `<div class="callout ${S.loadProblem.recovered ? 'info' : 'warn'}">${UI.icon('info')}<div>${U.esc(S.loadProblem.msg)}</div></div>
          ${window.blam ? `<div class="page-a mt">${UI.btn('Open data folder', 'folder', { icon: 'report' })}</div>` : ''}`,
      }).body.addEventListener('click', (e) => { if (e.target.closest('[data-act="folder"]')) window.blam.openDataFolder(); });
    }
    A.start();
    setInterval(updateChrome, 30000);
    window.addEventListener('online', updateChrome);
    window.addEventListener('offline', updateChrome);
  }
  boot();
})(window.BLAM);
