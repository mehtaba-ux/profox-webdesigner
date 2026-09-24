import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { trainingService, TrainingModule } from '../../lib/trainingService';

type Tab = 'assessment' | 'acknowledgements';
type Section = 'knowledge' | 'scenario' | 'recommendation';

type Question = {
  id: string; module_id: string; prompt: string; options: string[]; correct_index: number; explanation: string;
  sort_order: number; active: boolean; assessment_section?: Section; case_key?: string; critical?: boolean;
};
type Acknowledgement = { id: string; module_id: string; statement: string; sort_order: number; required: boolean; active: boolean; };

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
const supportedSlugs = ['agreement-rules', 'product-training', 'product-package-training', 'product-packages', 'meeting-booking', 'discovery-script', 'presentation-skills', 'objections', 'closing', 'quotation-process'];
function messageFromError(error: any, fallback: string) { return error?.message || fallback; }

export default function SalesAcademyAssessmentAdmin() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('assessment');
  const [availableModules, setAvailableModules] = useState<TrainingModule[]>([]);
  const [module, setModule] = useState<TrainingModule | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<Acknowledgement[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''); const [error, setError] = useState('');
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const isProductModule = module ? ['product-training', 'product-package-training', 'product-packages'].includes(module.slug) : false;
  const isMeetingBookingModule = module?.slug === 'meeting-booking';
  const isDiscoveryModule = module?.slug === 'discovery-script';
  const isPresentationModule = module?.slug === 'presentation-skills';
  const isObjectionModule = module?.slug === 'objections';
  const isClosingModule = module?.slug === 'closing';
  const isQuotationModule = module?.slug === 'quotation-process';
  const usesCriticalQuestions = isProductModule || isMeetingBookingModule || isDiscoveryModule || isPresentationModule || isObjectionModule || isClosingModule || isQuotationModule;

  useEffect(() => { if (isAdmin) void loadModules(); }, [isAdmin]);

  const loadModules = async () => {
    setLoading(true); setError('');
    try {
      const { data, error: moduleError } = await trainingService.getModules(true);
      if (moduleError) throw moduleError;
      const supported = (data || []).filter(item => supportedSlugs.includes(item.slug)).sort((a, b) => a.sort_order - b.sort_order);
      if (!supported.length) throw new Error('No configurable Academy assessment modules were found.');
      setAvailableModules(supported);
      const current = module ? supported.find(item => item.id === module.id) : null;
      const target = current || supported.find(item => ['product-training', 'product-package-training', 'product-packages'].includes(item.slug)) || supported[0];
      await loadModule(target, false);
    } catch (err: any) { setError(messageFromError(err, 'Academy assessment settings could not be loaded.')); setLoading(false); }
  };

  const loadModule = async (target: TrainingModule, showSpinner = true) => {
    if (showSpinner) setLoading(true); setError('');
    try {
      const [questionResult, acknowledgementResult] = await Promise.all([
        supabase.from('training_assessment_questions').select('*').eq('module_id', target.id).order('sort_order', { ascending: true }),
        supabase.from('training_acknowledgements').select('*').eq('module_id', target.id).order('sort_order', { ascending: true })
      ]);
      if (questionResult.error) throw questionResult.error; if (acknowledgementResult.error) throw acknowledgementResult.error;
      setModule(target); setQuestions((questionResult.data || []) as Question[]); setAcknowledgements((acknowledgementResult.data || []) as Acknowledgement[]); setExpandedQuestion(null);
      if (['product-training', 'product-package-training', 'product-packages', 'presentation-skills', 'objections', 'closing', 'quotation-process'].includes(target.slug)) setTab('assessment');
    } catch (err: any) { setError(messageFromError(err, 'Assessment module could not be loaded.')); }
    finally { setLoading(false); }
  };

  const savePassingScore = async () => {
    if (!module) return; const normalized = Math.max(1, Math.min(100, Math.round(Number(module.passing_score || 80))));
    setBusy(true); setError(''); setMessage('');
    try { const { data, error: saveError } = await trainingService.updateModule(module.id, { passing_score: normalized }); if (saveError) throw saveError; setModule(data || { ...module, passing_score: normalized }); setMessage('Passing score saved. New attempts will use this requirement.'); }
    catch (err: any) { setError(messageFromError(err, 'Passing score could not be saved.')); } finally { setBusy(false); }
  };

  const updateQuestion = (id: string, updates: Partial<Question>) => setQuestions(previous => previous.map(item => item.id === id ? { ...item, ...updates } : item));
  const updateOption = (id: string, optionIndex: number, value: string) => setQuestions(previous => previous.map(item => item.id === id ? { ...item, options: item.options.map((option, index) => index === optionIndex ? value : option) } : item));

  const addQuestion = async () => {
    if (!module) return; setBusy(true); setError(''); setMessage('');
    try {
      const nextOrder = questions.length ? Math.max(...questions.map(item => item.sort_order)) + 1 : 1;
      const prompt = isProductModule ? 'New product-fit assessment question' : isMeetingBookingModule ? 'New Meeting Booking practical scenario' : isDiscoveryModule ? 'New Discovery practical scenario' : isPresentationModule ? 'New Product Presentation buyer scenario' : isObjectionModule ? 'New Objection Handling buyer scenario' : isClosingModule ? 'New Closing decision scenario' : isQuotationModule ? 'New Quotation Process commercial scenario' : 'New high-ticket sales scenario';
      const section: Section = (isMeetingBookingModule || isDiscoveryModule || isPresentationModule || isObjectionModule || isClosingModule || isQuotationModule) ? 'scenario' : 'knowledge';
      const { data, error: insertError } = await supabase.from('training_assessment_questions').insert({ module_id: module.id, prompt, options: ['Option A', 'Option B', 'Option C', 'Option D'], correct_index: 0, explanation: 'Explain why the approved action is correct.', sort_order: nextOrder, active: true, assessment_section: section, case_key: '', critical: false }).select('*').single();
      if (insertError) throw insertError; setQuestions(previous => [...previous, data as Question]); setExpandedQuestion((data as Question).id); setMessage('Assessment question added. Edit it before learners use it.');
    } catch (err: any) { setError(messageFromError(err, 'Assessment question could not be added.')); } finally { setBusy(false); }
  };

  const saveQuestion = async (question: Question) => {
    const options = question.options.map(option => option.trim());
    if (!question.prompt.trim() || options.length < 2 || options.some(option => !option)) { setError('Question prompt and every answer option are required.'); return; }
    if (question.correct_index < 0 || question.correct_index >= options.length) { setError('Choose a valid correct answer.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.from('training_assessment_questions').update({ prompt: question.prompt.trim(), options, correct_index: question.correct_index, explanation: question.explanation.trim(), sort_order: question.sort_order, active: question.active, assessment_section: question.assessment_section || 'knowledge', case_key: (question.case_key || '').trim(), critical: !!question.critical, updated_at: new Date().toISOString() }).eq('id', question.id);
      if (saveError) throw saveError; setMessage(`Question ${question.sort_order} saved.`);
    } catch (err: any) { setError(messageFromError(err, 'Assessment question could not be saved.')); } finally { setBusy(false); }
  };

  const deleteQuestion = async (question: Question) => {
    if (!window.confirm(`Delete assessment question ${question.sort_order}?`)) return; setBusy(true); setError('');
    try { const { error: deleteError } = await supabase.from('training_assessment_questions').delete().eq('id', question.id); if (deleteError) throw deleteError; setQuestions(previous => previous.filter(item => item.id !== question.id)); setMessage('Assessment question deleted.'); }
    catch (err: any) { setError(messageFromError(err, 'Assessment question could not be deleted.')); } finally { setBusy(false); }
  };

  const addAcknowledgement = async () => {
    if (!module || isProductModule) return; setBusy(true); setError('');
    try { const nextOrder = acknowledgements.length ? Math.max(...acknowledgements.map(item => item.sort_order)) + 1 : 1; const { data, error: insertError } = await supabase.from('training_acknowledgements').insert({ module_id: module.id, statement: 'New required Sales Partner acknowledgement.', sort_order: nextOrder, required: true, active: true }).select('*').single(); if (insertError) throw insertError; setAcknowledgements(previous => [...previous, data as Acknowledgement]); setMessage('Acknowledgement added.'); }
    catch (err: any) { setError(messageFromError(err, 'Acknowledgement could not be added.')); } finally { setBusy(false); }
  };

  const saveAcknowledgement = async (item: Acknowledgement) => {
    if (!item.statement.trim()) { setError('Acknowledgement statement cannot be empty.'); return; } setBusy(true); setError(''); setMessage('');
    try { const { error: saveError } = await supabase.from('training_acknowledgements').update({ statement: item.statement.trim(), sort_order: item.sort_order, required: item.required, active: item.active, updated_at: new Date().toISOString() }).eq('id', item.id); if (saveError) throw saveError; setMessage(`Acknowledgement ${item.sort_order} saved.`); }
    catch (err: any) { setError(messageFromError(err, 'Acknowledgement could not be saved.')); } finally { setBusy(false); }
  };

  const deleteAcknowledgement = async (item: Acknowledgement) => {
    if (!window.confirm(`Delete acknowledgement ${item.sort_order}?`)) return; setBusy(true); setError('');
    try { const { error: deleteError } = await supabase.from('training_acknowledgements').delete().eq('id', item.id); if (deleteError) throw deleteError; setAcknowledgements(previous => previous.filter(current => current.id !== item.id)); setMessage('Acknowledgement deleted.'); }
    catch (err: any) { setError(messageFromError(err, 'Acknowledgement could not be deleted.')); } finally { setBusy(false); }
  };

  const activeQuestionCount = useMemo(() => questions.filter(item => item.active).length, [questions]);
  const criticalCount = useMemo(() => questions.filter(item => item.active && item.critical).length, [questions]);
  if (authLoading) return null; if (!isAdmin) return <Navigate to="/admin/workspace" replace />;
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-6xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div className="flex items-start gap-3"><button type="button" onClick={() => navigate('/admin/app/recruitment?tab=onboarding')} className="mt-0.5 rounded-xl border border-slate-200 p-2 text-slate-600"><ArrowLeft className="h-4 w-4" /></button><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Sales Academy · Assessment Control</div><h1 className="text-xl font-black text-slate-950">Assessment & Learning Controls</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Edit server-scored questions, answer keys, explanations and learning gates without code. Lesson bodies remain in Curriculum & Module Editor.</p></div></div><button type="button" onClick={() => void loadModules()} disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-600 disabled:opacity-40"><RefreshCw className="h-4 w-4" /> Refresh</button></div></header>
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">{error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="grid gap-5 lg:grid-cols-[1fr_260px] lg:items-end"><div><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Academy module</label><select value={module?.id || ''} onChange={event => { const next = availableModules.find(item => item.id === event.target.value); if (next) void loadModule(next); }} className={`${inputClass} mt-2 max-w-xl font-bold`}>{availableModules.map(item => <option key={item.id} value={item.id}>Module {item.sort_order} · {item.title}</option>)}</select><div className="mt-4 flex items-center gap-2 text-[#000080]"><ShieldCheck className="h-5 w-5" /><span className="text-sm font-black">{module?.title}</span></div><p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">{module?.description}</p><button type="button" onClick={() => navigate('/admin/app/recruitment?tab=onboarding')} className="mt-3 text-xs font-bold text-[#000080] hover:underline">Edit lesson content in Curriculum & Module Editor →</button></div><div className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Required score</label><div className="mt-2 flex items-center gap-2"><input type="number" min={1} max={100} value={module?.passing_score ?? 80} onChange={event => setModule(current => current ? { ...current, passing_score: Number(event.target.value) } : current)} className="w-24 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black" /><span className="text-sm font-black">%</span><button type="button" disabled={busy || !module} onClick={() => void savePassingScore()} className="ml-auto rounded-xl bg-[#000080] p-2.5 text-white disabled:opacity-40"><Save className="h-4 w-4" /></button></div>{usesCriticalQuestions && <div className="mt-3 text-[10px] font-bold leading-4 text-slate-500">Critical questions must also all be correct.</div>}</div></div></section>
      <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-2"><button type="button" onClick={() => setTab('assessment')} className={`flex-1 rounded-xl px-4 py-3 text-left ${tab === 'assessment' ? 'bg-[#000080] text-white' : 'text-slate-600'}`}><div className="text-xs font-black">Assessment</div><div className={`mt-0.5 text-[10px] ${tab === 'assessment' ? 'text-white/70' : 'text-slate-400'}`}>{activeQuestionCount} active questions{usesCriticalQuestions ? ` · ${criticalCount} critical` : ' · server scored'}</div></button>{!isProductModule && <button type="button" onClick={() => setTab('acknowledgements')} className={`flex-1 rounded-xl px-4 py-3 text-left ${tab === 'acknowledgements' ? 'bg-[#000080] text-white' : 'text-slate-600'}`}><div className="text-xs font-black">Acknowledgements</div><div className={`mt-0.5 text-[10px] ${tab === 'acknowledgements' ? 'text-white/70' : 'text-slate-400'}`}>{acknowledgements.filter(item => item.active && item.required).length} required confirmations</div></button>}</div>
      {tab === 'assessment' && <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-950">Assessment questions</h2><p className="text-xs text-slate-500">Correct answers stay Admin-only and scoring remains server-side.</p></div><button type="button" onClick={() => void addQuestion()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Add Question</button></div>{questions.map(question => { const open = expandedQuestion === question.id; return <article key={question.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm"><button type="button" onClick={() => setExpandedQuestion(open ? null : question.id)} className="flex w-full items-center justify-between gap-4 p-4 text-left"><div><div className="text-[10px] font-black uppercase tracking-wider text-[#000080]">Question {question.sort_order}{usesCriticalQuestions ? ` · ${question.assessment_section || 'knowledge'}${question.critical ? ' · Critical' : ''}` : ''}</div><div className="mt-1 text-sm font-bold text-slate-900">{question.prompt}</div></div>{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{open && <div className="space-y-5 border-t border-slate-100 p-5"><Field label="Question"><textarea rows={3} className={inputClass} value={question.prompt} onChange={event => updateQuestion(question.id, { prompt: event.target.value })} /></Field>{usesCriticalQuestions && <div className="grid gap-4 sm:grid-cols-3"><Field label="Assessment section"><select className={inputClass} value={question.assessment_section || 'knowledge'} onChange={event => updateQuestion(question.id, { assessment_section: event.target.value as Section })}><option value="knowledge">Knowledge</option><option value="scenario">Practical Scenario</option><option value="recommendation">Recommendation</option></select></Field><Field label="Case key"><input className={inputClass} value={question.case_key || ''} onChange={event => updateQuestion(question.id, { case_key: event.target.value })} /></Field><label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={!!question.critical} onChange={event => updateQuestion(question.id, { critical: event.target.checked })} /> Critical rule</label></div>}<div className="space-y-3">{question.options.map((option, index) => <div key={index} className="grid gap-2 sm:grid-cols-[36px_1fr]"><label className="flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-xs font-black"><input type="radio" name={`correct-${question.id}`} checked={question.correct_index === index} onChange={() => updateQuestion(question.id, { correct_index: index })} className="sr-only" />{question.correct_index === index ? '✓' : String.fromCharCode(65 + index)}</label><input className={inputClass} value={option} onChange={event => updateOption(question.id, index, event.target.value)} /></div>)}</div><Field label="Feedback explanation"><textarea rows={3} className={inputClass} value={question.explanation || ''} onChange={event => updateQuestion(question.id, { explanation: event.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-3"><Field label="Order"><input type="number" className={inputClass} value={question.sort_order} onChange={event => updateQuestion(question.id, { sort_order: Number(event.target.value) })} /></Field><label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-600"><input type="checkbox" checked={question.active} onChange={event => updateQuestion(question.id, { active: event.target.checked })} /> Active</label><div className="flex items-end justify-end gap-2"><button type="button" disabled={busy} onClick={() => void deleteQuestion(question)} className="rounded-xl border border-red-200 p-2.5 text-red-600"><Trash2 className="h-4 w-4" /></button><button type="button" disabled={busy} onClick={() => void saveQuestion(question)} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white"><Save className="h-4 w-4" /> Save</button></div></div></div>}</article>; })}</section>}
      {tab === 'acknowledgements' && !isProductModule && <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-black">Final acknowledgements</h2><p className="text-xs text-slate-500">Required confirmations used by the module's secure completion workflow.</p></div><button type="button" onClick={() => void addAcknowledgement()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white"><Plus className="h-4 w-4" /> Add</button></div>{acknowledgements.map(item => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5"><textarea rows={3} className={inputClass} value={item.statement} onChange={event => setAcknowledgements(previous => previous.map(current => current.id === item.id ? { ...current, statement: event.target.value } : current))} /><div className="mt-4 flex flex-wrap items-center gap-4"><input type="number" className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-xs" value={item.sort_order} onChange={event => setAcknowledgements(previous => previous.map(current => current.id === item.id ? { ...current, sort_order: Number(event.target.value) } : current))} /><label className="text-xs font-bold"><input type="checkbox" className="mr-2" checked={item.required} onChange={event => setAcknowledgements(previous => previous.map(current => current.id === item.id ? { ...current, required: event.target.checked } : current))} />Required</label><label className="text-xs font-bold"><input type="checkbox" className="mr-2" checked={item.active} onChange={event => setAcknowledgements(previous => previous.map(current => current.id === item.id ? { ...current, active: event.target.checked } : current))} />Active</label><div className="ml-auto flex gap-2"><button type="button" onClick={() => void deleteAcknowledgement(item)} className="rounded-xl border border-red-200 p-2.5 text-red-600"><Trash2 className="h-4 w-4" /></button><button type="button" onClick={() => void saveAcknowledgement(item)} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white"><Save className="h-4 w-4" /> Save</button></div></div></article>)}</section>}
    </main>
  </div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-xs font-black text-slate-600">{label}<div className="mt-2">{children}</div></label>; }
function Notice({ danger = false, children }: { danger?: boolean; children: React.ReactNode }) { return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${danger ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
