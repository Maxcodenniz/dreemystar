-- Add Flutterwave payment columns to tickets (for mobile money / card via Flutterwave)
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS flutterwave_tx_id TEXT,
ADD COLUMN IF NOT EXISTS flutterwave_tx_ref TEXT;

COMMENT ON COLUMN tickets.flutterwave_tx_id IS 'Flutterwave transaction id from webhook';
COMMENT ON COLUMN tickets.flutterwave_tx_ref IS 'Our tx_ref sent to Flutterwave (idempotency)';
