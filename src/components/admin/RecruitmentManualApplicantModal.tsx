import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { applicantService } from '../../lib/applicantService';
import { recruitmentPipelineService, type RecruitmentPipelineJob } from '../../lib/recruitmentPipelineService';

interface Props {
  onClose: () => void;
  onUpdate: () => Promise<void>;
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'message' in error) return String((error as any).message || fallback);
  return fallback;
}

export default function RecruitmentManualApplicantModal({ onClose, onUpdate }: Props) {
  const [jobs, setJobs] = useState<RecruitmentPipelineJob[]>([]);
  const [jobId, setJobId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('');
  const [source, setSource] = useState('Manual Entry');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedJob = useMemo(() => jobs.find(job => job.jobId === jobId), [jobs, jobId]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const rows = await recruitmentPipelineService.getJobs();
        const published = rows.filter(row => row.status === 'Published');
        const options = published.length ? published : rows;
        setJobs(options);
        setJobId(options[0]?.jobId || '');
      } catch (err) {
        setError(errorMessage(err, 'Could not load recruitment Job Posts.'));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedJob) return;
    setSaving(true);
    setError(null);
    try {
      const stages = await recruitmentPipelineService.getStages(selectedJob.jobId);
      const firstStage = stages.filter(stage => stage.active).sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (!firstStage) throw new Error('This Job Post does not have an active recruitment pipeline. Configure its stages first.');
      if (firstStage.stage !== 'New Application') throw new Error('The protected first stage for a recruitment pipeline must be New Application.');
      await applicantService.createApplicant({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        country: country.trim(),
        position: selectedJob.title,
        careerJobId: selectedJob.jobId,
        stage: 'New Application',
        rating: 0,
        source: source.trim() || 'Manual Entry',
      });
      await onUpdate();
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Could not create the applicant.'));
    } finally {
      setSaving(false);
    }
  };

  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl"><form onSubmit={submit}><div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-6 sm:px-8"><div><div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Recruitment</div><h2 className="mt-1 text-xl font-black text-slate-900">Add Manual Applicant</h2><p className="mt-1 text-sm leading-6 text-slate-500">Choose the correct Job Post so the candidate enters that role’s own recruitment pipeline.</p></div><button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-400"><X className="h-4 w-4" /></button></div><div className="space-y-5 p-6 sm:p-8">{error && <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}{loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div> : <><label className="block"><span className="mb-1.5 block text-xs font-black uppercase text-slate-500">Department / Job Post *</span><select required value={jobId} onChange={event => setJobId(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 outline-none focus:border-[#000080]">{jobs.map(job => <option key={job.jobId} value={job.jobId}>{job.department} · {job.title}</option>)}</select></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black uppercase text-slate-500">Full name *</span><input required minLength={2} value={fullName} onChange={event => setFullName(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#000080]" /></label><label><span className="mb-1.5 block text-xs font-black uppercase text-slate-500">Email *</span><input type="email" required value={email} onChange={event => setEmail(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#000080]" /></label></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-black uppercase text-slate-500">Country</span><input value={country} onChange={event => setCountry(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#000080]" /></label><label><span className="mb-1.5 block text-xs font-black uppercase text-slate-500">Source</span><input value={source} onChange={event => setSource(event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-[#000080]" /></label></div><div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-slate-600"><strong className="text-slate-900">Pipeline:</strong> {selectedJob ? `${selectedJob.department} → ${selectedJob.title} → New Application` : 'Select a Job Post'}. Public Careers applications should still be preferred when role-specific evidence and consent are required.</div></>}</div><div className="flex justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-5 sm:px-8"><button type="button" onClick={onClose} className="min-h-11 px-4 text-sm font-bold text-slate-500">Cancel</button><button type="submit" disabled={loading || saving || !selectedJob} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#000080] px-6 text-sm font-black text-white disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}Create Applicant</button></div></form></div></div>;
}
