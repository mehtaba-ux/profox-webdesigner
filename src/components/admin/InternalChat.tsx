import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ChevronUp,
  Eye,
  LockKeyhole,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  UserRound,
  UsersRound
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import {
  internalChatService,
  type InternalChatContact,
  type InternalChatMessage,
  type InternalChatThread
} from '../../lib/internalChatService';
import { ROLE_LABELS } from '../../types';
import AppAvatar from './workspace/AppAvatar';
import ClientChatAccessManager from './ClientChatAccessManager';

const PAGE_SIZE = 50;
const FALLBACK_REFRESH_MS = 30_000;

function messageFromError(error: any, fallback: string) {
  return error?.message || error?.details || fallback;
}

function formatMessageTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function mergeMessages(current: InternalChatMessage[], incoming: InternalChatMessage[]) {
  const map = new Map<string, InternalChatMessage>();
  [...current, ...incoming].forEach(message => map.set(message.messageId, message));
  return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

function isClientRole(role?: string | null) {
  return ['customer', 'client'].includes(String(role || '').toLowerCase());
}

interface Peer {
  projectId: string;
  projectName: string;
  userId: string;
  fullName: string;
  role: string;
  department: string;
  avatarUrl: string;
  communicationScope: string;
}

export default function InternalChat() {
  const navigate = useNavigate();
  const { user, profile, role, status, loading: authLoading } = useAuth();
  const [contacts, setContacts] = useState<InternalChatContact[]>([]);
  const [threads, setThreads] = useState<InternalChatThread[]>([]);
  const [messages, setMessages] = useState<InternalChatMessage[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToEndRef = useRef(false);
  const realtimeDebounceRef = useRef<number | null>(null);
  const confirmedClientVisibleThreadsRef = useRef(new Set<string>());

  const isActiveInternalUser = Boolean(
    user && profile && status === 'active' && role && !['customer', 'client', 'pending', 'talent_partner'].includes(String(role))
  );

  const selectedIsClientVisible = Boolean(selectedPeer && isClientRole(selectedPeer.role));
  const policySummary = 'Project-scoped access only. Sellers and delivery staff can collaborate only on projects they both actively belong to. Client access remains blocked unless the responsible Seller or an authorized Manager explicitly grants a delivery member access for that exact project.';

  const loadDirectory = async (silent = false) => {
    if (!isActiveInternalUser) return;
    if (!silent) setLoading(true);
    try {
      const [contactResult, threadResult] = await Promise.all([
        internalChatService.listContacts(),
        internalChatService.listThreads()
      ]);
      if (contactResult.error) throw contactResult.error;
      if (threadResult.error) throw threadResult.error;
      setContacts(contactResult.data);
      setThreads(threadResult.data);

      if (selectedThreadId && !threadResult.data.some(thread => thread.threadId === selectedThreadId)) {
        setSelectedThreadId(null);
        setSelectedPeer(null);
        setMessages([]);
        setHasOlder(false);
        setDraft('');
        setError('This conversation is no longer available because its project access changed.');
      }
    } catch (err: any) {
      if (!silent) setError(messageFromError(err, 'Internal chat could not be loaded.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const markVisibleThreadRead = async (threadId: string) => {
    if (document.visibilityState !== 'visible') return;
    const readResult = await internalChatService.markRead(threadId);
    if (readResult.error) throw readResult.error;
  };

  const loadInitialMessages = async (threadId: string, silent = false) => {
    try {
      const result = await internalChatService.getMessages(threadId, null, PAGE_SIZE);
      if (result.error) throw result.error;
      shouldScrollToEndRef.current = true;
      setMessages(result.data);
      setHasOlder(result.data.length === PAGE_SIZE);
      await markVisibleThreadRead(threadId);
      if (!silent) await loadDirectory(true);
    } catch (err: any) {
      if (!silent) setError(messageFromError(err, 'Conversation could not be opened.'));
    }
  };

  const refreshLatestMessages = async (threadId: string, silent = true) => {
    try {
      const result = await internalChatService.getMessages(threadId, null, PAGE_SIZE);
      if (result.error) throw result.error;
      shouldScrollToEndRef.current = true;
      setMessages(current => mergeMessages(current, result.data));
      await markVisibleThreadRead(threadId);
    } catch (err: any) {
      if (!silent) setError(messageFromError(err, 'Conversation could not be refreshed.'));
    }
  };

  const loadOlderMessages = async () => {
    if (!selectedThreadId || loadingOlder || !hasOlder || messages.length === 0) return;
    setLoadingOlder(true);
    setError(null);
    const before = messages[0]?.createdAt;
    const result = await internalChatService.getMessages(selectedThreadId, before, PAGE_SIZE);
    if (result.error) {
      setError(messageFromError(result.error, 'Older messages could not be loaded.'));
    } else {
      shouldScrollToEndRef.current = false;
      setMessages(current => mergeMessages(result.data, current));
      setHasOlder(result.data.length === PAGE_SIZE);
    }
    setLoadingOlder(false);
  };

  useEffect(() => {
    if (!authLoading && isActiveInternalUser) void loadDirectory();
    else if (!authLoading) setLoading(false);
  }, [authLoading, user?.id, status, role]);

  useEffect(() => {
    if (!isActiveInternalUser) return;

    const scheduleRefresh = (messageThreadId?: string) => {
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = window.setTimeout(() => {
        void loadDirectory(true);
        if (selectedThreadId && (!messageThreadId || messageThreadId === selectedThreadId)) {
          void refreshLatestMessages(selectedThreadId, true);
        }
      }, 120);
    };

    const unsubscribe = internalChatService.subscribeToProjectChat(event => {
      const eventThreadId = event.table === 'internal_chat_messages'
        ? String(event.record.thread_id || event.oldRecord.thread_id || '')
        : String(event.record.id || event.oldRecord.id || '');
      scheduleRefresh(eventThreadId || undefined);
    });

    const fallback = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void loadDirectory(true);
      if (selectedThreadId) void refreshLatestMessages(selectedThreadId, true);
    }, FALLBACK_REFRESH_MS);

    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      void loadDirectory(true);
      if (selectedThreadId) void refreshLatestMessages(selectedThreadId, true);
    };

    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);

    return () => {
      unsubscribe();
      window.clearInterval(fallback);
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [isActiveInternalUser, selectedThreadId]);

  useEffect(() => {
    if (!shouldScrollToEndRef.current) return;
    shouldScrollToEndRef.current = false;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedThreadId]);

  const openThread = async (thread: InternalChatThread) => {
    setError(null);
    setDraft('');
    setSelectedThreadId(thread.threadId);
    setSelectedPeer({
      projectId: thread.projectId,
      projectName: thread.projectName,
      userId: thread.otherUserId,
      fullName: thread.otherFullName,
      role: thread.otherRole,
      department: thread.otherDepartment,
      avatarUrl: thread.otherAvatarUrl,
      communicationScope: isClientRole(thread.otherRole) ? 'Client' : 'Internal'
    });
    await loadInitialMessages(thread.threadId);
  };

  const startConversation = async (contact: InternalChatContact) => {
    setError(null);
    setDraft('');
    const result = await internalChatService.getOrCreateThread(contact.userId, contact.projectId);
    if (result.error || !result.data) {
      setError(messageFromError(result.error, 'This project conversation is not permitted.'));
      return;
    }
    setSelectedThreadId(result.data);
    setSelectedPeer({
      projectId: contact.projectId,
      projectName: contact.projectName,
      userId: contact.userId,
      fullName: contact.fullName,
      role: contact.role,
      department: contact.department,
      avatarUrl: contact.avatarUrl,
      communicationScope: contact.communicationScope
    });
    await loadInitialMessages(result.data);
    await loadDirectory(true);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !selectedThreadId || !selectedPeer || sending) return;

    if (selectedIsClientVisible && !confirmedClientVisibleThreadsRef.current.has(selectedThreadId)) {
      const confirmed = window.confirm(
        `CLIENT-VISIBLE MESSAGE\n\n${selectedPeer.fullName} can read everything you send in this project thread. Do not include internal pricing, margins, credentials, private QA notes, staff discussion or other sensitive ProFox information.\n\nSend in this customer-visible conversation?`
      );
      if (!confirmed) return;
      confirmedClientVisibleThreadsRef.current.add(selectedThreadId);
    }

    setSending(true);
    setError(null);
    const result = await internalChatService.sendMessage(selectedThreadId, body);
    if (result.error) {
      setError(messageFromError(result.error, 'Message could not be sent. Your project access may have changed.'));
      await loadDirectory(true);
    } else {
      setDraft('');
      await refreshLatestMessages(selectedThreadId, false);
      await loadDirectory(true);
    }
    setSending(false);
  };

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? threads.filter(thread => `${thread.projectName} ${thread.otherFullName} ${thread.otherRole} ${thread.otherDepartment} ${thread.lastMessagePreview}`.toLowerCase().includes(q))
      : threads;
  }, [threads, search]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(contact =>
      (!q || `${contact.projectName} ${contact.fullName} ${contact.role} ${contact.department}`.toLowerCase().includes(q))
      && !threads.some(thread => thread.projectId === contact.projectId && thread.otherUserId === contact.userId)
    );
  }, [contacts, threads, search]);

  const groupedContacts = useMemo(() => {
    const projects = new Map<string, { projectId: string; projectName: string; items: InternalChatContact[] }>();
    filteredContacts.forEach(contact => {
      const existing = projects.get(contact.projectId);
      if (existing) existing.items.push(contact);
      else projects.set(contact.projectId, { projectId: contact.projectId, projectName: contact.projectName, items: [contact] });
    });
    return Array.from(projects.values()).sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [filteredContacts]);

  if (authLoading || loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="h-8 w-8 rounded-full border-2 border-[#000080] border-t-transparent animate-spin" /></div>;
  }

  if (!isActiveInternalUser) {
    return <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center"><div className="max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm"><LockKeyhole className="mx-auto h-9 w-9 text-red-600" /><h1 className="mt-4 text-lg font-black text-slate-900">Internal Chat Restricted</h1><p className="mt-2 text-sm leading-6 text-slate-500">Internal workspace chat is available only to active ProFox staff. Client access is provided separately in the Client Portal and only by an explicit project grant.</p><button type="button" onClick={() => navigate('/admin/workspace')} className="mt-5 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Back to Workspace</button></div></div>;
  }

  return <div className="profox-app-shell min-h-screen bg-[#f3f7fc] text-slate-900">
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={() => navigate('/admin/workspace')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Back to workspace"><ArrowLeft className="h-4 w-4" /></button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#000080] text-white"><MessageCircle className="h-5 w-5" /></div>
          <div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-base font-black">Project Chat</h1><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">Realtime</span></div><p className="truncate text-[11px] text-slate-500">Internal-only and client-visible channels are separated by project authorization</p></div>
        </div>
        <button type="button" onClick={() => void loadDirectory()} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"><RefreshCw className="h-4 w-4" /> Refresh</button>
      </div>
    </header>

    <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" /><div><div className="text-xs font-black text-slate-800">Project access enforced by Supabase</div><p className="mt-0.5 text-[11px] leading-5 text-slate-600">{policySummary} Realtime improves delivery speed only; every read and send is still authorized server-side.</p></div></div>
      <ClientChatAccessManager onChanged={() => void loadDirectory(true)} />
      {error && <div className="mb-4 flex gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

      <div className="grid min-h-[72vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[380px_1fr]">
        <aside className={`${selectedThreadId ? 'hidden lg:flex' : 'flex'} min-h-[72vh] flex-col border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r`}>
          <div className="border-b border-slate-200 bg-white p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search projects, people or chats..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-[#000080]" /></div></div>
          <div className="flex-1 overflow-y-auto p-3">
            {filteredThreads.length > 0 && <div className="mb-5"><div className="mb-2 px-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Recent project conversations</div><div className="space-y-1">{filteredThreads.map(thread => {
              const active = selectedThreadId === thread.threadId;
              const clientVisible = isClientRole(thread.otherRole);
              return <button key={thread.threadId} type="button" onClick={() => void openThread(thread)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${active ? 'bg-[#000080] text-white shadow-sm' : clientVisible ? 'border border-amber-200 bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-white'}`}>
                <Avatar name={thread.otherFullName} url={thread.otherAvatarUrl} active={active} />
                <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="truncate text-xs font-black">{thread.otherFullName}</span><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide ${active ? 'bg-white/15 text-white' : clientVisible ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-600'}`}>{clientVisible ? 'Client visible' : 'Internal only'}</span><span className={`ml-auto shrink-0 text-[9px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>{formatMessageTime(thread.lastMessageAt)}</span></div><div className={`mt-0.5 truncate text-[10px] font-semibold ${active ? 'text-blue-100' : 'text-[#000080]'}`}>{thread.projectName}</div><div className={`mt-1 truncate text-[11px] ${active ? 'text-white/80' : 'text-slate-500'}`}>{thread.lastMessagePreview || 'Conversation ready'}</div></div>
                {thread.unreadCount > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-black ${active ? 'bg-white text-[#000080]' : 'bg-[#FF0E0E] text-white'}`}>{thread.unreadCount > 99 ? '99+' : thread.unreadCount}</span>}
              </button>;
            })}</div></div>}

            {groupedContacts.map(group => <div key={group.projectId} className="mb-5"><div className="mb-2 flex items-center gap-2 px-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400"><UsersRound className="h-3.5 w-3.5" /><span className="truncate">{group.projectName}</span></div><div className="space-y-1">{group.items.map(contact => {
              const clientVisible = isClientRole(contact.role);
              return <button key={`${contact.projectId}:${contact.userId}`} type="button" onClick={() => void startConversation(contact)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${clientVisible ? 'border border-amber-200 bg-amber-50/60 hover:bg-amber-50' : 'hover:bg-white'}`}><Avatar name={contact.fullName} url={contact.avatarUrl} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><div className="truncate text-xs font-black text-slate-800">{contact.fullName}</div><span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wide ${clientVisible ? 'bg-amber-100 text-amber-900' : 'bg-slate-200 text-slate-600'}`}>{clientVisible ? 'Client visible' : 'Internal only'}</span></div><div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{contact.department} · {(ROLE_LABELS as any)[contact.role] || contact.role}</div></div><MessageCircle className="h-4 w-4 shrink-0 text-slate-300" /></button>;
            })}</div></div>)}

            {filteredThreads.length === 0 && groupedContacts.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center"><UserRound className="mx-auto h-6 w-6 text-slate-300" /><div className="mt-2 text-xs font-black text-slate-600">No authorized project conversations</div><p className="mt-1 text-[10px] leading-4 text-slate-400">Contacts appear only while the current project and role policy permit communication.</p></div>}
          </div>
        </aside>

        <section className={`${selectedThreadId ? 'flex' : 'hidden lg:flex'} min-h-[72vh] flex-col`}>
          {!selectedThreadId || !selectedPeer ? <div className="flex flex-1 items-center justify-center p-8 text-center"><div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-50 text-[#000080]"><LockKeyhole className="h-6 w-6" /></div><h2 className="mt-4 text-base font-black text-slate-800">Choose an authorized project conversation</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">Every thread belongs to one project. Revoking an assignment or client-chat grant removes access immediately.</p></div></div> : <>
            <div className={`flex items-center gap-3 border-b px-4 py-4 sm:px-5 ${selectedIsClientVisible ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}><button type="button" onClick={() => { setSelectedThreadId(null); setSelectedPeer(null); setMessages([]); setHasOlder(false); setDraft(''); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></button><Avatar name={selectedPeer.fullName} url={selectedPeer.avatarUrl} /><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{selectedPeer.fullName}</div><div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{selectedPeer.projectName} · {selectedPeer.department} · {(ROLE_LABELS as any)[selectedPeer.role] || selectedPeer.role}</div></div><div className={`ml-auto hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-wide sm:flex ${selectedIsClientVisible ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-blue-200 bg-blue-50 text-[#000080]'}`}>{selectedIsClientVisible ? <Eye className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}{selectedIsClientVisible ? 'Client visible' : 'Internal only'}</div></div>

            <div className={`mx-4 mt-4 rounded-2xl border px-4 py-3 text-[11px] font-semibold leading-5 sm:mx-6 ${selectedIsClientVisible ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-blue-200 bg-blue-50 text-slate-700'}`}>
              <div className="flex items-start gap-2">{selectedIsClientVisible ? <Eye className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /> : <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />}<div><strong>{selectedIsClientVisible ? 'CLIENT VISIBLE:' : 'INTERNAL ONLY:'}</strong> {selectedIsClientVisible ? 'The customer can read every message in this exact project thread through Client Portal. Never send internal margins, credentials, private QA notes, staff discussion or other sensitive ProFox information here.' : 'Only currently authorized ProFox project staff can read this thread. The customer cannot see these messages in Client Portal.'}</div></div>
            </div>

            <div className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,#f8fafc,#ffffff)] p-4 sm:p-6"><div className="mx-auto max-w-4xl space-y-3">
              {hasOlder && <div className="flex justify-center pb-2"><button type="button" disabled={loadingOlder} onClick={() => void loadOlderMessages()} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"><ChevronUp className="h-3.5 w-3.5" />{loadingOlder ? 'Loading…' : 'Load older messages'}</button></div>}
              {messages.length === 0 && <div className="py-16 text-center"><MessageCircle className="mx-auto h-7 w-7 text-slate-300" /><div className="mt-3 text-xs font-black text-slate-600">Start this project conversation</div><p className="mt-1 text-[10px] text-slate-400">Messages are limited to this exact project and delivered through the secured RPC layer.</p></div>}
              {messages.map(message => {
                const mine = message.senderId === user?.id;
                return <div key={message.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${mine ? 'rounded-br-md bg-[#000080] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}><div className={`mb-1 text-[9px] font-black ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{mine ? 'You' : message.senderFullName} · {formatMessageTime(message.createdAt)}</div><div className="whitespace-pre-wrap break-words text-xs leading-5">{message.body}</div></div></div>;
              })}
              <div ref={messagesEndRef} />
            </div></div>

            <div className={`border-t p-4 ${selectedIsClientVisible ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'}`}><div className="mx-auto max-w-4xl"><div className={`mb-2 flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wide ${selectedIsClientVisible ? 'text-amber-900' : 'text-[#000080]'}`}>{selectedIsClientVisible ? <Eye className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}{selectedIsClientVisible ? 'Customer will see this message' : 'Private ProFox team message'}</div><div className={`flex items-end gap-2 rounded-2xl border p-2 ${selectedIsClientVisible ? 'border-amber-300 bg-white focus-within:border-amber-500' : 'border-slate-200 bg-slate-50 focus-within:border-[#000080]'}`}><textarea value={draft} onChange={event => setDraft(event.target.value.slice(0, 4000))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} placeholder={selectedIsClientVisible ? `CLIENT VISIBLE — message ${selectedPeer.fullName} about ${selectedPeer.projectName}...` : `INTERNAL ONLY — discuss ${selectedPeer.projectName} with ${selectedPeer.fullName}...`} className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-2 py-2 text-xs leading-5 outline-none" /><button type="button" onClick={() => void send()} disabled={!draft.trim() || sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#000080] text-white disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button></div><div className="mt-2 flex justify-between gap-3 px-1 text-[9px] text-slate-400"><span>{selectedIsClientVisible ? 'First send each session requires client-visibility confirmation' : 'Internal project scope'} · Realtime · 30/minute protection</span><span>{draft.length}/4000</span></div></div></div>
          </>}
        </section>
      </div>
    </main>
  </div>;
}

function Avatar({ name, url, active = false }: { name: string; url?: string; active?: boolean }) {
  return <AppAvatar name={name} src={url} size="md" className={active ? 'ring-2 ring-white/40' : ''} />;
}
