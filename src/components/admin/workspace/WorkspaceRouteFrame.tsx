import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../../lib/AuthContext';
import { salesAccountSetupService, type SalesAccountSetupStatus } from '../../../lib/salesAccountSetupService';
import { WorkspaceAppId } from '../../../lib/workspaceApps';
import QuotationWorkspaceEnhancements from '../QuotationWorkspaceEnhancements';
import QuotationApprovalDecisionBanner from '../QuotationApprovalDecisionBanner';
import SalesAccountSetup from '../SalesAccountSetup';
import WorkspaceShell from './WorkspaceShell';
import './AdminAppWorkspace.css';

const SELLER_ROLES = new Set(['sales', 'sales_rep', 'sales_team']);
const SALES_SETUP_SUPPORT_PATHS = ['/admin/seller-profile', '/admin/booking-setup'];

function activeWorkspaceForPath(pathname: string): WorkspaceAppId | 'workspace' | 'approvals' {
  if (pathname.startsWith('/admin/quotation-approvals')) return 'approvals';
  if (pathname.startsWith('/admin/intelligence')) return 'intelligence';
  if (pathname.startsWith('/admin/internal-chat')) return 'internal_chat';
  if (pathname.startsWith('/admin/calendar') || pathname.startsWith('/admin/meeting') || pathname.startsWith('/admin/booking')) return 'calendar';
  if (pathname.startsWith('/admin/content-recruitment') || pathname.startsWith('/admin/uiux-recruitment') || pathname.startsWith('/admin/talent-partners') || pathname.startsWith('/admin/hiring') || pathname.startsWith('/admin/job-posts') || pathname.startsWith('/admin/agreements')) return 'recruitment';
  if (pathname.startsWith('/admin/academy-certification')) return 'academy_governance';
  if (pathname.startsWith('/admin/academy-') || pathname.startsWith('/admin/final-certification') || pathname.startsWith('/admin/mock-call') || pathname.startsWith('/admin/niche-') || pathname.startsWith('/admin/lead-research') || pathname.startsWith('/admin/loom-outreach') || pathname.startsWith('/admin/outreach-messaging') || pathname.startsWith('/admin/crm-training') || pathname.startsWith('/admin/confidentiality-training')) return 'sales_academy';
  if (pathname.startsWith('/admin/project-handover') || pathname.startsWith('/admin/design-delivery')) return 'projects';
  if (pathname.startsWith('/admin/payment-gateway') || pathname.startsWith('/admin/automation') || pathname.startsWith('/admin/customer-communication') || pathname.startsWith('/admin/productivity-settings') || pathname.startsWith('/admin/meeting-settings')) return 'settings';
  if (pathname.startsWith('/admin/public-pricing')) return 'website';
  if (pathname.startsWith('/admin/quotations') || pathname.startsWith('/admin/today') || pathname.startsWith('/admin/seller') || pathname.startsWith('/admin/sales-performance') || pathname.startsWith('/admin/payment-process')) return 'sales';
  if (pathname.startsWith('/admin/profile')) return 'team';
  return 'workspace';
}

export default function WorkspaceRouteFrame() {
  const location = useLocation();
  const { user, profile, isAdminOrEditor, loading } = useAuth();
  const [salesSetup, setSalesSetup] = useState<SalesAccountSetupStatus | null>(null);
  const [salesSetupLoading, setSalesSetupLoading] = useState(false);
  const [salesSetupError, setSalesSetupError] = useState('');

  const activeSeller = Boolean(
    user &&
    profile?.status === 'active' &&
    SELLER_ROLES.has(String(profile?.role || '')),
  );

  const refreshSalesSetup = async () => {
    if (!activeSeller) {
      setSalesSetup(null);
      setSalesSetupError('');
      setSalesSetupLoading(false);
      return;
    }
    setSalesSetupLoading(true);
    setSalesSetupError('');
    try {
      setSalesSetup(await salesAccountSetupService.getMyStatus());
    } catch (error: any) {
      setSalesSetup(null);
      setSalesSetupError(error?.message || 'Your mandatory Sales account setup could not be verified.');
    } finally {
      setSalesSetupLoading(false);
    }
  };

  useEffect(() => {
    if (!loading) void refreshSalesSetup();
  }, [loading, user?.id, profile?.role, profile?.status, location.pathname, location.search]);

  if (loading || !user || !profile || !isAdminOrEditor) return <Outlet />;

  const setupIncomplete = activeSeller && salesSetup?.setupCompleted !== true;
  const supportPath = SALES_SETUP_SUPPORT_PATHS.some(path => location.pathname === path || location.pathname.startsWith(`${path}/`));

  let content: React.ReactNode = <Outlet />;
  if (activeSeller && salesSetupLoading && !salesSetup) {
    content = <div className="flex min-h-[520px] items-center justify-center"><div className="text-center"><div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-[#000080] border-t-transparent" /><p className="mt-3 text-sm font-semibold text-slate-500">Verifying your Sales account setup…</p></div></div>;
  } else if (activeSeller && salesSetupError) {
    content = <div className="mx-auto mt-10 max-w-xl rounded-3xl border border-red-200 bg-red-50 p-6 text-sm font-semibold leading-6 text-red-700"><div className="font-black">Sales account setup verification is unavailable.</div><p className="mt-2">{salesSetupError}</p><button type="button" onClick={() => void refreshSalesSetup()} className="mt-4 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Try again</button></div>;
  } else if (setupIncomplete && !supportPath) {
    content = <SalesAccountSetup onCompleted={refreshSalesSetup} />;
  }

  return (
    <WorkspaceShell activeAppId={activeWorkspaceForPath(location.pathname)} searchPlaceholder="Search ProFox workspace">
      <div className="profox-standalone-app-embed">{content}</div>
      {!setupIncomplete && !salesSetupError && <QuotationWorkspaceEnhancements />}
      {!setupIncomplete && !salesSetupError && <QuotationApprovalDecisionBanner />}
    </WorkspaceShell>
  );
}