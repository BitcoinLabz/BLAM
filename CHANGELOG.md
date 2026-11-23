# Changelog

Each `## x.y.z` section becomes the GitHub Release notes for that version.

## 1.1.0

**Automatic bank & card sync (SimpleFIN)**
- New **Bank Sync** screen: paste a SimpleFIN Bridge setup token and BLAM pulls in your checking, savings, credit cards, brokerages and loans, with balances and transactions.
- Each bank account is linked automatically: to an existing BLAM account with the same name, or to a new one created with the right type (credit card, savings, 401(k), loan…). You can relink any account, or stop syncing it, at any time.
- Balances match what your bank reports. Loan accounts update the loan balance. Transactions are categorized with your rules.
- No duplicates: transactions are matched by their bank ID, and transactions you already entered or imported from CSV are recognised instead of added again.
- Syncs automatically every 6 hours while BLAM is open (adjustable), and imports 30, 45 or 90 days of history for newly linked accounts.
- The access key is encrypted with your OS keychain (Keychain, Windows DPAPI, GNOME Keyring / KWallet). It is never written to your data file or backups, and the app's screens never see it. Disconnect deletes it.
- Banks & Cards shows a **synced** badge on linked accounts, plus a one-click Connect / Sync button.


**Live market data**
- Fixed the 24h change for every stock, ETF and metal. It was measured against the close five trading days ago instead of yesterday's close (VOO showed −8.3% on a −3.4% day).
- Yahoo Finance now falls back automatically: query1 → query2 → cookie/crumb handshake → Nasdaq's public quote API. Gold and silver fall back to PAXG/KAG spot via CoinGecko.
- CoinGecko rate limits (HTTP 429) are retried with backoff instead of failing.
- Holdings whose price can't be fetched show a **price unavailable** tag with the reason, instead of silently keeping an old price.
- The top-bar price indicator now says what actually happened: live, partially unavailable, all sources failed, or offline. Prices refresh automatically when the connection returns.
- Dividend sync falls back to Nasdaq history and reports which symbols were unavailable.

**CSV import**
- Imports exports from Chase (card and checking), American Express, Capital One (card and 360 checking) and Crypto.com without manual mapping.
- Amex-style files, where charges are positive, are detected and flipped automatically.
- Handles debit/credit columns, a Debit/Credit type column, parentheses negatives, `CR`/`DR` suffixes and MM/DD/YYYY or timestamp dates.
- Better auto-categorization: card payments ("Payment Thank You-Mobile" was being filed as Fuel), bank fees and crypto buys.

**Your data**
- A damaged data file is never overwritten. BLAM keeps it aside and restores your newest backup.
- **Erase all**, **Restore** and **Load demo** save a safety copy first, which you can restore from Settings.
- Deleting an account no longer leaves bills auto-posting into it; deleting a property clears its links.

**Fixes**
- Toggle switches in every form were drawn incorrectly.
- Number and date inputs now use the dark theme.
- Quick add (Ctrl/⌘+K) can no longer open on top of the PIN lock screen.
- Debt planner layout at small window sizes.
- The release tag now always points at the commit the installers were built from.
- Release builds are ready for Windows and macOS code signing and notarization; signing turns on automatically once the certificates are added.

## 1.0.0

- First release.
