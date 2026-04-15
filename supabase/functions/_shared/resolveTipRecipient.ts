import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

export type TipRecipientRegistered = {
  kind: "registered";
  profile: { id: string; username: string | null; full_name: string | null };
};

export type TipRecipientUnregistered = {
  kind: "unregistered";
  eventId: string;
  displayName: string;
};

export type TipRecipient = TipRecipientRegistered | TipRecipientUnregistered;

/**
 * Resolves tip recipient: registered profile, or scheduled event for an unregistered artist
 * (client passes event.id as artistId in that case).
 */
export async function resolveTipRecipient(
  supabase: SupabaseClient,
  artistIdParam: string,
): Promise<{ ok: true; recipient: TipRecipient } | { ok: false }> {
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, username, full_name")
    .eq("id", artistIdParam)
    .maybeSingle();

  if (!profileErr && profile) {
    return { ok: true, recipient: { kind: "registered", profile } };
  }

  const { data: ev } = await supabase
    .from("events")
    .select("id, artist_id, unregistered_artist_name")
    .eq("id", artistIdParam)
    .maybeSingle();

  const name =
    typeof ev?.unregistered_artist_name === "string" ? ev.unregistered_artist_name.trim() : "";
  if (
    ev &&
    ev.artist_id === null &&
    name.length > 0
  ) {
    return {
      ok: true,
      recipient: {
        kind: "unregistered",
        eventId: ev.id,
        displayName: name,
      },
    };
  }

  return { ok: false };
}

export function tipRecipientDisplayName(recipient: TipRecipient): string {
  if (recipient.kind === "registered") {
    return (
      recipient.profile.username?.trim()
      || recipient.profile.full_name?.trim()
      || "Artist"
    );
  }
  return recipient.displayName;
}
