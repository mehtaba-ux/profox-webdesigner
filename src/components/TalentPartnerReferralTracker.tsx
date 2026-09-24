import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { talentPartnerService } from '../lib/talentPartnerService';
import '../styles/talentPartner.css';

export default function TalentPartnerReferralTracker() {
  const location = useLocation();

  useEffect(() => {
    const retry = () => {
      void talentPartnerService.retryPendingApplicationClaims().catch((error) => {
        console.warn('Talent Partner attribution retry warning:', error);
      });
    };
    retry();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      await talentPartnerService.retryPendingApplicationClaims();
      if (!active || !location.pathname.startsWith('/careers/')) return;
      try {
        await talentPartnerService.captureReferralFromLocation();
        // A visit and an application submit can race on fast connections. Retrying immediately
        // after the server has recorded the visit closes that gap without changing ownership rules.
        if (active) await talentPartnerService.retryPendingApplicationClaims();
      } catch (error) {
        console.warn('Talent Partner referral tracking warning:', error);
      }
    };
    void run();
    return () => { active = false; };
  }, [location.pathname, location.search]);

  return null;
}
