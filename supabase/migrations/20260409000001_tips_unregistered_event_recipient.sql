-- Tips for admin-scheduled events without a registered artist: store event + display name.

ALTER TABLE public.tips
  ALTER COLUMN artist_id DROP NOT NULL;

ALTER TABLE public.tips
  ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES public.events(id) ON DELETE SET NULL;

ALTER TABLE public.tips
  ADD COLUMN IF NOT EXISTS unregistered_artist_name TEXT;

CREATE INDEX IF NOT EXISTS idx_tips_event_id ON public.tips(event_id);

ALTER TABLE public.tips
  ADD CONSTRAINT tips_recipient_registered_or_event CHECK (
    (artist_id IS NOT NULL AND event_id IS NULL AND unregistered_artist_name IS NULL)
    OR
    (
      artist_id IS NULL
      AND event_id IS NOT NULL
      AND unregistered_artist_name IS NOT NULL
      AND length(trim(unregistered_artist_name)) > 0
    )
  );

COMMENT ON COLUMN public.tips.event_id IS 'When artist_id is null, the scheduled event this tip is for (unregistered artist).';
COMMENT ON COLUMN public.tips.unregistered_artist_name IS 'Snapshot of events.unregistered_artist_name for logging and receipts when artist_id is null.';
