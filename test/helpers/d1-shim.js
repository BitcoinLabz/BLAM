/* Minimal Cloudflare D1 stand-in on node:sqlite, for testing the sync worker locally. */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

function createD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec(fs.readFileSync(path.join(__dirname, '../../worker/schema.sql'), 'utf8'));
  return {
    prepare(sql) {
      let args = [];
      const stmt = () => db.prepare(sql);
      return {
        bind(...a) { args = a; return this; },
        async first() { return stmt().get(...args) || null; },
        async all() { return { results: stmt().all(...args) }; },
        async run() { const r = stmt().run(...args); return { meta: { changes: Number(r.changes) } }; },
      };
    },
    _db: db,
  };
}
module.exports = { createD1 };
