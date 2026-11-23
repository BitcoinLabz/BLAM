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
console.log('util tests passed');
