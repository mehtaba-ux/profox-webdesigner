import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, Loader2, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { BookingQualificationQuestion, PublicBookingSettings, bookingService } from '../../lib/bookingService';

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-[#000080] focus:ring-4 focus:ring-blue-100';

const fallback: PublicBookingSettings = {
  active: true,
  pageTitle: 'Book a strategy call',
  pageSubtitle: 'Choose the ProFox specialist who best matches your business and select an available time.',
  confirmationMessage: 'Your meeting is confirmed.',
  maxAdvanceDays: 60,
  slotIntervalMinutes: 15,
  maxBookingsPerEmailPerDay: 3,
  requirePrivacyConsent: true,
  privacyConsentText: 'I agree that ProFox may process this meeting request under the',
  qualificationQuestions: []
};

export default function PublicBookingSettingsAdmin() {
  const navigate = useNavigate();
  const { user, isAdmin, loading: authLoading } = useAuth();
  const [form, setForm] = useState<PublicBookingSettings>(fallback);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user || !isAdmin) { setLoading(false); return; }
    void (async () => {
      try { setForm(await bookingService.getAdminSettings()); }
      catch (err: any) { setError(err?.message || 'Unable to load public booking settings.'); }
      finally { setLoading(false); }
    })();
  }, [authLoading,user?.id,isAdmin]);

  const save = async () => {
    setSaving(true); setError(''); setMessage('');
    try {
      if (!form.pageTitle.trim()) throw new Error('Booking page title is required.');
      if (!form.pageSubtitle.trim()) throw new Error('Booking page subtitle is required.');
      for (const question of form.qualificationQuestions) {
        if (!question.label.trim()) throw new Error('Every qualification question needs a label.');
        if (question.type==='select' && !(question.options || []).filter(Boolean).length) throw new Error(`Add at least one option for “${question.label}”.`);
      }
      setForm(await bookingService.saveAdminSettings(form));
      setMessage('Public booking settings saved and audited.');
    } catch (err: any) { setError(err?.message || 'Public booking settings could not be saved.'); }
    finally { setSaving(false); }
  };

  const addQuestion = () => {
    const next: BookingQualificationQuestion = { id:`question_${form.qualificationQuestions.length+1}`,label:'',type:'text',required:false,placeholder:'',options:[] };
    setForm({...form,qualificationQuestions:[...form.qualificationQuestions,next]});
  };

  const updateQuestion = (index:number, updates:Partial<BookingQualificationQuestion>) => {
    const rows=[...form.qualificationQuestions]; rows[index]={...rows[index],...updates}; setForm({...form,qualificationQuestions:rows});
  };

  const removeQuestion = (index:number) => setForm({...form,qualificationQuestions:form.qualificationQuestions.filter((_,i)=>i!==index)});

  if (authLoading || loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#000080]"/></div>;
  if (!user || !isAdmin) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="max-w-md rounded-3xl border border-amber-200 bg-white p-8 text-center"><ShieldCheck className="mx-auto h-9 w-9 text-amber-500"/><h1 className="mt-4 text-xl font-black">Admin access required</h1><button onClick={()=>navigate('/admin/workspace')} className="mt-5 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-bold text-white">Back to Workspace</button></div></div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur-xl sm:px-8"><div className="mx-auto flex max-w-6xl items-center justify-between gap-4"><div className="flex items-center gap-3"><button onClick={()=>navigate('/admin/app/settings?tab=configuration')} className="rounded-xl border border-slate-200 p-2 hover:bg-slate-50"><ArrowLeft className="h-4 w-4"/></button><div><h1 className="text-xl font-black">Public Booking Settings</h1><p className="text-xs text-slate-500">Control the visitor flow, qualification questions and booking policy without editing code.</p></div></div><button onClick={()=>window.open('/book-a-meeting','_blank','noopener,noreferrer')} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><ExternalLink className="h-4 w-4"/> Preview</button></div></header>
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-8">
      {error&&<div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
      {message&&<div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</div>}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="mb-6"><h2 className="font-black">Booking page & policy</h2><p className="mt-1 text-xs text-slate-500">These settings apply to every public seller booking page.</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Booking status"><select value={form.active?'active':'paused'} onChange={e=>setForm({...form,active:e.target.value==='active'})} className={inputClass}><option value="active">Public booking active</option><option value="paused">Pause all public booking</option></select></Field><Field label="Maximum advance booking"><input type="number" min={1} max={365} value={form.maxAdvanceDays} onChange={e=>setForm({...form,maxAdvanceDays:Number(e.target.value)})} className={inputClass}/></Field><Field label="Slot interval"><select value={form.slotIntervalMinutes} onChange={e=>setForm({...form,slotIntervalMinutes:Number(e.target.value)})} className={inputClass}>{[5,10,15,20,30,45,60].map(v=><option key={v} value={v}>{v} minutes</option>)}</select></Field><Field label="Max bookings per email / 24h"><input type="number" min={1} max={20} value={form.maxBookingsPerEmailPerDay} onChange={e=>setForm({...form,maxBookingsPerEmailPerDay:Number(e.target.value)})} className={inputClass}/></Field></div><div className="mt-4 space-y-4"><Field label="Page title"><input value={form.pageTitle} onChange={e=>setForm({...form,pageTitle:e.target.value})} className={inputClass}/></Field><Field label="Page subtitle"><textarea rows={3} value={form.pageSubtitle} onChange={e=>setForm({...form,pageSubtitle:e.target.value})} className={inputClass}/></Field><Field label="Confirmation message"><textarea rows={3} value={form.confirmationMessage} onChange={e=>setForm({...form,confirmationMessage:e.target.value})} className={inputClass}/></Field></div></section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="mb-6 flex items-center justify-between gap-4"><div><h2 className="font-black">Qualification questions</h2><p className="mt-1 text-xs text-slate-500">Ask only what helps the seller prepare. Required answers are validated again in the database.</p></div><button onClick={addQuestion} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black"><Plus className="h-4 w-4"/> Add question</button></div><div className="space-y-4">{form.qualificationQuestions.length===0?<div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-400">No custom qualification questions.</div>:form.qualificationQuestions.map((question,index)=><div key={`${question.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"><div className="grid gap-3 sm:grid-cols-[1fr,180px,130px,44px]"><input value={question.label} onChange={e=>updateQuestion(index,{label:e.target.value})} placeholder="Question label" className={inputClass}/><select value={question.type} onChange={e=>updateQuestion(index,{type:e.target.value as BookingQualificationQuestion['type']})} className={inputClass}><option value="text">Short text</option><option value="textarea">Long text</option><option value="select">Dropdown</option></select><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"><input type="checkbox" checked={question.required} onChange={e=>updateQuestion(index,{required:e.target.checked})}/> Required</label><button onClick={()=>removeQuestion(index)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600"><Trash2 className="h-4 w-4"/></button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><input value={question.id} onChange={e=>updateQuestion(index,{id:e.target.value})} placeholder="stable_question_id" className={inputClass}/><input value={question.placeholder||''} onChange={e=>updateQuestion(index,{placeholder:e.target.value})} placeholder="Helpful placeholder" className={inputClass}/></div>{question.type==='select'&&<input value={(question.options||[]).join(', ')} onChange={e=>updateQuestion(index,{options:e.target.value.split(',').map(v=>v.trim()).filter(Boolean)})} placeholder="Option 1, Option 2, Option 3" className={`${inputClass} mt-3`}/>}</div>)}</div></section>

      <div className="flex justify-end"><button disabled={saving} onClick={()=>void save()} className="flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-xs font-black text-white disabled:opacity-50">{saving?<Loader2 className="h-4 w-4 animate-spin"/>:<Save className="h-4 w-4"/>} Save public booking settings</button></div>
    </main>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}) { return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
