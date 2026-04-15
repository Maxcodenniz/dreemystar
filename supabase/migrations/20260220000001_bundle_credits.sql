/*
  # Bundle credits for multi-ticket purchases (3-ticket and 5-ticket bundles)
  
  - user_bundle_credits: stores remaining credits per user per bundle type
  - bundle_type: '3_ticket' | '5_ticket'
  - When user purchases a bundle, we add credits; when they use one for an event, we decrement
*/

CREATE TABLE IF NOT EXISTS user_bundle_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bundle_type TEXT NOT NULL CHECK (bundle_type IN ('3_ticket', '5_ticket')),
  credits_remaining INTEGER NOT NULL CHECK (credits_remaining >= 0) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, bundle_type)
);

CREATE INDEX IF NOT EXISTS idx_user_bundle_credits_user_id ON user_bundle_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bundle_credits_bundle_type ON user_bundle_credits(bundle_type);

ALTER TABLE user_bundle_credits ENABLE ROW LEVEL SECURITY;

-- Users can read their own credits
CREATE POLICY "Users can read own bundle credits"
  ON user_bundle_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert/update (via Edge Functions / webhooks)
CREATE POLICY "Service role can manage bundle credits"
  ON user_bundle_credits FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE user_bundle_credits IS 'Credits from 3-ticket or 5-ticket bundle purchases; redeemed for live event access';
