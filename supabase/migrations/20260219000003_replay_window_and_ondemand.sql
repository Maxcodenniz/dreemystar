/*
  # Replay window (3h free for live ticket holders) and on-demand replay
  
  1. Tickets
    - ticket_type: 'live' | 'replay' (default 'live')
    - Live ticket = purchased for live stream; grants free replay for 3h after event end
    - Replay ticket = purchased for on-demand viewing after the 3h window
    
  2. Events
    - replay_price: optional price for on-demand replay (if null, use event.price)
*/

-- Add ticket_type to tickets (existing rows = 'live')
ALTER TABLE tickets
ADD COLUMN IF NOT EXISTS ticket_type TEXT CHECK (ticket_type IN ('live', 'replay')) DEFAULT 'live';

COMMENT ON COLUMN tickets.ticket_type IS 'live = purchased for live stream; replay = purchased for on-demand viewing';

-- Add replay_price to events (null = use event.price for on-demand)
ALTER TABLE events
ADD COLUMN IF NOT EXISTS replay_price DECIMAL DEFAULT NULL;

COMMENT ON COLUMN events.replay_price IS 'Price for on-demand replay after free window. Null = use event price.';
