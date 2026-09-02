import React, { useMemo, useRef, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import AdminDashboard from '../AdminDashboard';
import ClientOnboardingOperations from '../ClientOnboardingOperations';
import CustomerCommunicationDrawer from '../CustomerCommunicationDrawer';
import SalesChatInbox from '../SalesChatInbox';
import { useAuth } from '../../../lib/AuthContext';
import {
  canAccessWorkspaceApp,
  canAccessWorkspaceItem,
  getWorkspaceApp,
  getWorkspaceAppForTab,
  getWorkspaceAppLaunchPath,
  WorkspaceNavItem
} from '../../../lib/workspaceApps';
import WorkspaceAppIcon from './WorkspaceAppIcon';
import WorkspaceShell from './WorkspaceShell';
import './AdminAppWorkspace.css';

const TALENT_PARTNER_ITEM: WorkspaceNavItem = {
  id: 'talent-partners',
  label: 'Talent Partners',
  path: '/admin/talent-partners',
  section: 'Hiring Pipelines',
  roles: ['admin']
};

const CUSTOMER_CONVERSATIONS_ITEM: WorkspaceNavItem = {
  id: 'customer-conversations',
  label: 'Customer Conversations',
  tab: 'inbox',
  section: 'Client Communication',
  roles: ['admin','project_manager','site_manager','content_writer','uiux_designer','developer','web_developer','developer_designer','qa','sales','sales_rep','sales_team']
};

export default function AdminAppWorkspace() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, profile, role, status, isAdminOrEditor, loading } = useAuth();
  const [navigationQuery, setNavigationQuery] = useState('');
  const previousContextSearchRef = useRef<string | null>(null);
  const previousAppIdRef = useRef<string | undefined>(appId);

  const app = getWorkspaceApp(appId);
  const visibleItems = useMemo(() => {
    let items = app?.items.filter(item => canAccessWorkspaceItem(item, role, status)) || [];
    if (app?.id === 'recruitment' && role === 'admin' && status === 'active' && !items.some(item => item.id === TALENT_PARTNER_ITEM.id)) {
      items = [...items, TALENT_PARTNER_ITEM];
    }
    if (app?.id === 'crm') {
      items = items.map(item => item.id === 'sales-inbox' ? { ...item, label: 'Customer Conversations', section: 'Communication' } : item);
    }
    if (app?.id === 'projects' && canAccessWorkspaceItem(CUSTOMER_CONVERSATIONS_ITEM, role, status) && !items.some(item => item.tab === 'inbox')) {
      items = [...items, CUSTOMER_CONVERSATIONS_ITEM];
    }
    return items;
  }, [app, role, status]);
  const searchedItems = useMemo(() => {
    const query = navigationQuery.trim().toLowerCase();
    if (!query) return visibleItems;
    return visibleItems.filter(item => `${item.label} ${item.section || ''}`.toLowerCase().includes(query));
  }, [navigationQuery, visibleItems]);
  const requestedTab = searchParams.get('tab');
  const requestedLeadId = searchParams.get('lead') || '';
  const communicationRequest = requestedTab === 'inbox' && Boolean(requestedLeadId) && (app?.id === 'crm' || app?.id === 'projects');

  if (previousAppIdRef.current !== appId) {
    previousAppIdRef.current = appId;
    previousContextSearchRef.current = null;
  }
  if (!communicationRequest && requestedTab && requestedTab !== 'inbox') {
    previousContextSearchRef.current = location.search;
  }

  const communicationOverlay = Boolean(communicationRequest && previousContextSearchRef.current);
  const contentSearch = communicationOverlay ? previousContextSearchRef.current! : location.search;
  const contentParams = new URLSearchParams(contentSearch);
  const contentTab = contentParams.get('tab') || requestedTab;
  const contentLocation = communicationOverlay ? { ...location, search: contentSearch } : location;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f4f7fb]"><div className="h-8 w-8 animate-spin rounded-full border-2 border-[#000080] border-t-transparent" /></div>;
  }
  if (!user || !profile || !isAdminOrEditor) return <Navigate to="/admin" replace />;
  if (!app || !canAccessWorkspaceApp(app, role, status)) return <Navigate to="/admin/workspace" replace />;
  if (app.launchPath) return <Navigate to={app.launchPath} replace />;

  const selectedItem = contentTab ? visibleItems.find(item => item.tab === contentTab) : undefined;
  if (requestedTab && !visibleItems.find(item => item.tab === requestedTab)) {
    const owningApp = getWorkspaceAppForTab(requestedTab, role, status);
    if (owningApp && owningApp.id !== app.id) {
      return <Navigate to={`/admin/app/${owningApp.id}?tab=${encodeURIComponent(requestedTab)}`} replace />;
    }
    return <Navigate to={getWorkspaceAppLaunchPath(app, role, status)} replace />;
  }
  if (!requestedTab) return <Navigate to={getWorkspaceAppLaunchPath(app, role, status)} replace />;

  const showClientOnboardingOperations = app.id === 'projects' && contentTab === 'projects' && (role === 'admin' || role === 'project_manager');
  const showUnifiedCustomerConversations = !communicationOverlay && requestedTab === 'inbox' && (app.id === 'crm' || app.id === 'projects');

  const openItem = (item: WorkspaceNavItem) => {
    if (item.path) navigate(item.path, { state: { fromWorkspaceApp: app.id } });
    else if (item.tab) navigate(`/admin/app/${app.id}?tab=${encodeURIComponent(item.tab)}`);
  };

  const closeCommunicationOverlay = () => {
    const restoreSearch = previousContextSearchRef.current;
    if (restoreSearch) navigate({ pathname: location.pathname, search: restoreSearch }, { replace: true });
    else navigate(`/admin/app/${app.id}?tab=inbox`, { replace: true });
  };

  return (
    <WorkspaceShell
      activeAppId={app.id}
      searchValue={navigationQuery}
      onSearchChange={setNavigationQuery}
      searchPlaceholder={`Search ${app.shortLabel}`}
    >
      <div className="pf-page-heading">
        <div>
          <h1>{selectedItem?.label || app.label}</h1>
          <p>{showUnifiedCustomerConversations ? 'One customer timeline for website chat, professional email, WhatsApp and private team notes.' : app.description}</p>
        </div>
      </div>

      <div className="pf-context-navigation">
        <div className="pf-context-navigation__identity">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border bg-white ${app.iconBackgroundClass}`}>
            <WorkspaceAppIcon name={app.icon} className={`h-[18px] w-[18px] ${app.iconClass}`} />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-extrabold text-slate-900">{app.label}</div>
            <div className="mt-0.5 truncate text-[9px] text-slate-400">{visibleItems.length} available screen{visibleItems.length === 1 ? '' : 's'}</div>
          </div>
        </div>

        <nav className="pf-context-navigation__items" aria-label={`${app.label} screens`}>
          {searchedItems.map(item => {
            const active = Boolean(item.tab && item.tab === contentTab);
            return (
              <button key={item.id} type="button" onClick={() => openItem(item)} className={`pf-context-navigation__item ${active ? 'is-active' : ''}`}>
                <span>{item.label}</span>
                {item.path ? <ExternalLink className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            );
          })}
          {searchedItems.length === 0 && <div className="px-3 py-2 text-[10px] text-slate-400">No matching screen in this workspace.</div>}
        </nav>
      </div>

      <div className="profox-admin-app-embed min-h-0">
        {showClientOnboardingOperations && <ClientOnboardingOperations />}
        {showUnifiedCustomerConversations ? <SalesChatInbox /> : (
          <Routes location={contentLocation}>
            <Route path="*" element={<AdminDashboard key={`${app.id}:${contentSearch}`} />} />
          </Routes>
        )}
      </div>

      {communicationOverlay && <CustomerCommunicationDrawer leadId={requestedLeadId} onClose={closeCommunicationOverlay} />}
    </WorkspaceShell>
  );
}