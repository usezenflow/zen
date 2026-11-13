CREATE TABLE IF NOT EXISTS rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  install TEXT NOT NULL,
  at INTEGER NOT NULL,
  policy TEXT NOT NULL,
  arm INTEGER NOT NULL,
  x TEXT NOT NULL,
  theta TEXT,
  reward REAL NOT NULL,
  kind TEXT NOT NULL,
  zero_edit INTEGER NOT NULL,
  UNIQUE (install, at, policy, arm, kind)
);
CREATE INDEX IF NOT EXISTS rows_at ON rows (at);
