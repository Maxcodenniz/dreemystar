-- Allow deleting events that have tickets: cascade delete tickets when event is deleted
-- Fix for: update or delete on table "events" violates foreign key constraint "tickets_event_id_fkey"
ALTER TABLE tickets
  DROP CONSTRAINT IF EXISTS tickets_event_id_fkey;

ALTER TABLE tickets
  ADD CONSTRAINT tickets_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE;
