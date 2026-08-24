import React, { useEffect, useState } from 'react';
import { Check, CheckCircle2, FileText, Loader2, RotateCcw, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type ClientContentItem = {
  deliverableId: string;
  taskId: string;
  title: string;
  contentType: string;
  stage: string;
  versionNo: number;
  content: string;
  qualityStatus: string;
  updatedAt: string;
};

export default function ClientContentReviewPanel({ projectId, onDecision }: { projectId: string; onDecision?: () => void }) {
  const [items, setItems] = useState<ClientContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('get_client_content_review_items', { p_project_id: projectId });
    if (rpcError) setError('Content review items could not be loaded.');
    else setItems((data || []) as ClientContentItem[]);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [projectId]);

  const approve = async (item: ClientContentItem) => {
    setBusy(item.deliverableId);
    setError('');
    const { error: rpcError } = await supabase.rpc('client_approve_content_deliverable', {
      p_deliverable_id: item.deliverableId,
      p_notes: notes[item.deliverableId] || ''
    });
    if (rpcError) setError(rpcError.message || 'Approval could not be recorded.');
    else {
      setNotes(current => ({ ...current, [item.deliverableId]: '' }));
      await load();
      onDecision?.();
    }
    setBusy('');
  };

  const requestChanges = async (item: ClientContentItem) => {
    const note = (notes[item.deliverableId] || '').trim();
    if (!note) {
      setError('Please describe the requested changes so the team has one clear revision brief.');
      return;
    }
    setBusy(item.deliverableId);
    setError('');
    const { error: rpcError } = await supabase.rpc('client_request_content_changes', {
      p_deliverable_id: item.deliverableId,
      p_notes: note
    });
    if (rpcError) setError(rpcError.message || 'The change request could not be recorded.');
    else {
      setNotes(current => ({ ...current, [item.deliverableId]: '' }));
      await load();
      onDecision?.();
    }
    setBusy('');
  };

  if (loading) return <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin text-[#000080]" />Loading content prepared for review...</div>;
  if (items.length === 0) return null;

  return (
    <section className="rounded-[2rem] border border-blue-100 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3"><div className="rounded-2xl bg-blue-50 p-3 text-[#000080]"><FileText className="h-5 w-5" /></div><div><h2 className="text-lg font-black text-slate-900">Content prepared for your review</h2><p className="mt-1 text-sm leading-6 text-slate-500">Review the internally approved version. Approve it or send one consolidated change request; your decision is stored in the same ProFox client-approval ledger used by the project.</p></div></div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      <div className="mt-5 space-y-5">
        {items.map(item => <article key={item.deliverableId} className="overflow-hidden rounded-2xl border border-slate-200"><div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-slate-900">{item.title}</div><div className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{item.contentType} · Version {item.versionNo}</div></div><div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />Internal quality complete</div></div><div className="max-h-[520px] overflow-y-auto whitespace-pre-wrap p-5 text-sm leading-7 text-slate-700">{item.content}</div><div className="border-t border-slate-100 bg-white p-4"><textarea rows={3} value={notes[item.deliverableId] || ''} onChange={event => setNotes(current => ({ ...current, [item.deliverableId]: event.target.value }))} placeholder="Optional approval note, or required details when requesting changes..." className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-[#000080]" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy === item.deliverableId} onClick={() => void approve(item)} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">{busy === item.deliverableId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Approve Content</button><button type="button" disabled={busy === item.deliverableId} onClick={() => void requestChanges(item)} className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-800 disabled:opacity-50"><RotateCcw className="h-4 w-4" />Request Changes</button></div></div></article>)}
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-2xl bg-emerald-50 p-3 text-xs leading-5 text-emerald-800"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />Content approval does not change the whole project stage. It approves this exact deliverable and returns the result to the same project/workflow.</div>
    </section>
  );
}
