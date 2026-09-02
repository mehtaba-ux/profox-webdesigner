import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ChevronUp, Loader2, MessageCircle, Send, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import CommunicationAttachmentList from '../communication/CommunicationAttachmentList';
import CommunicationComposerTools from '../communication/CommunicationComposerTools';
import RichMessageText from '../communication/RichMessageText';
import {
  deleteCommunicationAttachment,
  uploadInternalAttachment,
  type UploadedCommunicationAttachment,
} from '../../lib/communicationAttachmentService';
import {
  internalChatService,
  type InternalChatContact,
  type InternalChatMessage,
  type InternalChatThread
} from '../../lib/internalChatService';

const PAGE_SIZE = 50;
const FALLBACK_REFRESH_MS = 30_000;

function messageOf(error: any, fallback: string) {
  return error?.message || error?.details || fallback;
}

function time(value?: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

function mergeMessages(current: InternalChatMessage[], incoming: InternalChatMessage[]) {
  const map = new Map<string, InternalChatMessage>();
  [...current, ...incoming].forEach(message => map.set(message.messageId, message));
  return Array.from(map.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export default function ClientProjectChat() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState<InternalChatContact[]>([]);
  const [threads, setThreads] = useState<InternalChatThread[]>([]);
  const [messages, setMessages] = useState<InternalChatMessage[]>([]);
  const [selectedThread, setSelectedThread] = useState<InternalChatThread | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollRef = useRef(false);
  const realtimeDebounceRef = useRef<number | null>(null);

  const loadDirectory = async (quiet = false) => {
    if (!quiet) setLoading(true);
    const [contactResult, threadResult] = await Promise.all([
      internalChatService.listContacts(),
      internalChatService.listThreads()
    ]);

    if (contactResult.error || threadResult.error) {
      setError(messageOf(contactResult.error || threadResult.error, 'Project chat could not be loaded.'));
    } else {
      setContacts(contactResult.data);
      setThreads(threadResult.data);
      setError('');
      if (selectedThread && !threadResult.data.some(row => row.threadId === selectedThread.threadId)) {
        setSelectedThread(null);
        setMessages([]);
        setHasOlder(false);
        setPendingFiles([]);
      }
    }
    if (!quiet) setLoading(false);
  };

  const markVisibleRead = async (threadId: string) => {
    if (document.visibilityState !== 'visible') return;
    const result = await internalChatService.markRead(threadId);
    if (result.error) throw result.error;
  };

  const loadInitialMessages = async (thread: InternalChatThread, quiet = false) => {
    const result = await internalChatService.getMessages(thread.threadId, null, PAGE_SIZE);
    if (result.error) {
      if (!quiet) setError(messageOf(result.error, 'This project conversation is no longer available.'));
      return;
    }
    shouldScrollRef.current = true;
    setMessages(result.data);
    setHasOlder(result.data.length === PAGE_SIZE);
    try {
      await markVisibleRead(thread.threadId);
    } catch (readError: any) {
      if (!quiet) setError(messageOf(readError, 'This project conversation is no longer available.'));
    }
    if (!quiet) await loadDirectory(true);
  };

  const refreshLatest = async (thread: InternalChatThread, quiet = true) => {
    const result = await internalChatService.getMessages(thread.threadId, null, PAGE_SIZE);
    if (result.error) {
      if (!quiet) setError(messageOf(result.error, 'This project conversation is no longer available.'));
      return;
    }
    shouldScrollRef.current = true;
    setMessages(current => mergeMessages(current, result.data));
    try {
      await markVisibleRead(thread.threadId);
    } catch (readError: any) {
      if (!quiet) setError(messageOf(readError, 'This project conversation is no longer available.'));
    }
  };

  const loadOlder = async () => {
    if (!selectedThread || loadingOlder || !hasOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const result = await internalChatService.getMessages(selectedThread.threadId, messages[0].createdAt, PAGE_SIZE);
    if (result.error) setError(messageOf(result.error, 'Older messages could not be loaded.'));
    else {
      shouldScrollRef.current = false;
      setMessages(current => mergeMessages(result.data, current));
      setHasOlder(result.data.length === PAGE_SIZE);
    }
    setLoadingOlder(false);
  };

  useEffect(() => {
    void loadDirectory();
  }, [user?.id]);

  useEffect(() => {
    const scheduleRefresh = (eventThreadId?: string) => {
      if (realtimeDebounceRef.current) window.clearTimeout(realtimeDebounceRef.current);
      realtimeDebounceRef.current = window.setTimeout(() => {
        void loadDirectory(true);
        if (selectedThread && (!eventThreadId || eventThreadId === selectedThread.threadId)) {
          void refreshLatest(selectedThread, true);
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
      if (selectedThread) void refreshLatest(selectedThread, true);
    }, FALLBACK_REFRESH_MS);

    const resume = () => {
      if (document.visibilityState !== 'visible') return;
      void loadDirectory(true);
      if (selectedThread) void refreshLatest(selectedThread, true);
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
  }, [selectedThread?.threadId]);

  useEffect(() => {
    if (!shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const open = async (thread: InternalChatThread) => {
    setSelectedThread(thread);
    setPendingFiles([]);
    setError('');
    await loadInitialMessages(thread);
  };

  const start = async (contact: InternalChatContact) => {
    setError('');
    const result = await internalChatService.getOrCreateThread(contact.userId, contact.projectId);
    if (result.error || !result.data) {
      setError(messageOf(result.error, 'This project conversation is not available.'));
      return;
    }
    const thread: InternalChatThread = {
      projectId: contact.projectId,
      projectName: contact.projectName,
      threadId: result.data,
      otherUserId: contact.userId,
      otherFullName: contact.fullName,
      otherRole: contact.role,
      otherDepartment: contact.department,
      otherAvatarUrl: contact.avatarUrl,
      lastMessagePreview: '',
      unreadCount: 0
    };
    setSelectedThread(thread);
    setPendingFiles([]);
    await loadInitialMessages(thread);
    await loadDirectory(true);
  };

  const send = async () => {
    if (!selectedThread || (!draft.trim() && pendingFiles.length === 0) || sending) return;
    setSending(true);
    setError('');
    const uploaded: UploadedCommunicationAttachment[] = [];
    try {
      for (const file of pendingFiles) uploaded.push(await uploadInternalAttachment({ threadId: selectedThread.threadId, file }));
      const result = await internalChatService.sendMessage(selectedThread.threadId, draft.trim(), uploaded.map(item => item.id));
      if (result.error) throw result.error;
      setDraft('');
      setPendingFiles([]);
      await refreshLatest(selectedThread, false);
      await loadDirectory(true);
    } catch (sendError: any) {
      if (uploaded.length) await Promise.allSettled(uploaded.map(attachment => deleteCommunicationAttachment({ attachment })));
      setError(messageOf(sendError, 'Message could not be sent. The project-chat grant may have changed.'));
      await loadDirectory(true);
    } finally {
      setSending(false);
    }
  };

  const newContacts = useMemo(
    () => contacts.filter(contact => !threads.some(thread => thread.projectId === contact.projectId && thread.otherUserId === contact.userId)),
    [contacts, threads]
  );

  if (loading) {
    return <section className="flex min-h-[180px] items-center justify-center rounded-[2rem] border border-slate-200 bg-white"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></section>;
  }
  if (!error && threads.length === 0 && newContacts.length === 0) return null;

  return <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-200 p-5">
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#000080]"><ShieldCheck className="h-4 w-4" />Authorized Project Chat</div>
      <h3 className="mt-2 text-lg font-black text-slate-900">Chat with an approved delivery specialist</h3>
      <p className="mt-1 text-xs leading-5 text-slate-500">Messages, safe links and project files stay inside the same authorized project thread. Every action still passes the existing project grant checks.</p>
    </div>

    {error && <div className="m-4 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}

    <div className="grid min-h-[420px] lg:grid-cols-[320px_1fr]">
      <div className="border-r border-slate-200 bg-slate-50 p-3">
        {threads.map(thread => <button key={thread.threadId} type="button" onClick={() => void open(thread)} className={`mb-1 block w-full rounded-xl p-3 text-left ${selectedThread?.threadId === thread.threadId ? 'bg-[#000080] text-white' : 'bg-white hover:bg-slate-100'}`}><div className="text-xs font-black">{thread.otherFullName}</div><div className={`mt-1 text-[10px] ${selectedThread?.threadId === thread.threadId ? 'text-blue-200' : 'text-slate-400'}`}>{thread.projectName}</div><div className={`mt-1 truncate text-[10px] ${selectedThread?.threadId === thread.threadId ? 'text-white/80' : 'text-slate-500'}`}>{thread.lastMessagePreview || 'Project conversation'}</div>{thread.unreadCount > 0 && <div className="mt-1 text-[9px] font-black">{thread.unreadCount} unread</div>}</button>)}
        {newContacts.map(contact => <button key={`${contact.projectId}:${contact.userId}`} type="button" onClick={() => void start(contact)} className="mb-1 flex w-full items-center gap-2 rounded-xl bg-white p-3 text-left hover:bg-slate-100"><UserRound className="h-4 w-4 text-[#000080]" /><div className="min-w-0"><div className="truncate text-xs font-black text-slate-800">{contact.fullName}</div><div className="truncate text-[10px] text-slate-400">{contact.projectName} · approved delivery</div></div></button>)}
        {threads.length === 0 && newContacts.length === 0 && <p className="p-5 text-center text-xs text-slate-400">No delivery specialist has been approved for direct project chat.</p>}
      </div>

      <div className="flex min-h-[420px] flex-col">
        {!selectedThread ? <div className="flex flex-1 items-center justify-center p-8 text-center"><div><MessageCircle className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-black text-slate-600">Choose an approved project contact</p></div></div> : <>
          <div className="border-b border-slate-200 bg-slate-50 p-4"><div className="text-sm font-black text-slate-900">{selectedThread.otherFullName}</div><div className="text-[10px] font-semibold text-slate-400">{selectedThread.projectName} · {selectedThread.otherDepartment}</div></div>
          <div className="max-h-[420px] min-h-[260px] flex-1 space-y-3 overflow-y-auto p-4">
            {hasOlder && <div className="flex justify-center"><button type="button" disabled={loadingOlder} onClick={() => void loadOlder()} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-[10px] font-black text-slate-600 disabled:opacity-50"><ChevronUp className="h-3.5 w-3.5" />{loadingOlder ? 'Loading…' : 'Load older messages'}</button></div>}
            {messages.map(message => {
              const mine = message.senderId === user?.id;
              return <div key={message.messageId} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[82%] rounded-2xl px-4 py-3 ${mine ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-slate-50 text-slate-800'}`}><div className={`text-[9px] font-black ${mine ? 'text-blue-200' : 'text-slate-400'}`}>{mine ? 'You' : message.senderFullName} · {time(message.createdAt)}</div><div className="mt-1 text-sm leading-6"><RichMessageText text={message.body} inverse={mine} /></div><CommunicationAttachmentList attachments={message.attachments} inverse={mine} /></div></div>;
            })}
            <div ref={endRef} />
          </div>
          <div className="space-y-2 border-t border-slate-200 p-4">
            <CommunicationComposerTools files={pendingFiles} onFilesChange={setPendingFiles} text={draft} onTextChange={setDraft} disabled={sending} compact />
            <div className="flex items-end gap-2"><textarea rows={2} maxLength={4000} value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${selectedThread.otherFullName} about ${selectedThread.projectName}...`} className="flex-1 resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#000080]" /><button type="button" disabled={sending || (!draft.trim() && pendingFiles.length === 0)} onClick={() => void send()} className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#000080] text-white disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></div>
            <div className="text-[9px] text-slate-400">Private R2 file storage · realtime delivery · secure 30-second fallback refresh · 30 messages/minute limit</div>
          </div>
        </>}
      </div>
    </div>
  </section>;
}
