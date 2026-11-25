-- BLAM sync server: one encrypted blob per sync key. The server never sees readable data.
CREATE TABLE IF NOT EXISTS vaults (
  id      TEXT PRIMARY KEY,   -- derived from the sync key (one-way)
  auth    TEXT NOT NULL,      -- SHA-256 of the write token (also derived from the sync key)
  rev     INTEGER NOT NULL,   -- increases on every write; used for conflict detection
  blob    TEXT NOT NULL,      -- base64(iv || AES-GCM ciphertext of gzip(JSON))
  updated INTEGER NOT NULL    -- ms since epoch; vaults untouched for 12 months are deleted
);
CREATE INDEX IF NOT EXISTS vaults_updated ON vaults(updated);
