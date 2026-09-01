import React, { useEffect, useRef, useState } from 'react';
import {
  Mail, MessageSquare, RefreshCw, Search, Send, Shield, StickyNote,
  User, UserCheck, Users, Volume2, X
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { ChatConversation, ChatMessage, SalesRep } from '../../types';
import {
  getConversations, getChatMessages, sendChatMessage,
  updateConversationStatus, getSalesReps, playChatChime
} from '../../lib/chatService';
import { professionalMailService } from '../../lib/professionalMailService';

function replySubject(subject: unknown, customerName: string) {
  const clean = String(subject || '').trim();
  if (/^re\s*:/i.test(clean)) return clean.slice(0, 180);
  return `Re: ${clean || customerName}`.slice(0, 180);
}

export default function SalesChatInbox() {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedConversationId = searchParams.get('conversation') || '';

  const isSalesUser = ['sales', 'sales_rep', 'sales_team'].includes(role || '');
  const isAdmin = role === 'admin';
  const isAuthorized = isSalesUser || isAdmin;

  const [activeTab, setActiveTab] = useState<'my_clients' | 'all_chats' | 'resolved'>('my_clients');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [emailError, setEmailError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const syncProfessionalInbox = async (silent = true) => {
    if (!isAuthorized || emailSyncing) return false;
    setEmailSyncing(true);
    if (!silent) setEmailError('');
    try {
      const status = await professionalMailService.getMyStatus();
      if (!status.sendConnected) return false;
      await professionalMailService.syncInbox();
      return true;
    } catch (error: any) {
      if (!silent) setEmailError(error?.message || 'Professional inbox could not be synchronized.');
      return false;
    } finally {
      setEmailSyncing(false);
    }
  };

  const loadData = async (syncMail = false) => {
    setLoading(true);
    try {
      if (syncMail) await syncProfessionalInbox(true);
      const [convs, reps] = await Promise.all([getConversations(), getSalesReps()]);
      setConversations(convs);
      setSalesReps(reps);

      const requested = requestedConversationId ? convs.find(conv => conv.id === requestedConversationId) : null;
      const current = selectedConv ? convs.find(conv => conv.id === selectedConv.id) : null;
      const target = requested || current || convs[0] || null;
      if (target) {
        setSelectedConv(target);
        setMessages(await getChatMessages(target.id));
        if (target.status === 'resolved') setActiveTab('resolved');
        else if (requested) setActiveTab('my_clients');
      } else {
        setSelectedConv(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Error loading sales inbox:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshDataSilent = async () => {
    try {
      const convs = await getConversations();
      setConversations(convs);
      if (selectedConv) {
        const current = convs.find(conv => conv.id === selectedConv.id) || selectedConv;
        setSelectedConv(current);
        setMessages(await getChatMessages(current.id));
      }
    } catch {
      // Silent refresh intentionally leaves the current inbox visible.
    }
  };

  const refreshAll = async () => {
    setEmailError('');
    await syncProfessionalInbox(false);
    await loadData(false);
  };

  useEffect(() => {
    if (isAuthorized) void loadData(true);
  }, [role, user?.email, requestedConversationId]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isAuthorized) interval = setInterval(() => { void refreshDataSilent(); }, 3500);
    return () => { if (interval) clearInterval(interval); };
  }, [isAuthorized, selectedConv?.id]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isAuthorized) {
      interval = setInterval(() => {
        void (async () => {
          const changed = await syncProfessionalInbox(true);
          if (changed) await refreshDataSilent();
        })();
      }, 60000);
    }
    return () => { if (interval) clearInterval(interval); };
  }, [isAuthorized, selectedConv?.id]);

  const handleSelectConversation = async (conv: ChatConversation) => {
    setSelectedConv(conv);
    setMessages(await getChatMessages(conv.id));
    setEmailError('');
  };

  const latestExternalMessage = [...messages].reverse().find(message => !message.isInternalNote && message.senderType !== 'system') as any;
  const selectedMeta = (selectedConv || {}) as any;
  const replyByEmail = !isInternalNote && Boolean(latestExternalMessage?.channel === 'email' || selectedMeta.conversationKind === 'email');

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConv || sending) return;
    setSending(true);
    setEmailError('');
    try {
      const repName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Sales Representative';
      if (isInternalNote) {
        await sendChatMessage({
          conversationId: selectedConv.id,
          senderType: 'sales_rep',
          senderName: repName,
          senderId: user?.id,
          messageText: replyText.trim(),
          isInternalNote: true
        });
      } else if (replyByEmail) {
        const leadId = String((selectedConv as any).crmLeadId || '');
        if (!leadId) throw new Error('This email conversation is not linked to a CRM lead. Ask a manager to review the customer assignment before replying.');
        const status = await professionalMailService.getMyStatus();
        if (!status.sendConnected) throw new Error('Connect your Professional Email in My Profile before replying to customer email.');
        await professionalMailService.sendLeadEmail({
          leadId,
          subject: replySubject(latestExternalMessage?.subject, selectedConv.customerName),
          body: replyText.trim(),
          idempotencyKey: crypto.randomUUID(),
        });
      } else {
        await sendChatMessage({
          conversationId: selectedConv.id,
          senderType: 'sales_rep',
          senderName: repName,
          senderId: user?.id,
          messageText: replyText.trim(),
          isInternalNote: false
        });
      }

      setReplyText('');
      setMessages(await getChatMessages(selectedConv.id));
      const convs = await getConversations();
      setConversations(convs);
      const current = convs.find(conv => conv.id === selectedConv.id);
      if (current) setSelectedConv(current);
    } catch (error: any) {
      console.error('Failed sending reply:', error);
      setEmailError(error?.message || 'Customer reply could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: 'open' | 'pending' | 'resolved') => {
    if (!selectedConv) return;
    await updateConversationStatus(selectedConv.id, newStatus);
    setSelectedConv({ ...selectedConv, status: newStatus });
    void refreshDataSilent();
  };

  const handleCannedResponse = (text: string) => setReplyText(text);

  const filteredConversations = conversations.filter(c => {
    const meta = c as any;
    const matchesSearch =
      c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase())) ||
      String(meta.quotationNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    if (activeTab === 'resolved') return c.status === 'resolved';
    if (activeTab === 'my_clients') return c.status !== 'resolved';
    return c.status !== 'resolved';
  });

  if (!isAuthorized) {
    return <div className="flex min-h-[500px] flex-col items-center justify-center space-y-4 rounded-2xl border border-red-200 bg-white p-8 text-center">
      <div className="rounded-full bg-red-100 p-4 text-red-700"><Shield className="h-10 w-10" /></div>
      <div><h2 className="text-lg font-bold text-slate-900">Access Restricted</h2><p className="mt-1 max-w-md text-xs text-slate-500">The Sales Inbox is reserved for authorized Sales Representative accounts and Administrators. Delivery specialists cannot view client leads.</p></div>
    </div>;
  }

  return <div className="flex h-[82vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-[#000080] p-2.5 text-white shadow-sm"><MessageSquare className="h-5 w-5" /></div>
        <div>
          <div className="flex items-center gap-2"><h2 className="text-base font-bold text-slate-900">Sales Customer Inbox</h2><span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-[#000080]"><Shield className="h-3 w-3" /> Sales & Support Privileged</span></div>
          <p className="text-xs text-slate-500">Website chat, quotation messages and matched professional customer email in one seller workspace.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setShowTeamModal(true)} className="flex items-center gap-1.5 rounded-xl bg-[#000080] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#000066]"><Users className="h-4 w-4" /> Verified Sales Team ({salesReps.length})</button>
        <button onClick={playChatChime} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100" title="Test Chime Sound"><Volume2 className="h-4 w-4 text-[#000080]" /> Test Chime</button>
        <button onClick={() => void refreshAll()} disabled={loading || emailSyncing} className="rounded-xl p-2 text-slate-600 transition-all hover:bg-slate-200/60 hover:text-[#000080] disabled:opacity-50" title="Refresh chat and professional email"><RefreshCw className={`h-4 w-4 ${loading || emailSyncing ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>

    {emailError && <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-700">{emailError}</div>}

    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-80 flex-col border-r border-slate-200 bg-slate-50/50 sm:w-96">
        <div className="space-y-2.5 border-b border-slate-200 bg-white p-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            <button onClick={() => setActiveTab('my_clients')} className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${activeTab === 'my_clients' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Active Leads ({conversations.filter(c => c.status !== 'resolved').length})</button>
            <button onClick={() => setActiveTab('resolved')} className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition-all ${activeTab === 'resolved' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Archive ({conversations.filter(c => c.status === 'resolved').length})</button>
          </div>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search name, email, quotation, text..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs font-medium focus:border-[#000080] focus:outline-none" /></div>
        </div>

        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {filteredConversations.length === 0 ? <div className="p-8 text-center text-xs text-slate-400">No active sales conversations found.</div> : filteredConversations.map(conv => {
            const meta = conv as any;
            const isSelected = selectedConv?.id === conv.id;
            const origRep = salesReps.find(rep => rep.id === conv.originalSalesId);
            const quotationConversation = meta.conversationKind === 'quotation';
            const emailConversation = meta.conversationKind === 'email' || String(conv.lastMessage || '').startsWith('Email:');
            return <div key={conv.id} onClick={() => void handleSelectConversation(conv)} className={`relative cursor-pointer p-4 transition-all hover:bg-white ${isSelected ? 'border-l-4 border-l-[#000080] bg-white shadow-sm' : 'bg-transparent'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h4 className="truncate text-xs font-bold text-slate-900">{conv.customerName}</h4>{quotationConversation ? <span className="shrink-0 rounded border border-violet-200 bg-violet-100 px-1.5 py-0.5 text-[9px] font-bold text-violet-800">Quotation {meta.quotationNumber || ''}</span> : emailConversation ? <span className="flex shrink-0 items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-700"><Mail className="h-2.5 w-2.5" />Email</span> : conv.intent === 'existing_issue' ? <span className="shrink-0 rounded border border-emerald-200 bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-800">Existing</span> : <span className="shrink-0 rounded border border-blue-200 bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-800">New Lead</span>}</div><p className="mt-0.5 truncate text-[11px] text-slate-500">{conv.customerEmail}</p></div>
                <span className="shrink-0 text-[9px] font-medium text-slate-400">{conv.lastMessageTime ? new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-normal text-slate-600">{conv.lastMessage || 'Conversation started'}</p>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400"><span className="flex items-center gap-1 text-slate-500"><UserCheck className="h-3 w-3 text-[#000080]" /> Seller: {origRep?.name || 'Assigned Rep'}</span>{conv.ratingGiven && <span className="font-bold text-amber-600">★ {conv.ratingGiven}/5</span>}</div>
            </div>;
          })}
        </div>
      </div>

      {selectedConv ? <div className="flex h-full flex-1 flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-[#000080]/10 p-2 text-[#000080]"><User className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-slate-900">{selectedConv.customerName}</h3><span className="text-xs text-slate-500">({selectedConv.customerEmail})</span>{(selectedConv as any).conversationKind === 'quotation' && <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-black uppercase text-violet-700">Quotation {(selectedConv as any).quotationNumber}</span>}{replyByEmail && <span className="flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] font-black uppercase text-sky-700"><Mail className="h-3 w-3" />Professional Email</span>}</div><p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500"><span>Assigned Salesperson: <strong className="text-slate-800">{salesReps.find(rep => rep.id === selectedConv.originalSalesId)?.name || 'Default Sales'}</strong></span></p></div></div>
          <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">Status:</span><select value={selectedConv.status} onChange={e => void handleStatusChange(e.target.value as any)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-800 focus:border-[#000080] focus:outline-none"><option value="open">🟢 Open / Active</option><option value="pending">🟡 Pending Customer</option><option value="resolved">✅ Resolved / Archive</option></select></div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-6">
          {messages.map(message => {
            const meta = message as any;
            if (message.senderType === 'system') return <div key={message.id} className="my-2 text-center"><span className="inline-block rounded-full bg-slate-200 px-3 py-1 text-[10px] font-bold text-slate-700">{message.messageText}</span></div>;
            if (message.isInternalNote) return <div key={message.id} className="space-y-1 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm"><div className="flex items-center justify-between text-[10px] font-bold text-amber-800"><span className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5 text-amber-600" /> Internal Sales Note (Hidden from Customer)</span><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><p className="whitespace-pre-wrap font-medium">{message.messageText}</p></div>;
            const isCustomer = message.senderType === 'customer';
            const isEmail = meta.channel === 'email';
            return <div key={message.id} className={`flex gap-3 ${isCustomer ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[75%] rounded-2xl p-4 text-xs shadow-sm ${isCustomer ? 'rounded-tl-none border border-slate-200 bg-white text-slate-900' : 'rounded-tr-none bg-[#000080] text-white'}`}><div className="mb-1 flex items-center justify-between gap-4 text-[10px] opacity-70"><span className="flex items-center gap-1 font-bold">{isEmail && <Mail className="h-3 w-3" />}{message.senderName}{isEmail ? ' · Email' : ''}</span><span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>{isEmail && meta.subject && <div className={`mb-2 text-[10px] font-black ${isCustomer ? 'text-slate-500' : 'text-white/75'}`}>Subject: {meta.subject}</div>}<p className="whitespace-pre-wrap font-medium leading-relaxed">{message.messageText}</p></div></div>;
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2 no-scrollbar"><span className="shrink-0 text-[10px] font-bold text-slate-400">Quick Templates:</span><button type="button" onClick={() => handleCannedResponse('Hello! Thank you for reaching out to Profox web designer. How can I assist you with your web project today?')} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200">👋 Welcome Greeting</button><button type="button" onClick={() => handleCannedResponse('We offer custom web design, e-commerce solutions, and enterprise software development. Would you like a custom quote or package recommendation?')} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200">💼 Package Overview</button><button type="button" onClick={() => handleCannedResponse("I've shared your requirements with our design team. We'll have a preliminary project roadmap ready for you shortly.")} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200">🎨 Draft Update</button></div>

        <div className="space-y-2 border-t border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between"><button type="button" onClick={() => setIsInternalNote(!isInternalNote)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all ${isInternalNote ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><StickyNote className="h-3.5 w-3.5" /><span>{isInternalNote ? 'Internal Note Active (Yellow)' : replyByEmail ? 'Professional Email Reply' : 'Website Chat Reply'}</span></button>{!isInternalNote && <span className="text-[10px] font-bold text-slate-400">{replyByEmail ? 'Sends through your connected professional Zoho mailbox' : 'Replies in the customer chat'}</span>}</div>
          <div className="flex items-center gap-2"><textarea rows={2} placeholder={isInternalNote ? 'Type internal note for sales team...' : replyByEmail ? 'Type professional email reply...' : 'Type message to customer...'} value={replyText} onChange={e => setReplyText(e.target.value)} className={`flex-1 rounded-xl border p-3 text-xs font-medium focus:outline-none ${isInternalNote ? 'border-amber-300 bg-amber-50/80 text-amber-950 focus:border-amber-500' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-[#000080]'}`} /><button onClick={() => void handleSendReply()} disabled={!replyText.trim() || sending} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold shadow-md transition-all disabled:opacity-50 ${isInternalNote ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'bg-[#000080] text-white hover:bg-[#000080]/90'}`}><Send className="h-4 w-4" /><span>{sending ? 'Sending…' : isInternalNote ? 'Save note' : replyByEmail ? 'Send email' : 'Send chat'}</span></button></div>
        </div>
      </div> : <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 text-slate-400"><MessageSquare className="mb-2 h-12 w-12 text-slate-300" /><p className="text-sm font-bold text-slate-700">Select a conversation</p><p className="mt-0.5 text-xs text-slate-400">Pick a customer conversation from the left column to reply.</p></div>}
    </div>

    {showTeamModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 pb-4"><div className="flex items-center gap-2.5"><div className="rounded-xl bg-[#000080] p-2 text-white"><Users className="h-5 w-5" /></div><div><h3 className="text-base font-bold text-slate-900">Verified Sales Representatives</h3><p className="text-xs text-slate-500">Only active, onboarded employee accounts can receive website chats and CRM leads.</p></div></div><button type="button" onClick={() => setShowTeamModal(false)} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"><X className="h-5 w-5" /></button></div><div className="flex-1 space-y-4 overflow-y-auto py-4"><div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">Add, activate, qualify, or deactivate sellers in <strong>Team &amp; Users</strong>. The customer directory follows those verified employee records automatically.</div><div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">{salesReps.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">No active, onboarded sales representative is currently available.</div> : salesReps.map((rep, repIdx) => <div key={`${rep.id || 'rep'}_${repIdx}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-slate-50">{rep.avatar ? <img src={rep.avatar} alt={rep.name} className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-slate-100" /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#000080]/10 text-xs font-black text-[#000080]">{rep.name.slice(0, 2).toUpperCase()}</div>}<div className="min-w-0"><div className="flex items-center gap-2"><h4 className="truncate text-xs font-bold text-slate-900">{rep.name}</h4><span className={`h-2 w-2 rounded-full ${rep.isOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} /></div><p className="mt-0.5 truncate text-[11px] text-slate-500">{rep.title}</p><div className="mt-1.5 flex flex-wrap gap-1">{rep.specialties.map((specialty, index) => <span key={`${specialty}_${index}`} className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-600">{specialty}</span>)}</div></div></div>)}</div></div></div></div>}
  </div>;
}
