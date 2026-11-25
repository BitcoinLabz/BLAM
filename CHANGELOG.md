# Changelog

Each `## x.y.z` section becomes the GitHub Release notes for that version.

## 1.5.2

**Updates arrive with a pop-up**
- Desktop: when a new version has downloaded, BLAM pops up **"BLAM x.y.z is ready: Restart & update / Later"**. Later installs it automatically the next time you close BLAM. Checks run 15 seconds after launch and every 2 hours.
- Phone: new versions install as soon as they're found. If you've just opened the app it reloads into the new version straight away; otherwise it asks **"BLAM has been updated: Restart now / Later"**. Later applies the update when you next return to the app. Checks run every time you open the app and every 30 minutes.
- Phones on 1.5.1 or earlier need to fully close and reopen BLAM once to get this.

## 1.5.1

- New BLAM logo: a clean, rounded orange ₿ on a dark tile. It's used for the app icon on Windows, Mac and Linux, the iPhone and Android Home Screen icons, and inside the app.

## 1.5.0

**Statement → AI → BLAM**
- Turn any PDF statement, photo or screenshot into transactions: on **Bank Import**, tap **Copy prompt**, paste it into any AI chatbot (ChatGPT, Claude, Gemini…) with your statement, then paste the AI's answer back into BLAM. No file to save.
- The prompt includes an example and your own category names, so transactions arrive already categorized.
- A review list with a checkbox per row shows what's **New**, what's **Already in BLAM**, and what your recurring bills already **Auto-posted**. Those start unticked, so nothing is counted twice.
- Recurring bills are recognized by amount (within $1 or 2%), date (within 5 days) and keywords from their name, even when the bill was auto-posted to a different account. Add **Statement keywords** to a recurring item (e.g. `NFLX`) for anything with an unusual description.
- The same recognition now applies to bank-file (OFX/QFX/QBO) and regular CSV imports.

## 1.4.0

**BLAM on your phone (free)**
- New phone version for iPhone and Android: open the link, then **Add to Home Screen** (iPhone: Share → Add to Home Screen; Android: Install app). It gets its own icon, opens full-screen and works offline.
- Designed for small screens: bottom tabs (Home, Accounts, Activity, Invest, More), single-column pages, forms that slide up from the bottom, and touch-sized controls.
- Your data stays on the phone, in the browser's app storage, with daily and before-erase backups just like desktop. Nothing is sent to the website.
- Crypto prices update live on the phone. Stock, ETF and metal prices come from your desktop app (Export backup → Restore on the phone) or from prices you enter, because phone browsers can't reach those quote services.
- Import bank files (OFX / QFX / QBO / CSV) straight from your phone's Downloads or Files.
- The phone app updates itself the next time you open it after a new release.

## 1.3.0

**Automatic updates**
- BLAM now updates itself from GitHub Releases. It checks when it opens and every 6 hours, downloads in the background, and installs when you restart. An **Update** button appears in the top bar when a new version is ready.
- New **Settings → Updates** card: current version, **Check for updates**, **Restart & update**, and a switch to turn automatic checks off.
- Works with the Windows installer and the Linux AppImage. The portable `.exe` and the `.deb` show a link to the releases page instead. macOS will update itself once builds are code-signed.

**100% free**
- Removed the optional SimpleFIN bank sync, which needed a paid third-party subscription. Use **Bank Import** (OFX / QFX / QBO / CSV) instead: it's free and works with virtually every bank.
- Any SimpleFIN access key saved by 1.1.x is deleted from disk on first launch. Accounts and transactions you already synced are kept.

## 1.2.0

**Free bank import, with no subscription**
- **Import bank file** now reads OFX, QFX and QBO, the free "Download for Quicken / QuickBooks" file that virtually every US bank, credit union and card offers. CSV still works too.
- Each transaction's unique bank ID is kept, so re-importing the same or an overlapping download never creates duplicates. Transactions you already entered or imported from CSV are matched instead of added again.
- The right account is picked automatically by its last 4 digits (or where that account's file went last time). You can also create the account straight from the file.
- Balances can be set to exactly what the bank reports in the file.
- The **Bank Import & Sync** screen leads with the free import. Automatic sync through SimpleFIN is now clearly marked as an optional third-party service that charges its own fee; BLAM never requires it.

## 1.1.0

**Automatic bank & card sync (SimpleFIN)**
- New **Bank Sync** screen: paste a SimpleFIN Bridge setup token and BLAM pulls in your checking, savings, credit cards, brokerages and loans, with balances and transactions.
- Each bank account is linked automatically: to an existing BLAM account with the same name, or to a new one created with the right type (credit card, savings, 401(k), loan…). You can relink any account, or stop syncing it, at any time.
- Balances match what your bank reports. Loan accounts update the loan balance. Transactions are categorized with your rules.
- No duplicates: transactions are matched by their bank ID, and transactions you already entered or imported from CSV are recognised instead of added again.
- Syncs automatically every 6 hours while BLAM is open (adjustable), and imports 30, 45 or 90 days of history for newly linked accounts.
- The access key is encrypted with your OS keychain (Keychain, Windows DPAPI, GNOME Keyring / KWallet). It is never written to your data file or backups, and the app's screens never see it. Disconnect deletes it.
- Banks & Cards shows a **synced** badge on linked accounts, plus a one-click Connect / Sync button.

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
