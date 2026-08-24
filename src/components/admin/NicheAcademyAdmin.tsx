import React, { useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronUp, Loader2, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';

type Track = {
  id: string; module_id: string; niche_name: string; slug: string; summary: string; passing_score: number; sort_order: number;
  required: boolean; active: boolean; pre_survey_questions: string[]; diagnostic_questions: string[];
};
type Question = {
  id: string; module_id: string; niche_slug: string; prompt: string; options: string[]; correct_index: number; explanation: string;
  sort_order: number; active: boolean; assessment_section?: string; case_key?: string; critical?: boolean;
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';
function messageFromError(error: any, fallback: string) { return error?.message || fallback; }

export default function NicheAcademyAdmin() {
  const { isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadTracks = async () => {
    setLoading(true); setError('');
    try {
      const { data, error: loadError } = await supabase.from('niche_training_tracks').select('*').order('sort_order', { ascending: true });
      if (loadError) throw loadError;
      const rows = (data || []) as Track[];
      setTracks(rows);
      const nextId = selectedId && rows.some(row => row.id === selectedId) ? selectedId : rows[0]?.id || '';
      setSelectedId(nextId);
    } catch (err: any) { setError(messageFromError(err, 'Niche Academy settings could not be loaded.')); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (isAdmin) void loadTracks(); }, [isAdmin]);

  const selected = tracks.find(track => track.id === selectedId) || null;

  const loadQuestions = async (track: Track) => {
    const { data, error: questionError } = await supabase.from('training_assessment_questions').select('*').eq('module_id', track.module_id).eq('niche_slug', track.slug).order('sort_order', { ascending: true });
    if (questionError) throw questionError;
    setQuestions((data || []) as Question[]);
    setExpandedQuestion(null);
  };

  useEffect(() => {
    if (!selected) { setQuestions([]); return; }
    void loadQuestions(selected).catch(err => setError(messageFromError(err, 'Niche certification questions could not be loaded.')));
  }, [selectedId, selected?.slug]);

  const updateSelected = (updates: Partial<Track>) => setTracks(previous => previous.map(track => track.id === selectedId ? { ...track, ...updates } : track));
  const updateQuestion = (id: string, updates: Partial<Question>) => setQuestions(previous => previous.map(item => item.id === id ? { ...item, ...updates } : item));
  const updateOption = (id: string, index: number, value: string) => setQuestions(previous => previous.map(item => item.id === id ? { ...item, options: item.options.map((option, i) => i === index ? value : option) } : item));

  const save = async () => {
    if (!selected) return;
    if (!selected.niche_name.trim()) { setError('Niche name is required.'); return; }
    if (selected.pre_survey_questions.some(item => !item.trim()) || selected.diagnostic_questions.some(item => !item.trim())) { setError('Survey and diagnostic prompts cannot be blank.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.from('niche_training_tracks').update({
        niche_name: selected.niche_name.trim(), summary: selected.summary.trim(), passing_score: Math.max(1, Math.min(100, Math.round(selected.passing_score))),
        sort_order: selected.sort_order, required: selected.required, active: selected.active,
        pre_survey_questions: selected.pre_survey_questions.map(item => item.trim()), diagnostic_questions: selected.diagnostic_questions.map(item => item.trim()), updated_at: new Date().toISOString()
      }).eq('id', selected.id);
      if (saveError) throw saveError;
      setMessage(`${selected.niche_name} track settings saved.`); await loadTracks();
    } catch (err: any) { setError(messageFromError(err, 'Niche track could not be saved.')); }
    finally { setBusy(false); }
  };

  const addPrompt = (key: 'pre_survey_questions' | 'diagnostic_questions') => selected && updateSelected({ [key]: [...selected[key], 'New prompt'] } as Partial<Track>);
  const updatePrompt = (key: 'pre_survey_questions' | 'diagnostic_questions', index: number, value: string) => selected && updateSelected({ [key]: selected[key].map((item, i) => i === index ? value : item) } as Partial<Track>);
  const removePrompt = (key: 'pre_survey_questions' | 'diagnostic_questions', index: number) => selected && updateSelected({ [key]: selected[key].filter((_, i) => i !== index) } as Partial<Track>);

  const addQuestion = async () => {
    if (!selected) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const nextOrder = questions.length ? Math.max(...questions.map(item => item.sort_order)) + 1 : 2001;
      const { data, error: insertError } = await supabase.from('training_assessment_questions').insert({
        module_id: selected.module_id, niche_slug: selected.slug, prompt: 'New niche certification question',
        options: ['Option A', 'Option B', 'Option C', 'Option D'], correct_index: 0, explanation: 'Explain why the approved answer is correct.',
        sort_order: nextOrder, active: true, assessment_section: 'knowledge', case_key: `niche:${selected.slug}:custom`, critical: false
      }).select('*').single();
      if (insertError) throw insertError;
      const item = data as Question; setQuestions(previous => [...previous, item]); setExpandedQuestion(item.id); setMessage('Certification question added.');
    } catch (err: any) { setError(messageFromError(err, 'Certification question could not be added.')); }
    finally { setBusy(false); }
  };

  const saveQuestion = async (question: Question) => {
    const options = question.options.map(option => option.trim());
    if (!question.prompt.trim() || options.length < 2 || options.some(option => !option)) { setError('Question prompt and every option are required.'); return; }
    if (question.correct_index < 0 || question.correct_index >= options.length) { setError('Choose a valid correct answer.'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: saveError } = await supabase.from('training_assessment_questions').update({
        prompt: question.prompt.trim(), options, correct_index: question.correct_index, explanation: question.explanation.trim(),
        sort_order: question.sort_order, active: question.active, assessment_section: question.assessment_section || 'knowledge',
        case_key: (question.case_key || '').trim(), critical: !!question.critical, updated_at: new Date().toISOString()
      }).eq('id', question.id);
      if (saveError) throw saveError;
      setMessage('Certification question saved.');
    } catch (err: any) { setError(messageFromError(err, 'Certification question could not be saved.')); }
    finally { setBusy(false); }
  };

  const deleteQuestion = async (question: Question) => {
    if (!window.confirm('Delete this niche certification question?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const { error: deleteError } = await supabase.from('training_assessment_questions').delete().eq('id', question.id);
      if (deleteError) throw deleteError;
      setQuestions(previous => previous.filter(item => item.id !== question.id)); setMessage('Certification question deleted.');
    } catch (err: any) { setError(messageFromError(err, 'Certification question could not be deleted.')); }
    finally { setBusy(false); }
  };

  if (authLoading) return null;
  if (!isAdmin) return <Navigate to="/admin/workspace" replace />;
  if (loading) return <div className="flex min-h-screen items-center justify-center bg-slate-50"><Loader2 className="h-8 w-8 animate-spin text-[#000080]" /></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b border-slate-200 bg-white px-4 py-5 sm:px-8"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div className="flex items-start gap-3"><button onClick={() => navigate('/admin/app/recruitment?tab=onboarding')} className="rounded-xl border border-slate-200 p-2 text-slate-600"><ArrowLeft className="h-4 w-4" /></button><div><div className="text-[10px] font-black uppercase tracking-[0.18em] text-[#000080]">Sales Academy · Module 4</div><h1 className="text-xl font-black">Niche Academy Controls</h1><p className="mt-1 text-xs text-slate-500">Manage niche definitions, surveys, diagnostic exercises, certification questions and thresholds without editing code.</p></div></div><button onClick={() => void loadTracks()} disabled={busy} className="rounded-xl border border-slate-200 p-2.5 text-slate-600"><RefreshCw className="h-4 w-4" /></button></div></header>
    <main className="mx-auto grid max-w-7xl gap-6 p-4 sm:p-8 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-2 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">{tracks.map((track, index) => <button key={track.id} onClick={() => setSelectedId(track.id)} className={`w-full rounded-2xl border p-4 text-left ${track.id === selectedId ? 'border-[#000080] bg-[#000080]/5' : 'border-slate-200 bg-slate-50'}`}><div className="text-[10px] font-black uppercase text-slate-400">Niche {index + 1}</div><div className="mt-1 text-sm font-black text-slate-900">{track.niche_name}</div><div className="mt-1 text-[10px] font-bold text-slate-500">{track.active ? 'Active' : 'Hidden'} · Pass {track.passing_score}%</div></button>)}</aside>
      <section className="space-y-6">
        {error && <Notice danger>{error}</Notice>}{message && <Notice>{message}</Notice>}
        {!selected ? <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-500">No niche tracks found.</div> : <>
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-2 text-[#000080]"><ShieldCheck className="h-5 w-5" /><span className="font-black">Track settings</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Niche name"><input className={inputClass} value={selected.niche_name} onChange={e => updateSelected({ niche_name: e.target.value })} /></Field><Field label="Stable system slug"><input className={`${inputClass} bg-slate-100 text-slate-500`} value={selected.slug} readOnly /></Field><Field label="Passing score"><input type="number" min={1} max={100} className={inputClass} value={selected.passing_score} onChange={e => updateSelected({ passing_score: Number(e.target.value) })} /></Field><Field label="Sort order"><input type="number" className={inputClass} value={selected.sort_order} onChange={e => updateSelected({ sort_order: Number(e.target.value) })} /></Field></div><Field label="Seller-facing summary"><textarea rows={4} className={`${inputClass} mt-2`} value={selected.summary} onChange={e => updateSelected({ summary: e.target.value })} /></Field><div className="mt-4 flex flex-wrap gap-5 text-xs font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={selected.active} onChange={e => updateSelected({ active: e.target.checked })} /> Active</label><label className="flex items-center gap-2"><input type="checkbox" checked={selected.required} onChange={e => updateSelected({ required: e.target.checked })} /> Required</label></div></div>
          <PromptEditor title="Pre-training fluency survey" subtitle="Unscored baseline questions sellers answer before training." prompts={selected.pre_survey_questions} onAdd={() => addPrompt('pre_survey_questions')} onChange={(i, v) => updatePrompt('pre_survey_questions', i, v)} onRemove={i => removePrompt('pre_survey_questions', i)} />
          <PromptEditor title="Business diagnostic exercise" subtitle="Open-response prompts that force sellers to diagnose before certification." prompts={selected.diagnostic_questions} onAdd={() => addPrompt('diagnostic_questions')} onChange={(i, v) => updatePrompt('diagnostic_questions', i, v)} onRemove={i => removePrompt('diagnostic_questions', i)} />

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-black">Certification assessment</h2><p className="mt-1 text-xs text-slate-500">{questions.filter(q => q.active).length} active questions · {questions.filter(q => q.active && q.critical).length} critical. Correct answers stay Admin-only; learner scoring remains server-side.</p></div><button onClick={() => void addQuestion()} disabled={busy} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Plus className="h-3.5 w-3.5" /> Add Question</button></div>
            <div className="mt-5 space-y-3">{questions.map((question, index) => <div key={question.id} className="rounded-2xl border border-slate-200 bg-slate-50"><button type="button" onClick={() => setExpandedQuestion(expandedQuestion === question.id ? null : question.id)} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Question {index + 1} · {question.assessment_section || 'knowledge'} {question.critical ? '· CRITICAL' : ''}</div><div className="mt-1 text-xs font-bold text-slate-800">{question.prompt}</div></div>{expandedQuestion === question.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button>{expandedQuestion === question.id && <div className="space-y-4 border-t border-slate-200 bg-white p-4"><Field label="Question"><textarea rows={3} className={inputClass} value={question.prompt} onChange={e => updateQuestion(question.id, { prompt: e.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-2">{question.options.map((option, optionIndex) => <div key={optionIndex} className="rounded-xl border border-slate-200 p-3"><label className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase text-slate-500"><input type="radio" name={`correct-${question.id}`} checked={question.correct_index === optionIndex} onChange={() => updateQuestion(question.id, { correct_index: optionIndex })} /> Correct answer</label><input className={inputClass} value={option} onChange={e => updateOption(question.id, optionIndex, e.target.value)} /></div>)}</div><Field label="Explanation shown after submission"><textarea rows={2} className={inputClass} value={question.explanation || ''} onChange={e => updateQuestion(question.id, { explanation: e.target.value })} /></Field><div className="grid gap-3 sm:grid-cols-3"><Field label="Section"><select className={inputClass} value={question.assessment_section || 'knowledge'} onChange={e => updateQuestion(question.id, { assessment_section: e.target.value })}><option value="knowledge">Knowledge</option><option value="scenario">Scenario</option><option value="recommendation">Recommendation</option></select></Field><Field label="Case key"><input className={inputClass} value={question.case_key || ''} onChange={e => updateQuestion(question.id, { case_key: e.target.value })} /></Field><Field label="Order"><input type="number" className={inputClass} value={question.sort_order} onChange={e => updateQuestion(question.id, { sort_order: Number(e.target.value) })} /></Field></div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-4 text-xs font-bold"><label className="flex items-center gap-2"><input type="checkbox" checked={question.active} onChange={e => updateQuestion(question.id, { active: e.target.checked })} /> Active</label><label className="flex items-center gap-2 text-red-700"><input type="checkbox" checked={!!question.critical} onChange={e => updateQuestion(question.id, { critical: e.target.checked })} /> Critical — must be correct</label></div><div className="flex gap-2"><button onClick={() => void deleteQuestion(question)} disabled={busy} className="rounded-xl border border-red-200 p-2.5 text-red-600"><Trash2 className="h-4 w-4" /></button><button onClick={() => void saveQuestion(question)} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white"><Save className="h-4 w-4" /> Save Question</button></div></div></div>}</div>)}</div>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-xs leading-5 text-blue-900"><strong>Lesson bodies:</strong> edit Module 4 lessons in Curriculum & Module Editor. This page controls niche track settings, surveys, diagnostics and certification questions. The system slug is intentionally protected because it binds lessons, assessments and progress.</div>
          <div className="flex justify-end"><button onClick={() => void save()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Niche Track</button></div>
        </>}
      </section>
    </main>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span><div className="mt-2">{children}</div></label>; }
function PromptEditor({ title, subtitle, prompts, onAdd, onChange, onRemove }: { title: string; subtitle: string; prompts: string[]; onAdd: () => void; onChange: (index: number, value: string) => void; onRemove: (index: number) => void }) { return <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-black">{title}</h2><p className="mt-1 text-xs text-slate-500">{subtitle}</p></div><button onClick={onAdd} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Plus className="h-3.5 w-3.5" /> Add</button></div><div className="mt-5 space-y-3">{prompts.map((prompt, index) => <div key={index} className="flex items-start gap-2"><span className="mt-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-black">{index + 1}</span><textarea rows={2} value={prompt} onChange={e => onChange(index, e.target.value)} className={inputClass} /><button onClick={() => onRemove(index)} className="mt-1 rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>)}</div></div>; }
function Notice({ danger = false, children }: { danger?: boolean; children: React.ReactNode }) { return <div className={`rounded-2xl border px-4 py-3 text-sm font-medium ${danger ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>{children}</div>; }
