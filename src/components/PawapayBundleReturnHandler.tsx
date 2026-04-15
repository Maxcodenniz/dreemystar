import React, { useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  peekPawapayTicketCheckoutContext,
  takePawapayTicketCheckoutContext,
} from '../utils/pawapayCheckoutContext';

/**
 * Bundle credits (non-cart) use returnUrl /dashboard with no query (PawaPay API requirement).
 * PawaPay appends ?depositId=…; we normalize URL and consume stash here.
 */
const PawapayBundleReturnHandler: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    const depositId = searchParams.get('depositId') ?? searchParams.get('deposit_id');
    if (!depositId) return;
    const peek = peekPawapayTicketCheckoutContext(depositId);
    if (!peek?.bundleDashboard) return;
    ran.current = true;
    takePawapayTicketCheckoutContext(depositId);
    navigate('/dashboard', { replace: true, state: { pawapayBundleCreditsOk: true } });
  }, [searchParams, navigate]);

  return null;
};

export default PawapayBundleReturnHandler;
