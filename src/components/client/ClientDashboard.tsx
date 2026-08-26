import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Receipt,
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '../../lib/AuthContext';
import { projectService } from '../../lib/projectService';
import { supabase } from '../../lib/supabase';
import { Payment, PROJECT_STAGES, ProjectStage } from '../../types';
import ClientDevelopmentHandover from './ClientDevelopmentHandover';
import ClientRelationshipHistory from './ClientRelationshipHistory';

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message || fallback);
  }
  return fallback;
}

export default function ClientDashboard() {
  const { user, profile, loading: authLoading, logout, refreshProfile } = useAuth();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authNotice, setAuthNotice] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [portalClaiming, setPortalClaiming] = useState(false);
  const [portalClaimError, setPortalClaimError] = useState('');
  const claimAttempt = useRef('');
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const hasPortalAccess = Boolean(user && profile?.role === 'customer' && profile?.status === 'active');

  useEffect(() => {
    if (!user || !profile || !['pending', 'customer'].includes(profile.role)) return;
    if (profile.role === 'customer' && profile.status === 'active') return;
    const key = `${user.id}:${profile.role}:${profile.status}`;
    if (claimAttempt.current === key) return;
    claimAttempt.current = key;
    setPortalClaiming(true);
    setPortalClaimError('');
    void supabase.rpc('customer_portal_claim_identity').then(async ({ error }) => {
      if (error) setPortalClaimError(error.message || 'This verified account could not be linked to a ProFox relationship yet.');
      else await refreshProfile();
      setPortalClaiming(false);
    });
  }, [user?.id, profile?.role, profile?.status, refreshProfile]);

  const loadProjects = async () => {
    if (!hasPortalAccess) return;
    setLoadingProjects(true);
    setProjectError('');
    const { data, error } = await projectService.getProjectsByClientEmail('');
    if (error) {
      setProjectError(getErrorMessage(error, 'Could not load your linked projects.'));
      setProjects([]);
      setSelectedProject(null);
    } else {
      const allowed = data || [];
      setProjects(allowed);
      setSelectedProject(current => {
        if (current) return allowed.find(project => project.id === current.id) || allowed[0] || null;
        return allowed[0] || null;
      });
    }
    setLoadingProjects(false);
  };

  useEffect(() => {
    if (hasPortalAccess) void loadProjects();
    if (!user) {
      setProjects([]);
      setSelectedProject(null);
      setPayments([]);
      claimAttempt.current = '';
    }
  }, [hasPortalAccess, user?.id]);

  useEffect(() => {
    setPayments(Array.isArray(selectedProject?.payments) ? selectedProject.payments as Payment[] : []);
  }, [selectedProject?.id]);

  const handleAuth = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError('');
    setAuthNotice('');
    const normalizedEmail = email.trim().toLowerCase();
    if (authMode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) setAuthError('Invalid email/password or this portal account has not been confirmed yet.');
    } else {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: { data: { full_name: fullName.trim() } }
      });
      if (error) setAuthError(error.message || 'Portal account could not be created.');
      else if (data.session) setAuthNotice('Account created. Your verified ProFox relationship will be linked automatically.');
      else setAuthNotice('Account created. Please verify your email, then return here and sign in. Your existing ProFox history will link automatically.');
    }
    setAuthBusy(false);
  };

  const handlePasswordReset = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError('Enter your registered email first.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
    const redirectTo = `${window.location.origin}/client-portal`;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
    setAuthError(error ? 'Password reset email could not be sent.' : 'If this email has a portal account, a password reset link has been sent.');
    setAuthBusy(false);
  };

  const refreshAfterAction = async (projectId: string) => {
    const { data, error } = await projectService.getProjectsByClientEmail('');
    if (error) throw error;
    const nextProjects = data || [];
    setProjects(nextProjects);
    setSelectedProject(nextProjects.find(project => project.id === projectId) || nextProjects[0] || null);
    setApprovalNotes('');
  };

  const approveStage = async () => {
    if (!selectedProject) return;
    if (approvalPaymentBlocked) {
      setActionError(`Complete the required ${requiredApprovalPayment?.paymentType || 'milestone'} payment before approving this stage.`);
      return;
    }
    setActionBusy(true);
    setActionError('');
    const { error } = await projectService.approveClientStage(selectedProject.id, approvalNotes);
    if (error) setActionError(getErrorMessage(error, 'Approval could not be recorded.'));
    else {
      try { await refreshAfterAction(selectedProject.id); } catch (error) { setActionError(getErrorMessage(error, 'Approval saved, but the project could not be refreshed.')); }
    }
    setActionBusy(false);
  };

  const requestChanges = async () => {
    if (!selectedProject) return;
    if (!approvalNotes.trim()) {
      setActionError('Describe the requested changes before submitting.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    const { error } = await projectService.requestClientChanges(selectedProject.id, approvalNotes.trim());
    if (error) setActionError(getErrorMessage(error, 'Change request could not be recorded.'));
    else {
      try { await refreshAfterAction(selectedProject.id); } catch (error) { setActionError(getErrorMessage(error, 'Request saved, but the project could not be refreshed.')); }
    }
    setActionBusy(false);
  };

  const stageProgress = useMemo(() => {
    if (!selectedProject) return 0;
    const index = PROJECT_STAGES.indexOf(selectedProject.stage as ProjectStage);
    if (index < 0) return 0;
    return Math.round((index / Math.max(PROJECT_STAGES.length - 1, 1)) * 100);
  }, [selectedProject?.stage]);

  const tasks = selectedProject?.tasks || [];
  const completedTasks = tasks.filter((task: any) => task.status === 'Done').length;
  const totalDue = payments.reduce((sum, payment) => sum + payment.amountDue, 0);
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amountPaid, 0);
  const outstanding = Math.max(0, totalDue - totalPaid);
  const approvalPaymentType = selectedProject?.stage === 'Client Design Approval' ? 'Design Milestone' : selectedProject?.stage === 'Client Review' ? 'Staging Milestone' : '';
  const requiredApprovalPayment = approvalPaymentType ? payments.find(payment => payment.paymentType === approvalPaymentType) : undefined;
  const approvalPaymentBlocked = Boolean(requiredApprovalPayment && requiredApprovalPayment.status !== 'Verified');
  const payableStatuses = new Set(['Sent', 'Pending', 'Partially Paid', 'Verification Pending']);

  if (authLoading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-slate-100 bg-white shadow-2xl">
          <div className="bg-[#000080] p-10 text-center text-white">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10"><Lock className="h-8 w-8" /></div>
            <h1 className="text-2xl font-black">Secure Customer Portal</h1>
            <p className="mt-2 text-sm text-blue-200">Your verified email connects your ProFox history from first enquiry through quotations, conversations, payments and projects.</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-5 p-8">
            {authError && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-medium text-amber-800">{authError}</div>}
            {authNotice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800">{authNotice}</div>}
            {authMode === 'signup' && <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Your Name</span><input required value={fullName} onChange={event => setFullName(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-[#000080]" /></label>}
            <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Email</span><div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="email" required autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-[#000080]" /></div></label>
            <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">Password</span><input type="password" required minLength={6} autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm outline-none focus:border-[#000080]" /></label>
            <button type="submit" disabled={authBusy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#000080] py-3.5 text-sm font-bold text-white disabled:opacity-50">{authBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}{authMode === 'signin' ? 'Sign In' : 'Create Portal Account'}</button>
            <button type="button" disabled={authBusy} onClick={() => { setAuthMode(current => current === 'signin' ? 'signup' : 'signin'); setAuthError(''); setAuthNotice(''); }} className="w-full text-center text-xs font-bold text-[#000080] hover:underline">{authMode === 'signin' ? 'First time here? Create a portal account' : 'Already have an account? Sign in'}</button>
            {authMode === 'signin' && <button type="button" disabled={authBusy} onClick={() => void handlePasswordReset()} className="w-full text-center text-xs font-bold text-slate-500 hover:underline">Forgot password?</button>}
          </form>
        </div>
      </div>
    );
  }

  if (portalClaiming) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /><p className="text-sm font-semibold text-slate-500">Linking your verified ProFox relationship history...</p></div>;
  }

  if (!hasPortalAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 text-center shadow-xl">
          <ShieldCheck className="mx-auto h-12 w-12 text-[#000080]" />
          <h1 className="mt-4 text-xl font-black text-slate-900">Relationship history could not be linked</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">You are signed in as <strong>{user.email}</strong>. Portal history is available only when this verified email matches an existing ProFox enquiry, conversation, quotation, payment or client record.</p>
          {portalClaimError && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">{portalClaimError}</div>}
          <button type="button" onClick={() => void logout()} className="mt-6 rounded-xl border border-slate-200 px-5 py-2.5 text-xs font-bold text-slate-700">Sign Out</button>
        </div>
      </div>
    );
  }

  if (loadingProjects) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <header className="sticky top-0 z-40 bg-[#000080] text-white shadow-lg">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-5">
          <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10"><Briefcase className="h-5 w-5" /></div><div><div className="text-sm font-black uppercase tracking-widest">ProFox Relationship</div><div className="text-[10px] font-bold text-blue-300">Secure Customer Portal</div></div></div>
          <div className="flex items-center gap-4"><div className="hidden text-right sm:block"><div className="text-xs font-bold">{profile?.fullName || user.email}</div><div className="text-[10px] text-blue-300">{user.email}</div></div><button type="button" onClick={() => void logout()} className="rounded-xl border border-white/10 p-2.5 text-blue-200 hover:bg-white/10 hover:text-white" title="Sign out"><LogOut className="h-4 w-4" /></button></div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-5 py-8">
        {projectError && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{projectError}</div>}

        <ClientRelationshipHistory />

        {projects.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-12 text-center shadow-sm"><Briefcase className="mx-auto h-12 w-12 text-slate-300" /><h2 className="mt-4 text-xl font-black text-slate-900">No active project yet</h2><p className="mt-2 text-sm text-slate-500">Your relationship history is available above even before payment. When a verified sale creates a project, it will appear here automatically without creating a new customer history.</p></div>
        ) : selectedProject && (
          <>
            <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div><div className="text-[10px] font-black uppercase tracking-widest text-[#000080]">{selectedProject.projectNumber}</div><h1 className="mt-1 text-3xl font-black text-slate-900">{selectedProject.projectName}</h1><p className="mt-1 text-sm text-slate-500">{selectedProject.client?.companyName || 'Your ProFox project'}</p></div>
              {projects.length > 1 && <select value={selectedProject.id} onChange={event => setSelectedProject(projects.find(project => project.id === event.target.value) || selectedProject)} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold outline-none focus:border-[#000080]">{projects.map(project => <option key={project.id} value={project.id}>{project.projectNumber} · {project.projectName}</option>)}</select>}
            </div>

            <div className="grid gap-5 md:grid-cols-4">
              <Metric label="Current Stage" value={selectedProject.stage} />
              <Metric label="Stage Progress" value={`${stageProgress}%`} />
              <Metric label="Deliverables Done" value={`${completedTasks}/${tasks.length}`} />
              <Metric label="Outstanding Balance" value={`${selectedProject.currency || 'USD'} ${outstanding.toLocaleString()}`} />
            </div>

            {['Client Design Approval', 'Client Review'].includes(selectedProject.stage) && (
              <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50 p-7">
                <div className="flex items-start gap-4"><div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div><div className="flex-1"><h2 className="text-lg font-black text-slate-900">Your review is required</h2><p className="mt-1 text-sm text-slate-600">Review the current deliverables. Approve to continue, or describe changes that need to be addressed.</p></div></div>
                {approvalPaymentBlocked && <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-2 text-xs leading-5 text-amber-800"><Clock className="mt-0.5 h-4 w-4 shrink-0" /><span><strong>{requiredApprovalPayment?.milestoneLabel || requiredApprovalPayment?.paymentType}</strong> must be verified before approval can move the project forward.</span></div>{requiredApprovalPayment?.paymentLink && payableStatuses.has(requiredApprovalPayment.status) && <a href={requiredApprovalPayment.paymentLink} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white">Pay Now<ExternalLink className="h-3.5 w-3.5" /></a>}</div>}
                {actionError && <div className="mt-4 rounded-xl border border-red-200 bg-white p-3 text-xs text-red-700">{actionError}</div>}
                <textarea value={approvalNotes} onChange={event => setApprovalNotes(event.target.value)} rows={3} placeholder="Optional approval note, or required details if requesting changes..." className="mt-5 w-full resize-none rounded-xl border border-emerald-200 bg-white p-3 text-sm outline-none focus:border-emerald-500" />
                <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={actionBusy || approvalPaymentBlocked} onClick={() => void approveStage()} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" />{approvalPaymentBlocked ? 'Payment Required Before Approval' : 'Approve & Proceed'}</button><button type="button" disabled={actionBusy} onClick={() => void requestChanges()} className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-5 py-2.5 text-xs font-bold text-emerald-800 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Request Changes</button>{actionBusy && <Loader2 className="h-5 w-5 animate-spin text-emerald-700" />}</div>
              </section>
            )}

            <ClientDevelopmentHandover projectId={selectedProject.id} />

            <div className="grid gap-7 lg:grid-cols-3">
              <section className="space-y-5 lg:col-span-2">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm">
                  <div className="flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">Delivery Progress</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-[10px] font-black uppercase text-[#000080]">{selectedProject.status}</span></div>
                  <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#000080] transition-all" style={{ width: `${stageProgress}%` }} /></div>
                  <div className="mt-6 grid gap-4 sm:grid-cols-3"><Mini label="Started" value={selectedProject.createdAt ? format(new Date(selectedProject.createdAt), 'MMM d, yyyy') : '—'} /><Mini label="Target" value={selectedProject.targetDate ? format(new Date(selectedProject.targetDate), 'MMM d, yyyy') : 'TBD'} /><Mini label="Project Value" value={`${selectedProject.currency || 'USD'} ${Number(selectedProject.projectValue || 0).toLocaleString()}`} /></div>
                </div>

                <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-black text-slate-900"><FileText className="h-5 w-5 text-[#000080]" />Project Deliverables</h2><div className="mt-5 space-y-3">{tasks.length === 0 ? <p className="text-sm text-slate-400">No deliverables have been published yet.</p> : tasks.map((task: any, index: number) => <div key={task.id} className="flex items-center gap-4 rounded-xl border border-slate-100 bg-slate-50 p-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${task.status === 'Done' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-400'}`}>{task.status === 'Done' ? <Check className="h-4 w-4" /> : <span className="text-xs font-black">{index + 1}</span>}</div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-slate-900">{task.title}</div><div className="mt-0.5 truncate text-xs text-slate-500">{task.description || task.department || 'Project task'}</div></div><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-slate-600">{task.status}</span></div>)}</div></div>
              </section>

              <aside className="space-y-5">
                <div className="rounded-[2rem] border border-slate-200 bg-white p-7 shadow-sm"><h2 className="flex items-center gap-2 text-base font-black text-slate-900"><Receipt className="h-5 w-5 text-[#000080]" />Payment Summary</h2><div className="mt-5 space-y-3"><Mini label="Total Requested" value={`${selectedProject.currency || 'USD'} ${totalDue.toLocaleString()}`} /><Mini label="Confirmed Received" value={`${selectedProject.currency || 'USD'} ${totalPaid.toLocaleString()}`} /><Mini label="Outstanding" value={`${selectedProject.currency || 'USD'} ${outstanding.toLocaleString()}`} /></div><div className="mt-5 space-y-2">{payments.map(payment => <div key={payment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase text-slate-600">{payment.paymentType}</span><span className="text-[9px] font-black uppercase text-[#000080]">{payment.status}</span></div><div className="mt-1 text-xs font-bold text-slate-900">{payment.currency} {payment.amountPaid.toLocaleString()} / {payment.amountDue.toLocaleString()}</div>{payment.paymentLink && payableStatuses.has(payment.status) && payment.amountPaid < payment.amountDue && <a href={payment.paymentLink} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#000080] px-3 py-2 text-[10px] font-black text-white">Pay this milestone<ExternalLink className="h-3 w-3" /></a>}</div>)}</div>{outstanding > 0 && ['Final Revisions', 'Launch'].includes(selectedProject.stage) && <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800"><Clock className="mt-0.5 h-4 w-4 shrink-0" />The final balance must be verified before the project can enter Launch.</div>}</div>
                <div className="rounded-[2rem] bg-slate-900 p-7 text-white"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-blue-300"><ShieldCheck className="h-4 w-4" />Secure Access</div><p className="mt-3 text-xs leading-relaxed text-slate-300">This workspace is authorized by your verified account link. Relationship, conversation, quotation, project, task and payment records are filtered server-side for this customer identity only.</p></div>
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 truncate text-lg font-black text-slate-900">{value}</div></div>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-bold text-slate-800">{value}</div></div>;
}
