import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { useCMS } from '../../lib/CMSProvider';
import { 
  MessageSquare, X, Send, User, Star, ShieldCheck, CheckCircle, 
  ArrowRight, RefreshCw, Sparkles, Clock, HelpCircle, PhoneCall,
  UserCheck, AlertCircle, HeartHandshake, ChevronLeft
} from 'lucide-react';
import { SalesRep, ChatConversation, ChatMessage } from '../../types';
import { 
  getSalesReps, getOriginalSalesAssignment, 
  createOrGetConversation, getChatMessages, 
  sendChatMessage, submitChatRating 
} from '../../lib/chatService';

export default function LiveChatWidget() {
  const location = useLocation();
  const { isAdminOrEditor } = useAuth();
  const { content } = useCMS();
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<'identify' | 'select_rep' | 'reconnecting' | 'chat' | 'rate'>('identify');
  
  // Customer Info State
  const [customerName, setCustomerName] = useState(() => localStorage.getItem('profox_customer_name_v2') || '');
  const [customerEmail, setCustomerEmail] = useState(() => localStorage.getItem('profox_customer_email_v2') || '');
  const [intent, setIntent] = useState<'new_package' | 'existing_issue'>('new_package');

  // Sales Reps & Active Chat
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [selectedRep, setSelectedRep] = useState<SalesRep | null>(null);
  const [assignedOriginalRep, setAssignedOriginalRep] = useState<SalesRep | null>(null);
  
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Rating State
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingSubmitted, setRatingSubmitted] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadSalesReps = async () => {
    const reps = await getSalesReps();
    setSalesReps(reps);
  };

  const fetchMessages = async (convId: string) => {
    try {
      const msgs = await getChatMessages(convId);
      // The server already excludes internal notes for public tokens. Keep this
      // client guard as defense in depth for previously cached data.
      setMessages(msgs.filter(m => !m.isInternalNote));
    } catch (err: any) {
      setError(err?.message || 'The conversation could not be synchronized.');
    }
  };

  useEffect(() => {
    loadSalesReps();
  }, []);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Polling for new messages when chat is active
  useEffect(() => {
    let interval: any;
    if (isOpen && activeConversation && step === 'chat') {
      fetchMessages(activeConversation.id);
      interval = setInterval(() => {
        fetchMessages(activeConversation.id);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isOpen, activeConversation, step]);

  const isGlobalEnabled = content.siteSettings?.chatWidgetEnabled !== false;

  // Do not show chat widget on admin pages or client portal
  if (location.pathname.startsWith('/admin') || location.pathname.startsWith('/client-portal')) {
    return null;
  }

  // If globally disabled, hide it for everyone (even admins)
  if (!isGlobalEnabled) {
    return null;
  }

  // Handle Initial Entrance (Identify Step)
  const handleIdentifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!customerName.trim() || !customerEmail.trim()) {
      setError('Please provide your name and email address to continue.');
      return;
    }

    if (!customerEmail.includes('@') || !customerEmail.includes('.')) {
      setError('Please enter a valid email address.');
      return;
    }

    // Save locally
    localStorage.setItem('profox_customer_name_v2', customerName.trim());
    localStorage.setItem('profox_customer_email_v2', customerEmail.trim());

    setLoading(true);

    try {
      // Check if existing customer with history
      const { originalRep, previousConversation } = await getOriginalSalesAssignment(customerEmail.trim());

      if (intent === 'existing_issue' || previousConversation) {
        // Customer already has an assigned seller!
        if (originalRep) {
          setAssignedOriginalRep(originalRep);
          setSelectedRep(originalRep);
          setStep('reconnecting');
          
          // Auto initiate or resume conversation
          setTimeout(async () => {
            const conv = await createOrGetConversation({
              customerName: customerName.trim(),
              customerEmail: customerEmail.trim(),
              intent: 'existing_issue',
              selectedSalesId: originalRep.id
            });
            setActiveConversation(conv);
            await fetchMessages(conv.id);
            setStep('chat');
            setLoading(false);
          }, 1200);
          return;
        }
      }

      // If new customer looking for packages, show Sales Rep Selection
      setStep('select_rep');
    } catch (err: any) {
      setError('Failed to connect. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Sales Rep Selection by Customer
  const handleSelectRepAndStart = async (rep: SalesRep) => {
    setSelectedRep(rep);
    setLoading(true);
    setError(null);

    try {
      const conv = await createOrGetConversation({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        intent: 'new_package',
        selectedSalesId: rep.id
      });
      setActiveConversation(conv);
      await fetchMessages(conv.id);
      setStep('chat');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to connect to representative.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Sending Customer Message
  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputText;
    if (!text.trim() || !activeConversation || sending) return;

    setSending(true);
    setError(null);
    try {
      await sendChatMessage({
        conversationId: activeConversation.id,
        senderType: 'customer',
        senderName: customerName,
        messageText: text.trim()
      });
      setInputText('');
      await fetchMessages(activeConversation.id);
    } catch (e) {
      console.error('Error sending message:', e);
      setError(e instanceof Error ? e.message : 'The message could not be sent.');
    } finally {
      setSending(false);
    }
  };

  // Handle Post-Chat Feedback Submission
  const handleRatingSubmit = async () => {
    if (!activeConversation) return;
    setLoading(true);
    setError(null);
    try {
      await submitChatRating(activeConversation.id, ratingStars, ratingComment);
      setRatingSubmitted(true);
      setTimeout(() => {
        setStep('identify');
        setActiveConversation(null);
        setRatingSubmitted(false);
      }, 2000);
    } catch (e) {
      console.error('Error submitting rating:', e);
      setError(e instanceof Error ? e.message : 'The rating could not be saved.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {/* Floating Chat Trigger Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative flex items-center justify-center bg-[#000080] hover:bg-[#000066] text-white p-4 sm:px-6 sm:py-4 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] hover:shadow-[0_8px_30px_rgb(0,0,128,0.2)] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer"
        >
          <MessageSquare className="w-5 h-5 sm:mr-3" />
          <div className="hidden sm:block text-left">
            <span className="text-sm font-semibold tracking-wide">Chat with Sales</span>
          </div>
          <span className="absolute top-0 right-0 w-3 h-3 bg-emerald-400 rounded-full ring-2 ring-[#000080] translate-x-1/4 -translate-y-1/4" />
        </button>
      )}

      {/* Main Chat Box Modal */}
      {isOpen && (
        <div className="w-[92vw] sm:w-[380px] h-[600px] max-h-[85vh] bg-white rounded-2xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] border border-slate-100 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
          
          {/* Header Bar */}
          <div className="bg-[#000080] text-white p-4 flex items-center justify-between shadow-sm shrink-0">
            <div className="flex items-center gap-3">
              {step !== 'identify' && (
                <button 
                  onClick={() => setStep('identify')}
                  className="p-1.5 hover:bg-white/10 rounded-full text-white transition-colors cursor-pointer"
                  title="Back"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
              )}
              {selectedRep ? (
                <div className="flex items-center gap-3">
                  <div className="relative">
                    {selectedRep.avatar ? <img src={selectedRep.avatar} alt={selectedRep.name} className="w-10 h-10 rounded-full object-cover ring-2 ring-white/20" /> : <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-[11px] font-bold ring-2 ring-white/20">{selectedRep.name.slice(0, 2).toUpperCase()}</div>}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-[#000080]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold leading-tight">{selectedRep.name}</h3>
                    <p className="text-[11px] text-blue-200 mt-0.5 truncate max-w-[150px]">{selectedRep.title}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold leading-tight">Profox Support</h3>
                    <p className="text-[11px] text-blue-200 mt-0.5 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span> Online
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {step === 'chat' && (
                <button
                  onClick={() => setStep('rate')}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[11px] font-medium transition-all cursor-pointer"
                >
                  End Chat
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && step !== 'identify' && (
            <div className="flex shrink-0 items-start gap-2 border-b border-red-100 bg-red-50 px-4 py-2.5 text-[11px] text-red-700">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => setError(null)} className="font-bold text-red-500" aria-label="Dismiss chat error">×</button>
            </div>
          )}

          {/* STEP 1: IDENTIFY & CHOOSE INTENT */}
          {step === 'identify' && (
            <div className="flex-1 p-6 overflow-y-auto flex flex-col justify-between bg-white">
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900 tracking-tight">Hi there,</h2>
                  <p className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">
                    Please fill out the form below to connect with a sales expert.
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-50 text-red-600 rounded-lg text-[13px] flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <form onSubmit={handleIdentifySubmit} className="space-y-5">
                  <div className="space-y-4">
                    <div>
                      <input
                        type="text"
                        required
                        placeholder="Your Name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#000080]/10 focus:border-[#000080]"
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        required
                        placeholder="Email Address"
                        value={customerEmail}
                        onChange={(e) => setCustomerEmail(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#000080]/10 focus:border-[#000080]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                      How can we help?
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setIntent('new_package')}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                          intent === 'new_package'
                            ? 'border-[#000080] bg-[#000080]/5 ring-1 ring-[#000080]'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${intent === 'new_package' ? 'border-[#000080]' : 'border-slate-300'}`}>
                          {intent === 'new_package' && <div className="w-2 h-2 bg-[#000080] rounded-full" />}
                        </div>
                        <span className={`text-[13px] font-medium ${intent === 'new_package' ? 'text-[#000080]' : 'text-slate-700'}`}>
                          New Web Package or Quote
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIntent('existing_issue')}
                        className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-3 ${
                          intent === 'existing_issue'
                            ? 'border-[#000080] bg-[#000080]/5 ring-1 ring-[#000080]'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${intent === 'existing_issue' ? 'border-[#000080]' : 'border-slate-300'}`}>
                          {intent === 'existing_issue' && <div className="w-2 h-2 bg-[#000080] rounded-full" />}
                        </div>
                        <span className={`text-[13px] font-medium ${intent === 'existing_issue' ? 'text-[#000080]' : 'text-slate-700'}`}>
                          Existing Customer Support
                        </span>
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-[13px] font-semibold transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 shadow-[0_4px_14px_0_rgba(0,0,128,0.2)] hover:shadow-[0_6px_20px_rgba(0,0,128,0.23)] hover:-translate-y-0.5"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Start Chat'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* STEP 2A: SELECT SALES REPRESENTATIVE (New Visitor) */}
          {step === 'select_rep' && (
            <div className="flex-1 p-5 overflow-y-auto bg-slate-50/50 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 tracking-tight">Choose a Sales Representative</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Select a verified specialist based on availability and expertise.</p>
              </div>

              <div className="space-y-3">
                {salesReps.length === 0 && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center text-xs leading-5 text-amber-800">No verified sales representative is currently available. Please use the contact form and our team will follow up.</div>}
                {salesReps.map((rep) => (
                  <div
                    key={rep.id}
                    onClick={() => handleSelectRepAndStart(rep)}
                    className="p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#000080]/30 rounded-2xl shadow-sm transition-all cursor-pointer group relative"
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        {rep.avatar ? <img src={rep.avatar} alt={rep.name} className="w-12 h-12 rounded-full object-cover ring-1 ring-slate-200 group-hover:ring-[#000080]/20 transition-all" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#000080]/10 text-xs font-bold text-[#000080] ring-1 ring-slate-200">{rep.name.slice(0, 2).toUpperCase()}</div>}
                        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full ring-2 ring-white ${rep.isOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="text-[13px] font-semibold text-slate-900 group-hover:text-[#000080] transition-colors">{rep.name}</div>
                          {rep.reviewCount > 0 ? <div className="flex items-center gap-1 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 text-amber-800 text-[10px] font-semibold"><Star className="w-3 h-3 fill-amber-400 text-amber-400" /><span>{rep.rating}</span><span className="text-slate-400 font-normal">({rep.reviewCount})</span></div> : <div className="flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-[#000080]"><ShieldCheck className="h-3 w-3" />Verified</div>}
                        </div>

                        <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">{rep.title}</p>
                        
                        {/* Specialties Chips */}
                        <div className="flex flex-wrap gap-1 mt-2">
                          {rep.specialties.slice(0, 2).map((s, idx) => (
                            <span key={idx} className="text-[10px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => salesReps[0] && handleSelectRepAndStart(salesReps[0])}
                disabled={!salesReps.length}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[11px] font-semibold transition-all text-center cursor-pointer mt-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Auto-Assign First Available Representative
              </button>
            </div>
          )}

          {/* STEP 2B: RECONNECTING TO ORIGINAL SALES REP */}
          {step === 'reconnecting' && (
            <div className="flex-1 p-6 flex flex-col items-center justify-center text-center bg-white space-y-5">
              <div className="relative">
                {assignedOriginalRep?.avatar ? <img src={assignedOriginalRep.avatar} alt={assignedOriginalRep.name} className="w-24 h-24 rounded-full object-cover ring-2 ring-slate-100 shadow-sm" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#000080]/10 text-xl font-bold text-[#000080] ring-2 ring-slate-100 shadow-sm">{assignedOriginalRep?.name?.slice(0, 2).toUpperCase() || 'PF'}</div>}
                <div className="absolute -bottom-2 -right-2 p-2 bg-emerald-500 text-white rounded-full ring-4 ring-white shadow-sm">
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                  Assigned Account Representative
                </span>
                <h3 className="text-lg font-semibold text-slate-900 mt-4 tracking-tight">Reconnecting with {assignedOriginalRep?.name}</h3>
                <p className="text-[13px] text-slate-500 mt-2 max-w-xs leading-relaxed">
                  We matched your email to your original sales consultant. Restoring your conversation history...
                </p>
              </div>

              <div className="flex items-center gap-2 text-[13px] font-medium text-slate-400">
                <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                <span>Loading chat history</span>
              </div>
            </div>
          )}

          {/* STEP 3: REAL-TIME CHAT SCREEN */}
          {step === 'chat' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50/50">
              
              {/* Message Stream */}
              <div className="flex-1 p-4 overflow-y-auto space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-[13px]">
                    Start conversation by sending a message below.
                  </div>
                ) : (
                  messages.map((m) => {
                    if (m.senderType === 'system') {
                      return (
                        <div key={m.id} className="text-center my-3">
                          <span className="inline-block text-[11px] bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-medium border border-slate-200">
                            {m.messageText}
                          </span>
                        </div>
                      );
                    }

                    const isMe = m.senderType === 'customer';

                    return (
                      <div 
                        key={m.id} 
                        className={`flex gap-2.5 ${isMe ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMe && (
                          <img 
                            src={selectedRep?.avatar || 'https://images.unsplash.com/photo-1560250097-0b93528c311a'} 
                            alt={m.senderName} 
                            className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5 ring-1 ring-slate-200"
                          />
                        )}

                        <div className={`max-w-[80%] p-3.5 rounded-2xl text-[13px] shadow-sm ${
                          isMe 
                            ? 'bg-[#000080] text-white rounded-tr-[4px]' 
                            : 'bg-white text-slate-800 border border-slate-200 rounded-tl-[4px]'
                        }`}>
                          <div className={`text-[10px] opacity-70 mb-1.5 flex items-center justify-between gap-3 ${isMe ? 'text-blue-200' : 'text-slate-500'}`}>
                            <span className="font-medium">{m.senderName}</span>
                            <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="whitespace-pre-wrap leading-relaxed">{m.messageText}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompt Chips */}
              <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
                <button
                  onClick={() => handleSendMessage('Can you send me your pricing packages?')}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer"
                >
                  💼 View Pricing Packages
                </button>
                <button
                  onClick={() => handleSendMessage('How long does a website take to design?')}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer"
                >
                  ⏱️ Turnaround Times
                </button>
                <button
                  onClick={() => handleSendMessage('I would like to request a custom quote.')}
                  className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors cursor-pointer"
                >
                  📝 Custom Quote
                </button>
              </div>

              {/* Input Area */}
              <div className="p-3 bg-white border-t border-slate-100 flex items-center gap-2 pb-4">
                <input
                  type="text"
                  placeholder="Type your message..."
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#000080]/10 focus:border-[#000080]"
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={!inputText.trim() || sending}
                  className="p-3 bg-[#000080] hover:bg-[#000066] text-white rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: RATE CHAT & FEEDBACK */}
          {step === 'rate' && (
            <div className="flex-1 p-6 overflow-y-auto bg-white flex flex-col justify-between">
              {ratingSubmitted ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="p-4 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-slate-900 tracking-tight">Thank you!</h3>
                    <p className="text-[13px] text-slate-500 mt-1">Your feedback helps us maintain top quality service.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-semibold text-slate-900 tracking-tight">Rate your experience</h3>
                    <p className="text-[13px] text-slate-500 mt-1.5">
                      How was your consultation with {selectedRep?.name || 'our sales representative'}?
                    </p>
                  </div>

                  {/* Star Rating Picker */}
                  <div className="flex items-center justify-center gap-3 py-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingStars(star)}
                        className="p-1 transition-transform hover:scale-110 cursor-pointer"
                      >
                        <Star className={`w-9 h-9 ${star <= ratingStars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Feedback Comment (Optional)</label>
                    <textarea
                      rows={4}
                      placeholder="Share details about your consultation..."
                      value={ratingComment}
                      onChange={(e) => setRatingComment(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[13px] transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#000080]/10 focus:border-[#000080]"
                    />
                  </div>

                  <button
                    onClick={handleRatingSubmit}
                    disabled={loading}
                    className="w-full py-3.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-[13px] font-semibold shadow-lg shadow-[#000080]/20 transition-all cursor-pointer disabled:opacity-50 mt-4"
                  >
                    {loading ? 'Submitting...' : 'Submit Rating & End Chat'}
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
