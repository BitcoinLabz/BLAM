/* BLAM — Bank Import: bring in balances and transactions from every bank and card, free. */
'use strict';
(function (B) {
  const { U, S, UI } = B;

  B.views.bankimport = {
    render(root) {
      const s = S.state;
      const fromFiles = s.transactions.filter((t) => t.extId && t.extId.startsWith('ofx:')).length;
      const fromCsv = s.transactions.filter((t) => t.imported && !t.extId).length;
      const updated = s.accounts.filter((a) => !a.archived && a.balanceSyncedAt).sort((a, b) => String(b.balanceSyncedAt).localeCompare(String(a.balanceSyncedAt)));

      root.innerHTML = `
        ${UI.pageHead('Bank Import', 'Bring in balances and transactions from every bank and card. Free, private and duplicate-safe.', UI.btn('Import bank file', 'importfile', { icon: 'upload', kind: 'primary' }))}
        <div class="grid g-21">
          ${UI.card({
            title: 'Import your bank\'s download file',
            sub: 'Works with virtually every US bank, credit union and card. No subscription, no third party, no passwords shared.',
            actions: '<span class="tag" style="--tc:#2ecf8f">Free</span>',
            body: `
              <ol class="steps">
                <li>Sign in to your bank's website and open <b>Download transactions</b> / <b>Export</b> (often under Statements or Activity).</li>
                <li>Choose <b>Quicken (QFX)</b>, <b>QuickBooks (QBO)</b> or <b>OFX</b>. <b>CSV</b> works too, but can't set balances or detect duplicates as precisely.</li>
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
        importfile: () => B.views.transactions.importCsv(),
        addacc: () => B.views.accounts.add(),
      });
    },
  };
})(window.BLAM);
