-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    owner_type TEXT NOT NULL CHECK(owner_type IN ('user', 'anchor')),
    owner_ref TEXT NOT NULL,
    currency TEXT NOT NULL,
    balance NUMERIC(20, 2) NOT NULL DEFAULT 0.00,
    password TEXT,
    name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create transfers table
CREATE TABLE IF NOT EXISTS transfers (
    id TEXT PRIMARY KEY,
    from_account TEXT NOT NULL REFERENCES accounts(id),
    to_account TEXT NOT NULL REFERENCES accounts(id),
    amount NUMERIC(20, 2) NOT NULL,
    currency TEXT NOT NULL,
    reference_id TEXT,
    idempotency_key TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create webhooks table
CREATE TABLE IF NOT EXISTS webhooks (
    id TEXT PRIMARY KEY,
    transfer_id TEXT NOT NULL REFERENCES transfers(id),
    reference_id TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'delivered', 'failed')),
    attempts INTEGER DEFAULT 0,
    last_attempt TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_owner_ref ON accounts(owner_ref);
CREATE INDEX IF NOT EXISTS idx_transfers_from ON transfers(from_account);
CREATE INDEX IF NOT EXISTS idx_transfers_to ON transfers(to_account);
CREATE INDEX IF NOT EXISTS idx_transfers_idempotency ON transfers(idempotency_key);
CREATE INDEX IF NOT EXISTS idx_webhooks_ref ON webhooks(reference_id);

-- Initialize system accounts on startup (can be run multiple times)
INSERT INTO accounts (id, owner_type, owner_ref, currency, balance, name)
VALUES 
  ('ACC_ANCHOR', 'anchor', 'ap-distribution-account', 'USD', 0.00, 'Anchor Account'),
  ('SYSTEM_FAUCET', 'anchor', 'system-faucet', 'USD', 999999999999.00, 'System Faucet')
ON CONFLICT (id) DO NOTHING;

-- Create transaction stored procedure for transferring funds safely
CREATE OR REPLACE FUNCTION transfer_funds(
  p_id TEXT,
  p_from_account TEXT,
  p_to_account TEXT,
  p_amount NUMERIC,
  p_currency TEXT,
  p_reference_id TEXT,
  p_idempotency_key TEXT
) RETURNS JSON AS $$
DECLARE
  v_from_balance NUMERIC;
  v_to_balance NUMERIC;
  v_from_type TEXT;
  v_from_currency TEXT;
  v_to_currency TEXT;
  v_existing_id TEXT;
BEGIN
  -- 1. Check idempotency key
  SELECT id INTO v_existing_id FROM transfers WHERE idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Conflict: Idempotency key already used', 'transfer_id', v_existing_id, 'code', '409');
  END IF;

  -- 2. Fetch sender account details
  SELECT balance, owner_type, currency INTO v_from_balance, v_from_type, v_from_currency FROM accounts WHERE id = p_from_account FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Sender account not found', 'code', '404');
  END IF;

  -- 3. Fetch recipient account details
  SELECT balance, currency INTO v_to_balance, v_to_currency FROM accounts WHERE id = p_to_account FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'Recipient account not found', 'code', '404');
  END IF;

  -- 4. Check currencies
  IF v_from_currency != p_currency OR v_to_currency != p_currency THEN
    RETURN json_build_object('success', false, 'error', 'Currency mismatch', 'code', '400');
  END IF;

  -- 5. Check balance & auto-seed anchor if needed
  IF v_from_type = 'anchor' AND v_from_balance < p_amount THEN
    UPDATE accounts SET balance = balance + 1000000.00 WHERE id = p_from_account;
    v_from_balance := v_from_balance + 1000000.00;
    
    INSERT INTO transfers (id, from_account, to_account, amount, currency, reference_id, idempotency_key, status)
    VALUES ('seed-' || p_id, 'SYSTEM_FAUCET', p_from_account, 1000000.00, p_currency, 'AUTO_SEED', 'idemp-seed-' || p_id, 'completed');
  END IF;

  IF v_from_balance < p_amount THEN
    -- Log failed transfer to database
    INSERT INTO transfers (id, from_account, to_account, amount, currency, reference_id, idempotency_key, status)
    VALUES (p_id, p_from_account, p_to_account, p_amount, p_currency, p_reference_id, p_idempotency_key, 'failed');
    
    RETURN json_build_object('success', false, 'error', 'Insufficient funds', 'code', '400');
  END IF;

  -- 6. Perform debit & credit
  UPDATE accounts SET balance = balance - p_amount WHERE id = p_from_account;
  UPDATE accounts SET balance = balance + p_amount WHERE id = p_to_account;

  -- 7. Insert completed transfer
  INSERT INTO transfers (id, from_account, to_account, amount, currency, reference_id, idempotency_key, status)
  VALUES (p_id, p_from_account, p_to_account, p_amount, p_currency, p_reference_id, p_idempotency_key, 'completed');

  RETURN json_build_object('success', true, 'transfer_id', p_id);
END;
$$ LANGUAGE plpgsql;
