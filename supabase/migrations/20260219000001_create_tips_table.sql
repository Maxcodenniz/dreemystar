-- Create tips table for artist tips/donations
CREATE TABLE IF NOT EXISTS tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sender_email TEXT,
  amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
  message TEXT,
  status TEXT CHECK (status IN ('pending', 'completed', 'failed', 'refunded')) DEFAULT 'pending',
  
  -- Payment provider info
  stripe_payment_intent_id TEXT,
  stripe_session_id TEXT,
  flutterwave_tx_id TEXT,
  flutterwave_tx_ref TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tips_artist_id ON tips(artist_id);
CREATE INDEX IF NOT EXISTS idx_tips_sender_id ON tips(sender_id);
CREATE INDEX IF NOT EXISTS idx_tips_status ON tips(status);
CREATE INDEX IF NOT EXISTS idx_tips_created_at ON tips(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_stripe_session_id ON tips(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_tips_flutterwave_tx_ref ON tips(flutterwave_tx_ref);

-- RLS Policies
ALTER TABLE tips ENABLE ROW LEVEL SECURITY;

-- Artists can view tips they received
CREATE POLICY "Artists can view their own tips"
  ON tips FOR SELECT
  USING (
    auth.uid() = artist_id OR
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Anyone can create a tip (will be completed via payment webhook)
CREATE POLICY "Anyone can create tips"
  ON tips FOR INSERT
  WITH CHECK (true);

-- Only service role and admins can update tips (for webhook processing)
CREATE POLICY "Service role and admins can update tips"
  ON tips FOR UPDATE
  USING (
    auth.role() = 'service_role' OR
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type IN ('global_admin', 'super_admin')
    )
  );

-- Add function to get total tips received by an artist
CREATE OR REPLACE FUNCTION get_artist_total_tips(artist_uuid UUID)
RETURNS DECIMAL(10, 2)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  total DECIMAL(10, 2);
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO total
  FROM tips
  WHERE artist_id = artist_uuid
  AND status = 'completed';
  
  RETURN total;
END;
$$;

COMMENT ON TABLE tips IS 'Stores tips/donations sent to artists';
COMMENT ON COLUMN tips.amount IS 'Tip amount in EUR';
COMMENT ON COLUMN tips.status IS 'Payment status: pending (created), completed (paid), failed, refunded';
