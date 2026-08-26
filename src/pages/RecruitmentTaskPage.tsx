import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Clock3, ExternalLink, Loader2, Save, Send, ShieldCheck } from 'lucide-react';
import { useParams } from 'react-router-dom';
import {
  emptyLeadResearchEntry,
  recruitmentTaskService,
  type LeadResearchEntry,
  type PublicRecruitmentTask,
  type RecruitmentTaskAnswers,
} from '../lib/recruitmentTaskService';

const inputClass = 'mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-[#000080] focus:ring-4 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500';
const textareaClass = `${inputClass} min-h-[110px] resize-y leading-6`;

function formatDate(value?: string | null) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function fieldComplete(lead: LeadResearchEntry) {
  return Boolean(
    lead.businessName.trim() && lead.website.trim() && lead.location.trim() && lead.niche.trim()
    && lead.fitReason.trim() && lead.qualificationSignals.trim() && lead.evidenceUrls.length
    && lead.decisionMakerName.trim() && lead.decisionMakerRole.trim() && lead.decisionMakerSourceUrl.trim()
    && lead.digitalProblem.trim() && lead.serviceFit.trim() && lead.priority && lead.serviceFitReason.trim()
  );
}

export default function RecruitmentTaskPage() {
  const { token = '' } = useParams<{ token: string }>();
  const [task, setTask] = useState<PublicRecruitmentTask | null>(null);
  const [answers, setAnswers] = useState<RecruitmentTaskAnswers>({ leads: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [expandedLead, setExpandedLead] = useState(0);
  const loadedRef = useRef(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await recruitmentTaskService.open(token);
      setTask(result);
      setAnswers(result.answers);
      loadedRef.current = true;
    } catch (err: any) {
      setError(err?.message || 'This recruitment task could not be opened.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [token]);

  useEffect(() => {
    if (!loadedRef.current || !dirty || !task?.canEdit || submitting) return;
    const timer = window.setTimeout(async () => {
      setSaving(true);
      setSaveMessage('');
      try {
        await recruitmentTaskService.saveDraft(token, answers);
        setDirty(false);
        setSaveMessage('Draft saved');
      } catch (err: any) {
        setError(err?.message || 'Your draft could not be saved.');
      } finally {
        setSaving(false);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [answers, dirty, task?.canEdit, submitting, token]);

  const completed = useMemo(() => answers.leads.filter(fieldComplete).length, [answers]);
  const progress = task?.requiredItems ? Math.round((completed / task.requiredItems) * 100) : 0;

  const updateLead = <K extends keyof LeadResearchEntry>(index: number, key: K, value: LeadResearchEntry[K]) => {
    setAnswers(current => {
      const leads = [...current.leads];
      while (leads.length <= index) leads.push(emptyLeadResearchEntry());
      leads[index] = { ...leads[index], [key]: value };
      return { leads };
    });
    setDirty(true);
    setSaveMessage('');
    setError('');
  };

  const saveNow = async () => {
    if (!task?.canEdit) return;
    setSaving(true);
    setError('');
    try {
      await recruitmentTaskService.saveDraft(token, answers);
      setDirty(false);
      setSaveMessage('Draft saved');
    } catch (err: any) {
      setError(err?.message || 'Your draft could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!task?.canEdit) return;
    if (completed !== task.requiredItems) {
      setError(`Complete all ${task.requiredItems} lead records before final submission.`);
      const firstIncomplete = answers.leads.findIndex(lead => !fieldComplete(lead));
      if (firstIncomplete >= 0) setExpandedLead(firstIncomplete);
      return;
    }
    const confirmed = window.confirm('Submit your Lead Research Test? After final submission, this attempt becomes read-only and cannot be edited.');
    if (!confirmed) return;
    setSubmitting(true);
    setError('');
    try {
      await recruitmentTaskService.submit(token, answers);
      await load();
      setSaveMessage('Test submitted successfully');
    } catch (err: any) {
      setError(err?.message || 'Your test could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="flex items-center gap-3 text-sm font-semibold text-slate-600"><Loader2 className="h-5 w-5 animate-spin text-[#000080]" />Loading your secure recruitment task...</div></div>;
  }

  if (!task) {
    return <div className="min-h-screen bg-slate-50 p-5 flex items-center justify-center"><div className="w-full max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><AlertCircle className="mx-auto h-9 w-9 text-red-500"/><h1 className="mt-4 text-xl font-bold text-slate-900">Task link unavailable</h1><p className="mt-2 text-sm leading-6 text-slate-600">{error || 'This task link is invalid, expired, or no longer active.'}</p><p className="mt-5 text-sm text-slate-500">Contact the ProFox Recruitment Team if you believe you should still have access.</p></div></div>;
  }

  const readOnly = !task.canEdit;
  const submitted = ['Submitted','Under Review','Passed','Retry Required','Failed'].includes(task.status);

  return <div className="min-h-screen bg-[#f4f5fb] text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div><div className="text-xs font-black uppercase tracking-[0.16em] text-[#000080]">ProFox Recruitment</div><div className="mt-1 text-sm font-semibold text-slate-600">Secure candidate task portal</div></div>
        <a href="https://www.profoxwebdesigner.com/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-bold text-[#000080]">ProFox Web Designer <ExternalLink className="h-4 w-4"/></a>
      </div>
    </header>

    <main className="mx-auto max-w-6xl space-y-5 p-4 sm:p-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-[#000080]">Lead Research Test · Attempt {task.attemptNo}</div>
            <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{task.title}</h1>
            <p className="mt-3 text-sm leading-7 text-slate-600 sm:text-base">{task.description}</p>
          </div>
          <div className={`w-fit rounded-full px-3 py-1.5 text-xs font-black ${submitted ? 'bg-emerald-100 text-emerald-800' : task.expired ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-[#000080]'}`}>{task.status}</div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Summary label="Application" value={task.applicationReference || 'ProFox candidate'} />
          <Summary label="Research target" value={`${task.targetNiche || 'Assigned niche'} · ${task.targetMarket || 'Assigned market'}`} />
          <Summary label="Expected time" value={`${task.estimatedMinutes} minutes`} />
          <Summary label="Deadline" value={formatDate(task.dueAt)} />
        </div>

        {task.retryFeedback && <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-black text-amber-900">Evaluator feedback for this retry</div><p className="mt-1 text-sm leading-6 text-amber-800">{task.retryFeedback}</p></div>}

        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#000080]"/><div><h2 className="text-sm font-black text-[#000080]">Task instructions</h2><ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">{task.instructions.map((item,index)=><li key={index} className="flex gap-2"><span className="font-bold text-[#000080]">{index+1}.</span><span>{item}</span></li>)}</ul></div></div>
        </div>
      </section>

      {error && <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0"/><span>{error}</span></div>}

      {submitted && <section className="rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600"/><div><h2 className="text-lg font-black text-slate-900">Your test is submitted</h2><p className="mt-1 text-sm leading-6 text-slate-600">Submitted {formatDate(task.submittedAt)}. Your answers are now read-only while the ProFox Recruitment Team reviews this attempt.</p></div></div></section>}

      {!submitted && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Progress</div><div className="mt-1 text-lg font-black">{completed} of {task.requiredItems} lead records complete</div></div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">{saving ? <Loader2 className="h-4 w-4 animate-spin"/> : saveMessage ? <CheckCircle2 className="h-4 w-4 text-emerald-600"/> : <Clock3 className="h-4 w-4"/>}{saving ? 'Saving draft...' : saveMessage || 'Draft auto-saves while you work'}</div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#000080] transition-all" style={{ width: `${progress}%` }}/></div>
      </section>}

      <div className="space-y-4">
        {answers.leads.map((lead,index) => {
          const complete = fieldComplete(lead);
          const open = expandedLead === index;
          return <section key={index} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <button type="button" onClick={()=>setExpandedLead(open ? -1 : index)} className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6">
              <div className="flex min-w-0 items-center gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black ${complete ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-[#000080]'}`}>{complete ? <CheckCircle2 className="h-5 w-5"/> : index+1}</div><div className="min-w-0"><h2 className="truncate text-base font-black">{lead.businessName.trim() || `Lead ${index+1}`}</h2><p className="mt-0.5 text-xs text-slate-500">{complete ? 'Complete' : 'Complete all required research fields'}</p></div></div>
              <ChevronDown className={`h-5 w-5 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`}/>
            </button>

            {open && <div className="border-t border-slate-100 p-5 sm:p-6">
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Business name" required><input disabled={readOnly} className={inputClass} value={lead.businessName} onChange={e=>updateLead(index,'businessName',e.target.value)} placeholder="Example Roofing Co."/></Field>
                <Field label="Business website" required><input disabled={readOnly} className={inputClass} value={lead.website} onChange={e=>updateLead(index,'website',e.target.value)} placeholder="https://example.com"/></Field>
                <Field label="Location" required><input disabled={readOnly} className={inputClass} value={lead.location} onChange={e=>updateLead(index,'location',e.target.value)} placeholder="City, State, Country"/></Field>
                <Field label="Business niche" required><input disabled={readOnly} className={inputClass} value={lead.niche} onChange={e=>updateLead(index,'niche',e.target.value)} placeholder={task.targetNiche || 'Business category'}/></Field>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Field label="Why this business fits the ProFox ideal customer" required help="Explain your qualification judgment, not just what the company does."><textarea disabled={readOnly} className={textareaClass} value={lead.fitReason} onChange={e=>updateLead(index,'fitReason',e.target.value)}/></Field>
                <Field label="Qualification signals and evidence" required help="List the concrete signs that make this business worth contacting."><textarea disabled={readOnly} className={textareaClass} value={lead.qualificationSignals} onChange={e=>updateLead(index,'qualificationSignals',e.target.value)}/></Field>
              </div>

              <div className="mt-5"><Field label="Evidence URLs" required help="One public source URL per line. Include the pages you actually used for your research."><textarea disabled={readOnly} className={textareaClass} value={lead.evidenceUrls.join('\n')} onChange={e=>updateLead(index,'evidenceUrls',e.target.value.split(/\r?\n/).map(item=>item.trim()).filter(Boolean))} placeholder={'https://example.com/about\nhttps://example.com/services'}/></Field></div>

              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
                <h3 className="text-sm font-black text-slate-900">Decision-maker research</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">Use only a public company or professional source. Do not collect private contact information.</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Decision-maker name" required><input disabled={readOnly} className={inputClass} value={lead.decisionMakerName} onChange={e=>updateLead(index,'decisionMakerName',e.target.value)}/></Field><Field label="Role / title" required><input disabled={readOnly} className={inputClass} value={lead.decisionMakerRole} onChange={e=>updateLead(index,'decisionMakerRole',e.target.value)} placeholder="Owner, CEO, Marketing Director..."/></Field></div>
                <div className="mt-4"><Field label="Public source URL" required><input disabled={readOnly} className={inputClass} value={lead.decisionMakerSourceUrl} onChange={e=>updateLead(index,'decisionMakerSourceUrl',e.target.value)} placeholder="https://..."/></Field></div>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Field label="Digital problem or growth opportunity" required help="Describe the specific website, UX, conversion, automation, or digital-system opportunity you found."><textarea disabled={readOnly} className={textareaClass} value={lead.digitalProblem} onChange={e=>updateLead(index,'digitalProblem',e.target.value)}/></Field>
                <div className="grid gap-4"><Field label="Most relevant ProFox service" required><input disabled={readOnly} className={inputClass} value={lead.serviceFit} onChange={e=>updateLead(index,'serviceFit',e.target.value)} placeholder="Website Design & Development"/></Field><Field label="Opportunity priority" required><select disabled={readOnly} className={inputClass} value={lead.priority} onChange={e=>updateLead(index,'priority',e.target.value as LeadResearchEntry['priority'])}><option value="">Select priority</option><option>High</option><option>Medium</option><option>Low</option></select></Field></div>
              </div>
              <div className="mt-5"><Field label="Why this ProFox service fits" required><textarea disabled={readOnly} className={textareaClass} value={lead.serviceFitReason} onChange={e=>updateLead(index,'serviceFitReason',e.target.value)}/></Field></div>
            </div>}
          </section>;
        })}
      </div>

      {!submitted && <section className="sticky bottom-3 z-20 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black">{completed === task.requiredItems ? 'Ready for final submission' : `${task.requiredItems-completed} lead record${task.requiredItems-completed===1?'':'s'} still incomplete`}</div><p className="mt-1 text-xs leading-5 text-slate-500">Final submission locks this attempt. Your evaluator will score it separately against the configured recruitment rubric.</p></div><div className="flex flex-col gap-2 sm:flex-row"><button type="button" disabled={saving||submitting||readOnly} onClick={()=>void saveNow()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 disabled:opacity-50"><Save className="h-4 w-4"/>Save Draft</button><button type="button" disabled={saving||submitting||readOnly||completed!==task.requiredItems} onClick={()=>void submit()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{submitting?<Loader2 className="h-4 w-4 animate-spin"/>:<Send className="h-4 w-4"/>}Review & Submit Test</button></div></div>
      </section>}

      <footer className="pb-8 pt-2 text-center text-xs leading-5 text-slate-500">This secure recruitment task is intended only for the candidate who received the link. Do not forward it. · ProFox Web Designer</footer>
    </main>
  </div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[11px] font-black uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm font-bold leading-5 text-slate-900">{value}</div></div>;
}

function Field({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-bold text-slate-800">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>{help && <span className="mt-1 block text-xs leading-5 text-slate-500">{help}</span>}{children}</label>;
}
