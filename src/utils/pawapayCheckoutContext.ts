const TICKET_PREFIX = 'pawapay_ck_';
const TIP_PREFIX = 'pawapay_tip_';

export type PawapayTicketCheckoutStash = {
  isCart?: boolean;
  returnPath?: string;
  /** Bundle credits purchase (non-cart) success should land on dashboard */
  bundleDashboard?: boolean;
  /** Cart checkout for ticket bundle (3/5 events) */
  bundleFromCart?: boolean;
  /** Single-event checkout when return URL has no eventId query */
  eventId?: string;
};

/** Persist context PawaPay return URLs cannot carry (path-only returnUrl for API compatibility). */
export function stashPawapayTicketCheckoutContext(
  depositId: string,
  body: Record<string, unknown>,
): void {
  try {
    const bundleType = body.bundleType ?? body.bundle_type;
    const bundleEventIds = body.bundleEventIds ?? body.bundle_event_ids;
    const fromCartBundle =
      Array.isArray(bundleEventIds) && (bundleEventIds as unknown[]).length > 0;
    const payload: PawapayTicketCheckoutStash = {
      isCart: body.isCart === true,
      returnPath: typeof body.returnPath === 'string' ? body.returnPath : undefined,
      bundleDashboard:
        typeof bundleType === 'string' &&
        (bundleType === '3_ticket' || bundleType === '5_ticket') &&
        !fromCartBundle,
      bundleFromCart:
        typeof bundleType === 'string' &&
        (bundleType === '3_ticket' || bundleType === '5_ticket') &&
        fromCartBundle,
      eventId: undefined,
    };
    const eid = body.eventIds;
    if (Array.isArray(eid) && eid.length === 1 && typeof eid[0] === 'string') {
      payload.eventId = eid[0];
    } else if (typeof body.eventId === 'string' && body.eventId.trim()) {
      payload.eventId = body.eventId.trim();
    }
    sessionStorage.setItem(TICKET_PREFIX + depositId, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}

export function peekPawapayTicketCheckoutContext(
  depositId: string | null | undefined,
): PawapayTicketCheckoutStash | null {
  if (!depositId) return null;
  try {
    const raw = sessionStorage.getItem(TICKET_PREFIX + depositId);
    if (!raw) return null;
    return JSON.parse(raw) as PawapayTicketCheckoutStash;
  } catch {
    return null;
  }
}

export function takePawapayTicketCheckoutContext(
  depositId: string | null | undefined,
): PawapayTicketCheckoutStash | null {
  if (!depositId) return null;
  try {
    const raw = sessionStorage.getItem(TICKET_PREFIX + depositId);
    if (!raw) return null;
    sessionStorage.removeItem(TICKET_PREFIX + depositId);
    return JSON.parse(raw) as PawapayTicketCheckoutStash;
  } catch {
    return null;
  }
}

export function stashPawapayTipContext(depositId: string, tipId: string): void {
  try {
    sessionStorage.setItem(TIP_PREFIX + depositId, JSON.stringify({ tipId }));
  } catch {
    /* ignore */
  }
}

export function takePawapayTipContext(depositId: string | null | undefined): string | null {
  if (!depositId) return null;
  try {
    const raw = sessionStorage.getItem(TIP_PREFIX + depositId);
    if (!raw) return null;
    sessionStorage.removeItem(TIP_PREFIX + depositId);
    const o = JSON.parse(raw) as { tipId?: string };
    return typeof o.tipId === 'string' ? o.tipId : null;
  } catch {
    return null;
  }
}
