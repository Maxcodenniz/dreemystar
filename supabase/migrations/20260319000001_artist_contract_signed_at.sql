-- Artist application: record when the artist has electronically signed the contract
-- (50% of ticket sales, excluding taxes and fees). Signup is gated on this.

ALTER TABLE artist_applications
  ADD COLUMN IF NOT EXISTS contract_signed_at TIMESTAMPTZ;

COMMENT ON COLUMN artist_applications.contract_signed_at IS 'When the artist accepted the terms (50% revenue share, excl. taxes/fees) before creating their account.';
