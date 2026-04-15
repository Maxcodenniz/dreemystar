-- Record-keeping for artist contract signature: exact terms agreed to + audit trail

ALTER TABLE artist_applications
  ADD COLUMN IF NOT EXISTS contract_terms_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS contract_signed_ip TEXT,
  ADD COLUMN IF NOT EXISTS contract_signed_user_agent TEXT;

COMMENT ON COLUMN artist_applications.contract_terms_snapshot IS 'Exact contract text the artist agreed to at signing (for record keeping).';
COMMENT ON COLUMN artist_applications.contract_signed_ip IS 'IP address from which the artist signed (audit trail).';
COMMENT ON COLUMN artist_applications.contract_signed_user_agent IS 'User-Agent at signing (audit trail).';
