import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, MessageCircle, Send, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { internalChatService, type InternalChatContact, type InternalChatMessage, type InternalChatThread } from '../../lib/internalChatService';

function messageOf(error: any, fallback: string) { return error?.message || error?.details || fallback; }
function time(value?: string | null) { if (!value) return ''; const d = new Date(value); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(); }

export default function ClientProjectChat() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<InternalChatContact[]>([]);
  const [threads, setThreads] = useState<InternalChatThread[]>([]);
  const [messages, setMessages] = useState<InternalChatMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<InternalChatThread | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  const loadDirectory = async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [contactResult, threadResult] = await Promise.all([internalChatService.listContacts(), internalChatService.listThreads()]);
    if (contactResult.error || threadResult.error) setError(messageOf(contactResult.error || threadResult.error, 'Project chat could not be loaded.'));
    else {
      setContacts(contactResult.data);
      setThreads(threadResult.data);
      setError('');
      if (selectedThread && !threadResult.data.some(row => row.threadId === selectedThread.threadId)) {
        setSelectedThread(null); setMessages([]);
      }
    }
    if (!quiet) setLoading(false);
  };

  const loadMessages = async (thread: InternalChatThread, quiet = false) => {
    const result = await internalChatService.getMessages(thread.threadId);
    if (result.error) { if (!quiet) setError(messageOf(result.error, 'This project conversation is no longer available.')); return; }
    setMessages(result.data);
    await internalChatService.markRead(thread.threadId);
    if (!quiet) await loadDirectory(true);
  };

  useEffect(() => { void loadDirectory(); }, [user?.id]);
  useEffect(() => {
    const timer = window.setInterval(() => { void loadDirectory(true); if (selectedThread) void loadMessages(selectedThread, true); }, 4000);
    return () => window.clearInterval(timer);
  }, [selectedThread?.threadId]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const open = async (thread: InternalChatThread) => { setSelectedThread(thread); setError(''); await loadMessages(thread); };
  const start = async (contact: InternalChatContact) => {
    setError('');
    const result = await internalChatService.getOrCreateThread(contact.userId, contact.projectId);
    if (result.error || !result.data) { setError(messageOf(result.error, 'This project conversation is not available.')); return; }
    const thread: InternalChatThread = { projectId: contact.projectId, projectName: contact.projectName, threadId: result.data, otherUserId: contact.userId, otherFullName: contact.fullName, otherRole: contact.role, otherDepartment: contact.department, otherAvatarUrl: contact.avatarUrl, lastMessagePreview: '', unreadCount: 0 };
    setSelectedThread(thread); await loadMessages(thread); await loadDirectory(true);
  };
  const send = async () => {
    if (!selectedThread || !draft.trim() || sending) return;
    setSending(true); setError('');
    const result = await internalChatService.sendMessage(selectedThread.threadId, draft.trim());
    if (result.error) setError(messageOf(result.error, 'Message could not be sent. The project-chat grant may have changed.'));
    else { setDraft(''); await loadMessages(selectedThread); }
    setSending(false);
  };

  const newContacts = useMemo(() => contacts.filter(contact => !threads.some(thread => thread.projectId === contact.projectId && thread.otherUserId === contact.userId)), [contacts, threads]);

  if (loading) return <section className="flex min-h-[180px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></section>;
  if (!error && threads.length === 0 && newContacts.length === 0) return null;

  return <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-5"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#000080]"><ShieldCheck className="h-4 w-4" />Authorized Project Chat</div><h3 className="mt-2 text-lg font-black text-slate-900">Chat with an approved delivery specialist</h3><p className="mt-1 text-xs leading-5 text-slate-500">Only delivery members explicitly approved for your exact project appear here. Revoking the grant or ending the project removes access immediately.</p></div>
    {error && <div className="m-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
    <div className="grid min-h-[420px] lg:grid-cols-[320px_1fr]">
      <div className="border-r border-slate-200 bg-slate-50 p-3">
        {threads.map(thread => <button key={thread.threadId} type="button" onClick={() => void open(thread)} className={`mb-1 block w-full rounded-xl p-3 text-left ${selectedThread?.threadId === thread.threadId ? 'bg-[#000080] text-white' : 'bg-white hover:bg-slate-100'}`}><div className="text-xs font-black">{thread.otherFullName}</div><div className={`mt-1 text-[10px] ${selectedThread?.threadId === thread.threadId ? 'text-blue-200' : 'text-slate-400'}`}>{thread.projectName}</div><div className={`mt-1 truncate text-[10px] ${selectedThread?.threadId === thread.threadId ? 'text-white/80' : 'text-slate-500'}`}>{thread.lastMessagePreview || 'Project conversation'}</div></button>)}
        {newContacts.map(contact => <button key={`${contact.projectId}:${contact.userId}`} type="button" onClick={() => void start(contact)} className="mb-1 flex w-full items-center gap-2 rounded-xl bg-white p-3 text-left hover:bg-slate-100"><UserRound className="h-4 w-4 text-[#000080]" /><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800">{contact.fullName}</div><div className="truncate text-[10px] text-slate-400">{contact.projectName} · approved delivery</div></div></button>)}
        {threads.length === 0 && newContacts.length === 0 && <p className="p-5 text-center text-xs text-slate-400">No delivery specialist has been approved for direct project chat.</p>}
      </div>
      <div className="flex min-h-[420px] flex-col">
        {!selectedThread ? <div className="flex flex-1 items-center justify-center p-8 text-center"><div><MessageCircle className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-black text-slate-600">Choose an approved project contact</p></div></div> : <><div className="border-b border-slate-200 bg-slate-50 p-4"><div className="text-sm font-black text-slate-900">{selectedThread.otherFullName}</div><div className="text-[10px] font-semibold text-slate-400">{selectedThread.projectName} · {selectedThread.otherDepartment}</div></div><div className="max-h-[420px] min-h-[260px] flex-1 space-y-3 overflow-y-auto p-4">{messages.map(message => { const mine = message.senderId === user?.id; return <div key={message.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'}`}><div className={`text-[9px] font-black ${mine ? 'text-blue-200' : 'text-slate-400'}`}>{mine ? 'You' : message.senderFullName} · {time(message.createdAt)}</div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p></div></div>; })}<div ref={endRef} /></div><div className="border-t border-slate-200 p-4"><div className="flex items-end gap-2"><textarea rows={2} maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${selectedThread.otherFullName} about ${selectedThread.projectName}...`} className="flex-1 resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#000080]" /><button type="button" disabled={sending || !draft.trim()} onClick={() => void send()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#000080] text-white disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div></div></>}
      </div>
    </div>
  </section>;
}
