import React, { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, CheckCircle2, Loader2, Settings2, X } from 'lucide-react';
import {
  recruitmentWorkflowService,
  type RecruitmentSourceFunnelRow,
  type RecruitmentStagePolicy,
} from '../../lib/recruitmentWorkflowService';

function message(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || fallback);
  return fallback;
}

export default function RecruitmentOperationsControls() {
  const [mode, setMode] = useState<'settings' | 'funnel' | null>(null);
  const [policies, setPolicies] = useState<RecruitmentStagePolicy[]>([]);
  const [funnel, setFunnel] = useState<RecruitmentSourceFunnelRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyStage, setBusyStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async (nextMode: 'settings' | 'funnel') => {
    setMode(nextMode);
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (nextMode === 'settings') setPolicies(await recruitmentWorkflowService.getStagePolicies());
      else setFunnel(await recruitmentWorkflowService.getSourceFunnel());
    } catch (err) {
      setError(message(err, 'Recruitment controls could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mode) return;
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMode(null); };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [mode]);

  const updatePolicy = (index: number, updates: Partial<RecruitmentStagePolicy>) => {
    setPolicies(current => current.map((policy, i) => i === index ? { ...policy, ...updates } : policy));
  };

  const savePolicy = async (index: number) => {
    const policy = policies[index];
    setBusyStage(policy.stage);
    setError(null);
    setNotice(null);
    try {
      await recruitmentWorkflowService.saveStagePolicy(policy);
      setNotice(`${policy.stage} workflow policy saved.`);
      setPolicies(await recruitmentWorkflowService.getStagePolicies(policy.jobId));
    } catch (err) {
      setError(message(err, 'Workflow policy could not be saved.'));
    } finally {
      setBusyStage(null);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void load('funnel')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 shadow-sm transition hover:border-[#000080]/30 hover:text-[#000080]"><BarChart3 className="h-4 w-4" />Source Funnel</button>
        <button type="button" onClick={() => void load('settings')} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 shadow-sm transition hover:border-[#000080]/30 hover:text-[#000080]"><Settings2 className="h-4 w-4" />Workflow Settings</button>
      </div>

      {mode && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6">
          <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-5 sm:px-8">
              <div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Sales Recruitment</div><h2 className="mt-1 text-xl font-black text-slate-900">{mode === 'settings' ? 'Workflow Settings' : 'Source & Campaign Funnel'}</h2><p className="mt-1 text-xs text-slate-500">{mode === 'settings' ? 'Configure the operational gates used by the protected recruitment workflow.' : 'Applications and downstream outcomes grouped by captured source and campaign.'}</p></div>
              <button type="button" onClick={() => setMode(null)} className="rounded-xl border border-slate-200 p-2 text-slate-400 hover:bg-slate-50"><X className="h-4 w-4" /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-6 sm:p-8">
              {loading ? <div className="flex min-h-[300px] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div> : <>
                {error && <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
                {notice && <div className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{notice}</div>}

                {mode === 'funnel' && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400"><tr><th className="px-4 py-3">Source</th><th className="px-4 py-3">Campaign</th><th className="px-4 py-3 text-right">Applications</th><th className="px-4 py-3 text-right">Shortlisted</th><th className="px-4 py-3 text-right">Selected</th><th className="px-4 py-3 text-right">Activated</th><th className="px-4 py-3 text-right">Closed</th></tr></thead><tbody className="divide-y divide-slate-100">{funnel.map((row, index) => <tr key={`${row.source}:${row.campaign}:${index}`} className="text-xs text-slate-600"><td className="px-4 py-3 font-black text-slate-800">{row.source}</td><td className="px-4 py-3">{row.campaign || 'No campaign'}</td><td className="px-4 py-3 text-right font-bold">{row.applications}</td><td className="px-4 py-3 text-right">{row.shortlisted}</td><td className="px-4 py-3 text-right">{row.selected}</td><td className="px-4 py-3 text-right font-bold text-emerald-700">{row.activated}</td><td className="px-4 py-3 text-right text-red-600">{row.closed}</td></tr>)}{!funnel.length && <tr><td colSpan={7} className="px-4 py-12 text-center text-xs text-slate-400">No source-attributed applications yet.</td></tr>}</tbody></table></div>
                  </div>
                )}

                {mode === 'settings' && <div className="space-y-4">{policies.map((policy, index) => (
                  <section key={policy.stage} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h3 className="text-sm font-black text-slate-900">{policy.sortOrder}. {policy.stage}</h3><p className="mt-1 text-[10px] text-slate-400">Operational policy for the active Sales Representative Job Post.</p></div><button type="button" onClick={() => void savePolicy(index)} disabled={busyStage === policy.stage} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50">{busyStage === policy.stage && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save Stage</button></div>
                    <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">SLA hours</span><input type="number" min={0} max={720} value={policy.slaHours} onChange={event => updatePolicy(index, { slaHours: Math.max(0, Number(event.target.value || 0)) })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold outline-none focus:border-[#000080]" /></label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5"><input type="checkbox" checked={policy.assessmentRequired} onChange={event => updatePolicy(index, { assessmentRequired: event.target.checked })} className="h-4 w-4 accent-[#000080]" /><span className="text-xs font-bold text-slate-600">Assessment required</span></label>
                      <label><span className="mb-1 block text-[9px] font-black uppercase text-slate-400">Passing score</span><input type="number" min={0} max={100} disabled={!policy.assessmentRequired} value={policy.passingScore ?? ''} onChange={event => updatePolicy(index, { passingScore: Number(event.target.value || 0) })} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold outline-none focus:border-[#000080] disabled:bg-slate-50 disabled:text-slate-300" /></label>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5"><input type="checkbox" checked={policy.interviewRequired} onChange={event => updatePolicy(index, { interviewRequired: event.target.checked })} className="h-4 w-4 accent-[#000080]" /><span className="text-xs font-bold text-slate-600">Interview required</span></label>
                    </div>
                    {policy.assessmentRequired && <div className="mt-5"><div className="mb-2 text-[9px] font-black uppercase tracking-wide text-slate-400">Assessment rubric</div><div className="space-y-2">{policy.rubric.map((item, itemIndex) => <div key={`${item.key}:${itemIndex}`} className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[140px_minmax(0,1fr)_100px]"><input value={item.key} disabled className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-[10px] font-mono text-slate-400" /><input value={item.label} onChange={event => { const rubric = policy.rubric.map((entry, i) => i === itemIndex ? { ...entry, label: event.target.value } : entry); updatePolicy(index, { rubric }); }} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs outline-none focus:border-[#000080]" /><input type="number" min={0} max={100} value={item.maxPoints} onChange={event => { const rubric = policy.rubric.map((entry, i) => i === itemIndex ? { ...entry, maxPoints: Math.max(0, Number(event.target.value || 0)) } : entry); updatePolicy(index, { rubric }); }} className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-bold outline-none focus:border-[#000080]" /></div>)}</div><p className="mt-2 text-[9px] leading-4 text-slate-400">Rubric keys remain stable for audit history. Labels and point weights are Admin-editable.</p></div>}
                  </section>
                ))}</div>}
              </>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
