import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardList, FileText, Loader2, MessageSquareText, RefreshCw, Send, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { touchClientPortalConversation } from '../../lib/chatService';
import {
  deleteCommunicationAttachment,
  uploadClientPortalSalesAttachment,
  type UploadedCommunicationAttachment,
} from '../../lib/communicationAttachmentService';
import CommunicationAttachmentList from '../communication/CommunicationAttachmentList';
import CommunicationComposerTools from '../communication/CommunicationComposerTools';
import RichMessageText from '../communication/RichMessageText';
import ClientProjectChat from './ClientProjectChat';

function money(value: unknown, currency = 'USD') {
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0)); }
  catch { return `${currency} ${Number(value || 0).toFixed(2)}`; }
}

export default function ClientRelationshipHistory() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [reply, setReply] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const load = async (quiet = false) => {
    if (!quiet) setLoading(true);
    let response = await supabase.rpc('client_get_relationship_history_v2');
    if (response.error && /client_get_relationship_history_v2|function .* does not exist/i.test(response.error.message || '')) {
      response = await supabase.rpc('client_get_relationship_history');
    }
    const { data: result, error: rpcError } = response;
    if (rpcError) setError(rpcError.message || 'Relationship history could not be loaded.');
    else {
      setData(result || null);
      setError('');
      const conversations = Array.isArray(result?.conversations) ? result.conversations : [];
      setSelectedConversationId(current => conversations.some((item: any) => item.id === current) ? current : conversations[0]?.id || '');
    }
    if (!quiet) setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const conversations = Array.isArray(data?.conversations) ? data.conversations : [];
  const quotations = Array.isArray(data?.quotations) ? data.quotations : [];
  const payments = Array.isArray(data?.payments) ? data.payments : [];
  const projects = Array.isArray(data?.projects) ? data.projects : [];
  const onboardings = Array.isArray(data?.onboardings) ? data.onboardings : [];
  const selected = useMemo(() => conversations.find((item: any) => item.id === selectedConversationId) || null, [conversations, selectedConversationId]);

  useEffect(() => {
    setPendingFiles([]);
    setReply('');
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;
    const touch = () => {
      if (document.visibilityState !== 'visible') return;
      void touchClientPortalConversation(selectedConversationId).catch(() => undefined);
    };
    touch();
    const interval = window.setInterval(touch, 30000);
    const onVisibility = () => { if (document.visibilityState === 'visible') touch(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [selectedConversationId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 6000);
    return () => window.clearInterval(interval);
  }, []);

  const sendReply = async () => {
    if (!selected || (!reply.trim() && pendingFiles.length === 0) || sending) return;
    setSending(true);
    setError('');
    const uploaded: UploadedCommunicationAttachment[] = [];
    try {
      for (const file of pendingFiles) uploaded.push(await uploadClientPortalSalesAttachment({ conversationId: selected.id, file }));
      const { error: sendError } = await supabase.rpc('client_portal_send_conversation_message_with_attachments', {
        p_conversation_id: selected.id,
        p_message: reply.trim(),
        p_attachment_ids: uploaded.map(item => item.id),
      });
      if (sendError) throw sendError;
      setReply('');
      setPendingFiles([]);
      await load(true);
    } catch (sendError: any) {
      if (uploaded.length) await Promise.allSettled(uploaded.map(attachment => deleteCommunicationAttachment({ attachment })));
      setError(sendError?.message || 'Your message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="flex min-h-[220px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div>;

  return <section className="space-y-5">
    <div className="flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#000080]"><ShieldCheck className="h-4 w-4" />Permanent Relationship History</div><h2 className="mt-2 text-xl font-black text-slate-900">Your ProFox history stays with you</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">Conversations, customer-facing files, onboarding submissions, quotations, payments and projects remain connected to your verified account from the first enquiry onward.</p>{data?.identity?.email && <p className="mt-2 text-[11px] font-semibold text-slate-500">Verified relationship: {data.identity.email} · {data.identity.relationshipStatus === 'client' ? 'Client' : 'Prospect'}</p>}</div><button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw className="h-4 w-4" />Refresh</button></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Metric label="Conversations" value={String(conversations.length)} /><Metric label="Onboardings" value={String(onboardings.length)} /><Metric label="Quotations" value={String(quotations.length)} /><Metric label="Payments" value={String(payments.length)} /><Metric label="Projects" value={String(projects.length)} /></div>

    <ClientProjectChat />

    <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-5"><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><MessageSquareText className="h-4 w-4 text-[#000080]" />Sales & relationship conversations</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">The customer-facing conversation and its files continue here after your project becomes active.</p></div><div className="max-h-[520px] overflow-y-auto">{conversations.length === 0 ? <div className="p-8 text-center text-xs text-slate-400">No saved conversations yet.</div> : conversations.map((conversation: any) => <button key={conversation.id} type="button" onClick={() => setSelectedConversationId(conversation.id)} className={`block w-full border-b border-slate-100 p-4 text-left transition-colors ${selectedConversationId === conversation.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black text-slate-900">{conversation.quotationNumber ? `Quotation ${conversation.quotationNumber}` : 'Sales conversation'}</span><span className="text-[9px] font-black uppercase text-slate-400">{conversation.status}</span></div><p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">{conversation.lastMessage || 'Conversation started'}</p><p className="mt-2 text-[9px] text-slate-400">{conversation.lastMessageTime ? new Date(conversation.lastMessageTime).toLocaleString() : ''}</p></button>)}</div></div>
      <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">{!selected ? <div className="flex min-h-[420px] items-center justify-center p-8 text-center text-xs text-slate-400">Select a conversation to view its permanent history.</div> : <><div className="border-b border-slate-200 bg-slate-50 p-5"><div className="text-sm font-black text-slate-900">{selected.quotationNumber ? `Quotation ${selected.quotationNumber}` : 'ProFox conversation'}</div><div className="mt-1 text-[11px] text-slate-500">Representative: {selected.sellerName || 'ProFox representative'}</div></div><div className="max-h-[420px] min-h-[280px] space-y-3 overflow-y-auto bg-slate-50/50 p-5">{(selected.messages || []).map((message: any) => { if (message.senderType === 'system') return <div key={message.id} className="text-center text-[10px] font-semibold text-slate-400">{message.messageText}</div>; const mine = message.senderType === 'customer'; return <div key={`${message.channel || 'chat'}-${message.id}`} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-800'}`}><div className={`text-[9px] font-black ${mine ? 'text-blue-200' : 'text-[#000080]'}`}>{mine ? 'You' : message.senderName || 'ProFox'}{message.channel ? ` · ${String(message.channel).toUpperCase()}` : ''}</div>{message.subject && <div className={`mt-1 text-[10px] font-black ${mine ? 'text-white/75' : 'text-slate-500'}`}>Subject: {message.subject}</div>}<div className="mt-1 text-sm leading-6"><RichMessageText text={message.messageText || ''} inverse={mine} /></div><CommunicationAttachmentList attachments={Array.isArray(message.attachments) ? message.attachments : []} inverse={mine} /><div className={`mt-1 text-[9px] ${mine ? 'text-blue-200' : 'text-slate-400'}`}>{new Date(message.createdAt).toLocaleString()}</div></div></div>; })}</div><div className="space-y-2 border-t border-slate-200 p-5"><CommunicationComposerTools files={pendingFiles} onFilesChange={setPendingFiles} text={reply} onTextChange={setReply} disabled={sending} /><textarea rows={3} maxLength={4000} value={reply} onChange={event => setReply(event.target.value)} placeholder="Continue this conversation..." className="w-full resize-none rounded-2xl border border-slate-200 p-3 text-sm outline-none focus:border-[#000080]"/><div className="flex items-center justify-between gap-3"><span className="text-[9px] text-slate-400">Customer-facing files are stored privately in ProFox R2.</span><button type="button" disabled={sending || (!reply.trim() && pendingFiles.length === 0)} onClick={() => void sendReply()} className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send Message</button></div></div></>}</div>
    </div>

    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><ClipboardList className="h-4 w-4 text-[#000080]" />Client Onboarding History</h3><p className="mt-1 text-xs leading-5 text-slate-500">Your submitted onboarding information remains attached to the project it was provided for.</p><div className="mt-4 space-y-4">{onboardings.length === 0 ? <p className="text-xs text-slate-400">No onboarding submission is available yet.</p> : onboardings.map((onboarding: any) => <details key={onboarding.id} className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50"><summary className="cursor-pointer list-none p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-black text-slate-900">{onboarding.projectNumber} · {onboarding.projectName}</div><div className="mt-1 text-[10px] text-slate-400">{onboarding.completedAt ? `Completed ${new Date(onboarding.completedAt).toLocaleString()}` : onboarding.status}</div></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${onboarding.status === 'Completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{onboarding.status}</span></div></summary><div className="grid gap-3 border-t border-slate-200 bg-white p-4 md:grid-cols-2">{(onboarding.fields || []).map((field: any) => { const value = onboarding.responses?.[field.key]; if (value == null || String(value).trim() === '') return null; return <div key={field.key} className={field.type === 'textarea' ? 'md:col-span-2' : ''}><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{field.label || field.key}</div><div className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{String(value)}</div></div>; })}</div></details>)}</div></div>

    <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><FileText className="h-4 w-4 text-[#000080]" />Quotation History</h3><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{quotations.length === 0 ? <p className="text-xs text-slate-400">No customer-facing quotations yet.</p> : quotations.map((quotation: any) => <div key={quotation.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-black text-slate-900">{quotation.quotationNumber}</span><span className="rounded-full bg-white px-2 py-1 text-[9px] font-black uppercase text-[#000080]">{quotation.status}</span></div><div className="mt-2 text-lg font-black text-slate-900">{money(quotation.total, quotation.currency)}</div><div className="mt-1 text-[10px] text-slate-400">Revision {quotation.revisionNumber || 1}{quotation.isSuperseded ? ' · Superseded' : ''}</div></div>)}</div></div>
  </section>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-xl font-black text-slate-900">{value}</div></div>; }
