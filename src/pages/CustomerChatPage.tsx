import { FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, LockKeyhole, MessageSquare, Send, ShieldCheck, UserRound } from 'lucide-react';
import type { ChatMessage } from '../types';
import CommunicationAttachmentList from '../components/communication/CommunicationAttachmentList';
import CommunicationComposerTools from '../components/communication/CommunicationComposerTools';
import RichMessageText from '../components/communication/RichMessageText';
import {
  deleteCommunicationAttachment,
  uploadSalesAttachment,
  type UploadedCommunicationAttachment,
} from '../lib/communicationAttachmentService';
import {
  getChatConversation,
  getChatMessages,
  redeemSalesChatLink,
  sendChatMessage,
  type ChatConversationResult,
} from '../lib/chatService';

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerChatPage() {
  const { token, conversationId } = useParams<{ token?: string; conversationId?: string }>();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<ChatConversationResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reply, setReply] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Secure Conversation | ProFox';
    let referrer = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    if (!referrer) {
      referrer = document.createElement('meta');
      referrer.name = 'referrer';
      document.head.appendChild(referrer);
    }
    referrer.content = 'no-referrer';

    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement('meta');
      robots.name = 'robots';
      document.head.appendChild(robots);
    }
    robots.content = 'noindex, nofollow, noarchive';
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    setError('');
    void redeemSalesChatLink(token)
      .then((opened) => {
        if (!active) return;
        setConversation(opened);
        navigate(`/chat/session/${opened.id}`, { replace: true });
      })
      .catch((err: any) => {
        if (!active) return;
        setError(err?.message || 'This secure conversation link is invalid or has been revoked.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [navigate, token]);

  useEffect(() => {
    if (!conversationId || token) return;
    let disposed = false;

    const refresh = async (showLoader = false) => {
      if (showLoader) setLoading(true);
      try {
        const [nextConversation, nextMessages] = await Promise.all([
          getChatConversation(conversationId),
          getChatMessages(conversationId),
        ]);
        if (disposed) return;
        setConversation(nextConversation);
        setMessages(nextMessages.filter(message => !message.isInternalNote));
        setError('');
      } catch (err: any) {
        if (!disposed) setError(err?.message || 'The conversation could not be opened.');
      } finally {
        if (!disposed && showLoader) setLoading(false);
      }
    };

    void refresh(true);
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh(false);
    }, 3500);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(false);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [conversationId, token]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const cleanupUnused = async (uploaded: UploadedCommunicationAttachment[], conversationIdToUse: string) => {
    await Promise.allSettled(uploaded.map(attachment => deleteCommunicationAttachment({ attachment, conversationId: conversationIdToUse })));
  };

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!conversation || (!reply.trim() && pendingFiles.length === 0) || sending) return;
    setSending(true);
    setError('');
    const uploaded: UploadedCommunicationAttachment[] = [];
    try {
      for (const file of pendingFiles) {
        uploaded.push(await uploadSalesAttachment({ conversationId: conversation.id, channel: 'chat', file }));
      }
      await sendChatMessage({
        conversationId: conversation.id,
        senderType: 'customer',
        senderName: conversation.customerName || 'Customer',
        messageText: reply.trim(),
        attachmentIds: uploaded.map(item => item.id),
      });
      setReply('');
      setPendingFiles([]);
      setMessages((await getChatMessages(conversation.id)).filter(message => !message.isInternalNote));
    } catch (err: any) {
      if (uploaded.length) await cleanupUnused(uploaded, conversation.id);
      setError(err?.message || 'Your message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50"><div role="status" aria-label="Opening secure conversation" className="h-10 w-10 animate-spin rounded-full border-4 border-[#000080]/20 border-t-[#000080]" /></div>;
  }

  if (error && !conversation) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-12">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><LockKeyhole className="h-7 w-7" /></div>
        <h1 className="mt-5 text-2xl font-black text-slate-950">This conversation link cannot be opened</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">{error}</p>
        <p className="mt-3 text-xs leading-5 text-slate-500">Reply to your ProFox email if you need a fresh secure link.</p>
        <Link to="/" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#000080] px-5 py-3 text-sm font-bold text-white"><ArrowLeft className="h-4 w-4" />Go to ProFox</Link>
      </section>
    </main>;
  }

  if (!conversation) return null;

  const sellerName = conversation.currentSalesName || conversation.originalSalesName || 'ProFox representative';
  const sellerTitle = conversation.currentSalesTitle || 'Sales Consultant';

  return <main className="min-h-screen bg-slate-50 text-slate-950">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Link to="/" className="text-xl font-black tracking-tight text-[#000080]">ProFox</Link>
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Secure customer conversation</div>
      </div>
    </header>

    <div className="mx-auto grid min-h-[calc(100vh-69px)] max-w-5xl gap-0 px-0 sm:px-5 sm:py-6 lg:grid-cols-[280px_1fr]">
      <aside className="border-b border-slate-200 bg-white p-5 sm:rounded-t-3xl sm:border sm:p-6 lg:rounded-l-3xl lg:rounded-tr-none lg:border-r-0">
        <div className="flex items-center gap-3">
          {conversation.currentSalesAvatar ? <img src={conversation.currentSalesAvatar} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#000080]/10 text-[#000080]"><UserRound className="h-6 w-6" /></div>}
          <div className="min-w-0"><div className="truncate text-sm font-black">{sellerName}</div><div className="mt-0.5 text-xs text-slate-500">{sellerTitle} at ProFox</div></div>
        </div>
        <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs leading-5 text-slate-600">
          <div className="mb-1 flex items-center gap-2 font-black text-[#000080]"><MessageSquare className="h-4 w-4" />One continuous conversation</div>
          Your customer-facing history stays connected to your ProFox relationship. If you become a client, this same conversation is also available inside your Client Portal.
        </div>
        <Link to="/client-portal" className="mt-4 inline-flex text-xs font-bold text-[#000080] hover:underline">Already a client? Open Client Portal</Link>
        <div className="mt-6 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-400">ProFox<br />From site to system.<br /><a className="text-[#000080] hover:underline" href="https://www.profoxwebdesigner.com/">www.profoxwebdesigner.com</a></div>
      </aside>

      <section className="flex min-h-[620px] flex-col bg-white sm:rounded-b-3xl sm:border sm:border-t-0 lg:rounded-r-3xl lg:rounded-bl-none lg:border-l lg:border-t">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <h1 className="text-base font-black">Conversation with {sellerName}</h1>
          <p className="mt-1 text-xs text-slate-500">Messages and customer-facing attachments here are visible to you and the authorized ProFox team supporting this relationship. Private internal notes are never shown here.</p>
        </div>

        {error && <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-700">{error}</div>}

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-5 sm:p-6">
          {messages.length === 0 && <div className="py-16 text-center text-sm text-slate-400">Your conversation is ready.</div>}
          {messages.map(message => {
            const customer = message.senderType === 'customer';
            if (message.senderType === 'system') return <div key={message.id} className="text-center"><span className="inline-block rounded-full bg-slate-200 px-3 py-1 text-[10px] font-bold text-slate-600">{message.messageText}</span></div>;
            return <div key={message.id} className={`flex ${customer ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm shadow-sm ${customer ? 'rounded-tr-none bg-[#000080] text-white' : 'rounded-tl-none border border-slate-200 bg-white text-slate-900'}`}>
                <div className={`mb-1 text-[10px] font-bold ${customer ? 'text-white/70' : 'text-slate-400'}`}>{customer ? 'You' : message.senderName || sellerName} · {formatMessageTime(message.createdAt)}</div>
                <RichMessageText text={message.messageText} inverse={customer} />
                <CommunicationAttachmentList attachments={(message as any).attachments || []} conversationId={conversation.id} inverse={customer} />
              </div>
            </div>;
          })}
          <div ref={endRef} />
        </div>

        <form onSubmit={handleSend} className="space-y-2 border-t border-slate-200 bg-white p-4 sm:p-5">
          <CommunicationComposerTools files={pendingFiles} onFilesChange={setPendingFiles} text={reply} onTextChange={setReply} disabled={sending} />
          <div className="flex items-end gap-2">
            <textarea rows={2} maxLength={4000} value={reply} onChange={event => setReply(event.target.value)} placeholder={`Reply to ${sellerName}...`} className="min-h-[54px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#000080] focus:bg-white" />
            <button type="submit" disabled={(!reply.trim() && pendingFiles.length === 0) || sending} className="flex min-h-[54px] items-center gap-2 rounded-2xl bg-[#000080] px-5 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"><Send className="h-4 w-4" />{sending ? 'Sending...' : 'Send'}</button>
          </div>
          <div className="text-[10px] text-slate-400">Files are stored privately in ProFox R2 storage. Do not share this secure conversation link publicly.</div>
        </form>
      </section>
    </div>
  </main>;
}
