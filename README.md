<p align="center"><img src="build/icon.png" width="110" alt="BLAM"></p>

<h1 align="center">BLAM — Bitcoin Labz Asset Manager</h1>

<p align="center"><b>A private, local-first desktop command center for your entire financial life.</b><br>
Crypto · Stocks · ETFs · Dividends · Real Estate · Rentals · Mortgages · Metals · Passive Income · Budgets · Every Bank & Card</p>

<p align="center"><img src="docs/dashboard.png" alt="BLAM dashboard" width="900"></p>

---

## Why BLAM

Most finance apps want your bank password and live in someone else's cloud. BLAM runs **entirely on your computer**. No account, no subscription, no telemetry. The only network calls are anonymous price lookups for your tickers.

## Features

| Area | What you get |
|---|---|
| **Dashboard** | Net worth with daily history, asset allocation, today's market move, passive income, cash flow, savings rate, upcoming bills, top holdings, debt payoff progress |
| **Crypto & Stocks** | Live prices (CoinGecko for 10,000+ coins, Yahoo Finance for stocks/ETFs/funds), 24h change, cost basis, gain/loss, weight, yield, buy/sell trades with realized gain (average-cost), coin search |
| **Dividends & Passive** | One-click dividend sync (payout history + trailing yield), dividend calendar with 12-month forward projection, yield on cost, passive assets (vending, notes, royalties, staking, businesses…) |
| **Real Estate** | Equity, LTV, NOI, cap rate, cash-on-cash, DSCR, GRM, 1% rule, 10-year equity projection, multi-unit tenants & lease expiration alerts |
| **Loans & Payoff** | Full amortization schedules, payoff date charts, extra-payment & lump-sum **what-if simulator**, refinance test, interest saved, CSV export, **avalanche vs. snowball** planner across every loan and credit card |
| **Banks & Cards** | Checking, savings, HYSA, CDs, credit cards, 401(k)/IRA, HSA, exchanges. Credit utilization, interest cost, APY earnings, reconcile balances |
| **Transactions** | Fast ledger, search & filters, bulk re-categorize, **CSV import from any bank** with column mapping, duplicate detection & smart auto-categorization |
| **Budget & Spending** | Monthly budgets by category, auto-budget from your 3-month average, spending pace vs. budget, 12-month trend by group |
| **Bills & Recurring** | Paychecks, bills, subscriptions, transfers and **self-amortizing loan payments** that auto-post on schedule |
| **Precious Metals** | Gold, silver, platinum, palladium, copper valued at live COMEX spot, gold/silver ratio |
| **Goals & FIRE** | Goals that auto-track accounts, holdings (e.g. "1 BTC") or loan payoff; FIRE calculator pre-filled from your real data with Coast FI |
| **Reports** | Net worth composition over time, balance sheet, month-by-month income statement, top merchants, CSV export, print to PDF |
| **Security** | Optional PIN lock (SHA-256), privacy mode that blurs every number, sandboxed Electron renderer |

### Automation

- Recurring items **auto-post** on their due date (and catch up on days the app was closed)
- Loan payments split **principal vs. interest** and reduce the loan balance automatically
- Prices refresh every 5–240 minutes while open
- Dividend history sync and payout logging
- Daily net-worth snapshot, daily rolling backups (30 days kept)
- Desktop notifications for bills coming due
- Categorization rules + built-in merchant detection on every new or imported transaction

<p align="center"><img src="docs/loan-simulator.png" width="900" alt="Loan payoff simulator"></p>

## Download & install

### Option 1 — Download the installer (easiest)
Go to **[Releases → Latest](https://github.com/BitcoinLabz/BLAM/releases/latest)** and download:
- **Windows:** `BLAM-Setup-x.x.x.exe` (installer) or `BLAM-Portable-x.x.x.exe` (runs without installing)
  - If Windows SmartScreen appears, click **More info → Run anyway** (the app isn't code-signed yet).
- **macOS (Intel & Apple Silicon):** `BLAM-x.x.x-mac-universal.dmg` — drag BLAM to Applications, then the first time **right-click → Open**.
- **Linux:** `.AppImage` (make it executable, double-click) or `.deb` (`sudo apt install ./BLAM-*.deb`)

> Every push to `main` automatically builds all three platforms with GitHub Actions, launch-tests the packaged app and publishes a Release for the version in `package.json`, with notes taken from that version's section in [`CHANGELOG.md`](CHANGELOG.md). To cut a new release, bump `version` and add a changelog section. If the version's tag already exists at another commit, the build still runs but nothing is published, so a tag always matches its installers.

### Option 2 — Run from source
Requires [Node.js 20+](https://nodejs.org).

```bash
git clone https://github.com/BitcoinLabz/BLAM.git
cd BLAM
npm install
npm start
```

Build your own installer:

```bash
npm run dist:win     # Windows .exe
npm run dist:mac     # macOS .dmg
npm run dist:linux   # AppImage + .deb
npm test             # offline unit tests (market-data fallbacks, CSV parsing)
```

## Getting started

1. Launch BLAM and choose **Start fresh** (or **Explore with demo data** to look around first — clear it in Settings anytime).
2. Add your **Banks & Cards** with current balances.
3. Add **Crypto & Stocks** — prices go live automatically.
4. Add **Loans** (check "auto-post" to put payments on autopilot) and **Properties** (link the mortgage).
5. Import a CSV from your bank under **Transactions**, then click **Auto-budget**.
6. Set up **Bills & Recurring** so paychecks, bills and transfers post themselves.

Shortcuts: `Ctrl/⌘ + K` quick add · `Ctrl/⌘ + Shift + R` refresh prices.

## Your data

Everything is stored in one JSON file in your OS app-data folder:

| OS | Location |
|---|---|
| Windows | `%APPDATA%\BLAM\blam-data.json` |
| macOS | `~/Library/Application Support/BLAM/blam-data.json` |
| Linux | `~/.config/BLAM/blam-data.json` |

Daily backups live in the `backups/` folder next to it. Settings → **Export backup** saves a portable copy you can restore on any machine.

## Architecture

```
src/
├─ main/
│  ├─ main.js        Electron main: window, atomic JSON persistence, backups, market-data fetching, dialogs
│  └─ preload.js     Narrow contextBridge API (no Node in the renderer)
└─ renderer/
   ├─ index.html     Shell + strict Content-Security-Policy
   ├─ css/app.css    Design system
   └─ js/
      ├─ util.js         Formatting, dates, CSV, frequencies
      ├─ finance.js      Amortization, payoff strategies, real-estate & investment math
      ├─ store.js        State, schema migrations, CRUD, balance accounting, valuation
      ├─ charts.js       Zero-dependency SVG charts (line/area, bar, donut, sparkline) with tooltips
      ├─ ui.js           Icons, modals, schema-driven forms, toasts
      ├─ automation.js   Recurring engine, loan autopay, live prices, dividend sync, reminders
      ├─ sample.js       Demo dataset
      ├─ app.js          Router & app shell
      └─ views/          One module per screen
```

Zero runtime dependencies — just Electron. Security defaults: `contextIsolation`, `sandbox`, no `nodeIntegration`, CSP-restricted network, external links open in your browser.

## Disclaimer

BLAM is a personal tracking tool, not financial, tax or legal advice. Market data comes from free public endpoints and may be delayed or unavailable.

## License

MIT © Bitcoin Labz
