-- Enforce single-device viewing per logged-in user per event.
-- When a user joins from a new device, all their other active sessions for that
-- event are marked inactive so one ticket cannot be shared across multiple devices.

CREATE OR REPLACE FUNCTION enforce_single_device_viewing()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS NOT NULL AND NEW.is_active = true THEN
    UPDATE viewer_sessions
    SET is_active = false,
        left_at = now()
    WHERE event_id = NEW.event_id
      AND user_id = NEW.user_id
      AND device_id != NEW.device_id
      AND is_active = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_single_device_trigger ON viewer_sessions;

CREATE TRIGGER enforce_single_device_trigger
  AFTER INSERT OR UPDATE OF is_active ON viewer_sessions
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_device_viewing();
