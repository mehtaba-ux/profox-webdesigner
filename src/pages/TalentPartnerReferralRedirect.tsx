import { Navigate, useLocation, useParams } from 'react-router-dom';

export default function TalentPartnerReferralRedirect() {
  const { partnerCode = '', jobSlug = '' } = useParams<{ partnerCode: string; jobSlug: string }>();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set('ref', partnerCode.trim().toUpperCase());
  const search = params.toString();
  return <Navigate to={`/careers/${encodeURIComponent(jobSlug)}${search ? `?${search}` : ''}`} replace />;
}
