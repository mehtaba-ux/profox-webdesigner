import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Clock,
  CreditCard,
  ExternalLink,
  FileText,
  FolderKanban,
  History,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogOut,
  Menu,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  UserRound,
  X
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../lib/AuthContext';
import { internalChatService } from '../../lib/internalChatService';
import { notificationCenterService, type NotificationCenterItem } from '../../lib/notificationCenterService';
import { profileService } from '../../lib/profileService';
import { projectService } from '../../lib/projectService';
import { Payment, PROJECT_STAGES, ProjectStage } from '../../types';
import Logo from '../Logo';
import ProfileImageUploader from '../admin/workspace/ProfileImageUploader';
import ClientDevelopmentHandover from './ClientDevelopmentHandover';
import ClientProjectChat from './ClientProjectChat';
import ClientRelationshipHistory from './ClientRelationshipHistory';

type PortalSection = 'overview' | 'project' | 'deliverables' | 'payments' | 'history' | 'notifications' | 'profile';

const PAYABLE_STATUSES = new Set(['Sent', 'Pending', 'Partially Paid', 'Verification Pending']);
const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

function money(currency: string, value: number) {
  return `${currency || 'USD'} ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function dateLabel(value?: string | null) {
  if (!value) return 'TBD';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'TBD' : format(date, 'MMM d, yyyy');
}

function timeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : format(date, 'MMM d · h:mm a');
}

export default function ClientDashboard() {
  const { user, profile, loading: authLoading, logout, refreshProfile } = useAuth();
  const [section, setSection] = useState<PortalSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectError, setProjectError] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notifications, setNotifications] = useState<NotificationCenterItem[]>([]);
  const [notificationUnread, setNotificationUnread] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [profileForm, setProfileForm] = useState({ fullName: '', phone: '', country: '', timezone: '', avatarUrl: '' });

  const hasPortalAccess = Boolean(user && profile?.role === 'customer' && profile?.status === 'active');

  useEffect(() => {
    setProfileForm({
      fullName: profile?.fullName || '',
      phone: profile?.phone || '',
      country: profile?.country || '',
      timezone: profile?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      avatarUrl: profile?.avatarUrl || ''
    });
  }, [profile?.fullName, profile?.phone, profile?.country, profile?.timezone, profile?.avatarUrl]);

  const loadProjects = async () => {
    if (!hasPortalAccess) return;
    setLoadingProjects(true);
    setProjectError('');
    try {
      const { data, error } = await projectService.getProjectsByClientEmail('');
      if (error) throw error;
      const allowed = data || [];
      setProjects(allowed);
      setSelectedProject(current => current ? (allowed.find(project => project.id === current.id) || allowed[0] || null) : (allowed[0] || null));
    } catch (error) {
      setProjectError(getErrorMessage(error, 'Could not load your linked projects.'));
      setProjects([]);
      setSelectedProject(null);
    } finally {
      setLoadingProjects(false);
    }
  };

  const loadNotifications = async () => {
    if (!hasPortalAccess) return;
    setNotificationsLoading(true);
    setNotificationError('');
    try {
      const page = await notificationCenterService.get({ limit: 40, filter: 'all' });
      setNotifications(page.items);
      setNotificationUnread(page.unreadCount);
    } catch (error) {
      setNotificationError(getErrorMessage(error, 'Notifications could not be loaded.'));
    } finally {
      setNotificationsLoading(false);
    }
  };

  const loadChatUnread = async () => {
    if (!hasPortalAccess) return;
    try {
      const { data } = await internalChatService.listThreads();
      setChatUnread(data.reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0));
    } catch {
      setChatUnread(0);
    }
  };

  useEffect(() => {
    if (!hasPortalAccess) return;
    void loadProjects();
    void loadNotifications();
    void loadChatUnread();
    const timer = window.setInterval(() => {
      void loadNotifications();
      void loadChatUnread();
    }, 45000);
    return () => window.clearInterval(timer);
  }, [hasPortalAccess, user?.id]);

  useEffect(() => {
    setPayments(Array.isArray(selectedProject?.payments) ? selectedProject.payments as Payment[] : []);
  }, [selectedProject?.id, selectedProject?.payments]);

  const tasks = selectedProject?.tasks || [];
  const completedTasks = tasks.filter((task: any) => task.status === 'Done').length;
  const stageIndex = selectedProject ? PROJECT_STAGES.indexOf(selectedProject.stage as ProjectStage) : -1;
  const stageProgress = stageIndex < 0 ? 0 : Math.round((stageIndex / Math.max(PROJECT_STAGES.length - 1, 1)) * 100);
  const nextStage = stageIndex >= 0 && stageIndex < PROJECT_STAGES.length - 1 ? PROJECT_STAGES[stageIndex + 1] : null;
  const totalDue = payments.reduce((sum, payment) => sum + Number(payment.amountDue || 0), 0);
  const totalPaid = payments.reduce((sum, payment) => sum + Number(payment.amountPaid || 0), 0);
  const outstanding = Math.max(0, totalDue - totalPaid);
  const approvalPaymentType = selectedProject?.stage === 'Client Design Approval' ? 'Design Milestone' : selectedProject?.stage === 'Client Review' ? 'Staging Milestone' : '';
  const requiredApprovalPayment = approvalPaymentType ? payments.find(payment => payment.paymentType === approvalPaymentType) : undefined;
  const approvalPaymentBlocked = Boolean(requiredApprovalPayment && requiredApprovalPayment.status !== 'Verified');
  const pendingPayment = payments.find(payment => PAYABLE_STATUSES.has(payment.status) && Number(payment.amountDue || 0) > Number(payment.amountPaid || 0));
  const reviewRequired = Boolean(selectedProject && ['Client Design Approval', 'Client Review'].includes(selectedProject.stage));

  const attentionItems = useMemo(() => {
    const items: Array<{ id: string; title: string; description: string; action: string; kind: 'profile' | 'review' | 'payment' }> = [];
    if (!profile?.avatarUrl) {
      items.push({ id: 'profile-image', title: 'Add your profile image or company logo', description: 'Required for a complete customer identity across project communication and portal views.', action: 'Complete profile', kind: 'profile' });
    }
    if (reviewRequired) {
      items.push({ id: 'project-review', title: `${selectedProject.stage} needs your decision`, description: approvalPaymentBlocked ? 'The required milestone payment must be verified before this approval can move forward.' : 'Review the current work and approve it, or send clear revision notes.', action: 'Review now', kind: 'review' });
    }
    if (pendingPayment) {
      items.push({ id: `payment-${pendingPayment.id}`, title: `${pendingPayment.milestoneLabel || pendingPayment.paymentType} payment is pending`, description: `${money(pendingPayment.currency, Math.max(0, Number(pendingPayment.amountDue || 0) - Number(pendingPayment.amountPaid || 0)))} remains on this milestone.`, action: pendingPayment.paymentLink ? 'Pay securely' : 'View payment', kind: 'payment' });
    }
    return items;
  }, [profile?.avatarUrl, reviewRequired, selectedProject?.stage, approvalPaymentBlocked, pendingPayment?.id, pendingPayment?.status, pendingPayment?.amountPaid]);

  const refreshAfterAction = async (projectId: string) => {
    const { data, error } = await projectService.getProjectsByClientEmail('');
    if (error) throw error;
    const nextProjects = data || [];
    setProjects(nextProjects);
    setSelectedProject(nextProjects.find(project => project.id === projectId) || nextProjects[0] || null);
    setApprovalNotes('');
    await loadNotifications();
  };

  const approveStage = async () => {
    if (!selectedProject) return;
    if (approvalPaymentBlocked) {
      setActionError(`Complete the required ${requiredApprovalPayment?.paymentType || 'milestone'} payment before approving this stage.`);
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      const { error } = await projectService.approveClientStage(selectedProject.id, approvalNotes);
      if (error) throw error;
      await refreshAfterAction(selectedProject.id);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Approval could not be recorded.'));
    } finally {
      setActionBusy(false);
    }
  };

  const requestChanges = async () => {
    if (!selectedProject) return;
    if (!approvalNotes.trim()) {
      setActionError('Describe the requested changes before submitting.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      const { error } = await projectService.requestClientChanges(selectedProject.id, approvalNotes.trim());
      if (error) throw error;
      await refreshAfterAction(selectedProject.id);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Change request could not be recorded.'));
    } finally {
      setActionBusy(false);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setProfileSaving(true);
    setProfileError('');
    setProfileMessage('');
    try {
      if (!profileForm.fullName.trim()) throw new Error('Your name is required.');
      if (!profileForm.avatarUrl.trim()) throw new Error('Please upload a profile image or company logo before saving.');
      try { new Intl.DateTimeFormat('en-US', { timeZone: profileForm.timezone.trim() }).format(new Date()); }
      catch { throw new Error('Enter a valid timezone such as Asia/Kolkata or America/New_York.'); }
      const result = await profileService.updateMyProfile(user.id, {
        fullName: profileForm.fullName.trim(),
        phone: profileForm.phone.trim(),
        country: profileForm.country.trim(),
        timezone: profileForm.timezone.trim(),
        avatarUrl: profileForm.avatarUrl.trim()
      });
      if (result.error) throw result.error;
      await refreshProfile();
      setProfileMessage('Profile saved. Your customer identity is now current across ProFox.');
    } catch (error) {
      setProfileError(getErrorMessage(error, 'Your profile could not be saved.'));
    } finally {
      setProfileSaving(false);
    }
  };

  const openAttention = (kind: 'profile' | 'review' | 'payment') => {
    if (kind === 'profile') setSection('profile');
    if (kind === 'review') setSection('project');
    if (kind === 'payment') {
      if (pendingPayment?.paymentLink) window.open(pendingPayment.paymentLink, '_blank', 'noopener,noreferrer');
      else setSection('payments');
    }
    setMobileMenuOpen(false);
  };

  const openNotification = async (item: NotificationCenterItem) => {
    if (!item.readAt) {
      try {
        await notificationCenterService.markRead(item.id);
        setNotifications(current => current.map(notification => notification.id === item.id ? { ...notification, readAt: new Date().toISOString() } : notification));
        setNotificationUnread(current => Math.max(0, current - 1));
      } catch {
        // Reading a notification should never block the portal action.
      }
    }
    if (item.actionUrl && item.actionUrl.startsWith('/client-portal')) window.location.assign(item.actionUrl);
  };

  const markAllNotificationsRead = async () => {
    try {
      await notificationCenterService.markAllRead();
      setNotifications(current => current.map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
      setNotificationUnread(0);
    } catch (error) {
      setNotificationError(getErrorMessage(error, 'Notifications could not be marked as read.'));
    }
  };

  if (authLoading || (hasPortalAccess && loadingProjects)) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f3f7fc]"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }

  if (!hasPortalAccess) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f3f7fc] p-5"><div className="max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm"><ShieldCheck className="mx-auto h-12 w-12 text-[#000080]" /><h1 className="mt-4 text-xl font-black text-slate-900">Secure Client Portal access required</h1><p className="mt-2 text-sm leading-6 text-slate-500">Please use the verified ProFox client invitation and active customer account to continue.</p><button type="button" onClick={() => void logout()} className="mt-6 rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-black text-slate-700">Sign out</button></div></div>;
  }

  const navItems: Array<{ id: PortalSection; label: string; icon: React.ElementType; badge?: number }> = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'project', label: 'Project Journey', icon: FolderKanban },
    { id: 'deliverables', label: 'Deliverables', icon: ListChecks },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'history', label: 'Relationship History', icon: History },
    { id: 'notifications', label: 'Notifications', icon: Bell, badge: notificationUnread },
    { id: 'profile', label: 'My Profile', icon: UserRound }
  ];

  const renderProjectSelector = () => projects.length > 1 ? (
    <select value={selectedProject?.id || ''} onChange={event => setSelectedProject(projects.find(project => project.id === event.target.value) || selectedProject)} className="max-w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 outline-none focus:border-[#000080]">
      {projects.map(project => <option key={project.id} value={project.id}>{project.projectNumber} · {project.projectName}</option>)}
    </select>
  ) : null;

  return (
    <div className="min-h-screen bg-[#f3f7fc] text-slate-900">
      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col bg-[#000080] text-white shadow-2xl transition-transform duration-300 lg:translate-x-0 ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-24 items-center justify-between border-b border-white/10 px-6">
          <div className="h-11 w-[190px]"><Logo light className="h-full max-w-full" /></div>
          <button type="button" onClick={() => setMobileMenuOpen(false)} className="rounded-xl p-2 text-blue-100 hover:bg-white/10 lg:hidden" aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 pb-4 pt-6"><div className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-300">Client Portal</div><div className="mt-1 text-sm font-black">Project Command Center</div></div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-6">
          {navItems.map(item => {
            const Icon = item.icon;
            const active = section === item.id;
            return <button key={item.id} type="button" onClick={() => { setSection(item.id); setMobileMenuOpen(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-xs font-black transition ${active ? 'bg-white text-[#000080] shadow-sm' : 'text-blue-100 hover:bg-white/10 hover:text-white'}`}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{item.label}</span>{Boolean(item.badge) && <span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[9px] ${active ? 'bg-red-500 text-white' : 'bg-white text-[#000080]'}`}>{item.badge}</span>}</button>;
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/10 p-3"><CircleUserRound className="h-8 w-8 shrink-0 text-blue-200" /><div className="min-w-0"><div className="truncate text-xs font-black">{profile?.fullName || user?.email}</div><div className="truncate text-[10px] text-blue-300">{user?.email}</div></div></div>
          <button type="button" onClick={() => void logout()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-3 py-2.5 text-xs font-black text-blue-100 hover:bg-white/10"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>

      {mobileMenuOpen && <button type="button" className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileMenuOpen(false)} aria-label="Close navigation" />}

      <div className="min-h-screen lg:pl-[286px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex min-h-20 items-center gap-3 px-4 sm:px-7 lg:px-9">
            <button type="button" onClick={() => setMobileMenuOpen(true)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 lg:hidden" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1"><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">{selectedProject?.projectNumber || 'ProFox Client Portal'}</div><div className="truncate text-lg font-black">{selectedProject?.projectName || 'Your ProFox Relationship'}</div></div>
            {renderProjectSelector()}
            <button type="button" onClick={() => setSection('notifications')} className="relative rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 hover:border-blue-200 hover:text-[#000080]" aria-label="Notifications"><Bell className="h-4 w-4" />{notificationUnread > 0 && <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-500 px-1 py-0.5 text-[9px] font-black text-white">{notificationUnread > 99 ? '99+' : notificationUnread}</span>}</button>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] p-4 sm:p-7 lg:p-9">
          {projectError && <div className="mb-6 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{projectError}</div>}

          {section === 'overview' && <OverviewSection profileName={profile?.fullName || ''} selectedProject={selectedProject} projects={projects} stageProgress={stageProgress} completedTasks={completedTasks} taskCount={tasks.length} outstanding={outstanding} attentionItems={attentionItems} openAttention={openAttention} nextStage={nextStage} setSection={setSection} />}

          {section === 'project' && <ProjectSection selectedProject={selectedProject} projects={projects} stageIndex={stageIndex} stageProgress={stageProgress} nextStage={nextStage} reviewRequired={reviewRequired} approvalPaymentBlocked={approvalPaymentBlocked} requiredApprovalPayment={requiredApprovalPayment} approvalNotes={approvalNotes} setApprovalNotes={setApprovalNotes} actionError={actionError} actionBusy={actionBusy} approveStage={approveStage} requestChanges={requestChanges} />}

          {section === 'deliverables' && <DeliverablesSection tasks={tasks} completedTasks={completedTasks} selectedProject={selectedProject} />}

          {section === 'payments' && <PaymentsSection payments={payments} selectedProject={selectedProject} totalDue={totalDue} totalPaid={totalPaid} outstanding={outstanding} />}

          {section === 'history' && <ClientRelationshipHistory />}

          {section === 'notifications' && <NotificationsSection notifications={notifications} unread={notificationUnread} loading={notificationsLoading} error={notificationError} onRefresh={loadNotifications} onMarkAll={markAllNotificationsRead} onOpen={openNotification} />}

          {section === 'profile' && <ProfileSection userEmail={user?.email || ''} form={profileForm} setForm={setProfileForm} saving={profileSaving} error={profileError} message={profileMessage} onSubmit={saveProfile} />}
        </main>
      </div>

      <button type="button" onClick={() => { setChatOpen(true); setChatUnread(0); }} className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#000080] text-white shadow-2xl transition hover:-translate-y-0.5 hover:bg-[#000066] sm:bottom-7 sm:right-7" aria-label="Open project chat"><MessageCircle className="h-6 w-6" />{chatUnread > 0 && <span className="absolute -right-1 -top-1 min-w-6 rounded-full border-2 border-white bg-red-500 px-1 py-0.5 text-[9px] font-black text-white">{chatUnread > 99 ? '99+' : chatUnread}</span>}</button>

      {chatOpen && <div className="fixed inset-0 z-[70] flex items-end justify-end bg-slate-950/35 p-0 sm:p-5" onMouseDown={event => { if (event.currentTarget === event.target) setChatOpen(false); }}><div className="flex h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[82vh] sm:rounded-3xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><div className="text-sm font-black text-slate-900">Project Chat</div><div className="text-[10px] font-semibold text-slate-500">Secure customer-visible communication</div></div><button type="button" onClick={() => { setChatOpen(false); void loadChatUnread(); }} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-slate-900" aria-label="Close chat"><X className="h-4 w-4" /></button></div><div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5"><ClientProjectChat /></div></div></div>}
    </div>
  );
}

function OverviewSection({ profileName, selectedProject, projects, stageProgress, completedTasks, taskCount, outstanding, attentionItems, openAttention, nextStage, setSection }: any) {
  return <div className="space-y-7">
    <section className="overflow-hidden rounded-[2rem] bg-[#000080] p-7 text-white shadow-lg sm:p-9"><div className="max-w-3xl"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-300">Welcome back{profileName ? `, ${profileName.split(' ')[0]}` : ''}</div><h1 className="mt-2 text-2xl font-black sm:text-3xl">Know exactly where your project stands—and what happens next.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">One secure place for progress, approvals, payments, deliverables, communication and your complete ProFox relationship.</p></div></section>

    <section><div className="mb-4 flex items-end justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-red-600">Priority</div><h2 className="text-xl font-black">Needs Your Attention</h2></div>{attentionItems.length === 0 && <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700">All caught up</span>}</div>{attentionItems.length === 0 ? <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><div className="text-sm font-black text-emerald-900">Nothing is waiting on you right now.</div><div className="mt-0.5 text-xs text-emerald-700">We’ll surface approvals, payments and profile requirements here automatically.</div></div></div> : <div className="grid gap-4 xl:grid-cols-3">{attentionItems.map((item: any) => <button key={item.id} type="button" onClick={() => openAttention(item.kind)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div className="rounded-xl bg-red-50 p-2.5 text-red-600"><AlertCircle className="h-4 w-4" /></div><ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-[#000080]" /></div><div className="mt-4 text-sm font-black">{item.title}</div><p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p><div className="mt-4 text-[10px] font-black uppercase tracking-wider text-[#000080]">{item.action}</div></button>)}</div>}</section>

    {projects.length === 0 ? <section className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-sm"><FolderKanban className="mx-auto h-11 w-11 text-slate-300" /><h2 className="mt-4 text-lg font-black">Your project will appear here automatically.</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Your relationship history remains available. Once your verified sale creates a project, the same canonical project will show here—no duplicate customer record.</p><button type="button" onClick={() => setSection('history')} className="mt-5 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">View relationship history</button></section> : selectedProject && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Current Stage" value={selectedProject.stage} /><Metric label="Project Progress" value={`${stageProgress}%`} /><Metric label="Deliverables Done" value={`${completedTasks}/${taskCount}`} /><Metric label="Outstanding Balance" value={money(selectedProject.currency || 'USD', outstanding)} /></div>
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Project Journey</div><h2 className="mt-1 text-lg font-black">{selectedProject.stage}</h2><p className="mt-1 text-xs text-slate-500">{nextStage ? <>Next milestone: <strong className="text-slate-700">{nextStage}</strong></> : 'Your project journey has reached its final stage.'}</p></div><button type="button" onClick={() => setSection('project')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-[#000080]">View full journey</button></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#000080]" style={{ width: `${stageProgress}%` }} /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Mini label="Started" value={dateLabel(selectedProject.createdAt)} /><Mini label="Target" value={dateLabel(selectedProject.targetDate)} /><Mini label="Status" value={selectedProject.status || 'Active'} /></div></section>
    </>}
  </div>;
}

function ProjectSection({ selectedProject, projects, stageIndex, stageProgress, nextStage, reviewRequired, approvalPaymentBlocked, requiredApprovalPayment, approvalNotes, setApprovalNotes, actionError, actionBusy, approveStage, requestChanges }: any) {
  if (!selectedProject && projects.length === 0) return <EmptyState icon={FolderKanban} title="No active project yet" description="Your verified project will appear here automatically when it is created from your sale." />;
  if (!selectedProject) return null;
  return <div className="space-y-7"><PageHeading eyebrow={selectedProject.projectNumber} title="Project Journey" description="Every stage comes from your real ProFox delivery workflow, so the status you see here is the same status our team works from." />
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><div className="text-xs font-black text-slate-500">Current stage</div><div className="mt-1 text-2xl font-black text-[#000080]">{selectedProject.stage}</div></div><div className="text-left sm:text-right"><div className="text-xs font-black text-slate-500">Next milestone</div><div className="mt-1 text-sm font-black">{nextStage || 'Project complete'}</div></div></div><div className="mt-7 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#000080]" style={{ width: `${stageProgress}%` }} /></div><div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{PROJECT_STAGES.map((stage, index) => { const complete = index < stageIndex || selectedProject.stage === 'Completed'; const current = index === stageIndex && selectedProject.stage !== 'Completed'; return <div key={stage} className={`rounded-2xl border p-4 ${current ? 'border-blue-200 bg-blue-50' : complete ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-200 bg-slate-50'}`}><div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${current ? 'bg-[#000080] text-white' : complete ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-200'}`}>{complete ? <Check className="h-3.5 w-3.5" /> : index + 1}</div><div className={`mt-3 text-xs font-black ${current ? 'text-[#000080]' : complete ? 'text-emerald-800' : 'text-slate-500'}`}>{stage}</div>{current && <div className="mt-1 text-[9px] font-black uppercase tracking-wider text-blue-600">In progress</div>}</div>; })}</div></section>

    {reviewRequired && <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-6 sm:p-7"><div className="flex items-start gap-4"><div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div><div className="flex-1"><h2 className="text-lg font-black">Your review is required</h2><p className="mt-1 text-sm leading-6 text-slate-600">Approve the current work to continue, or send specific changes for the team to address.</p></div></div>{approvalPaymentBlocked && <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2 text-xs leading-5 text-amber-800"><Clock className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{requiredApprovalPayment?.milestoneLabel || requiredApprovalPayment?.paymentType}</strong> must be verified before approval can advance the project.</span></div>{requiredApprovalPayment?.paymentLink && PAYABLE_STATUSES.has(requiredApprovalPayment.status) && <a href={requiredApprovalPayment.paymentLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Pay securely<ExternalLink className="h-3.5 w-3.5" /></a>}</div>}{actionError && <div className="mt-4 rounded-xl border border-red-200 bg-white p-3 text-xs font-semibold text-red-700">{actionError}</div>}<textarea value={approvalNotes} onChange={(event: any) => setApprovalNotes(event.target.value)} rows={4} placeholder="Optional approval note, or required details if requesting changes..." className="mt-5 w-full resize-none rounded-xl border border-emerald-200 bg-white p-3 text-sm outline-none focus:border-emerald-500" /><div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={actionBusy || approvalPaymentBlocked} onClick={approveStage} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"><Check className="h-4 w-4" />{approvalPaymentBlocked ? 'Payment required first' : 'Approve & proceed'}</button><button type="button" disabled={actionBusy} onClick={requestChanges} className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-xs font-black text-emerald-800 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Request changes</button>{actionBusy && <Loader2 className="h-5 w-5 animate-spin text-emerald-700" />}</div></section>}

    <ClientDevelopmentHandover projectId={selectedProject.id} />
  </div>;
}

function DeliverablesSection({ tasks, completedTasks, selectedProject }: any) {
  return <div className="space-y-7"><PageHeading eyebrow={selectedProject?.projectNumber || 'Delivery'} title="Project Deliverables" description="See what has been completed and what is still moving through the delivery workflow." /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Completed" value={`${completedTasks}`} /><Metric label="In Progress / To Do" value={`${Math.max(0, tasks.length - completedTasks)}`} /><Metric label="Total Deliverables" value={`${tasks.length}`} /></div><section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">{tasks.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No client-visible deliverables have been published yet.</p> : <div className="space-y-3">{tasks.map((task: any, index: number) => <div key={task.id} className="flex items-start gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${task.status === 'Done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{task.status === 'Done' ? <Check className="h-4 w-4" /> : <span className="text-xs font-black">{index + 1}</span>}</div><div className="min-w-0 flex-1"><div className="text-sm font-black">{task.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{task.description || task.department || 'Project deliverable'}</div>{task.dueDate && <div className="mt-2 text-[10px] font-bold text-slate-400">Due {dateLabel(task.dueDate)}</div>}</div><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black uppercase text-slate-600 ring-1 ring-slate-200">{task.status}</span></div>)}</div>}</section></div>;
}

function PaymentsSection({ payments, selectedProject, totalDue, totalPaid, outstanding }: any) {
  return <div className="space-y-7"><PageHeading eyebrow={selectedProject?.projectNumber || 'Billing'} title="Payments" description="Payment status and secure payment links come directly from your existing ProFox payment records." /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Total Scheduled" value={money(selectedProject?.currency || 'USD', totalDue)} /><Metric label="Paid" value={money(selectedProject?.currency || 'USD', totalPaid)} /><Metric label="Outstanding" value={money(selectedProject?.currency || 'USD', outstanding)} /></div><section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">{payments.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No project payments are published yet.</p> : <div className="space-y-3">{payments.map((payment: Payment) => { const balance = Math.max(0, Number(payment.amountDue || 0) - Number(payment.amountPaid || 0)); return <div key={payment.id} className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#000080] ring-1 ring-slate-200"><CreditCard className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="text-sm font-black">{payment.milestoneLabel || payment.paymentType}</div><div className="mt-1 text-[10px] font-bold text-slate-500">{payment.paymentReference} · Due {payment.dueDate ? dateLabel(payment.dueDate) : 'as scheduled'}</div></div><div className="sm:text-right"><div className="text-sm font-black">{money(payment.currency, balance)}</div><div className={`mt-1 text-[9px] font-black uppercase ${payment.status === 'Verified' ? 'text-emerald-700' : 'text-amber-700'}`}>{payment.status}</div></div>{payment.paymentLink && PAYABLE_STATUSES.has(payment.status) && balance > 0 && <a href={payment.paymentLink} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Pay securely<ExternalLink className="h-3.5 w-3.5" /></a>}</div>; })}</div>}</section></div>;
}

function NotificationsSection({ notifications, unread, loading, error, onRefresh, onMarkAll, onOpen }: any) {
  return <div className="space-y-7"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><PageHeading eyebrow="Updates" title="Notifications" description="Approvals, project updates and other customer-facing alerts in one place." /><div className="flex gap-2"><button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-black text-slate-600"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button>{unread > 0 && <button type="button" onClick={onMarkAll} className="rounded-xl bg-[#000080] px-3.5 py-2.5 text-xs font-black text-white">Mark all read</button>}</div></div>{error && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">{error}</div>}<section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">{loading && notifications.length === 0 ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div> : notifications.length === 0 ? <div className="p-10 text-center"><Bell className="mx-auto h-9 w-9 text-slate-300" /><div className="mt-3 text-sm font-black">No notifications yet</div><div className="mt-1 text-xs text-slate-500">New project updates will appear here.</div></div> : <div className="divide-y divide-slate-100">{notifications.map((item: NotificationCenterItem) => <button type="button" key={item.id} onClick={() => onOpen(item)} className={`flex w-full gap-4 p-5 text-left transition hover:bg-slate-50 ${item.readAt ? '' : 'bg-blue-50/60'}`}><div className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${item.readAt ? 'bg-slate-200' : 'bg-[#000080]'}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><div className="text-sm font-black">{item.title}</div>{!item.readAt && <span className="rounded-full bg-[#000080] px-2 py-0.5 text-[8px] font-black uppercase text-white">New</span>}</div><div className="mt-1 text-xs leading-5 text-slate-500">{item.message}</div><div className="mt-2 text-[9px] font-bold uppercase tracking-wider text-slate-400">{item.category || item.module} · {timeLabel(item.createdAt)}</div></div><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" /></button>)}</div>}</section></div>;
}

function ProfileSection({ userEmail, form, setForm, saving, error, message, onSubmit }: any) {
  return <div className="space-y-7"><PageHeading eyebrow="Account" title="My Profile" description="Keep the customer identity used across project communication and portal views current." /><form onSubmit={onSubmit} className="max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">{error && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>}{message && <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700">{message}</div>}<div className="mb-5"><div className="mb-2 flex items-center gap-2"><span className="text-xs font-black">Profile image or company logo</span><span className="rounded-full bg-red-50 px-2 py-0.5 text-[9px] font-black uppercase text-red-600">Required</span></div><ProfileImageUploader value={form.avatarUrl} name={form.fullName || userEmail} onChange={avatarUrl => setForm({ ...form, avatarUrl })} disabled={saving} /><p className="mt-2 text-[10px] leading-4 text-slate-500">Use a clear personal photo or your company logo. This image is stored through the existing ProFox profile-media system and reused wherever your customer identity appears.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Your name"><input value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} className={inputClass} /></Field><Field label="Verified account email"><input value={userEmail} disabled className={`${inputClass} bg-slate-50 text-slate-500`} /></Field><Field label="Phone"><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} className={inputClass} /></Field><Field label="Country"><input value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} className={inputClass} /></Field><Field label="Timezone"><input value={form.timezone} onChange={event => setForm({ ...form, timezone: event.target.value })} placeholder="Asia/Kolkata" className={inputClass} /></Field></div><div className="mt-6 flex justify-end"><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save profile</button></div></form></div>;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">{eyebrow}</div><h1 className="mt-1 text-2xl font-black">{title}</h1><p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">{description}</p></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div><div className="mt-2 break-words text-lg font-black text-slate-900">{value}</div></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-xs font-black text-slate-700">{value}</div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}

function EmptyState({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center shadow-sm"><Icon className="mx-auto h-10 w-10 text-slate-300" /><h2 className="mt-4 text-lg font-black">{title}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p></div>;
}
