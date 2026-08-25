import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../../lib/AuthContext';
import { WorkspaceAppId } from '../../../lib/workspaceApps';
import QuotationWorkspaceEnhancements from '../QuotationWorkspaceEnhancements';
import WorkspaceShell from './WorkspaceShell';
import './AdminAppWorkspace.css';

function activeWorkspaceForPath(pathname: string): WorkspaceAppId | 'workspace' | 'approvals' {
  if (pathname.startsWith('/admin/quotation-approvals')) return 'approvals';
  if (pathname.startsWith('/admin/intelligence')) return 'intelligence';
  if (pathname.startsWith('/admin/internal-chat')) return 'internal_chat';
  if (pathname.startsWith('/admin/calendar') || pathname.startsWith('/admin/meeting') || pathname.startsWith('/admin/booking')) return 'calendar';
  if (pathname.startsWith('/admin/content-recruitment') || pathname.startsWith('/admin/uiux-recruitment') || pathname.startsWith('/admin/hiring') || pathname.startsWith('/admin/job-posts') || pathname.startsWith('/admin/agreements')) return 'recruitment';
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

  if (loading || !user || !profile || !isAdminOrEditor) return <Outlet />;

  return (
    <WorkspaceShell activeAppId={activeWorkspaceForPath(location.pathname)} searchPlaceholder="Search ProFox workspace">
      <div className="profox-standalone-app-embed"><Outlet /></div>
      <QuotationWorkspaceEnhancements />
    </WorkspaceShell>
  );
}
