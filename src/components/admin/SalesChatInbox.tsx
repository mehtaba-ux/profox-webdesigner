import { ConfirmButton } from "./ConfirmButton";
import { useConfirmContext } from "./ConfirmContext";
import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Search, RefreshCw, Send, User, Star, Shield, 
  CheckCircle, Clock, AlertCircle, Phone, Mail, StickyNote, 
  ChevronRight, Filter, UserCheck, Tag, ArrowRight, CornerDownRight, Volume2,
  Users, Trash2, Plus, X, Settings
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { ChatConversation, ChatMessage, SalesRep } from '../../types';
import { 
  getConversations, getChatMessages, sendChatMessage, 
  updateConversationStatus, getSalesReps, playChatChime,
  deleteSalesRep, addSalesRep
} from '../../lib/chatService';

export default function SalesChatInbox() {
  const { user, role } = useAuth();
  
  const userEmailLower = user?.email?.toLowerCase() || '';
  const isSalesUser = role === 'sales_team' || 
                      user?.user_metadata?.role === 'sales_team' || 
                      userEmailLower.includes('sales');
  const isAdmin = role === 'admin' || user?.user_metadata?.role === 'admin';

  // Access restriction check
  const isAuthorized = isSalesUser || isAdmin;

  // Filter & Search State
  const [activeTab, setActiveTab] = useState<'my_clients' | 'all_chats' | 'resolved'>('my_clients');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data State
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [selectedConv, setSelectedConv] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Sales Team Modal State
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showAddRepForm, setShowAddRepForm] = useState(false);
  const [newRepForm, setNewRepForm] = useState({
    name: '',
    email: '',
    title: 'Sales Representative',
    specialties: 'Web Packages, Custom Quotes',
    bio: '',
    avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=250'
  });

  // Form State
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthorized) {
      loadData();
    }
  }, [role, user?.email]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Polling for new chats & messages
  useEffect(() => {
    let interval: any;
    if (isAuthorized) {
      interval = setInterval(() => {
        refreshDataSilent();
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isAuthorized, selectedConv?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [convs, reps] = await Promise.all([
        getConversations(),
        getSalesReps()
      ]);
      setConversations(convs);
      setSalesReps(reps);

      if (convs.length> 0 && !selectedConv) {
        setSelectedConv(convs[0]);
        const msgs = await getChatMessages(convs[0].id);
        setMessages(msgs);
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
        const msgs = await getChatMessages(selectedConv.id);
        setMessages(msgs);
      }
    } catch (e) {
      // Silent error
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
        isInternalNote: isInternalNote
      });

      setReplyText('');
      const msgs = await getChatMessages(selectedConv.id);
      setMessages(msgs);

      // Refresh list
      const convs = await getConversations();
      setConversations(convs);
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
    refreshDataSilent();
  };

  const handleCannedResponse = (text: string) => {
    setReplyText(text);
  };

  const handleDeleteRep = async (repId: string) => {
    if (window.confirm('Are you sure you want to remove this sales representative? They will be removed from the chat widget and team section.')) {
      await deleteSalesRep(repId);
      const updatedReps = await getSalesReps();
      setSalesReps(updatedReps);
    }
  };

  const handleCreateNewRep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepForm.name) return;

    await addSalesRep({
      name: newRepForm.name,
      email: newRepForm.email || `${newRepForm.name.toLowerCase().replace(/\s+/g, '.')}@profoxweb.com`,
      title: newRepForm.title,
      avatar: newRepForm.avatar,
      specialties: newRepForm.specialties.split(',').map(s => s.trim()).filter(Boolean),
      rating: 5.0,
      reviewCount: 1,
      isOnline: true,
      bio: newRepForm.bio
    });

    const updatedReps = await getSalesReps();
    setSalesReps(updatedReps);
    setShowAddRepForm(false);
    setNewRepForm({
      name: '',
      email: '',
      title: 'Sales Representative',
      specialties: 'Web Packages, Custom Quotes',
      bio: '',
      avatar: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=250'
    });
  };

  // Filter conversations
  const filteredConversations = conversations.filter(c => {
    const matchesSearch = 
      c.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.customerEmail.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.lastMessage && c.lastMessage.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    if (activeTab === 'resolved') return c.status === 'resolved';
    if (activeTab === 'my_clients') return c.status !== 'resolved';
    return c.status !== 'resolved';
  });

  if (!isAuthorized) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] bg-white rounded-2xl border border-red-200 p-8 text-center space-y-4">
        <div className="p-4 bg-red-100 text-red-700 rounded-full">
          <Shield className="w-10 h-10" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Access Restricted</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            The Live Sales Inbox is strictly reserved for Sales Representative accounts and Administrators. Web Designers and Developers are restricted from viewing client leads.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[82vh] bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden font-sans">
      
      {/* Top Bar Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#000080] text-white rounded-xl shadow-sm">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">Sales Live Chat Inbox</h2>
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-[#000080] border border-blue-200 flex items-center gap-1">
                <Shield className="w-3 h-3" /> Sales & Support Privileged
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Manage incoming customer sales leads, packages inquiries, and customer support.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button>
            <Users className="w-4 h-4 text-blue-200" /> Manage Sales Team ({salesReps.length})
          </button>

          <button 
            onClick={playChatChime}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Test Chime Sound"
>
            <Volume2 className="w-4 h-4 text-[#000080]" /> Test Chime
          </button>
          
          <button 
            onClick={loadData}
            disabled={loading}
            className="p-2 text-slate-600 hover:text-[#000080] hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
            title="Refresh Inbox"
>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main 2-Column Chat Layout */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Column: Conversation List */}
        <div className="w-80 sm:w-96 border-r border-slate-200 flex flex-col bg-slate-50/50">
          
          {/* Tabs & Search */}
          <div className="p-3 border-b border-slate-200 space-y-2.5 bg-white">
            <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
              <button onClick={() => setActiveTab('my_clients')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'my_clients' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`} >
                Active Leads ({conversations.filter(c => c.status !== 'resolved').length})
              </button>
              <button onClick={() => setActiveTab('resolved')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === 'resolved' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`} >
                Archive ({conversations.filter(c => c.status === 'resolved').length})
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search name, email, text..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-[#000080]"
              />
            </div>
          </div>

          {/* Conversation List Stream */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {filteredConversations.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs">
                No active sales conversations found.
              </div>
            ) : (
              filteredConversations.map((conv) => {
                const isSelected = selectedConv?.id === conv.id;
                const origRep = salesReps.find(r => r.id === conv.originalSalesId);

                return (
                  <div
                    key={conv.id}
                    onClick={() => handleSelectConversation(conv)}
                    className={`p-4 transition-all cursor-pointer hover:bg-white relative ${
                      isSelected 
                        ? 'bg-white border-l-4 border-l-[#000080] shadow-sm' 
                        : 'bg-transparent'
                    }`}
                 >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{conv.customerName}</h4>
                          {conv.intent === 'existing_issue' ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 shrink-0">
                              Existing
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                              New Lead
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 truncate mt-0.5">{conv.customerEmail}</p>
                      </div>

                      <span className="text-[9px] font-medium text-slate-400 shrink-0">
                        {conv.lastMessageTime ? new Date(conv.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 line-clamp-1 mt-2 font-normal">
                      {conv.lastMessage || 'Conversation started'}
                    </p>

                    <div className="flex items-center justify-between mt-2.5 text-[10px] text-slate-400 border-t border-slate-100 pt-2">
                      <span className="flex items-center gap-1 text-slate-500">
                        <UserCheck className="w-3 h-3 text-[#000080]" /> Seller: {origRep?.name || 'Assigned Rep'}
                      </span>
                      {conv.ratingGiven && (
                        <span className="flex items-center gap-0.5 text-amber-600 font-bold">
                          ★ {conv.ratingGiven}/5
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Active Conversation View */}
        {selectedConv ? (
          <div className="flex-1 flex flex-col h-full bg-white">
            
            {/* Conversation Header Bar */}
            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#000080]/10 text-[#000080] rounded-xl">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{selectedConv.customerName}</h3>
                    <span className="text-xs text-slate-500">({selectedConv.customerEmail})</span>
                  </div>
                  <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>Assigned Salesperson: <strong className="text-slate-800">{salesReps.find(r => r.id === selectedConv.originalSalesId)?.name || 'Default Sales'}</strong></span>
                  </p>
                </div>
              </div>

              {/* Status Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">Status:</span>
                <select
                  value={selectedConv.status}
                  onChange={(e) => handleStatusChange(e.target.value as any)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:border-[#000080]">
                  <option value="open">🟢 Open / Active</option>
                  <option value="pending">🟡 Pending Customer</option>
                  <option value="resolved">✅ Resolved / Archive</option>
                </select>
              </div>
            </div>

            {/* Chat Message Stream */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4 bg-slate-50/40">
              {messages.map((m) => {
                if (m.senderType === 'system') {
                  return (
                    <div key={m.id} className="text-center my-2">
                      <span className="inline-block text-[10px] bg-slate-200 text-slate-700 px-3 py-1 rounded-full font-bold">
                        {m.messageText}
                      </span>
                    </div>
                  );
                }

                if (m.isInternalNote) {
                  return (
                    <div key={m.id} className="p-3.5 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 text-xs shadow-sm space-y-1">
                      <div className="flex items-center justify-between font-bold text-[10px] text-amber-800">
                        <span className="flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5 text-amber-600" /> Internal Sales Note (Hidden from Customer)</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="font-medium whitespace-pre-wrap">{m.messageText}</p>
                    </div>
                  );
                }

                const isCustomer = m.senderType === 'customer';

                return (
                  <div
                    key={m.id}
                    className={`flex gap-3 ${isCustomer ? 'justify-start' : 'justify-end'}`}
                 >
                    <div className={`max-w-[75%] p-4 rounded-2xl text-xs shadow-sm ${
                      isCustomer 
                        ? 'bg-white text-slate-900 border border-slate-200 rounded-tl-none' 
                        : 'bg-[#000080] text-white rounded-tr-none'
                    }`}>
                      <div className="flex items-center justify-between gap-4 text-[10px] opacity-70 mb-1">
                        <span className="font-bold">{m.senderName}</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed font-medium">{m.messageText}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Canned Template Responses */}
            <div className="px-4 py-2 bg-white border-t border-slate-200 flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-bold text-slate-400 shrink-0">Quick Templates:</span>
              <button>
                👋 Welcome Greeting
              </button>
              <button>
                💼 Package Overview
              </button>
              <button>
                🎨 Draft Update
              </button>
            </div>

            {/* Reply Input Control */}
            <div className="p-4 bg-white border-t border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <button type="button"
                  onClick={() => setIsInternalNote(!isInternalNote)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    isInternalNote 
                      ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-300' 
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`} >
                  <StickyNote className="w-3.5 h-3.5" />
                  <span>{isInternalNote ? 'Internal Note Active (Yellow)' : 'Public Customer Reply'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <textarea
                  rows={2}
                  placeholder={isInternalNote ? 'Type internal note for sales team...' : 'Type message to customer...'}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className={`flex-1 p-3 border rounded-xl text-xs font-medium focus:outline-none ${
                    isInternalNote 
                      ? 'bg-amber-50/80 border-amber-300 focus:border-amber-500 text-amber-950' 
                      : 'bg-slate-50 border-slate-200 focus:border-[#000080] text-slate-900'
                  }`}
                />
                <button 
                  onClick={handleSendReply}
                  disabled={!replyText.trim() || sending}
                  className={`px-5 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-md ${
                    isInternalNote 
                      ? 'bg-amber-500 text-slate-950 hover:bg-amber-600' 
                      : 'bg-[#000080] text-white hover:bg-[#000080]/90'
                  }`}
>
                  <Send className="w-4 h-4" />
                  <span>Send</span>
                </button>
              </div>
            </div>

          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
            <MessageSquare className="w-12 h-12 text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-700">Select a conversation</p>
            <p className="text-xs text-slate-400 mt-0.5">Pick a customer chat from the left column to reply.</p>
          </div>
        )}

      </div>

      {/* Sales Team Management Modal */}
      {showTeamModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 border border-slate-200 shadow-2xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#000080] text-white rounded-xl">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Manage Sales Team Representatives</h3>
                  <p className="text-xs text-slate-500">Delete dummy sales reps or add new sales consultants.</p>
                </div>
              </div>
              <button>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              {!showAddRepForm ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Active Sales Representatives ({salesReps.length})</span>
                    <button>
                      <Plus className="w-3.5 h-3.5" /> Add New Representative
                    </button>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                    {salesReps.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No sales representatives present. Add a new representative above.
                      </div>
                    ) : (
                      salesReps.map((rep) => (
                        <div key={rep.id} className="p-4 flex items-center justify-between gap-4 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <img 
                              src={rep.avatar} 
                              alt={rep.name} 
                              className="w-11 h-11 rounded-full object-cover ring-2 ring-slate-100 shrink-0" 
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-slate-900 truncate">{rep.name}</h4>
                                <span className="text-[10px] font-semibold text-slate-400">({rep.email})</span>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate mt-0.5">{rep.title}</p>
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {rep.specialties.map((s, idx) => (
                                  <span key={idx} className="text-[9px] font-medium bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                                    {s}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>

                          <button>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </>
              ) : (
                /* Add New Sales Representative Form */
                <form onSubmit={handleCreateNewRep} className="space-y-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <Plus className="w-4 h-4 text-emerald-600" /> New Sales Representative
                    </h4>
                    <button>
                      Back to List
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Smith"
                      value={newRepForm.name}
                      onChange={(e) => setNewRepForm(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-[#000080]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. alex.sales@profoxweb.com"
                      value={newRepForm.email}
                      onChange={(e) => setNewRepForm(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-[#000080]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Title / Role</label>
                    <input
                      type="text"
                      placeholder="e.g. Senior E-Commerce Specialist"
                      value={newRepForm.title}
                      onChange={(e) => setNewRepForm(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-[#000080]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Specialties (comma separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. WooCommerce, Landing Pages, Enterprise Quotes"
                      value={newRepForm.specialties}
                      onChange={(e) => setNewRepForm(prev => ({ ...prev, specialties: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-[#000080]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Avatar Photo URL</label>
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/..."
                      value={newRepForm.avatar}
                      onChange={(e) => setNewRepForm(prev => ({ ...prev, avatar: e.target.value }))}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-[#000080]"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button>
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-2 text-xs font-bold bg-[#000080] hover:bg-[#000066] text-white rounded-xl shadow-md">
                      Create Representative
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
