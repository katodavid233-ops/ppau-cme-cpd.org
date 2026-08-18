CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'admin',
  ppau_reg_no TEXT,
  ahpc_reg_no TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  content TEXT,
  style TEXT DEFAULT 'e_learning',
  cpd_points REAL DEFAULT 0,
  duration_minutes INTEGER DEFAULT 30,
  pass_mark INTEGER DEFAULT 70,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_option TEXT NOT NULL,
  FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  event_date TEXT,
  cpd_points REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER,
  event_id INTEGER,
  full_name TEXT NOT NULL,
  ppau_reg_no TEXT NOT NULL,
  ahpc_reg_no TEXT,
  email TEXT,
  contact_email TEXT,
  score REAL,
  passed INTEGER DEFAULT 0,
  points_awarded REAL DEFAULT 0,
  certificate_code TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  source TEXT DEFAULT 'module',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  ppau_reg_no TEXT NOT NULL,
  ahpc_reg_no TEXT,
  email TEXT,
  title TEXT NOT NULL,
  description TEXT,
  evidence_file TEXT,
  status TEXT DEFAULT 'pending',
  points_awarded REAL DEFAULT 0,
  certificate_code TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_ppau_reg_no ON users(ppau_reg_no);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE UNIQUE INDEX IF NOT EXISTS idx_claims_certificate_code ON claims(certificate_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_certificate_code ON submissions(certificate_code);
