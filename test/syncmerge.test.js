/* Tests for the sync merge (src/renderer/js/syncmerge.js). Run: node test/syncmerge.test.js */
'use strict';
const assert = require('assert');
const M = require('../src/renderer/js/syncmerge.js');

const clone = (o) => JSON.parse(JSON.stringify(o));
const base0 = () => ({
  settings: { currency: 'USD', userName: 'Pat', privacy: false, autoUpdate: true },
  accounts: [{ id: 'chk', name: 'Checking', type: 'checking', balance: 1000 }, { id: 'cc', name: 'Card', type: 'credit', balance: 200 }],
  transactions: [{ id: 't1', accountId: 'chk', amount: -50, payee: 'Kroger', date: '2026-11-01' }],
  categories: [{ id: 'x1', name: 'Groceries', budget: 400 }],
  loans: [{ id: 'car', name: 'Car', balance: 10000, payments: [] }],
  recurring: [], holdings: [], snapshots: [], metalPrices: { gold: 3000 },
});
// Simulate a device: start from the synced base, make edits (keeping balances consistent like the app does).
const addTx = (s, t) => { s.transactions.push(t); const a = s.accounts.find((x) => x.id === t.accountId); a.balance = Math.round((a.balance + (a.type === 'credit' ? -t.amount : t.amount)) * 100) / 100; };
function sync(local, remote, base, mtL = {}, mtR = {}, tie) {
  const L = M.units(local), R = M.units(remote);
  const r = M.mergeUnits(L, R, base, mtL, mtR, tie);
  M.reconcile(r.units, r.picked, L, R);
  return M.apply(clone(local), r.units);
}
const acc = (s, id) => s.accounts.find((a) => a.id === id);

const tests = {
  'both devices add different transactions to the same account -> both kept, balance has both'() {
    const b = base0(), base = M.hashes(M.units(b));
    const pc = clone(b); addTx(pc, { id: 'pc1', accountId: 'chk', amount: -20, payee: 'Coffee', date: '2026-11-02' });
    const phone = clone(b); addTx(phone, { id: 'ph1', accountId: 'chk', amount: 500, payee: 'Paycheck', date: '2026-11-02' });
    const merged = sync(phone, pc, base);
    assert.deepStrictEqual(merged.transactions.map((t) => t.id).sort(), ['ph1', 'pc1', 't1'].sort());
    assert.strictEqual(acc(merged, 'chk').balance, 1000 - 20 + 500);
    const other = sync(pc, phone, base); // same result from the other device's point of view
    assert.strictEqual(acc(other, 'chk').balance, 1480);
  },
  'credit card purchases on two devices -> owed balance includes both'() {
    const b = base0(), base = M.hashes(M.units(b));
    const pc = clone(b); addTx(pc, { id: 'a', accountId: 'cc', amount: -30, date: '2026-11-03' });
    const ph = clone(b); addTx(ph, { id: 'b', accountId: 'cc', amount: -70, date: '2026-11-03' });
    assert.strictEqual(acc(sync(pc, ph, base), 'cc').balance, 300);
  },
  'same transaction edited on both -> most recent edit wins, balance follows'() {
    const b = base0(), base = M.hashes(M.units(b));
    const pc = clone(b); pc.transactions[0].amount = -60; acc(pc, 'chk').balance = 990;
    const ph = clone(b); ph.transactions[0].amount = -80; acc(ph, 'chk').balance = 970;
    const k = 'transactions\u0001t1', ka = 'accounts\u0001chk';
    const m = sync(pc, ph, base, { [k]: 100, [ka]: 100 }, { [k]: 200, [ka]: 200 });
    assert.strictEqual(m.transactions[0].amount, -80);
    assert.strictEqual(acc(m, 'chk').balance, 970);
  },
  'delete on one device, untouched on the other -> deleted, balance restored'() {
    const b = base0(), base = M.hashes(M.units(b));
    const ph = clone(b); ph.transactions = []; acc(ph, 'chk').balance = 1050;
    const pc = clone(b);
    const m = sync(pc, ph, base);
    assert.strictEqual(m.transactions.length, 0);
    assert.strictEqual(acc(m, 'chk').balance, 1050);
  },
  'recurring bill auto-posted on BOTH devices (same id) -> counted once'() {
    const b = base0(), base = M.hashes(M.units(b));
    const t = { id: 'r-rent-2026-11-05', recurringId: 'rent', accountId: 'chk', amount: -900, date: '2026-11-05' };
    const pc = clone(b); addTx(pc, clone(t));
    const ph = clone(b); addTx(ph, clone(t));
    const m = sync(pc, ph, base);
    assert.strictEqual(m.transactions.filter((x) => x.recurringId).length, 1);
    assert.strictEqual(acc(m, 'chk').balance, 100);
  },
  'loan autopay on PC + loan edited on phone -> edit kept AND payment applied once'() {
    const b = base0(), base = M.hashes(M.units(b));
    const pc = clone(b); pc.loans[0].balance = 9600; pc.loans[0].payments = [{ date: '2026-11-05', principal: 400 }];
    const ph = clone(b); ph.loans[0].rate = 5.5;
    const k = 'loans\u0001car';
    const m = sync(pc, ph, base, { [k]: 100 }, { [k]: 200 }); // phone edit is newer
    assert.strictEqual(m.loans[0].rate, 5.5);
    assert.strictEqual(m.loans[0].balance, 9600);
    assert.strictEqual(m.loans[0].payments.length, 1);
    const both = clone(pc);
    assert.strictEqual(sync(both, pc, base).loans[0].balance, 9600, 'same payment on both devices is not subtracted twice');
  },
  'categories match by name, so a fresh device does not duplicate them'() {
    const pc = base0();
    const fresh = { settings: {}, accounts: [], transactions: [], categories: [{ id: 'other-id', name: 'Groceries', budget: 0 }], loans: [] };
    const m = sync(fresh, pc, {}, {}, {}, 'remote');
    assert.strictEqual(m.categories.length, 1);
    assert.strictEqual(m.categories[0].budget, 400, 'remote wins ties when joining');
  },
  'device-only settings are never synced'() {
    const b = base0(), base = M.hashes(M.units(b));
    const pc = clone(b); pc.settings.privacy = true; pc.settings.userName = 'Sam';
    const ph = clone(b);
    const m = sync(ph, pc, base);
    assert.strictEqual(m.settings.userName, 'Sam');
    assert.strictEqual(m.settings.privacy, false);
    assert.ok(!('settings\u0001privacy' in M.units(pc)));
  },
  'nothing changed -> no changed keys; key order does not matter'() {
    const b = base0(), base = M.hashes(M.units(b));
    const s = clone(b); s.accounts[0] = { balance: 1000, type: 'checking', name: 'Checking', id: 'chk' };
    assert.deepStrictEqual(M.changedKeys(M.units(s), base), []);
    s.transactions.push({ id: 'n', accountId: 'chk', amount: -1 });
    assert.deepStrictEqual(M.changedKeys(M.units(s), base), ['transactions\u0001n']);
  },
  'hasUserData'() {
    assert.strictEqual(M.hasUserData({ categories: [{ name: 'x' }] }), false);
    assert.strictEqual(M.hasUserData(base0()), true);
  },
};
let failed = 0;
for (const [n, fn] of Object.entries(tests)) { try { fn(); console.log('  ok  ', n); } catch (e) { failed++; console.log('  FAIL', n, '\n       ', e.message); } }
console.log(failed ? `\n${failed} failed` : '\nsync merge tests passed');
process.exit(failed ? 1 : 0);
