import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  LockKeyhole,
  MessageSquare,
  Phone,
  Send,
  ShieldCheck,
  Star,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useCMS } from '../../lib/CMSProvider';
import type { ChatMessage } from '../../types';
import {
  createOrGetConversation,
  getChatConversation,
  getChatMessages,
  requestChatRecovery,
  resolvePublicChat,
  submitChatRating,
  verifyChatRecovery,
  type ChatConversationResult,
  type ChatRecoveryChallenge,
} from '../../lib/chatService';

type ChatStep = 'identify' | 'connecting' | 'verify' | 'chat' | 'rate';

const NAME_KEY = 'profox_customer_name_v2';
const EMAIL_KEY = 'profox_customer_email_v2';
const PHONE_KEY = 'profox_customer_phone_v2';

function initials(name?: string) {
  const parts = (name || 'ProFox').trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'PF';
}

export default function LiveChatWidget() {
  const location = useLocation();
  const { content } = useCMS();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<ChatStep>('identify');
  const [customerName, setCustomerName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [customerEmail, setCustomerEmail] = useState(() => localStorage.getItem(EMAIL_KEY) || '');
  const [customerPhone, setCustomerPhone] = useState(() => localStorage.getItem(PHONE_KEY) || '');
  const [intent, setIntent] = useState<'new_package' | 'existing_issue'>('new_package');
  const [activeConversation, setActiveConversation] = useState<ChatConversationResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [challenge, setChallenge] = useState<ChatRecoveryChallenge | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isGlobalEnabled = content.siteSettings?.chatWidgetEnabled !== false;
  const hiddenRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/client-portal');

  const fetchConversation = async (conversationId: string) => {
    const [conversation, timeline] = await Promise.all([
      getChatConversation(conversationId),
      getChatMessages(conversationId),
    ]);
    setActiveConversation(conversation);
    setMessages(timeline.filter(message => !message.isInternalNote));
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen || step !== 'chat' || !activeConversation) return;

    let disposed = false;
    const synchronize = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const [conversation, timeline] = await Promise.all([
          getChatConversation(activeConversation.id),
          getChatMessages(activeConversation.id),
        ]);
        if (disposed) return;
        setActiveConversation(conversation);
        setMessages(timeline.filter(message => !message.isInternalNote));
      } catch (err) {
        if (!disposed) setError(err instanceof Error ? err.message : 'The conversation could not be synchronized.');
      }
    };

    void synchronize();
    const interval = window.setInterval(synchronize, 3500);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void synchronize();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [isOpen, step, activeConversation?.id]);

  if (hiddenRoute || !isGlobalEnabled) return null;

  const openConversation = async () => {
    setLoading(true);
    setError(null);
    setStep('connecting');
    try {
      const result = await createOrGetConversation({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim(),
        intent,
      });

      if ('challengeId' in result) {
        setChallenge(result);
        setVerificationCode('');
        setStep('verify');
        return;
      }

      setActiveConversation(result);
      await fetchConversation(result.id);
      setStep('chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not connect your conversation.');
      setStep('identify');
    } finally {
      setLoading(false);
    }
  };

  const handleIdentifySubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const name = customerName.trim();
    const email = customerEmail.trim().toLowerCase();
    if (name.length < 2) {
      setError('Please enter your name.');
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    localStorage.setItem(NAME_KEY, name);
    localStorage.setItem(EMAIL_KEY, email);
    localStorage.setItem(PHONE_KEY, customerPhone.trim());
    setCustomerEmail(email);
    await openConversation();
  };

  const handleVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challenge || !verificationCode.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const conversation = await verifyChatRecovery({
        challengeId: challenge.challengeId,
        code: verificationCode,
        email: customerEmail,
      });
      setActiveConversation(conversation);
      await fetchConversation(conversation.id);
      setStep('chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The verification code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    setError(null);
    try {
      const nextChallenge = await requestChatRecovery(customerEmail);
      setChallenge(nextChallenge);
      setVerificationCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'A new verification code could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async (preset?: string) => {
    const message = (preset ?? inputText).trim();
    if (!message || !activeConversation || sending) return;
    setSending(true);
    setError(null);
    try {
      const { sendChatMessage } = await import('../../lib/chatService');
      await sendChatMessage({
        conversationId: activeConversation.id,
        senderType: 'customer',
        senderName: customerName,
        messageText: message,
      });
      setInputText('');
      await fetchConversation(activeConversation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  const finishConversation = () => {
    setRatingSubmitted(false);
    setRatingStars(5);
    setRatingComment('');
    setStep('identify');
    setActiveConversation(null);
    setMessages([]);
    setChallenge(null);
    setVerificationCode('');
    setIsOpen(false);
  };

  const handleRatingSubmit = async () => {
    if (!activeConversation) return;
    setLoading(true);
    setError(null);
    try {
      await submitChatRating(activeConversation.id, ratingStars, ratingComment);
      setRatingSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Your feedback could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  const handleSkipFeedback = async () => {
    if (!activeConversation) return finishConversation();
    setLoading(true);
    setError(null);
    try {
      await resolvePublicChat(activeConversation.id);
      finishConversation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The conversation could not be closed.');
    } finally {
      setLoading(false);
    }
  };

  const representativeName = activeConversation?.currentSalesName || 'Your ProFox representative';
  const representativeTitle = activeConversation?.currentSalesTitle || 'Sales & Support';
  const representativeAvailable = activeConversation?.currentSalesAvailability === 'available';

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="group flex items-center rounded-full bg-[#000080] p-4 text-white shadow-[0_8px_30px_rgb(0,0,0,0.14)] transition-all hover:-translate-y-0.5 hover:bg-[#000066] sm:px-6"
          aria-label="Open ProFox chat"
        >
          <MessageSquare className="h-5 w-5 sm:mr-3" />
          <span className="hidden text-sm font-semibold sm:block">Chat with ProFox</span>
        </button>
      )}

      {isOpen && (
        <div className="flex h-[620px] max-h-[85vh] w-[92vw] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18)] sm:w-[390px]">
          <header className="flex shrink-0 items-center justify-between bg-[#000080] px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              {activeConversation?.currentSalesAvatar ? (
                <img
                  src={activeConversation.currentSalesAvatar}
                  alt="Assigned ProFox representative"
                  className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-white/20"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-xs font-bold ring-2 ring-white/20">
                  {initials(activeConversation?.currentSalesName)}
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {activeConversation ? representativeName : 'ProFox Sales & Support'}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-blue-100">
                  {activeConversation ? (
                    <>
                      <span>{representativeTitle}</span>
                      <span>·</span>
                      <span>{representativeAvailable ? 'Available to help' : 'Messages are saved'}</span>
                    </>
                  ) : (
                    <span>Your conversation stays with your account</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {step === 'chat' && (
                <button
                  type="button"
                  onClick={() => setStep('rate')}
                  className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium hover:bg-white/20"
                >
                  End
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-2 hover:bg-white/10"
                aria-label="Minimize chat"
                title="Minimize chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </header>

          {error && (
            <div className="flex shrink-0 items-start gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="font-bold" aria-label="Dismiss error">×</button>
            </div>
          )}

          {step === 'identify' && (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-slate-900">Start once. Continue anytime.</h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                  We keep your customer conversation connected to your assigned representative, so you do not need to start over each time you return.
                </p>
              </div>

              <form onSubmit={handleIdentifySubmit} className="space-y-4">
                <input
                  type="text"
                  required
                  placeholder="Your name"
                  value={customerName}
                  onChange={event => setCustomerName(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] outline-none focus:border-[#000080] focus:bg-white focus:ring-2 focus:ring-[#000080]/10"
                />
                <input
                  type="email"
                  required
                  placeholder="Email address"
                  value={customerEmail}
                  onChange={event => setCustomerEmail(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] outline-none focus:border-[#000080] focus:bg-white focus:ring-2 focus:ring-[#000080]/10"
                />
                <div className="relative">
                  <Phone className="absolute left-4 top-3.5 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="Phone number (optional)"
                    value={customerPhone}
                    onChange={event => setCustomerPhone(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-[13px] outline-none focus:border-[#000080] focus:bg-white focus:ring-2 focus:ring-[#000080]/10"
                  />
                </div>

                <div className="pt-1">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">How can we help?</div>
                  <div className="grid gap-2">
                    <button
                      type="button"
                      onClick={() => setIntent('new_package')}
                      className={`rounded-xl border p-3.5 text-left text-[13px] font-medium transition ${intent === 'new_package' ? 'border-[#000080] bg-[#000080]/5 text-[#000080]' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
                    >
                      New project, pricing or quote
                    </button>
                    <button
                      type="button"
                      onClick={() => setIntent('existing_issue')}
                      className={`rounded-xl border p-3.5 text-left text-[13px] font-medium transition ${intent === 'existing_issue' ? 'border-[#000080] bg-[#000080]/5 text-[#000080]' : 'border-slate-200 text-slate-700 hover:border-slate-300'}`}
                    >
                      Existing customer or ongoing help
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-[#000080] px-4 py-3 text-[13px] font-semibold text-white transition hover:bg-[#000066] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? 'Connecting…' : 'Continue conversation'}
                </button>
              </form>

              <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-[11px] leading-relaxed text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#000080]" />
                <span>Your conversation is saved for service and quality. A new device must verify your email before previous messages can be shown.</span>
              </div>
            </div>
          )}

          {step === 'connecting' && (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#000080]/5 text-[#000080]">
                <UserRoundCheck className="h-7 w-7 animate-pulse" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">Finding your relationship</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">We are reconnecting you to the right current representative and your existing conversation.</p>
            </div>
          )}

          {step === 'verify' && (
            <div className="flex flex-1 flex-col justify-center p-6">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-[#000080]/5 text-[#000080]">
                <LockKeyhole className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Verify before we show history</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                We found an existing relationship for this email. Enter the verification code sent to <strong className="font-semibold text-slate-700">{customerEmail}</strong> to continue on this device.
              </p>
              <form onSubmit={handleVerify} className="mt-5 space-y-3">
                <input
                  type="text"
                  autoComplete="one-time-code"
                  inputMode="text"
                  maxLength={16}
                  placeholder="Verification code"
                  value={verificationCode}
                  onChange={event => setVerificationCode(event.target.value.toUpperCase())}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-base font-semibold tracking-[0.18em] outline-none focus:border-[#000080] focus:bg-white focus:ring-2 focus:ring-[#000080]/10"
                />
                <button
                  type="submit"
                  disabled={loading || !verificationCode.trim()}
                  className="w-full rounded-xl bg-[#000080] px-4 py-3 text-[13px] font-semibold text-white hover:bg-[#000066] disabled:opacity-60"
                >
                  Verify & continue
                </button>
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={loading}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                >
                  Send a new code
                </button>
              </form>
              <button type="button" onClick={() => setStep('identify')} className="mt-4 text-xs font-medium text-slate-400 hover:text-slate-600">Use another email</button>
            </div>
          )}

          {step === 'chat' && activeConversation && (
            <>
              <div className="shrink-0 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="font-medium text-slate-700">Same customer history</span>
                  <span>·</span>
                  <span>{activeConversation.relationshipResumed ? 'Conversation resumed' : 'Saved automatically'}</span>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-white px-4 py-4">
                {messages.map(message => {
                  const own = message.senderType === 'customer';
                  const system = message.senderType === 'system';
                  if (system) {
                    return (
                      <div key={message.id} className="mx-auto max-w-[90%] rounded-lg bg-slate-50 px-3 py-2 text-center text-[11px] leading-relaxed text-slate-500">
                        {message.messageText}
                      </div>
                    );
                  }
                  return (
                    <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 ${own ? 'rounded-br-md bg-[#000080] text-white' : 'rounded-bl-md bg-slate-100 text-slate-800'}`}>
                        {!own && <div className="mb-1 text-[10px] font-semibold text-slate-500">{message.senderName || representativeName}</div>}
                        <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{message.messageText}</div>
                        <div className={`mt-1 text-[9px] ${own ? 'text-blue-200' : 'text-slate-400'}`}>
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="shrink-0 border-t border-slate-100 bg-white p-3">
                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
                  {[
                    ['Pricing', 'Can you send me your pricing packages?'],
                    ['Turnaround', 'How long does a website take to design?'],
                    ['Custom quote', 'I would like to request a custom quote.'],
                  ].map(([label, value]) => (
                    <button key={label} type="button" onClick={() => handleSendMessage(value)} disabled={sending} className="shrink-0 rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {label}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    rows={1}
                    value={inputText}
                    onChange={event => setInputText(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Write a message…"
                    className="max-h-24 min-h-[42px] flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[13px] outline-none focus:border-[#000080] focus:bg-white"
                  />
                  <button type="button" onClick={() => handleSendMessage()} disabled={sending || !inputText.trim()} className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl bg-[#000080] text-white hover:bg-[#000066] disabled:opacity-50" aria-label="Send message">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Clock3 className="h-3 w-3" />
                  <span>If your representative is away, your message stays queued in this same relationship.</span>
                </div>
              </div>
            </>
          )}

          {step === 'rate' && (
            <div className="flex flex-1 flex-col justify-center p-6 text-center">
              {ratingSubmitted ? (
                <>
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-7 w-7" />
                  </div>
                  <h2 className="text-lg font-semibold text-slate-900">Thank you.</h2>
                  <p className="mt-2 text-[13px] leading-relaxed text-slate-500">Your conversation is closed for now, but the history remains saved. You can return later and continue with your assigned relationship.</p>
                  <button type="button" onClick={finishConversation} className="mt-5 rounded-xl bg-[#000080] px-4 py-3 text-[13px] font-semibold text-white">Done</button>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold text-slate-900">How was the support?</h2>
                  <p className="mt-1.5 text-[13px] text-slate-500">Feedback is optional. Closing the chat never deletes your history.</p>
                  <div className="my-5 flex justify-center gap-1">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} type="button" onClick={() => setRatingStars(star)} className="p-1" aria-label={`Rate ${star} stars`}>
                        <Star className={`h-7 w-7 ${star <= ratingStars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={3}
                    value={ratingComment}
                    onChange={event => setRatingComment(event.target.value)}
                    placeholder="Optional feedback"
                    className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] outline-none focus:border-[#000080] focus:bg-white"
                  />
                  <button type="button" onClick={handleRatingSubmit} disabled={loading} className="mt-3 rounded-xl bg-[#000080] px-4 py-3 text-[13px] font-semibold text-white hover:bg-[#000066] disabled:opacity-60">
                    Submit feedback & close
                  </button>
                  <button type="button" onClick={handleSkipFeedback} disabled={loading} className="mt-2 rounded-xl px-4 py-2 text-[12px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-60">
                    Skip feedback & close
                  </button>
                  <button type="button" onClick={() => setStep('chat')} className="mt-1 text-[11px] text-slate-400 hover:text-slate-600">Keep conversation open</button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
