/* BLAM — Bank Import: bring in balances and transactions from every bank and card, free. */
'use strict';
(function (B) {
  const { U, S, UI } = B;

  /** The prompt people paste into any AI chatbot together with their statement (PDF, photo, screenshot). */
  function aiPrompt() {
    const cats = S.state.categories.map((c) => c.name).join(', ');
    return `Convert the attached bank or credit card statement into a CSV file for my budgeting app.

Rules:
- Reply with ONLY the CSV inside one code block. No other text.
- Columns, in this order: Date,Description,Amount,Category
- Date: YYYY-MM-DD
- Description: the merchant or payee as shown, cleaned up. No card or account numbers.
- Amount: NEGATIVE for money going out (purchases, bills, fees, interest, withdrawals, transfers out). POSITIVE for money coming in (deposits, paychecks, refunds, credits). On a credit card statement, purchases are negative and payments made to the card are positive.
- Write amounts as plain numbers: no $ sign, no thousands commas, a dot for decimals (e.g. -1234.56).
- Category: choose the closest from this list, or leave it blank: ${cats}
- One row per transaction. Skip balances, totals, summaries and anything that isn't a single transaction.
- If a line is unreadable, skip it instead of guessing.
- If a description contains a comma, wrap it in double quotes.

Example of the exact format:
\`\`\`csv
Date,Description,Amount,Category
2026-11-03,Kroger,-84.12,Groceries
2026-11-05,Acme Corp Payroll,2500.00,Salary
2026-11-09,Netflix,-15.49,Subscriptions
2026-11-12,"Shell Oil, Ann Arbor",-38.20,Fuel
2026-11-15,Payment Thank You,500.00,Credit Card Payment
\`\`\`

Here is my statement:`;
  }
  const AIS = [['ChatGPT', 'https://chatgpt.com/'], ['Claude', 'https://claude.ai/new'], ['Gemini', 'https://gemini.google.com/app']];
  const openLink = (url) => (window.blam?.openExternal ? window.blam.openExternal(url) : window.open(url, '_blank', 'noopener'));

  B.views.bankimport = {
    aiPrompt,
    render(root) {
      const s = S.state;
      const fromFiles = s.transactions.filter((t) => t.extId && t.extId.startsWith('ofx:')).length;
      const fromCsv = s.transactions.filter((t) => t.imported && !t.extId).length;
      const updated = s.accounts.filter((a) => !a.archived && a.balanceSyncedAt).sort((a, b) => String(b.balanceSyncedAt).localeCompare(String(a.balanceSyncedAt)));

      root.innerHTML = `
        ${UI.pageHead('Bank Import', 'Bring in balances and transactions from every bank and card. Free, private and duplicate-safe.', UI.btn('Import bank file', 'importfile', { icon: 'upload', kind: 'primary' }))}
        ${UI.card({
          title: 'Statement → AI → BLAM',
          sub: 'Turn any PDF statement, photo or screenshot into transactions in about a minute.',
          actions: '<span class="tag" style="--tc:#8b5cf6">Any AI chatbot</span>',
          body: `
            <div class="ai-steps">
              <div class="ai-step"><div class="ai-n">1</div><div class="ai-b"><b>Copy the prompt</b><p>It tells the AI exactly how to format your transactions, with an example.</p>
                <div class="page-a">${UI.btn('Copy prompt', 'copyprompt', { icon: 'check', kind: 'primary' })}${UI.btn('Show prompt', 'showprompt', { icon: 'info' })}</div></div></div>
              <div class="ai-step"><div class="ai-n">2</div><div class="ai-b"><b>Paste it into an AI and attach your statement</b><p>Bank or credit card statement: PDF, photo or screenshot. One statement at a time works best.</p>
                <div class="page-a">${AIS.map(([n, u]) => `<button class="btn" data-act="ai" data-url="${u}">${UI.icon('report', 15)}<span>${n}</span></button>`).join('')}</div></div></div>
              <div class="ai-step"><div class="ai-n">3</div><div class="ai-b"><b>Paste the AI's answer here</b><p>BLAM sorts it into the right account, and skips anything already in BLAM, including bills your recurring items already posted.</p>
                <textarea class="input" id="ai-csv" rows="5" spellcheck="false" placeholder="Date,Description,Amount,Category&#10;2026-11-03,Kroger,-84.12,Groceries&#10;…"></textarea>
                <div class="page-a mt">${UI.btn('Review & import', 'pastecsv', { icon: 'upload', kind: 'primary' })}${UI.btn('or upload a .csv file', 'importfile', { icon: 'upload' })}</div></div></div>
            </div>
            <div id="prompt-box"></div>
            <p class="muted" style="margin:12px 0 0;font-size:12px">Privacy: the statement goes to the AI service you choose, under its terms. BLAM never sends it anywhere. Consider covering account numbers before uploading.</p>`,
        })}
        <div class="grid g-21 mt">
          ${UI.card({
            title: 'Import your bank\'s download file',
            sub: 'Works with virtually every US bank, credit union and card. No subscription, no third party, no passwords shared.',
            actions: '<span class="tag" style="--tc:#2ecf8f">Free</span>',
            body: `
              <ol class="steps">
                <li>Sign in to your bank's website and open <b>Download transactions</b> / <b>Export</b> (often under Statements or Activity).</li>
                <li>Choose <b>Quicken (QFX)</b>, <b>QuickBooks (QBO)</b> or <b>OFX</b>. These are the most precise, because each transaction has a bank ID and the file includes your balance. <b>CSV</b> works too.</li>
                <li>Click <b>Import bank file</b>. BLAM finds the right account by its last 4 digits (or creates it), skips anything already imported, sets the balance to what the bank reports, and categorizes everything.</li>
              </ol>
              <p class="muted" style="margin:12px 0 0">Tip: download once a week or month. Overlapping date ranges are fine, because duplicates are skipped automatically. You can import a file for each account, one after another.</p>
              <div class="page-a mt">${UI.btn('Import bank file', 'importfile', { icon: 'upload', kind: 'primary' })}${UI.btn('Add account manually', 'addacc', { icon: 'plus' })}</div>`,
          })}
          ${UI.card({
            title: 'Imported so far',
            body: `<div class="list">
              <div class="li"><div class="li-ic">${UI.icon('list')}</div><div class="li-m"><div class="li-t">${fromFiles.toLocaleString()} from bank files</div><div class="li-s">OFX / QFX / QBO, matched by bank ID</div></div></div>
              <div class="li"><div class="li-ic">${UI.icon('upload')}</div><div class="li-m"><div class="li-t">${fromCsv.toLocaleString()} from CSV</div><div class="li-s">Matched by date, amount and description</div></div></div>
              ${updated.slice(0, 6).map((a) => `<div class="li"><div class="li-ic">${UI.icon(S.accountKind(a) === 'credit' ? 'card' : 'bank')}</div><div class="li-m"><div class="li-t">${U.esc(a.name)}</div><div class="li-s">Balance from bank ${U.fmtDate(a.balanceSyncedAt)}</div></div><div class="li-r"><span class="amt">${U.money(a.balance)}</span></div></div>`).join('')}
            </div>`,
          })}
        </div>`;

      UI.bind(root, {
        copyprompt: async () => { UI.toast(await U.copy(aiPrompt()) ? 'Prompt copied. Paste it into your AI with the statement' : 'Could not copy. Use "Show prompt" and copy it by hand', 'ok', 4500); },
        showprompt: () => {
          const box = root.querySelector('#prompt-box');
          box.innerHTML = box.innerHTML ? '' : `<textarea class="input mt" rows="12" readonly spellcheck="false" style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px">${U.esc(aiPrompt())}</textarea>`;
        },
        ai: (d) => openLink(d.url),
        pastecsv: () => { const ta = root.querySelector('#ai-csv'); if (B.views.transactions.importText(ta.value) !== false) ta.value = ''; },
        importfile: () => B.views.transactions.importCsv(),
        addacc: () => B.views.accounts.add(),
      });
    },
  };
})(window.BLAM);
