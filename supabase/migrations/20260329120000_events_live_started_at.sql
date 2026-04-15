-- Official broadcast start time for elapsed "live" timer (viewers + analytics).
-- Set automatically when status becomes 'live'; cleared when status is not 'live'.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS live_started_at TIMESTAMPTZ;

COMMENT ON COLUMN events.live_started_at IS
  'Timestamp when the event first entered live status this session; cleared when not live. Used for viewer elapsed timer.';

CREATE OR REPLACE FUNCTION sync_events_live_started_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'live' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.live_started_at IS NULL THEN
        NEW.live_started_at := NOW();
      END IF;
    ELSIF OLD.status IS DISTINCT FROM 'live' THEN
      NEW.live_started_at := NOW();
    ELSE
      NEW.live_started_at := OLD.live_started_at;
    END IF;
  ELSE
    NEW.live_started_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_live_started_at ON events;
CREATE TRIGGER trg_events_live_started_at
  BEFORE INSERT OR UPDATE OF status ON events
  FOR EACH ROW
  EXECUTE FUNCTION sync_events_live_started_at();

-- Ending a stream must clear live_started_at (trigger handles it when status -> ended).
CREATE OR REPLACE FUNCTION remove_broadcaster_session(
  event_uuid UUID,
  broadcaster_uuid UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE broadcaster_sessions
  SET
    is_active = false,
    last_heartbeat = NOW()
  WHERE event_id = event_uuid
    AND broadcaster_id = broadcaster_uuid;

  UPDATE events
  SET
    status = 'ended',
    viewer_count = 0,
    live_started_at = NULL,
    updated_at = NOW()
  WHERE id = event_uuid;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION cleanup_stale_live_streams_v2(
  stale_minutes INTEGER DEFAULT 5,
  broadcaster_timeout_minutes INTEGER DEFAULT 3
)
RETURNS TABLE (
  event_id UUID,
  event_title TEXT,
  reason TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH stale_streams AS (
    SELECT
      e.id,
      e.title,
      bs.last_heartbeat,
      bs.is_active,
      CASE
        WHEN bs.id IS NULL THEN 'No broadcaster session'
        WHEN NOT bs.is_active THEN 'Broadcaster marked inactive'
        WHEN bs.last_heartbeat < NOW() - (broadcaster_timeout_minutes || ' minutes')::INTERVAL THEN 'Broadcaster heartbeat timeout'
        ELSE NULL
      END AS end_reason
    FROM events e
    LEFT JOIN broadcaster_sessions bs ON bs.event_id = e.id AND bs.is_active = true
    WHERE e.status = 'live'
      AND (
        bs.id IS NULL
        OR NOT bs.is_active
        OR bs.last_heartbeat < NOW() - (broadcaster_timeout_minutes || ' minutes')::INTERVAL
      )
  )
  UPDATE events
  SET
    status = 'ended',
    viewer_count = 0,
    live_started_at = NULL,
    updated_at = NOW()
  WHERE id IN (SELECT id FROM stale_streams WHERE end_reason IS NOT NULL)
  RETURNING
    id AS event_id,
    title AS event_title,
    (SELECT end_reason FROM stale_streams WHERE stale_streams.id = events.id) AS reason;

  DELETE FROM broadcaster_sessions
  WHERE is_active = false
    OR last_heartbeat < NOW() - (broadcaster_timeout_minutes + 10 || ' minutes')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
