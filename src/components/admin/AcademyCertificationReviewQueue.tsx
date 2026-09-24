import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, FileCheck2, Loader2, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { profileService } from '../../lib/profileService';
import { roleCertificationService } from '../../lib/roleCertificationService';
import { trainingService, type TrainingModule, type UserProgress } from '../../lib/trainingService';
import type { UserProfile } from '../../types';

interface ReviewItem {
  user: UserProfile;
  progress: UserProgress;
  module: TrainingModule;
  submission: any | null;
}

function displayValue(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function AcademyCertificationReviewQueue() {
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>({});

  const load = async () => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    try {
      const { data: profiles, error: profilesError } = await profileService.getAllProfiles();
      if (profilesError) throw profilesError;
      const candidates = (profiles || []).filter(profile =>
        profile.status === 'onboarding' && ['developer', 'web_developer', 'developer_designer', 'uiux_designer'].includes(profile.role)
      );
      const rows = await Promise.all(candidates.map(async candidate => {
        const result = await trainingService.getUserProgress(candidate.id);
        if (result.error) throw result.error;
        const pending = (result.data || []).filter(progress => progress.status === 'Submitted' && progress.module?.requires_admin_review);
        return Promise.all(pending.map(async progress => {
          const assignment = await trainingService.getLatestAssignment(candidate.id, progress.module_id);
          if (assignment.error) throw assignment.error;
          return { user: candidate, progress, module: progress.module as TrainingModule, submission: assignment.data || null } as ReviewItem;
        }));
      }));
      const flattened = rows.flat().sort((a, b) => String(a.module.title).localeCompare(String(b.module.title)));
      setItems(flattened);
      setScores(current => {
        const next = { ...current };
        flattened.forEach(item => { if (next[item.progress.id] == null) next[item.progress.id] = Number(item.module.passing_score || 90); });
        return next;
      });
    } catch (err: any) {
      setError(err?.message || 'Academy review queue could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [isAdmin]);

  const pendingCount = items.length;
  const roleCounts = useMemo(() => ({
    developer: items.filter(item => ['developer', 'web_developer', 'developer_designer'].includes(item.user.role)).length,
    design: items.filter(item => item.user.role === 'uiux_designer').length,
  }), [items]);

  const review = async (item: ReviewItem, status: 'Passed' | 'Retry Required') => {
    if (!isAdmin) return;
    const notes = String(feedback[item.progress.id] || '').trim();
    const score = Number(scores[item.progress.id] ?? item.module.passing_score ?? 90);
    if (status === 'Retry Required' && notes.length < 10) {
      setError('Return Changes requires specific feedback so the candidate knows exactly what to correct.');
      return;
    }
    if (status === 'Passed' && score < Number(item.module.passing_score || 0)) {
      setError(`A Pass must meet the configured ${item.module.passing_score || 0}% certification threshold.`);
      return;
    }
    setBusyId(item.progress.id);
    setError(null);
    try {
      await roleCertificationService.review(item.progress.id, status, notes, score);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Certification review could not be recorded.');
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) return <div className="p-8 text-sm font-bold text-red-700">Management authorization is required.</div>;

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[#000080]">Management quality gate</div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Academy Certification Reviews</h1>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Review evidence-based final certifications before candidates can request Final Approval. This queue uses the existing Academy progress, assignments, and review audit trail.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric label="Pending reviews" value={pendingCount} />
        <Metric label="Developer" value={roleCounts.developer} />
        <Metric label="UI/UX Design" value={roleCounts.design} />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-slate-700"><ShieldCheck className="mr-2 inline h-4 w-4 text-[#000080]" /><strong>Independent review:</strong> verify the actual evidence, not just whether fields are filled. Never copy credentials or secrets from external systems into review notes.</div>
      {error && <div className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      {loading ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#000080]" /><p className="mt-3 text-xs font-bold text-slate-500">Loading review-required submissions...</p></div> : items.length === 0 ? <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><h2 className="mt-3 text-sm font-black text-slate-800">No certification reviews waiting</h2><p className="mt-1 text-xs text-slate-500">New review-required Academy submissions will appear here automatically.</p></div> : <div className="space-y-4">{items.map(item => {
        const score = Number(scores[item.progress.id] ?? item.module.passing_score ?? 90);
        const busy = busyId === item.progress.id;
        return <section key={item.progress.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
            <div><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">{item.user.role === 'uiux_designer' ? 'UI/UX Designer' : 'Web Developer'} · Independent certification</div><h2 className="mt-1 text-base font-black text-slate-900">{item.user.fullName}</h2><p className="text-xs text-slate-500">{item.user.email} · {item.module.title}</p></div>
            <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[10px] font-black text-amber-700"><FileCheck2 className="mr-1 inline h-3.5 w-3.5" />Submitted</div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">{item.submission && typeof item.submission === 'object' ? Object.entries(item.submission).filter(([key]) => !['type', 'submittedAt', 'trainingTrack'].includes(key)).map(([key, value]) => {
            const text = displayValue(value);
            return <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="text-[9px] font-black uppercase tracking-wide text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</div>{isHttpUrl(text) ? <a href={text} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 break-all text-xs font-bold text-[#000080] hover:underline"><ExternalLink className="h-3.5 w-3.5 shrink-0" />{text}</a> : <div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{text || '—'}</div>}</div>;
          }) : <div className="col-span-full rounded-xl border border-red-100 bg-red-50 p-3 text-xs text-red-700">No reviewable submission evidence was found. Return the certification for correction.</div>}</div>

          <div className="mt-5 grid gap-4 border-t border-slate-100 pt-5 md:grid-cols-[150px_1fr]">
            <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Quality score</span><input type="number" min={0} max={100} value={score} onChange={event => setScores(value => ({ ...value, [item.progress.id]: Math.max(0, Math.min(100, Number(event.target.value || 0))) }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-black outline-none focus:border-[#000080]" /><span className="mt-1 block text-[9px] text-slate-400">Pass threshold {item.module.passing_score || 0}%</span></label>
            <label><span className="mb-1 block text-[10px] font-black uppercase text-slate-500">Management feedback</span><textarea value={feedback[item.progress.id] || ''} onChange={event => setFeedback(value => ({ ...value, [item.progress.id]: event.target.value }))} rows={3} placeholder="Record evidence-based review notes. Specific feedback is mandatory when returning changes." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs leading-5 outline-none focus:border-[#000080]" /></label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void review(item, 'Retry Required')} className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-700 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Return Changes</button><button type="button" disabled={busy || score < Number(item.module.passing_score || 0)} onClick={() => void review(item, 'Passed')} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Pass Certification</button></div>
        </section>;
      })}</div>}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-2xl font-black text-slate-900">{value}</div></div>;
}
