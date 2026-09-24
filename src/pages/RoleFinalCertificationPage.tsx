import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, ExternalLink, FileCheck2, Loader2, Send, ShieldCheck } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { trainingService, type AcademyDescriptor, type TrainingModule, type UserProgress } from '../lib/trainingService';
import { roleCertificationService } from '../lib/roleCertificationService';

type EvidenceForm = Record<string, string>;
type CertificationField = [key: string, label: string, required: boolean];

const DEV_FIELDS: CertificationField[] = [
  ['sourcePullRequestUrl', 'Source / pull request URL', true],
  ['previewUrl', 'Working preview / staging URL', true],
  ['testEvidence', 'Test evidence', true],
  ['responsiveAccessibilityNotes', 'Responsive & accessibility verification', true],
  ['performanceSecurityNotes', 'Performance & security verification', true],
  ['releaseHandoverNotes', 'Release / handover notes', true],
];

const DESIGN_FIELDS: CertificationField[] = [
  ['figmaUrl', 'Approved Figma / design file URL', true],
  ['responsiveEvidence', 'Responsive solution evidence', true],
  ['componentSystemEvidence', 'Component / design-system evidence', true],
  ['statesAccessibilityNotes', 'States & accessibility considerations', true],
  ['designRationale', 'Design rationale', true],
  ['developerHandoffNote', 'Developer handoff note', true],
];

function message(error: unknown, fallback: string) {
  return error && typeof error === 'object' && 'message' in error ? String((error as any).message || fallback) : fallback;
}

function safeHttpUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export default function RoleFinalCertificationPage() {
  const { user, profile, loading: authLoading, isOnboarding } = useAuth();
  const navigate = useNavigate();
  const [descriptor, setDescriptor] = useState<AcademyDescriptor | null>(null);
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [submission, setSubmission] = useState<any | null>(null);
  const [form, setForm] = useState<EvidenceForm>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const descriptorResult = await trainingService.getMyAcademyDescriptor();
      if (descriptorResult.error) throw descriptorResult.error;
      const currentDescriptor = descriptorResult.data;
      if (!['web_development', 'uiux_design'].includes(String(currentDescriptor.track || ''))) {
        setDescriptor(currentDescriptor);
        setModule(null);
        return;
      }
      const modulesResult = await trainingService.getModules();
      if (modulesResult.error) throw modulesResult.error;
      const finalModule = (modulesResult.data || []).find(item => item.slug === currentDescriptor.finalCertificationSlug);
      if (!finalModule) throw new Error('Your final certification module is not available in the assigned Academy track.');

      let progressResult = await trainingService.getUserProgress(user.id);
      if (progressResult.error) throw progressResult.error;
      let currentProgress = (progressResult.data || []).find(item => item.module_id === finalModule.id) || null;
      if (!currentProgress) {
        const started = await trainingService.startModule(user.id, finalModule.id);
        if (started.error || !started.data) throw started.error || new Error('Final certification could not be initialized.');
        currentProgress = started.data;
      }
      const assignment = await trainingService.getLatestAssignment(user.id, finalModule.id);
      if (assignment.error) throw assignment.error;

      setDescriptor(currentDescriptor);
      setModule(finalModule);
      setProgress(currentProgress);
      setSubmission(assignment.data || null);
      if (assignment.data && typeof assignment.data === 'object') {
        const next: EvidenceForm = {};
        Object.entries(assignment.data).forEach(([key, value]) => {
          if (typeof value === 'string') next[key] = value;
        });
        setForm(next);
      }
    } catch (err) {
      setError(message(err, 'Final certification could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user) void load(); }, [user?.id]);

  const fields = useMemo<CertificationField[]>(() => descriptor?.track === 'web_development' ? DEV_FIELDS : DESIGN_FIELDS, [descriptor?.track]);
  const canSubmit = fields.every(([key, , required]) => !required || String(form[key] || '').trim().length >= 5)
    && fields.filter(([key]) => key.toLowerCase().includes('url')).every(([key]) => safeHttpUrl(String(form[key] || '')));
  const passed = progress?.status === 'Passed';
  const submitted = progress?.status === 'Submitted';
  const retry = progress?.status === 'Retry Required';

  const submit = async () => {
    if (!user || !module || !progress || !canSubmit) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const payload = {
        type: descriptor?.track === 'web_development' ? 'web_developer_final_certification' : 'uiux_final_certification',
        ...Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()])),
      };
      await roleCertificationService.submit(payload);
      setNotice('Certification evidence submitted to Management for independent review.');
      await load();
    } catch (err) {
      setError(message(err, 'Certification evidence could not be submitted.'));
    } finally {
      setBusy(false);
    }
  };

  const requestFinalApproval = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await trainingService.requestFinalApproval();
      if (result.error) throw result.error;
      setNotice('Final Approval request submitted to Management.');
      await load();
    } catch (err) {
      setError(message(err, 'Final Approval could not be requested.'));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) return <div className="min-h-screen bg-slate-50 p-10 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#000080]" /></div>;
  if (!user || !profile) return <Navigate to="/admin" replace />;
  if (!isOnboarding && profile.status !== 'active') return <Navigate to="/admin" replace />;
  if (loading) return <div className="min-h-screen bg-slate-50 p-10 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#000080]" /><p className="mt-3 text-xs font-bold text-slate-500">Loading certification...</p></div>;
  if (descriptor && !['web_development', 'uiux_design'].includes(String(descriptor.track || ''))) return <Navigate to="/admin/app/academy?tab=training" replace />;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-5">
        <button type="button" onClick={() => navigate('/admin/app/academy?tab=training')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:text-[#000080]"><ArrowLeft className="h-4 w-4" />Back to My Training</button>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">{descriptor?.certificationLabel || 'Final Certification'}</div>
              <h1 className="mt-1 text-2xl font-black text-slate-900">{module?.title || 'Final Certification'}</h1>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-slate-600">{module?.description}</p>
            </div>
            <div className={`rounded-full border px-3 py-1.5 text-[10px] font-black ${passed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : submitted ? 'border-amber-200 bg-amber-50 text-amber-700' : retry ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{progress?.status || 'Not Started'}</div>
          </div>

          <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-slate-700">
            <ShieldCheck className="mr-2 inline h-4 w-4 text-[#000080]" />Submit only reviewable project/design evidence. <strong>Never place passwords, API keys, access tokens, private keys, or client secrets here.</strong>
          </div>

          {error && <div className="mt-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
          {notice && <div className="mt-4 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</div>}

          {submitted ? (
            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <div className="flex items-center gap-2 text-sm font-black text-amber-800"><FileCheck2 className="h-5 w-5" />Management review pending</div>
              <p className="mt-2 text-xs leading-5 text-amber-800">Your evidence is locked in the review queue. Management must pass it at the configured score before Final Approval can be requested.</p>
            </div>
          ) : passed ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-center gap-2 text-sm font-black text-emerald-800"><CheckCircle2 className="h-5 w-5" />Certification passed</div>
              <p className="mt-2 text-xs leading-5 text-emerald-800">Management review is complete. You may now request Final Approval; the server will still verify every required Academy module and agreement gate.</p>
              <button type="button" onClick={() => void requestFinalApproval()} disabled={busy} className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-xs font-black text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Request Final Approval</button>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {retry && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-700">Changes or stronger evidence are required. Review Management feedback in your Academy progress and resubmit the corrected certification package.</div>}
              {fields.map(([key, label]) => {
                const urlField = key.toLowerCase().includes('url');
                return <label key={key} className="block"><span className="mb-1.5 block text-xs font-black text-slate-700">{label}</span>{urlField ? <div className="relative"><ExternalLink className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={form[key] || ''} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} placeholder="https://..." className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-[#000080]" /></div> : <textarea value={form[key] || ''} onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} rows={3} placeholder="Provide concise, verifiable evidence and context." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#000080]" />}</label>;
              })}
              <button type="button" onClick={() => void submit()} disabled={busy || !canSubmit} className="flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{retry ? 'Resubmit Certification Evidence' : 'Submit for Management Review'}</button>
            </div>
          )}

          {submission && <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer text-xs font-black text-slate-700">Latest submitted evidence</summary><pre className="mt-3 whitespace-pre-wrap break-words text-[10px] leading-4 text-slate-600">{JSON.stringify(submission, null, 2)}</pre></details>}
        </section>
      </div>
    </div>
  );
}
