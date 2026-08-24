import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
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

const DELIVERY_COLLABORATORS = new Set([
  'content_writer',
  'uiux_designer',
  'developer',
  'web_developer',
  'developer_designer'
]);
const MANAGER_ROLES = new Set(['admin', 'project_manager', 'site_manager']);

function messageFromError(error: any, fallback: string) {
  return error?.message || error?.details || fallback;
}

function formatMessageTime(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface Peer {
  userId: string;
  fullName: string;
  role: string;
  department: string;
  avatarUrl: string;
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
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isActiveInternalUser = Boolean(
    user && profile && status === 'active' && role && !['customer', 'pending'].includes(String(role))
  );
  const isManager = MANAGER_ROLES.has(String(role || ''));
  const isDeliveryCollaborator = DELIVERY_COLLABORATORS.has(String(role || ''));

  const policySummary = isManager
    ? 'Management bridge: you can communicate with every active internal team member.'
    : isDeliveryCollaborator
      ? 'Delivery collaboration: Content, Design and Development can communicate with each other and with Management. Seller access is blocked.'
      : 'Controlled communication: your direct internal chat is limited to Management.';

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

      if (selectedThreadId) {
        const stillAllowed = threadResult.data.some(thread => thread.threadId === selectedThreadId);
        if (!stillAllowed) {
          setSelectedThreadId(null);
          setSelectedPeer(null);
          setMessages([]);
        }
      }
    } catch (err: any) {
      if (!silent) setError(messageFromError(err, 'Internal chat could not be loaded.'));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const loadMessages = async (threadId: string, silent = false) => {
    try {
      const result = await internalChatService.getMessages(threadId);
      if (result.error) throw result.error;
      setMessages(result.data);
      await internalChatService.markRead(threadId);
      if (!silent) await loadDirectory(true);
    } catch (err: any) {
      if (!silent) setError(messageFromError(err, 'Conversation could not be opened.'));
    }
  };

  useEffect(() => {
    if (!authLoading && isActiveInternalUser) void loadDirectory();
    if (!authLoading && !isActiveInternalUser) setLoading(false);
  }, [authLoading, user?.id, status, role]);

  useEffect(() => {
    if (!isActiveInternalUser) return;
    const interval = window.setInterval(() => {
      void loadDirectory(true);
      if (selectedThreadId) void loadMessages(selectedThreadId, true);
    }, 3500);
    return () => window.clearInterval(interval);
  }, [isActiveInternalUser, selectedThreadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, selectedThreadId]);

  const openThread = async (thread: InternalChatThread) => {
    setError(null);
    setSelectedThreadId(thread.threadId);
    setSelectedPeer({
      userId: thread.otherUserId,
      fullName: thread.otherFullName,
      role: thread.otherRole,
      department: thread.otherDepartment,
      avatarUrl: thread.otherAvatarUrl
    });
    await loadMessages(thread.threadId);
  };

  const startConversation = async (contact: InternalChatContact) => {
    setError(null);
    const result = await internalChatService.getOrCreateThread(contact.userId);
    if (result.error || !result.data) {
      setError(messageFromError(result.error, 'This conversation is not permitted.'));
      return;
    }
    setSelectedThreadId(result.data);
    setSelectedPeer({
      userId: contact.userId,
      fullName: contact.fullName,
      role: contact.role,
      department: contact.department,
      avatarUrl: contact.avatarUrl
    });
    await loadMessages(result.data);
    await loadDirectory(true);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !selectedThreadId || sending) return;
    setSending(true);
    setError(null);
    const result = await internalChatService.sendMessage(selectedThreadId, body);
    if (result.error) {
      setError(messageFromError(result.error, 'Message could not be sent.'));
      setSending(false);
      return;
    }
    setDraft('');
    await loadMessages(selectedThreadId);
    setSending(false);
  };

  const filteredThreads = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter(thread =>
      `${thread.otherFullName} ${thread.otherRole} ${thread.otherDepartment} ${thread.lastMessagePreview}`.toLowerCase().includes(q)
    );
  }, [threads, search]);

  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter(contact => {
      const matches = !q || `${contact.fullName} ${contact.role} ${contact.department}`.toLowerCase().includes(q);
      const alreadyOpen = threads.some(thread => thread.otherUserId === contact.userId);
      return matches && !alreadyOpen;
    });
  }, [contacts, threads, search]);

  const groupedContacts = useMemo(() => {
    const managers = filteredContacts.filter(contact => contact.communicationScope === 'Manager');
    const collaborators = filteredContacts.filter(contact => contact.communicationScope === 'Delivery Collaboration');
    const internal = filteredContacts.filter(contact => !['Manager', 'Delivery Collaboration'].includes(contact.communicationScope));
    return [
      { label: 'Management', items: managers },
      { label: 'Delivery Collaboration', items: collaborators },
      { label: 'Team', items: internal }
    ].filter(group => group.items.length > 0);
  }, [filteredContacts]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="h-8 w-8 rounded-full border-2 border-[#000080] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isActiveInternalUser) {
    return (
      <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center">
        <div className="max-w-lg rounded-3xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <LockKeyhole className="mx-auto h-9 w-9 text-red-600" />
          <h1 className="mt-4 text-lg font-black text-slate-900">Internal Chat Restricted</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">Internal chat is available only to active ProFox staff accounts. Customer and pending accounts are excluded.</p>
          <button type="button" onClick={() => navigate('/admin/workspace')} className="mt-5 rounded-xl bg-[#000080] px-4 py-2.5 text-xs font-black text-white">Back to Workspace</button>
        </div>
      </div>
    );
  }

  return (
    <div className="profox-app-shell min-h-screen bg-[#f3f7fc] text-slate-900">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => navigate('/admin/workspace')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Back to workspace">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#000080] text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><h1 className="truncate text-base font-black">Internal Chat</h1><span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-emerald-700">Controlled</span></div>
              <p className="truncate text-[11px] text-slate-500">Role-controlled team communication · no external access</p>
            </div>
          </div>
          <button type="button" onClick={() => void loadDirectory()} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />
          <div><div className="text-xs font-black text-slate-800">Communication policy enforced by Supabase</div><p className="mt-0.5 text-[11px] leading-5 text-slate-600">{policySummary} Messages are immutable in the application: no edit or delete actions are exposed.</p></div>
        </div>

        {error && <div className="mb-4 flex gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

        <div className="grid min-h-[72vh] overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[360px_1fr]">
          <aside className={`${selectedThreadId ? 'hidden lg:flex' : 'flex'} min-h-[72vh] flex-col border-b border-slate-200 bg-slate-50/60 lg:border-b-0 lg:border-r`}>
            <div className="border-b border-slate-200 bg-white p-4">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search permitted people or chats..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs outline-none focus:border-[#000080]" /></div>
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {filteredThreads.length > 0 && <div className="mb-5"><div className="mb-2 px-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">Recent conversations</div><div className="space-y-1">{filteredThreads.map(thread => {
                const active = selectedThreadId === thread.threadId;
                return <button key={thread.threadId} type="button" onClick={() => void openThread(thread)} className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition ${active ? 'bg-[#000080] text-white shadow-sm' : 'hover:bg-white'}`}>
                  <Avatar name={thread.otherFullName} url={thread.otherAvatarUrl} active={active} />
                  <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-black">{thread.otherFullName}</span><span className={`shrink-0 text-[9px] ${active ? 'text-blue-100' : 'text-slate-400'}`}>{formatMessageTime(thread.lastMessageAt)}</span></div><div className={`mt-0.5 truncate text-[10px] font-semibold ${active ? 'text-blue-100' : 'text-slate-400'}`}>{thread.otherDepartment}</div><div className={`mt-1 truncate text-[11px] ${active ? 'text-white/80' : 'text-slate-500'}`}>{thread.lastMessagePreview || 'Conversation ready'}</div></div>
                  {thread.unreadCount > 0 && <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[9px] font-black ${active ? 'bg-white text-[#000080]' : 'bg-[#FF0E0E] text-white'}`}>{thread.unreadCount > 99 ? '99+' : thread.unreadCount}</span>}
                </button>;
              })}</div></div>}

              {groupedContacts.map(group => <div key={group.label} className="mb-5"><div className="mb-2 flex items-center gap-2 px-2 text-[9px] font-black uppercase tracking-[0.16em] text-slate-400"><UsersRound className="h-3.5 w-3.5" />{group.label}</div><div className="space-y-1">{group.items.map(contact => <button key={contact.userId} type="button" onClick={() => void startConversation(contact)} className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-white">
                <Avatar name={contact.fullName} url={contact.avatarUrl} />
                <div className="min-w-0 flex-1"><div className="truncate text-xs font-black text-slate-800">{contact.fullName}</div><div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{contact.department} · {(ROLE_LABELS as any)[contact.role] || contact.role}</div></div>
                <MessageCircle className="h-4 w-4 shrink-0 text-slate-300" />
              </button>)}</div></div>)}

              {filteredThreads.length === 0 && groupedContacts.length === 0 && <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center"><UserRound className="mx-auto h-6 w-6 text-slate-300" /><div className="mt-2 text-xs font-black text-slate-600">No permitted contacts found</div><p className="mt-1 text-[10px] leading-4 text-slate-400">Your communication directory is generated from the current role policy.</p></div>}
            </div>
          </aside>

          <section className={`${selectedThreadId ? 'flex' : 'hidden lg:flex'} min-h-[72vh] flex-col`}>
            {!selectedThreadId || !selectedPeer ? <div className="flex flex-1 items-center justify-center p-8 text-center"><div><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-blue-50 text-[#000080]"><LockKeyhole className="h-6 w-6" /></div><h2 className="mt-4 text-base font-black text-slate-800">Choose an authorized conversation</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">The directory only shows people you are allowed to contact. Delivery specialists cannot open seller conversations; non-delivery staff are limited to Management.</p></div></div> : <>
              <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-4 sm:px-5"><button type="button" onClick={() => { setSelectedThreadId(null); setSelectedPeer(null); setMessages([]); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-4 w-4" /></button><Avatar name={selectedPeer.fullName} url={selectedPeer.avatarUrl} /><div className="min-w-0"><div className="truncate text-sm font-black text-slate-900">{selectedPeer.fullName}</div><div className="mt-0.5 truncate text-[10px] font-semibold text-slate-400">{selectedPeer.department} · {(ROLE_LABELS as any)[selectedPeer.role] || selectedPeer.role}</div></div><div className="ml-auto hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 sm:flex"><ShieldCheck className="h-3.5 w-3.5" />Authorized</div></div>

              <div className="flex-1 overflow-y-auto bg-[linear-gradient(to_bottom,#f8fafc,#ffffff)] p-4 sm:p-6"><div className="mx-auto max-w-4xl space-y-3">{messages.length === 0 && <div className="py-16 text-center"><MessageCircle className="mx-auto h-7 w-7 text-slate-300" /><div className="mt-3 text-xs font-black text-slate-600">Start this internal conversation</div><p className="mt-1 text-[10px] text-slate-400">Keep project/customer details inside the approved ProFox workflow and use chat for coordination.</p></div>}{messages.map(message => {
                const mine = message.senderId === user?.id;
                return <div key={message.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${mine ? 'rounded-br-md bg-[#000080] text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'}`}><div className={`mb-1 text-[9px] font-black ${mine ? 'text-blue-100' : 'text-slate-400'}`}>{mine ? 'You' : message.senderFullName} · {formatMessageTime(message.createdAt)}</div><div className="whitespace-pre-wrap break-words text-xs leading-5">{message.body}</div></div></div>;
              })}<div ref={messagesEndRef} /></div></div>

              <div className="border-t border-slate-200 bg-white p-4"><div className="mx-auto max-w-4xl"><div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 focus-within:border-[#000080]"><textarea value={draft} onChange={event => setDraft(event.target.value.slice(0, 4000))} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); } }} rows={2} placeholder="Write an internal message..." className="max-h-40 min-h-[48px] flex-1 resize-none bg-transparent px-2 py-2 text-xs leading-5 outline-none" /><button type="button" onClick={() => void send()} disabled={!draft.trim() || sending} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#000080] text-white disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send className="h-4 w-4" /></button></div><div className="mt-2 flex justify-between gap-3 px-1 text-[9px] text-slate-400"><span>Enter to send · Shift+Enter for a new line</span><span>{draft.length}/4000 · history protected</span></div></div></div>
            </>}
          </section>
        </div>
      </main>
    </div>
  );
}

function Avatar({ name, url, active = false }: { name: string; url?: string; active?: boolean }) {
  return <AppAvatar name={name} src={url} size="md" className={active ? 'ring-2 ring-white/40' : ''} />;
}
