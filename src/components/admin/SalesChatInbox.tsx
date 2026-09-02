import React, { useEffect, useRef, useState } from 'react';
import {
  Mail, MessageSquare, RefreshCw, Search, Send, Shield, StickyNote,
  User, UserCheck, Users, Volume2, X
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import type { ChatMessage, SalesRep } from '../../types';
import { getSalesReps, playChatChime, sendChatMessage } from '../../lib/chatService';
import { professionalMailService } from '../../lib/professionalMailService';
import {
  getUnifiedCustomerConversations,
  getUnifiedCustomerTimeline,
  updateUnifiedCustomerStatus,
  type UnifiedCustomerConversation,
} from '../../lib/unifiedInboxService';

type ReplyMode = 'chat' | 'email' | 'note';

function replySubject(subject: unknown, customerName: string) {
  const clean = String(subject || '').trim();
  if (/^re\s*:/i.test(clean)) return clean.slice(0, 180);
  return `Re: ${clean || customerName}`.slice(0, 180);
}

function defaultReplyMode(conversation: UnifiedCustomerConversation, timeline: ChatMessage[]): ReplyMode {
  const latestExternal = [...timeline].reverse().find(message => !message.isInternalNote && message.senderType !== 'system') as any;
  if (latestExternal?.channel === 'email' && conversation.crmLeadId) return 'email';
  if (conversation.chatConversationId) return 'chat';
  if (conversation.crmLeadId) return 'email';
  return 'note';
}

export default function SalesChatInbox() {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedConversationId = searchParams.get('conversation') || '';

  const isSalesUser = ['sales', 'sales_rep', 'sales_team'].includes(role || '');
  const isAdmin = role === 'admin';
  const isAuthorized = isSalesUser || isAdmin;

  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<UnifiedCustomerConversation[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [selectedConv, setSelectedConv] = useState<UnifiedCustomerConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyMode, setReplyMode] = useState<ReplyMode>('chat');
  const [replyText, setReplyText] = useState('');
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const syncProfessionalInbox = async (silent = true) => {
    if (!isAuthorized || emailSyncing) return false;
    setEmailSyncing(true);
    if (!silent) setInboxError('');
    try {
      const status = await professionalMailService.getMyStatus();
      if (!status.sendConnected) return false;
      await professionalMailService.syncInbox();
      return true;
    } catch (error: any) {
      if (!silent) setInboxError(error?.message || 'Professional inbox could not be synchronized.');
      return false;
    } finally {
      setEmailSyncing(false);
    }
  };

  const selectConversation = async (conversation: UnifiedCustomerConversation) => {
    setSelectedConv(conversation);
    setInboxError('');
    const timeline = await getUnifiedCustomerTimeline(conversation);
    setMessages(timeline);
    setReplyMode(defaultReplyMode(conversation, timeline));
  };

  const loadData = async (syncMail = false) => {
    setLoading(true);
    try {
      if (syncMail) await syncProfessionalInbox(true);
      const [unified, reps] = await Promise.all([getUnifiedCustomerConversations(), getSalesReps()]);
      setConversations(unified);
      setSalesReps(reps);

      const requested = requestedConversationId
        ? unified.find(conv => conv.id === requestedConversationId || conv.conversationIds.includes(requestedConversationId))
        : null;
      const current = selectedConv
        ? unified.find(conv => conv.id === selectedConv.id || conv.conversationIds.some(id => selectedConv.conversationIds.includes(id)))
        : null;
      const target = requested || current || unified[0] || null;
      if (target) {
        await selectConversation(target);
        setActiveTab(target.status === 'resolved' ? 'resolved' : 'active');
      } else {
        setSelectedConv(null);
        setMessages([]);
      }
    } catch (error: any) {
      console.error('Error loading unified seller inbox:', error);
      setInboxError(error?.message || 'The unified customer inbox could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  const refreshDataSilent = async () => {
    try {
      const unified = await getUnifiedCustomerConversations();
      setConversations(unified);
      if (selectedConv) {
        const current = unified.find(conv => conv.id === selectedConv.id || conv.conversationIds.some(id => selectedConv.conversationIds.includes(id))) || selectedConv;
        setSelectedConv(current);
        setMessages(await getUnifiedCustomerTimeline(current));
      }
    } catch {
      // Silent refresh intentionally leaves the current inbox visible.
    }
  };

  const refreshAll = async () => {
    setInboxError('');
    await syncProfessionalInbox(false);
    await loadData(false);
  };

  useEffect(() => {
    if (isAuthorized) void loadData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.email, requestedConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isAuthorized) interval = setInterval(() => { void refreshDataSilent(); }, 3500);
    return () => { if (interval) clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorized, selectedConv?.id]);

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConv || sending) return;
    setSending(true);
    setInboxError('');
    try {
      const repName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Sales Representative';

      if (replyMode === 'note') {
        const targetId = selectedConv.chatConversationId || selectedConv.id;
        await sendChatMessage({
          conversationId: targetId,
          senderType: 'sales_rep',
          senderName: repName,
          senderId: user?.id,
          messageText: replyText.trim(),
          isInternalNote: true,
        });
      } else if (replyMode === 'email') {
        if (!selectedConv.crmLeadId) throw new Error('This customer is not linked to a CRM lead, so professional email cannot be sent safely yet.');
        const status = await professionalMailService.getMyStatus();
        if (!status.sendConnected) throw new Error('Connect your Professional Email in My Profile before sending customer email.');
        const latestEmail = [...messages].reverse().find(message => (message as any).channel === 'email') as any;
        await professionalMailService.sendLeadEmail({
          leadId: selectedConv.crmLeadId,
          subject: replySubject(latestEmail?.subject, selectedConv.customerName),
          body: replyText.trim(),
          idempotencyKey: crypto.randomUUID(),
        });
      } else {
        if (!selectedConv.chatConversationId) throw new Error('This customer does not currently have an active website-chat channel. Use Professional Email instead.');
        await sendChatMessage({
          conversationId: selectedConv.chatConversationId,
          senderType: 'sales_rep',
          senderName: repName,
          senderId: user?.id,
          messageText: replyText.trim(),
          isInternalNote: false,
        });
      }

      setReplyText('');
      const unified = await getUnifiedCustomerConversations();
      setConversations(unified);
      const current = unified.find(conv => conv.conversationIds.some(id => selectedConv.conversationIds.includes(id))) || selectedConv;
      setSelectedConv(current);
      setMessages(await getUnifiedCustomerTimeline(current));
    } catch (error: any) {
      console.error('Failed sending unified customer reply:', error);
      setInboxError(error?.message || 'Customer reply could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: 'open' | 'pending' | 'resolved') => {
    if (!selectedConv) return;
    setInboxError('');
    try {
      await updateUnifiedCustomerStatus(selectedConv, newStatus);
      setSelectedConv({ ...selectedConv, status: newStatus });
      await refreshDataSilent();
    } catch (error: any) {
      setInboxError(error?.message || 'Customer conversation status could not be updated.');
    }
  };

  const filteredConversations = conversations.filter(conversation => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query
      || conversation.customerName.toLowerCase().includes(query)
      || conversation.customerEmail.toLowerCase().includes(query)
      || String(conversation.lastMessage || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;
    return activeTab === 'resolved' ? conversation.status === 'resolved' : conversation.status !== 'resolved';
  });

  if (!isAuthorized) {
    return <div className="flex min-h-[500px] flex-col items-center justify-center space-y-4 rounded-2xl border border-red-200 bg-white p-8 text-center">
      <div className="rounded-full bg-red-100 p-4 text-red-700"><Shield className="h-10 w-10" /></div>
      <div><h2 className="text-lg font-bold text-slate-900">Access Restricted</h2><p className="mt-1 max-w-md text-xs text-slate-500">The Unified Customer Inbox is reserved for authorized Sales Representative accounts and Administrators.</p></div>
    </div>;
  }

  return <div className="flex h-[82vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-[#000080] p-2.5 text-white shadow-sm"><MessageSquare className="h-5 w-5" /></div>
        <div>
          <div className="flex items-center gap-2"><h2 className="text-base font-bold text-slate-900">Unified Customer Inbox</h2><span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-[#000080]"><Shield className="h-3 w-3" /> Sales Privileged</span></div>
          <p className="text-xs text-slate-500">One customer thread for website chat, inbound email, outbound email and private internal notes.</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setShowTeamModal(true)} className="flex items-center gap-1.5 rounded-xl bg-[#000080] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-[#000066]"><Users className="h-4 w-4" /> Sales Team ({salesReps.length})</button>
        <button onClick={playChatChime} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100" title="Test chime"><Volume2 className="h-4 w-4 text-[#000080]" /> Test Chime</button>
        <button onClick={() => void refreshAll()} disabled={loading || emailSyncing} className="rounded-xl p-2 text-slate-600 hover:bg-slate-200/60 hover:text-[#000080] disabled:opacity-50" title="Refresh all channels"><RefreshCw className={`h-4 w-4 ${loading || emailSyncing ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>

    {inboxError && <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-700">{inboxError}</div>}

    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-80 flex-col border-r border-slate-200 bg-slate-50/50 sm:w-96">
        <div className="space-y-2.5 border-b border-slate-200 bg-white p-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            <button onClick={() => setActiveTab('active')} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${activeTab === 'active' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600'}`}>Active Customers ({conversations.filter(c => c.status !== 'resolved').length})</button>
            <button onClick={() => setActiveTab('resolved')} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${activeTab === 'resolved' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600'}`}>Archive ({conversations.filter(c => c.status === 'resolved').length})</button>
          </div>
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search customer, email or message..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs font-medium focus:border-[#000080] focus:outline-none" /></div>
        </div>

        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {filteredConversations.length === 0 ? <div className="p-8 text-center text-xs text-slate-400">No customer conversations found.</div> : filteredConversations.map(conversation => {
            const selected = selectedConv?.conversationIds.some(id => conversation.conversationIds.includes(id));
            const rep = salesReps.find(item => item.id === conversation.currentSalesId) || salesReps.find(item => item.id === conversation.originalSalesId);
            return <button key={`${conversation.currentSalesId}-${conversation.customerIdentityId || conversation.customerEmail}`} onClick={() => void selectConversation(conversation)} className={`block w-full p-4 text-left transition hover:bg-white ${selected ? 'border-l-4 border-l-[#000080] bg-white shadow-sm' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1"><h4 className="truncate text-xs font-bold text-slate-900">{conversation.customerName}</h4><p className="mt-0.5 truncate text-[11px] text-slate-500">{conversation.customerEmail}</p></div>
                <span className="shrink-0 text-[9px] text-slate-400">{conversation.lastMessageTime ? new Date(conversation.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              <div className="mt-2 flex items-center gap-1.5">{conversation.hasChat && <span className="flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700"><MessageSquare className="h-2.5 w-2.5" />Chat</span>}{conversation.hasEmail && <span className="flex items-center gap-1 rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-700"><Mail className="h-2.5 w-2.5" />Email</span>}{conversation.conversationIds.length > 1 && <span className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">Unified · {conversation.conversationIds.length}</span>}</div>
              <p className="mt-2 line-clamp-1 text-xs text-slate-600">{conversation.lastMessage || 'Conversation started'}</p>
              <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-500"><span className="flex items-center gap-1"><UserCheck className="h-3 w-3 text-[#000080]" />{rep?.name || 'Assigned seller'}</span>{conversation.ratingGiven && <span className="font-bold text-amber-600">★ {conversation.ratingGiven}/5</span>}</div>
            </button>;
          })}
        </div>
      </div>

      {selectedConv ? <div className="flex h-full flex-1 flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 p-4">
          <div className="flex items-center gap-3"><div className="rounded-xl bg-[#000080]/10 p-2 text-[#000080]"><User className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-slate-900">{selectedConv.customerName}</h3><span className="text-xs text-slate-500">{selectedConv.customerEmail}</span>{selectedConv.hasChat && <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-[9px] font-black uppercase text-indigo-700">Chat</span>}{selectedConv.hasEmail && <span className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-[9px] font-black uppercase text-sky-700">Email</span>}</div><p className="mt-1 text-[10px] font-bold text-slate-400">One customer timeline · {selectedConv.conversationIds.length} underlying channel record{selectedConv.conversationIds.length === 1 ? '' : 's'}</p></div></div>
          <div className="flex items-center gap-2"><span className="text-xs font-bold text-slate-600">Status:</span><select value={selectedConv.status} onChange={event => void handleStatusChange(event.target.value as any)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold focus:border-[#000080] focus:outline-none"><option value="open">🟢 Open / Active</option><option value="pending">🟡 Pending Customer</option><option value="resolved">✅ Resolved / Archive</option></select></div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-6">
          {messages.map(message => {
            const meta = message as any;
            if (message.senderType === 'system') return <div key={`system-${message.id}`} className="my-2 text-center"><span className="inline-block rounded-full bg-slate-200 px-3 py-1 text-[10px] font-bold text-slate-700">{message.messageText}</span></div>;
            if (message.isInternalNote) return <div key={`note-${message.id}`} className="space-y-1 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm"><div className="flex items-center justify-between text-[10px] font-bold text-amber-800"><span className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" />Internal Note · Hidden from Customer</span><span>{new Date(message.createdAt).toLocaleString()}</span></div><p className="whitespace-pre-wrap font-medium">{message.messageText}</p></div>;
            const customer = message.senderType === 'customer';
            const email = meta.channel === 'email';
            return <div key={`${email ? 'email' : 'chat'}-${message.id}`} className={`flex ${customer ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[78%] rounded-2xl p-4 text-xs shadow-sm ${customer ? 'rounded-tl-none border border-slate-200 bg-white text-slate-900' : 'rounded-tr-none bg-[#000080] text-white'}`}><div className="mb-1 flex items-center justify-between gap-4 text-[10px] opacity-75"><span className="flex items-center gap-1 font-bold">{email ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}{message.senderName || (customer ? selectedConv.customerName : 'ProFox Seller')} · {email ? 'Email' : 'Website Chat'}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div>{email && meta.subject && <div className={`mb-2 text-[10px] font-black ${customer ? 'text-slate-500' : 'text-white/75'}`}>Subject: {meta.subject}</div>}<p className="whitespace-pre-wrap font-medium leading-relaxed">{message.messageText}</p></div></div>;
          })}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2 no-scrollbar"><span className="shrink-0 text-[10px] font-bold text-slate-400">Quick Templates:</span><button type="button" onClick={() => setReplyText('Hello! Thank you for reaching out to ProFox. How can I assist you with your project today?')} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200">👋 Welcome</button><button type="button" onClick={() => setReplyText('Would you like a package recommendation or a custom quote based on your requirements?')} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200">💼 Package</button><button type="button" onClick={() => setReplyText("I've shared your requirements with our team. We'll update you here as soon as the next step is ready.")} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-200">🎯 Update</button></div>

        <div className="space-y-3 border-t border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Send as</span><button type="button" disabled={!selectedConv.chatConversationId} onClick={() => setReplyMode('chat')} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${replyMode === 'chat' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 bg-white text-slate-600'}`}><MessageSquare className="h-3.5 w-3.5" />Website Chat</button><button type="button" disabled={!selectedConv.crmLeadId} onClick={() => setReplyMode('email')} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40 ${replyMode === 'email' ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-600'}`}><Mail className="h-3.5 w-3.5" />Professional Email</button><button type="button" onClick={() => setReplyMode('note')} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold ${replyMode === 'note' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}><StickyNote className="h-3.5 w-3.5" />Internal Note</button></div>
          <div className="flex items-end gap-2"><textarea rows={2} value={replyText} onChange={event => setReplyText(event.target.value)} placeholder={replyMode === 'note' ? 'Write a private note for the ProFox team...' : replyMode === 'email' ? 'Write professional email reply...' : 'Write website chat reply...'} className={`flex-1 rounded-xl border p-3 text-xs font-medium focus:outline-none ${replyMode === 'note' ? 'border-amber-300 bg-amber-50/80 text-amber-950 focus:border-amber-500' : 'border-slate-200 bg-slate-50 text-slate-900 focus:border-[#000080]'}`} /><button onClick={() => void handleSendReply()} disabled={!replyText.trim() || sending} className={`flex min-h-[48px] items-center gap-2 rounded-xl px-5 text-xs font-bold shadow-md disabled:opacity-50 ${replyMode === 'note' ? 'bg-amber-500 text-slate-950' : 'bg-[#000080] text-white'}`}><Send className="h-4 w-4" />{sending ? 'Sending…' : replyMode === 'note' ? 'Save Note' : replyMode === 'email' ? 'Send Email' : 'Send Chat'}</button></div>
          <div className="text-[10px] leading-4 text-slate-400">Replies stay in this same customer timeline. Website Chat sends through ProFox chat; Professional Email sends through the connected seller mailbox; Internal Notes are never shown to the customer.</div>
        </div>
      </div> : <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 text-slate-400"><MessageSquare className="mb-2 h-12 w-12 text-slate-300" /><p className="text-sm font-bold text-slate-700">Select a customer</p><p className="mt-0.5 text-xs">All website chat and professional email for that customer will appear together.</p></div>}
    </div>

    {showTeamModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 pb-4"><div className="flex items-center gap-2.5"><div className="rounded-xl bg-[#000080] p-2 text-white"><Users className="h-5 w-5" /></div><div><h3 className="text-base font-bold text-slate-900">Verified Sales Representatives</h3><p className="text-xs text-slate-500">Customer communication remains scoped to authorized sellers.</p></div></div><button type="button" onClick={() => setShowTeamModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="flex-1 overflow-y-auto py-4"><div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">{salesReps.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">No active sales representative is available.</div> : salesReps.map((rep, index) => <div key={`${rep.id}-${index}`} className="flex items-center gap-4 p-4">{rep.avatar ? <img src={rep.avatar} alt={rep.name} className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#000080]/10 text-xs font-black text-[#000080]">{rep.name.slice(0,2).toUpperCase()}</div>}<div className="min-w-0"><div className="flex items-center gap-2"><h4 className="truncate text-xs font-bold text-slate-900">{rep.name}</h4><span className={`h-2 w-2 rounded-full ${rep.isOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} /></div><p className="mt-0.5 text-[11px] text-slate-500">{rep.title}</p></div></div>)}</div></div></div></div>}
  </div>;
}
