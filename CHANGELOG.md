# Changelog

Each `## x.y.z` section becomes the GitHub Release notes for that version.

## 1.0.1

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
