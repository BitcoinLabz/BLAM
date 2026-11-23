/* The release notes come from CHANGELOG.md: every version needs its own "## x.y.z" heading. */
'use strict';
const assert = require('assert');
const fs = require('fs');
const { version } = require('../package.json');
const log = fs.readFileSync(`${__dirname}/../CHANGELOG.md`, 'utf8');
const heads = [...log.matchAll(/^## \[?v?(\d+\.\d+\.\d+)\]?\s*$/gm)].map((m) => m[1]);
assert.ok(heads.includes(version), `CHANGELOG.md needs a "## ${version}" section for this release`);
assert.strictEqual(heads[0], version, `the newest CHANGELOG.md section should be ${version}, found ${heads[0]}`);
assert.strictEqual(new Set(heads).size, heads.length, 'duplicate version headings in CHANGELOG.md');
const section = (log.split(/^## .*$/m)[1] || '').split('\n').filter((l) => l.trim()).length;
assert.ok(section > 0 && section <= 30, `the ${version} section has ${section} lines. Is an older version's "## x.y.z" heading missing?`);
console.log(`changelog ok (${heads.join(', ')})`);
