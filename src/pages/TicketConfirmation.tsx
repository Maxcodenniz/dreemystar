import React, { useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useCartStore } from '../store/useCartStore';
import { useStore } from '../store/useStore';
import { supabase } from '../lib/supabaseClient';
import { safeLocalStorage } from '../utils/safeLocalStorage';
import { isSafeCheckoutReturnPath } from '../utils/checkoutReturnPath';
import { takePawapayTicketCheckoutContext } from '../utils/pawapayCheckoutContext';
import { checkPawapayDepositStatus, isPawapayDepositStatusFailed } from '../utils/pawapayDepositStatus';

function decodeReturnPathParam(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const d = decodeURIComponent(raw);
    return isSafeCheckoutReturnPath(d) ? d : null;
  } catch {
    return null;
  }
}

function buildSuccessNavigateUrl(
  returnPathDecoded: string | null,
  params: {
    isCartPurchase: boolean;
    eventId: string | null;
    sessionId: string | null;
    isPawapay: boolean;
    depositId: string | null;
    isDusupay: boolean;
    merchantRef: string | null;
    emailParam: string | null;
    isBundleSuccess: boolean;
  },
): string {
  const base = returnPathDecoded ?? '/';
  const [pathname, existingQuery] = base.split('?');
  const sp = new URLSearchParams(existingQuery || undefined);
  sp.set('payment', 'success');
  if (params.isCartPurchase) sp.set('cart', 'true');
  if (params.eventId) sp.set('eventId', params.eventId);
  if (params.sessionId) sp.set('session_id', params.sessionId);
  if (params.isPawapay && params.depositId) {
    sp.set('provider', 'pawapay');
    sp.set('deposit_id', params.depositId);
  }
  if (params.isDusupay && params.merchantRef) {
    sp.set('provider', 'dusupay');
    sp.set('merchant_ref', params.merchantRef);
  }
  if (params.emailParam) sp.set('email', params.emailParam);
  if (params.isBundleSuccess) sp.set('bundle', 'true');
  return `${pathname}?${sp.toString()}`;
}

const TicketConfirmation: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useStore();
  const cancelledRef = useRef(false);

  const depositKey = searchParams.get('deposit_id') ?? searchParams.get('depositId') ?? '';
  const pawapayStash = useMemo(
    () => takePawapayTicketCheckoutContext(depositKey || null),
    [depositKey],
  );

  useEffect(() => {
    cancelledRef.current = false;

    const verifyAndClearCart = async () => {
      const sessionId = searchParams.get('session_id');
      const provider = searchParams.get('provider');
      const depositId = searchParams.get('deposit_id') ?? searchParams.get('depositId');
      const merchantRef = searchParams.get('merchant_ref');
      const eventId =
        searchParams.get('eventId') ??
        (pawapayStash?.eventId?.trim() ? pawapayStash.eventId.trim() : null);
      const cartParam = searchParams.get('cart');
      const emailParam = searchParams.get('email');
      const isBundleSuccess =
        searchParams.get('bundle') === 'true' || !!pawapayStash?.bundleFromCart;
      const isCartPurchase = cartParam === 'true' || !!pawapayStash?.isCart;
      const isDusupay = provider === 'dusupay' && merchantRef;
      const isPawapay =
        !!depositId &&
        !merchantRef &&
        (provider === 'pawapay' || (!sessionId && provider !== 'dusupay'));
      const returnPathDecoded =
        decodeReturnPathParam(searchParams.get('returnPath')) ??
        (pawapayStash?.returnPath && isSafeCheckoutReturnPath(pawapayStash.returnPath)
          ? pawapayStash.returnPath
          : null);

      if (!sessionId && !isPawapay && !isDusupay) {
        console.warn('⚠️ No session_id, Pawapay deposit_id, or DusuPay merchant_ref found in URL');
        if (!cancelledRef.current) navigate('/?payment=error&reason=no_session', { replace: true });
        return;
      }

      try {
        const cartSnapshot = useCartStore.getState().items;
        const eventIdsToCheck =
          isCartPurchase && cartSnapshot.length > 0
            ? cartSnapshot.map((item) => item.eventId)
            : eventId
              ? [eventId]
              : [];

        if (eventIdsToCheck.length === 0 && !(isPawapay && depositId)) {
          if (isCartPurchase) {
            try {
              useCartStore.getState().clearCart();
            } catch (e) {
              console.warn('⚠️ Could not clear cart store:', e);
            }
            safeLocalStorage.removeItem('dreemystar-cart');
          }
          if (!cancelledRef.current) {
            navigate(
              buildSuccessNavigateUrl(returnPathDecoded, {
                isCartPurchase,
                eventId,
                sessionId,
                isPawapay,
                depositId,
                isDusupay,
                merchantRef,
                emailParam,
                isBundleSuccess,
              }),
              { replace: true },
            );
          }
          return;
        }

        let pawapayDepositFailed = false;

        const checkTicketsOnce = async (): Promise<boolean> => {
          if (isPawapay && depositId && !pawapayDepositFailed) {
            const ps = await checkPawapayDepositStatus(depositId);
            if (isPawapayDepositStatusFailed(ps)) {
              pawapayDepositFailed = true;
              return false;
            }
          }

          if (eventIdsToCheck.length > 0 && user?.id) {
            const { data: tickets, error } = await supabase
              .from('tickets')
              .select('id, event_id')
              .eq('user_id', user.id)
              .in('event_id', eventIdsToCheck)
              .eq('status', 'active');
            if (!error && tickets?.length) return true;
          }

          if (eventIdsToCheck.length > 0 && emailParam) {
            const { data: tickets, error } = await supabase
              .from('tickets')
              .select('id, event_id')
              .eq('email', emailParam.toLowerCase().trim())
              .in('event_id', eventIdsToCheck)
              .eq('status', 'active');
            if (!error && tickets?.length) return true;
          }

          if (isPawapay && depositId) {
            const { data: tickets } = await supabase
              .from('tickets')
              .select('id, event_id')
              .eq('pawapay_deposit_id', depositId)
              .eq('status', 'active');
            if (tickets?.length) return true;
          }

          if (isDusupay && merchantRef) {
            const { data: tickets } = await supabase
              .from('tickets')
              .select('id, event_id')
              .eq('dusupay_merchant_reference', merchantRef)
              .eq('status', 'active');
            if (tickets?.length) return true;
          }

          if (sessionId) {
            const { data: bySession } = await supabase
              .from('tickets')
              .select('id, event_id')
              .eq('stripe_session_id', sessionId)
              .eq('status', 'active')
              .limit(1);
            if (bySession?.length) return true;
          }

          return false;
        };

        let ticketsFound = await checkTicketsOnce();

        const maxAttempts = 24;
        for (let attempt = 0; attempt < maxAttempts && !cancelledRef.current; attempt++) {
          if (ticketsFound || pawapayDepositFailed) break;
          if (attempt < maxAttempts - 1) {
            await new Promise((r) => setTimeout(r, 500));
          }
          ticketsFound = await checkTicketsOnce();
        }

        if (pawapayDepositFailed) {
          if (!cancelledRef.current) {
            navigate('/?payment=error&reason=pawapay_failed', { replace: true });
          }
          return;
        }

        if (isCartPurchase) {
          try {
            useCartStore.getState().clearCart();
          } catch (e) {
            console.warn('⚠️ Could not clear cart store:', e);
          }
          safeLocalStorage.removeItem('dreemystar-cart');
        }

        if (!cancelledRef.current) {
          navigate(
            buildSuccessNavigateUrl(returnPathDecoded, {
              isCartPurchase,
              eventId,
              sessionId,
              isPawapay,
              depositId,
              isDusupay,
              merchantRef,
              emailParam,
              isBundleSuccess,
            }),
            { replace: true },
          );
        }
      } catch (error) {
        console.error('❌ Error verifying tickets:', error);
        if (isCartPurchase) {
          try {
            useCartStore.getState().clearCart();
          } catch (e) {
            console.warn('⚠️ Could not clear cart store:', e);
          }
          safeLocalStorage.removeItem('dreemystar-cart');
        }
        if (!cancelledRef.current) {
          navigate(
            buildSuccessNavigateUrl(returnPathDecoded, {
              isCartPurchase,
              eventId,
              sessionId,
              isPawapay,
              depositId,
              isDusupay,
              merchantRef,
              emailParam,
              isBundleSuccess,
            }),
            { replace: true },
          );
        }
      }
    };

    verifyAndClearCart();
    return () => {
      cancelledRef.current = true;
    };
  }, [searchParams, navigate, user?.id, pawapayStash]);

  return null;
};

export default TicketConfirmation;
