/* Tests for renderer utilities that run without a browser. Run: node test/util.test.js */
'use strict';
const assert = require('assert');
global.window = {};
require('../src/renderer/js/util.js');
const U = window.BLAM.U;

const amounts = [
  ['-6.45', -6.45], ['500.00', 500], ['(12.34)', -12.34], ['$(12.34)', -12.34], ['($1,234.56)', -1234.56],
  ['"1,024.50"'.replace(/"/g, ''), 1024.5], ['12.34-', -12.34], ['12.34 CR', 12.34], ['12.34 DR', -12.34],
  ['−5.00', -5], ['-$5', -5], ['$-5.00', -5], ['1.234,56', 1234.56], ['1,234', 1234], ['', 0], ['N/A', 0],
];
for (const [inp, out] of amounts) assert.strictEqual(U.parseAmount(inp), out, `parseAmount(${JSON.stringify(inp)})`);

const dates = [['11/18/2026', '2026-11-18'], ['1/5/26', '2026-01-05'], ['2026-11-18', '2026-11-18'], ['2026-11-18 14:02:11', '2026-11-18'], ['Nov 18, 2026', '2026-11-18']];
for (const [inp, out] of dates) assert.strictEqual(U.parseAnyDate(inp), out, `parseAnyDate(${inp})`);

const rows = U.csvParse('a,b,c\r\n1,"x, ""y""\nz",3\n\n4,5,6,\n');
assert.deepStrictEqual(rows, [['a', 'b', 'c'], ['1', 'x, "y"\nz', '3'], ['4', '5', '6', '']]);

// recurring schedule helpers
assert.strictEqual(U.nextOccurrence('2026-01-31', 'monthly', 31), '2026-02-28');
assert.strictEqual(U.nextOccurrence('2026-02-28', 'monthly', 31), '2026-03-31');
assert.strictEqual(U.nextOccurrence('2026-01-10', 'semimonthly'), '2026-01-15');
assert.strictEqual(U.nextOccurrence('2026-01-15', 'semimonthly'), '2026-02-01');
// OFX / QFX (SGML 1.x and XML 2.x)
const fs = require('fs');
const sg = U.parseOfx(fs.readFileSync(__dirname + '/fixtures/bank-checking.qfx', 'utf8'));
assert.strictEqual(sg.length, 1);
assert.strictEqual(sg[0].acctId, '000012345678');
assert.strictEqual(sg[0].acctType, 'CHECKING');
assert.strictEqual(sg[0].credit, false);
assert.strictEqual(sg[0].balance, 3245.88);
assert.strictEqual(sg[0].balanceDate, '2026-11-20');
assert.deepStrictEqual(sg[0].transactions.map((t) => [t.date, t.amount, t.fitid]), [['2026-11-18', -84.12, '202611180001'], ['2026-11-15', 2500, '202611150001'], ['2026-11-10', -120, '202611100001'], ['2026-11-09', -15.49, '202611090001']]);
assert.strictEqual(sg[0].transactions[0].memo, 'DEBIT CARD PURCHASE ANN ARBOR MI');
assert.strictEqual(sg[0].transactions[3].payee, 'NETFLIX.COM & MORE');
const xml = U.parseOfx(fs.readFileSync(__dirname + '/fixtures/card-ofx2.ofx', 'utf8'));
assert.strictEqual(xml.length, 1);
assert.strictEqual(xml[0].credit, true);
assert.strictEqual(xml[0].acctId, 'XXXXXXXXXXXX4321');
assert.strictEqual(xml[0].balance, -572.64);
assert.strictEqual(xml[0].org, 'CardIssuer');
assert.deepStrictEqual(xml[0].transactions.map((t) => [t.date, t.amount, t.payee]), [['2026-11-18', -6.45, 'STARBUCKS STORE 12345'], ['2026-11-15', 500, 'PAYMENT THANK YOU'], ['2026-11-14', -38.2, 'SHELL OIL 57444']]);
assert.strictEqual(U.parseOfx('Date,Amount\n1/1/2026,5'), null, 'CSV is not OFX');

console.log('util tests passed');
