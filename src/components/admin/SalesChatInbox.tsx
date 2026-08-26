import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare, Search, RefreshCw, Send, User, Star, Shield,
  CheckCircle, Clock, AlertCircle, Phone, Mail, StickyNote,
  ChevronRight, Filter, UserCheck, Tag, ArrowRight, CornerDownRight, Volume2,
  Users, X, Settings
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { ChatConversation, ChatMessage, SalesRep } from '../../types';
import {
  getConversations, getChatMessages, sendChatMessage,
  updateConversationStatus, getSalesReps, playChatChime
} from '../../lib/chatService';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthorized) void loadData();
  }, [role, user?.email, requestedConversationId]);

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let interval: any;
    if (isAuthorized) {
      interval = setInterval(() => { void refreshDataSilent(); }, 3500);
    }
    return () => clearInterval(interval);
  }, [isAuthorized, selectedConv?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [convs, reps] = await Promise.all([getConversations(), getSalesReps()]);
      setConversations(convs);
      setSalesReps(reps);

      const requested = requestedConversationId ? convs.find(conv => conv.id === requestedConversationId) : null;
      const current = selectedConv ? convs.find(conv => conv.id === selectedConv.id) : null;
      const target = requested || current || convs[0] || null;
      if (target) {
        setSelectedConv(target);
        const msgs = await getChatMessages(target.id);
        setMessages(msgs);
        if (target.status === 'resolved') setActiveTab('resolved');
        else if (requested) setActiveTab('my_clients');
      } else {
        setSelectedConv(null);
        setMessages([]);
      }
    } catch (e) {
      console.error('Error loading sales inbox:', e);
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
        const msgs = await getChatMessages(current.id);
        setMessages(msgs);
      }
    } catch (e) {
      // Silent refresh intentionally leaves the current inbox visible.
    }
  };

  const handleSelectConversation = async (conv: ChatConversation) => {
    setSelectedConv(conv);
    const msgs = await getChatMessages(conv.id);
    setMessages(msgs);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConv || sending) return;
    setSending(true);
    try {
      const repName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Sales Representative';
      await sendChatMessage({
        conversationId: selectedConv.id,
        senderType: 'sales_rep',
        senderName: repName,
        senderId: user?.id,
        messageText: replyText.trim(),
        isInternalNote
      });
      setReplyText('');
      const msgs = await getChatMessages(selectedConv.id);
      setMessages(msgs);
      const convs = await getConversations();
      setConversations(convs);
      const current = convs.find(conv => conv.id === selectedConv.id);
      if (current) setSelectedConv(current);
    } catch (e) {
      console.error('Failed sending reply:', e);
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
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] bg-white rounded-2xl border border-red-200 p-8 text-center space-y-4">
        <div className="p-4 bg-red-100 text-red-700 rounded-full"><Shield className="w-10 h-10" /></div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md">The Live Sales Inbox is strictly reserved for Sales Representative accounts and Administrators. Web Designers and Developers are restricted from viewing client leads.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[82vh] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden font-sans">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#000080] text-white rounded-xl shadow-sm"><MessageSquare className="w-5 h-5" /></div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Sales Live Chat Inbox</h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-[#000080] border border-blue-200 flex items-center gap-1"><Shield className="w-3 h-3" /> Sales & Support Privileged</span>
            </div>
            <p className="text-xs text-slate-500">Manage incoming customer sales leads, quotation conversations, package inquiries, and customer support.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setShowTeamModal(true)} className="px-3 py-1.5 bg-[#000080] hover:bg-[#000066] text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"><Users className="w-4 h-4" /> Verified Sales Team ({salesReps.length})</button>
          <button onClick={playChatChime} className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer" title="Test Chime Sound"><Volume2 className="w-4 h-4 text-[#000080]" /> Test Chime</button>
          <button onClick={() => void loadData()} disabled={loading} className="p-2 text-slate-600 hover:text-[#000080] hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer" title="Refresh Inbox"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80 sm:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
          <div className="p-3 border-b border-slate-200 space-y-2.5 bg-white">
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button onClick={() => setActiveTab('my_clients')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'my_clients' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Active Leads ({conversations.filter(c => c.status !== 'resolved').length})</button>
              <button onClick={() => setActiveTab('resolved')} className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === 'resolved' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>Archive ({conversations.filter(c => c.status === 'resolved').length})</button>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search name, email, quotation, text..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#000080]" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">No active sales conversations found.</div>
            ) : filteredConversations.map((conv) => {
              const meta = conv as any;
              const isSelected = selectedConv?.id === conv.id;
              const origRep = salesReps.find(r => r.id === conv.originalSalesId);
              const quotationConversation = meta.conversationKind === 'quotation';
              return (
                <div key={conv.id} onClick={() => void handleSelectConversation(conv)} className={`p-4 transition-all cursor-pointer hover:bg-white relative ${isSelected ? 'bg-white border-l-4 border-l-[#000080] shadow-sm' : 'bg-transparent'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{conv.customerName}</h4>
                        {quotationConversation ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-100 text-violet-800 border border-violet-200 shrink-0">Quotation {meta.quotationNumber || ''}</span> : conv.intent === 'existing_issue' ? <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">Existing</span> : <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-200 shrink-0">New Lead</span>}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{conv.customerEmail}</p>
                    </div>
                    <span className="text-[9px] font-medium text-slate-400 shrink-0">{conv.lastMessageTime ? new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-1 mt-2 font-normal">{conv.lastMessage || 'Conversation started'}</p>
                  <div className="flex items-center justify-between mt-2.5 text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                    <span className="flex items-center gap-1 text-slate-500"><UserCheck className="w-3 h-3 text-[#000080]" /> Seller: {origRep?.name || 'Assigned Rep'}</span>
                    {conv.ratingGiven && <span className="flex items-center gap-0.5 text-amber-600 font-bold">★ {conv.ratingGiven}/5</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {selectedConv ? (
          <div className="flex-1 flex flex-col h-full bg-white">
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#000080]/10 text-[#000080] rounded-xl"><User className="w-5 h-5" /></div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{selectedConv.customerName}</h3>
                    <span className="text-xs text-slate-500">({selectedConv.customerEmail})</span>
                    {(selectedConv as any).conversationKind === 'quotation' && <span className="rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[9px] font-black uppercase text-violet-700">Quotation {(selectedConv as any).quotationNumber}</span>}
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5"><span>Assigned Salesperson: <strong className="text-slate-800">{salesReps.find(r => r.id === selectedConv.originalSalesId)?.name || 'Default Sales'}</strong></span></p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Status:</span>
                <select value={selectedConv.status} onChange={(e) => void handleStatusChange(e.target.value as any)} className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#000080]">
                  <option value="open">🟢 Open / Active</option>
                  <option value="pending">🟡 Pending Customer</option>
                  <option value="resolved">✅ Resolved / Archive</option>
                </select>
              </div>
            </div>

            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/40">
              {messages.map((m) => {
                if (m.senderType === 'system') return <div key={m.id} className="text-center my-2"><span className="inline-block text-[10px] bg-slate-200 text-slate-700 px-3 py-1 rounded-full font-bold">{m.messageText}</span></div>;
                if (m.isInternalNote) return <div key={m.id} className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs shadow-sm space-y-1"><div className="flex items-center justify-between font-bold text-[10px] text-amber-800"><span className="flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5 text-amber-600" /> Internal Sales Note (Hidden from Customer)</span><span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><p className="font-medium whitespace-pre-wrap">{m.messageText}</p></div>;
                const isCustomer = m.senderType === 'customer';
                return <div key={m.id} className={`flex gap-3 ${isCustomer ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[75%] p-4 rounded-2xl text-xs shadow-sm ${isCustomer ? 'bg-white text-slate-900 border border-slate-200 rounded-tl-none' : 'bg-[#000080] text-white rounded-tr-none'}`}><div className="flex items-center justify-between gap-4 text-[10px] opacity-70 mb-1"><span className="font-bold">{m.senderName}</span><span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div><p className="whitespace-pre-wrap leading-relaxed font-medium">{m.messageText}</p></div></div>;
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-bold text-slate-400 shrink-0">Quick Templates:</span>
              <button type="button" onClick={() => handleCannedResponse("Hello! Thank you for reaching out to Profox web designer. How can I assist you with your web project today?")} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer">👋 Welcome Greeting</button>
              <button type="button" onClick={() => handleCannedResponse("We offer custom web design, e-commerce solutions, and enterprise software development. Would you like a custom quote or package recommendation?")} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer">💼 Package Overview</button>
              <button type="button" onClick={() => handleCannedResponse("I've shared your requirements with our design team. We'll have a preliminary project roadmap ready for you shortly.")} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-medium rounded-lg whitespace-nowrap transition-colors cursor-pointer">🎨 Draft Update</button>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setIsInternalNote(!isInternalNote)} className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${isInternalNote ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}><StickyNote className="w-3.5 h-3.5" /><span>{isInternalNote ? 'Internal Note Active (Yellow)' : 'Public Customer Reply'}</span></button>
              </div>
              <div className="flex items-center gap-2">
                <textarea rows={2} placeholder={isInternalNote ? 'Type internal note for sales team...' : 'Type message to customer...'} value={replyText} onChange={(e) => setReplyText(e.target.value)} className={`flex-1 p-3 border rounded-xl text-xs font-medium focus:outline-none ${isInternalNote ? 'bg-amber-50/80 border-amber-300 focus:border-amber-500 text-amber-950' : 'bg-slate-50 border-slate-200 focus:border-[#000080] text-slate-900'}`} />
                <button onClick={() => void handleSendReply()} disabled={!replyText.trim() || sending} className={`px-5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md ${isInternalNote ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' : 'bg-[#000080] text-white hover:bg-[#000080]/90'}`}><Send className="w-4 h-4" /><span>Send</span></button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50"><MessageSquare className="w-12 h-12 text-slate-300 mb-2" /><p className="text-sm font-bold text-slate-700">Select a conversation</p><p className="text-xs text-slate-400 mt-0.5">Pick a customer chat from the left column to reply.</p></div>
        )}
      </div>

      {showTeamModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 border border-slate-200 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5"><div className="p-2 bg-[#000080] text-white rounded-xl"><Users className="w-5 h-5" /></div><div><h3 className="text-base font-bold text-slate-900">Verified Sales Representatives</h3><p className="text-xs text-slate-500">Only active, onboarded employee accounts can receive website chats and CRM leads.</p></div></div>
              <button type="button" onClick={() => setShowTeamModal(false)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto py-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] leading-5 text-blue-800">Add, activate, qualify, or deactivate sellers in <strong>Team &amp; Users</strong>. The website chat directory follows those verified employee records automatically.</div>
              <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">
                {salesReps.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">No active, onboarded sales representative is currently available.</div> : salesReps.map((rep, repIdx) => <div key={`${rep.id || 'rep'}_${repIdx}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-slate-50">{rep.avatar ? <img src={rep.avatar} alt={rep.name} className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-slate-100" /> : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#000080]/10 text-xs font-black text-[#000080]">{rep.name.slice(0, 2).toUpperCase()}</div>}<div className="min-w-0"><div className="flex items-center gap-2"><h4 className="truncate text-xs font-bold text-slate-900">{rep.name}</h4><span className={`h-2 w-2 rounded-full ${rep.isOnline ? 'bg-emerald-500' : 'bg-amber-400'}`} /></div><p className="mt-0.5 truncate text-[11px] text-slate-500">{rep.title}</p><div className="mt-1.5 flex flex-wrap gap-1">{rep.specialties.map((specialty, index) => <span key={`${specialty}_${index}`} className="rounded bg-slate-100 px-2 py-0.5 text-[9px] font-medium text-slate-600">{specialty}</span>)}</div></div></div>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
