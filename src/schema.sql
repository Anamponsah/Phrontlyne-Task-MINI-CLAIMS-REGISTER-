CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_number TEXT NOT NULL,
  insured_name TEXT NOT NULL,
  loss_date TEXT NOT NULL,        -- ISO date (YYYY-MM-DD) the loss occurred
  date_notified TEXT NOT NULL,    -- ISO date the claim was notified to us
  loss_nature TEXT NOT NULL,
  currency TEXT NOT NULL,          -- ISO 4217 code; valid codes and decimal places are defined in src/money.ts
  estimated_minor INTEGER NOT NULL,        -- initial estimated loss, in minor units of `currency`
  approved_minor INTEGER,                  -- approved (reserved) amount, in minor units of `currency`; NULL until set
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  payment_date TEXT NOT NULL,
  currency TEXT NOT NULL,        -- currency the payment was actually made in (ISO 4217 code)
  amount_minor INTEGER NOT NULL,                       -- amount in minor units of the payment's own currency
  fx_rate TEXT,                                         -- units of claim currency per 1 unit of payment currency; NULL when currencies match
  converted_minor INTEGER NOT NULL,                     -- amount_minor converted into the claim's currency, at fx_rate; drives all totals
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_payments_claim_id ON payments(claim_id);
CREATE INDEX IF NOT EXISTS idx_claims_loss_date ON claims(loss_date);
