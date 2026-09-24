import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, MessageSquareText, Send } from 'lucide-react';
import { quotationCpqService } from '../../lib/quotationCpqService';

type ConversationMessage = {
  id: string;
  senderType: 'customer' | 'sales_rep' | 'system';
  senderName: string;
  messageText: string;
  createdAt: string;
};

export default function QuotationConversation({ token }: { token: string }) {
  const [conversation, setConversation] = useState<any>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (quiet = false) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    const result = await quotationCpqService.getPublicConversation(token);
    if (result.error) {
      if (!quiet) setError(result.error.message || 'Conversation could not be loaded.');
    } else if (result.data) {
      setConversation(result.data);
      setMessages(Array.isArray(result.data.messages) ? result.data.messages : []);
      setError('');
    }
    if (!quiet) setLoading(false);
  }, [token]);

  const heartbeat = useCallback(async () => {
    if (!token || document.visibilityState !== 'visible') return;
    await quotationCpqService.heartbeatPublicConversation(token);
  }, [token]);

  useEffect(() => {
    void load();
    void heartbeat();
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, 4000);
    const beat = window.setInterval(() => void heartbeat(), 30000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void heartbeat();
        void load(true);
      }
    };
    const onRefresh = () => void load(true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    window.addEventListener('profox:quotation-conversation-refresh', onRefresh as EventListener);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(beat);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('profox:quotation-conversation-refresh', onRefresh as EventListener);
    };
  }, [load, heartbeat]);

  useEffect(() => {
    if (window.location.hash === '#conversation' && !loading) {
      window.setTimeout(() => document.getElementById('conversation')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
  }, [loading]);

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length]);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError('');
    setNotice('');
    const result = await quotationCpqService.sendPublicConversationMessage(token, body, false);
    if (result.error) setError(result.error.message || 'Message could not be sent.');
    else {
      setDraft('');
      setNotice('Message sent to your ProFox representative.');
      await heartbeat();
      await load(true);
      window.setTimeout(() => setNotice(''), 4500);
    }
    setSending(false);
  };

  return (
    <section id="conversation" className="mt-6 scroll-mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-[#000080]/10 p-2.5 text-[#000080]"><MessageSquareText className="h-5 w-5" /></div>
          <div>
            <h3 className="text-sm font-black text-slate-950">Conversation with ProFox</h3>
            <p className="mt-1 text-xs leading-5 text-slate-500">Your messages stay securely connected to this quotation and your long-term ProFox relationship history.</p>
            {conversation?.sellerName && <p className="mt-1 text-[11px] font-bold text-[#000080]">Representative: {conversation.sellerName}</p>}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#000080]" /></div>
      ) : (
        <>
          <div className="max-h-[420px] min-h-[180px] space-y-3 overflow-y-auto bg-slate-50/60 p-4 sm:p-5">
            {messages.length === 0 && <div className="py-10 text-center text-xs text-slate-400">No messages yet. Ask anything about this quotation below.</div>}
            {messages.map(message => {
              if (message.senderType === 'system') return <div key={message.id} className="text-center text-[10px] font-semibold text-slate-400">{message.messageText}</div>;
              const customer = message.senderType === 'customer';
              return (
                <div key={message.id} className={`flex ${customer ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[76%] ${customer ? 'bg-[#000080] text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                    <div className={`text-[10px] font-black ${customer ? 'text-blue-200' : 'text-[#000080]'}`}>{customer ? 'You' : message.senderName || 'ProFox'}</div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{message.messageText}</p>
                    <div className={`mt-1.5 text-[9px] ${customer ? 'text-blue-200' : 'text-slate-400'}`}>{new Date(message.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-200 p-4 sm:p-5">
            {error && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</div>}
            {notice && <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"><CheckCircle2 className="h-4 w-4" />{notice}</div>}
            <textarea
              rows={3}
              maxLength={4000}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Write a message to your ProFox representative..."
              className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 outline-none focus:border-[#000080]"
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] leading-4 text-slate-400">If you leave this page, ProFox can notify you by email when a new reply is waiting. The conversation itself stays here.</p>
              <button type="button" onClick={() => void send()} disabled={sending || !draft.trim()} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000080] px-5 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send Message
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
