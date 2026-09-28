PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN','REMITENTE','AGENTE')),
  full_name TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  balance_cents INTEGER NOT NULL DEFAULT 0,
  commission_cents INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS beneficiaries (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  country TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(owner_user_id, phone),
  FOREIGN KEY(owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  status TEXT NOT NULL CHECK(status IN ('PENDIENTE','APROBADO','RECHAZADO','NO_COINCIDE')),
  note TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transfers (
  id TEXT PRIMARY KEY,
  ticket TEXT UNIQUE NOT NULL,
  sender_user_id TEXT NOT NULL,
  beneficiary_id TEXT NOT NULL,
  service_type TEXT NOT NULL,
  origin_country TEXT,
  destination_country TEXT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK(fee_cents >= 0),
  commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(commission_cents >= 0),
  sender_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(sender_commission_cents >= 0),
  admin_commission_cents INTEGER NOT NULL DEFAULT 0 CHECK(admin_commission_cents >= 0),
  status TEXT NOT NULL CHECK(status IN ('PENDIENTE','APROBADO','RECHAZADO','NO_COINCIDE')),
  note TEXT,
  approved_by TEXT,
  approved_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(sender_user_id) REFERENCES users(id),
  FOREIGN KEY(beneficiary_id) REFERENCES beneficiaries(id),
  FOREIGN KEY(approved_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_beneficiaries_owner ON beneficiaries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaries_phone ON beneficiaries(phone);
CREATE INDEX IF NOT EXISTS idx_deposits_user_status ON deposits(user_id,status);
CREATE INDEX IF NOT EXISTS idx_deposits_status_created ON deposits(status,created_at);
CREATE INDEX IF NOT EXISTS idx_transfers_sender_status ON transfers(sender_user_id,status);
CREATE INDEX IF NOT EXISTS idx_transfers_status_created ON transfers(status,created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON ledger(user_id,created_at);
