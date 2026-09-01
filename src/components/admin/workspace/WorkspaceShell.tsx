import React, { ReactNode, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  Grid3X3,
  Headphones,
  LogOut,
  Menu,
  UserRound,
  X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../lib/AuthContext';
import {
  getVisibleWorkspaceApps,
  getWorkspaceAppLaunchPath,
  WorkspaceAppId
} from '../../../lib/workspaceApps';
import { departmentDefinitionForRole } from '../../../lib/organization';
import { professionalMailService } from '../../../lib/professionalMailService';
import { ROLE_LABELS } from '../../../types';
import Logo from '../../Logo';
import AppAvatar from './AppAvatar';
import WorkspaceAppIcon from './WorkspaceAppIcon';
import GlobalNotificationBell from './GlobalNotificationBell';
import QuotationApprovalsNavButton from './QuotationApprovalsNavButton';

const SELLER_ROLES = new Set(['sales', 'sales_rep', 'sales_team']);
const SYMBOL_ROOT = '/assets/design-reference/sterling-home-symbols/icn/sidebar';

const REFERENCE_ICON: Partial<Record<WorkspaceAppId, string>> = {
  intelligence: 'dashboard',
  crm: 'dashboard',
  sales: 'projects',
  calendar: 'calendar',
  clients: 'employees',
  projects: 'projects',
  recruitment: 'employees',
  team: 'employees',
  internal_chat: 'messenger',
  sales_academy: 'infoportal',
  content_academy: 'infoportal',
  design_academy: 'infoportal',
  developer_academy: 'infoportal',
  academy: 'infoportal',
  academy_governance: 'infoportal',
  website: 'infoportal'
};

interface WorkspaceShellProps {
  children: ReactNode;
  activeAppId?: WorkspaceAppId | 'workspace' | 'approvals';
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  contentClassName?: string;
}

export default function WorkspaceShell({
  children,
  activeAppId = 'workspace',
  searchValue = '',
  onSearchChange,
  searchPlaceholder = 'Search your workspace',
  contentClassName = ''
}: WorkspaceShellProps) {
  const navigate = useNavigate();
  const { user, profile, role, status, logout } = useAuth();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [professionalEmail, setProfessionalEmail] = useState('');

  useEffect(() => {
    let active = true;
    if (!user?.id) {
      setProfessionalEmail('');
      return () => { active = false; };
    }
    professionalMailService.getMyStatus()
      .then(mail => {
        if (active) setProfessionalEmail(mail.mailboxStatus === 'active' ? mail.workEmail : '');
      })
      .catch(() => {
        if (active) setProfessionalEmail('');
      });
    return () => { active = false; };
  }, [user?.id]);

  const visibleApps = useMemo(
    () => getVisibleWorkspaceApps(role, status),
    [role, status]
  );
  const primaryDepartment = departmentDefinitionForRole(role);
  const profilePath = SELLER_ROLES.has(String(role || '')) ? '/admin/seller-profile' : '/admin/profile';
  const accountEmail = user?.email || '';

  const handleLogout = async () => {
    await logout();
    navigate('/admin', { replace: true });
  };

  const openWorkspace = (appId: WorkspaceAppId) => {
    const app = visibleApps.find(item => item.id === appId);
    if (!app) return;
    setMobileNavigationOpen(false);
    navigate(getWorkspaceAppLaunchPath(app, role, status));
  };

  const navigation = (
    <>
      <div className="px-5 pb-4 pt-6">
        <button
          type="button"
          onClick={() => navigate('/admin/workspace')}
          className="flex w-full items-center rounded-xl text-left"
          aria-label="Open dashboard"
        >
          <div className="h-10 w-[126px]"><Logo className="h-full max-w-full" /></div>
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => { setMobileNavigationOpen(false); navigate('/admin/workspace'); }}
            className={`pf-shell-nav-item ${activeAppId === 'workspace' ? 'is-active' : ''}`}
          >
            <span className="pf-shell-nav-icon">
              <img src={`${SYMBOL_ROOT}/dashboard/${activeAppId === 'workspace' ? 'active' : 'inactive'}.svg`} alt="" />
            </span>
            <span>Dashboard</span>
          </button>

          <QuotationApprovalsNavButton active={activeAppId === 'approvals'} onNavigate={() => setMobileNavigationOpen(false)} />

          {visibleApps.map(app => {
            const active = activeAppId === app.id;
            const referenceIcon = REFERENCE_ICON[app.id];
            return (
              <button
                key={app.id}
                type="button"
                onClick={() => openWorkspace(app.id)}
                className={`pf-shell-nav-item ${active ? 'is-active' : ''}`}
                title={app.label}
              >
                <span className="pf-shell-nav-icon">
                  {referenceIcon ? (
                    <img src={`${SYMBOL_ROOT}/${referenceIcon}/${active ? 'active' : 'inactive'}.svg`} alt="" />
                  ) : (
                    <WorkspaceAppIcon name={app.icon} className="h-[17px] w-[17px]" />
                  )}
                </span>
                <span className="truncate">{app.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="px-4 pb-5 pt-3">
        <div className="mb-3 rounded-2xl border border-[#e4eaf3] bg-[#f6f9fd] p-3">
          <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#000080] text-white">
            <Headphones className="h-4 w-4" />
          </div>
          <div className="text-[11px] font-extrabold text-slate-800">Need some help?</div>
          <p className="mt-1 text-[9px] leading-4 text-slate-500">Contact ProFox support without leaving your workspace.</p>
          <a href="mailto:support@profoxwebdesigner.com" className="mt-3 flex min-h-9 items-center justify-center rounded-lg bg-[#000080] px-3 text-[10px] font-extrabold text-white transition hover:bg-[#000066]">
            Support
          </a>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-[11px] font-bold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
        >
          <img src={`${SYMBOL_ROOT}/logout.svg`} className="h-4 w-4" alt="" />
          Logout
        </button>
      </div>
    </>
  );

  return (
    <div className="profox-app-shell min-h-screen text-slate-900">
      <aside className="pf-shell-sidebar hidden lg:flex">{navigation}</aside>

      {mobileNavigationOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm" onClick={() => setMobileNavigationOpen(false)} aria-label="Close navigation" />
          <aside className="absolute inset-y-0 left-0 flex w-[82vw] max-w-[290px] flex-col rounded-r-[24px] bg-white shadow-2xl">
            <button type="button" onClick={() => setMobileNavigationOpen(false)} className="absolute right-3 top-3 z-10 rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close navigation"><X className="h-4 w-4" /></button>
            {navigation}
          </aside>
        </div>
      )}

      <div className="min-h-screen lg:pl-[218px]">
        <header className="pf-shell-topbar">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button type="button" onClick={() => setMobileNavigationOpen(true)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#000080] text-white lg:hidden" aria-label="Open navigation"><Menu className="h-4 w-4" /></button>
            <button type="button" onClick={() => navigate('/admin/workspace')} className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#000080] transition hover:bg-blue-50 sm:flex lg:hidden" aria-label="Dashboard"><Grid3X3 className="h-4 w-4" /></button>
            <div className="relative w-full max-w-[440px]">
              <img src="/assets/design-reference/sterling-home-symbols/icn/general/search.svg" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2" alt="" />
              <input
                type="search"
                value={searchValue}
                onChange={event => onSearchChange?.(event.target.value)}
                placeholder={searchPlaceholder}
                readOnly={!onSearchChange}
                className="pf-shell-search"
              />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <GlobalNotificationBell userId={user?.id} />

            <div className="relative">
              <button type="button" onClick={() => setProfileMenuOpen(open => !open)} className="flex items-center gap-2 rounded-xl p-1.5 transition hover:bg-white" aria-expanded={profileMenuOpen}>
                <AppAvatar name={profile?.fullName || accountEmail || 'ProFox user'} src={profile?.avatarUrl} size="sm" />
                <div className="hidden max-w-[160px] text-left md:block">
                  <div className="truncate text-[11px] font-extrabold text-slate-800">{profile?.fullName || accountEmail}</div>
                  <div className="truncate text-[9px] font-semibold text-slate-400">{ROLE_LABELS[role || 'pending'] || role} · {primaryDepartment.shortLabel}</div>
                </div>
                <ChevronDown className="hidden h-3.5 w-3.5 text-slate-400 md:block" />
              </button>

              {profileMenuOpen && (
                <>
                  <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setProfileMenuOpen(false)} aria-label="Close profile menu" />
                  <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                    <div className="border-b border-slate-100 px-3 py-2.5">
                      <div className="truncate text-xs font-extrabold">{profile?.fullName || accountEmail}</div>
                      <div className="mt-2 text-[8px] font-bold uppercase tracking-wide text-slate-400">Account email · sign in</div>
                      <div className="mt-0.5 truncate text-[10px] text-slate-600">{accountEmail}</div>
                      {professionalEmail && <>
                        <div className="mt-2 text-[8px] font-bold uppercase tracking-wide text-emerald-600">Professional email · customers</div>
                        <div className="mt-0.5 truncate text-[10px] font-semibold text-emerald-700">{professionalEmail}</div>
                      </>}
                    </div>
                    <button type="button" onClick={() => navigate(profilePath)} className="mt-1 flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-slate-50 hover:text-[#000080]"><UserRound className="h-4 w-4" />My profile</button>
                    <button type="button" onClick={() => void handleLogout()} className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-xs font-bold text-slate-600 hover:bg-red-50 hover:text-red-600"><LogOut className="h-4 w-4" />Sign out</button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className={`pf-shell-content ${contentClassName}`}>{children}</main>
      </div>
    </div>
  );
}
