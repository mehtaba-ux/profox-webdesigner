import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { talentPartnerService } from '../lib/talentPartnerService';
import '../styles/talentPartner.css';

export default function TalentPartnerReferralTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/careers/')) return;
    void talentPartnerService.captureReferralFromLocation().catch((error) => {
      console.warn('Talent Partner referral tracking warning:', error);
    });
  }, [location.pathname, location.search]);

  return null;
}
