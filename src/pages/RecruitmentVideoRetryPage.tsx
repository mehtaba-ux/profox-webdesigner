import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, Save, Send, ShieldCheck, Video } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { recruitmentTaskService, type PublicRecruitmentTask } from '../lib/recruitmentTaskService';

const inputClass = 'mt-2 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#000080] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';

function fmt(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function validUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function RecruitmentVideoRetryPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [task, setTask] = useState<PublicRecruitmentTask | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [candidateNote, setCandidateNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'save' | 'submit' | ''>('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await recruitmentTaskService.open(token);
      if (result.taskKey !== 'sales_video_retry_v1') throw new Error('This secure link is not an interview-video retry link.');
      setTask(result);
      setVideoUrl(result.answers.videoUrl || '');
      setCandidateNote(result.answers.candidateNote || '');
      setSubmitted(Boolean(result.submittedAt || ['Submitted', 'Under Review', 'Passed', 'Failed'].includes(result.status)));
    } catch (err: any) {
      setError(err?.message || 'This interview retry link could not be opened.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token]);

  const save = async () => {
    if (videoUrl.trim() && !validUrl(videoUrl)) {
      setError('Enter a valid shareable video link beginning with http:// or https://.');
      return;
    }
    setBusy('save');
    setError('');
    setMessage('');
    try {
      await recruitmentTaskService.saveDraft(token, { leads: [], videoUrl: videoUrl.trim(), candidateNote: candidateNote.trim() });
      setMessage('Draft saved. You can return using the latest secure link from ProFox.');
    } catch (err: any) {
      setError(err?.message || 'Your draft could not be saved.');
    } finally {
      setBusy('');
    }
  };

  const submit = async () => {
    if (!validUrl(videoUrl)) {
      setError('Paste a valid shareable video link before submitting your retry.');
      return;
    }
    setBusy('submit');
    setError('');
    setMessage('');
    try {
      await recruitmentTaskService.submit(token, { leads: [], videoUrl: videoUrl.trim(), candidateNote: candidateNote.trim() });
      setSubmitted(true);
      setTask(current => current ? { ...current, status: 'Submitted', submittedAt: new Date().toISOString(), canEdit: false } : current);
      setMessage('Your retry video has been submitted successfully. The ProFox Recruitment Team has been notified.');
    } catch (err: any) {
      setError(err?.message || 'Your retry video could not be submitted.');
    } finally {
      setBusy('');
    }
  };

  if (loading) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto flex max-w-3xl items-center justify-center rounded-3xl border border-slate-200 bg-white p-16"><Loader2 className="h-7 w-7 animate-spin text-[#000080]" /></div></main>;

  if (!task) return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-3xl rounded-3xl border border-red-200 bg-white p-8"><div className="flex items-start gap-3 text-red-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><h1 className="text-xl font-black">Interview retry link unavailable</h1><p className="mt-2 text-sm leading-6">{error || 'Please open the latest ProFox Recruitment email or contact the Recruitment Team.'}</p></div></div></div></main>;

  const readOnly = submitted || !task.canEdit;

  return <main className="min-h-screen bg-[#f4f5fb] px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-3xl">
      <header className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
        <div><div className="text-xl font-black text-[#000080]">ProFox Web Designer</div><div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Recruitment · Interview Video Retry</div></div>
        <ShieldCheck className="h-6 w-6 text-[#000080]" />
      </header>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 bg-[#000080]" />
        <div className="p-6 sm:p-8">
          {submitted ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" /><div><h1 className="text-xl font-black text-slate-950">Your retry video has been received.</h1><p className="mt-2 text-sm leading-6 text-slate-600">No further action is required right now. Your new submission is waiting for the ProFox Recruitment Team to review it.</p></div></div>
          </div> : <>
            <div className="flex items-start gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-[#000080]"><Video className="h-6 w-6" /></span><div><div className="text-xs font-black uppercase tracking-[0.14em] text-[#000080]">Another opportunity to complete this stage</div><h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Please submit a new introduction video.</h1><p className="mt-3 text-sm leading-7 text-slate-600">Hi {task.candidateName}. Your application remains active. Your first video and assessment stay on record; this secure page creates a separate retry submission for the Recruitment Team to review.</p></div></div>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-400">Application</div><div className="mt-1 text-sm font-black text-slate-900">{task.applicationReference || 'ProFox candidate'}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-xs font-black uppercase tracking-wide text-slate-400">Retry attempt</div><div className="mt-1 text-sm font-black text-slate-900">#{task.attemptNo}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-1 text-xs font-black uppercase tracking-wide text-slate-400"><Clock3 className="h-3.5 w-3.5" />Deadline</div><div className="mt-1 text-sm font-black text-slate-900">{fmt(task.dueAt)}</div></div>
            </div>

            {task.previousScore !== null && task.previousScore !== undefined && <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950"><strong>Previous assessment:</strong> {task.previousScore}%{task.passingScore !== null && task.passingScore !== undefined ? <> · Required score: <strong>{task.passingScore}%</strong></> : null}. This retry does not erase or replace your first attempt.</div>}

            {task.retryFeedback && <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-4"><div className="text-xs font-black uppercase tracking-wide text-[#000080]">What to improve</div><p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-700">{task.retryFeedback}</p></div>}

            <div className="mt-6 rounded-2xl border border-slate-200 p-5">
              <h2 className="text-base font-black text-slate-950">Before you record</h2>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                {task.instructions.map((item, index) => <li key={index} className="flex gap-2"><span className="font-black text-[#000080]">•</span><span>{item}</span></li>)}
              </ul>
            </div>

            <label className="mt-6 block"><span className="text-sm font-black text-slate-900">New interview-video link *</span><span className="mt-1 block text-xs leading-5 text-slate-500">Use Loom, Google Drive, OneDrive, Dropbox, YouTube Unlisted, Zoom recording or another shareable link. Make sure ProFox can open it without requesting access.</span><input type="url" value={videoUrl} onChange={e=>{setVideoUrl(e.target.value);setError('');setMessage('');}} disabled={readOnly} placeholder="https://..." className={inputClass}/></label>
            <label className="mt-5 block"><span className="text-sm font-black text-slate-900">Optional note</span><span className="mt-1 block text-xs leading-5 text-slate-500">Add a short note only if there is something the reviewer should know about this replacement video.</span><textarea value={candidateNote} onChange={e=>setCandidateNote(e.target.value)} disabled={readOnly} rows={3} maxLength={2000} className={inputClass + ' resize-y'} placeholder="Optional note for the Recruitment Team..." /></label>

            {error && <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</div>}
            {message && <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{message}</div>}

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={()=>void save()} disabled={Boolean(busy) || readOnly} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-700 disabled:opacity-40">{busy==='save'?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>}Save Draft</button>
              <button type="button" onClick={()=>void submit()} disabled={Boolean(busy) || readOnly || !validUrl(videoUrl)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-black text-white disabled:opacity-40">{busy==='submit'?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}Submit Retry Video</button>
            </div>

            <p className="mt-5 text-xs leading-5 text-slate-400">Submitting this page does not automatically pass or fail your application. A reviewer will evaluate the new video as a separate assessment attempt.</p>
          </>}
        </div>
      </section>
      <p className="mt-5 text-center text-xs leading-5 text-slate-400">Need help? Contact <a className="font-bold text-[#000080] hover:underline" href="mailto:admin@profoxwebdesigner.com">admin@profoxwebdesigner.com</a>. Use the latest secure ProFox email if you requested a new link.</p>
    </div>
  </main>;
}
