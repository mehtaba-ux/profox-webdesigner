import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2, Mail, MessageCircle, MessageSquare, RefreshCw, Search, Send,
  Shield, StickyNote, User, UserCheck, Users, Volume2, VolumeX, X
} from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import type { ChatMessage, SalesRep } from '../../types';
import { getSalesReps, sendChatMessage } from '../../lib/chatService';
import { professionalMailService } from '../../lib/professionalMailService';
import {
  deleteCommunicationAttachment,
  PROFESSIONAL_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES,
  uploadSalesAttachment,
  type UploadedCommunicationAttachment,
} from '../../lib/communicationAttachmentService';
import {
  getUnifiedCustomerConversations,
  getUnifiedCustomerTimeline,
  updateUnifiedCustomerStatus,
  type UnifiedCustomerConversation,
} from '../../lib/unifiedInboxService';
import {
  whatsappBusinessService,
  type CustomerCommunicationCapabilities,
} from '../../lib/whatsappBusinessService';
import CommunicationAttachmentList from '../communication/CommunicationAttachmentList';
import CommunicationComposerTools from '../communication/CommunicationComposerTools';
import RichMessageText from '../communication/RichMessageText';

type ReplyMode = 'chat' | 'email' | 'whatsapp' | 'note';

const CUSTOMER_COMMUNICATION_ROLES = new Set([
  'admin','sales','sales_rep','sales_team','project_manager','site_manager',
  'content_writer','uiux_designer','developer','web_developer','developer_designer','qa',
]);
const SALES_ROLES = new Set(['admin','sales','sales_rep','sales_team']);
const PROFESSIONAL_EMAIL_ROLES = new Set(['admin','project_manager','site_manager']);
const SALES_CHAT_SOUND_KEY = 'profox_sales_chat_sound_v1';
let staffAlertAudioContext: AudioContext | null = null;

function getStaffAlertAudioContext() {
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (!staffAlertAudioContext) staffAlertAudioContext = new AudioContextCtor();
    return staffAlertAudioContext;
  } catch { return null; }
}

async function unlockStaffAlertAudio() {
  try { const context = getStaffAlertAudioContext(); if (context?.state === 'suspended') await context.resume(); }
  catch { /* visual unread indicators remain available */ }
}

function playStaffAlertChime() {
  try {
    const context = getStaffAlertAudioContext();
    if (!context || context.state !== 'running') return;
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, now);
    oscillator.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + 0.35);
  } catch { /* no-op */ }
}

function replySubject(subject: unknown, customerName: string) {
  const clean = String(subject || '').trim();
  if (/^re\s*:/i.test(clean)) return clean.slice(0, 180);
  return `Re: ${clean || customerName}`.slice(0, 180);
}

function deliveryLabel(status: unknown) {
  const value = String(status || '').toLowerCase();
  if (!value) return '';
  if (value === 'read') return 'Read';
  if (value === 'delivered') return 'Delivered';
  if (value === 'sent' || value === 'accepted' || value === 'provider_accepted') return 'Sent';
  if (value === 'failed') return 'Failed';
  if (value === 'received') return 'Received';
  return value.replace(/_/g, ' ');
}

function channelName(channel: string) {
  if (channel === 'email') return 'Email';
  if (channel === 'whatsapp') return 'WhatsApp';
  return 'Website Chat';
}

function modeFromConversation(
  conversation: UnifiedCustomerConversation,
  timeline: ChatMessage[],
  capabilities: CustomerCommunicationCapabilities,
  professionalEmailConnected: boolean,
): ReplyMode {
  const latestExternal = [...timeline].reverse().find(message => !message.isInternalNote && message.senderType !== 'system') as any;
  const channel = String(latestExternal?.channel || '');
  if (channel === 'whatsapp' && capabilities.canSendWhatsApp) return 'whatsapp';
  if (channel === 'email' && capabilities.canSendEmail && professionalEmailConnected && conversation.crmLeadId) return 'email';
  if (channel === 'chat' && conversation.chatConversationId) return 'chat';
  if (conversation.chatConversationId) return 'chat';
  if (capabilities.canSendWhatsApp) return 'whatsapp';
  if (capabilities.canSendEmail && professionalEmailConnected && conversation.crmLeadId) return 'email';
  return 'note';
}

function clearUnread(conversation: UnifiedCustomerConversation): UnifiedCustomerConversation {
  return { ...conversation, unreadCount: 0, latestUnreadCustomerMessageIds: [] };
}

function sameUnifiedConversation(a: UnifiedCustomerConversation, b: UnifiedCustomerConversation) {
  return a.id === b.id || a.conversationIds.some(id => b.conversationIds.includes(id));
}

export default function SalesChatInbox() {
  const { user, role } = useAuth();
  const [searchParams] = useSearchParams();
  const requestedConversationId = searchParams.get('conversation') || '';
  const requestedLeadId = searchParams.get('lead') || '';
  const isAuthorizedRole = CUSTOMER_COMMUNICATION_ROLES.has(String(role || ''));
  const showSalesTeam = SALES_ROLES.has(String(role || ''));
  const canUseProfessionalEmail = PROFESSIONAL_EMAIL_ROLES.has(String(role || ''));

  const [activeTab, setActiveTab] = useState<'active' | 'resolved'>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [conversations, setConversations] = useState<UnifiedCustomerConversation[]>([]);
  const [salesReps, setSalesReps] = useState<SalesRep[]>([]);
  const [selectedConv, setSelectedConv] = useState<UnifiedCustomerConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [capabilities, setCapabilities] = useState<CustomerCommunicationCapabilities | null>(null);
  const [replyMode, setReplyMode] = useState<ReplyMode>('note');
  const [replyText, setReplyText] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [emailSyncing, setEmailSyncing] = useState(false);
  const [professionalEmailConnected, setProfessionalEmailConnected] = useState(false);
  const [inboxError, setInboxError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(() => { try { return localStorage.getItem(SALES_CHAT_SOUND_KEY) !== 'off'; } catch { return true; } });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const alertedMessageIdsRef = useRef<Set<string>>(new Set());
  const alertsSeededRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { setPendingFiles([]); }, [selectedConv?.id, replyMode]);
  useEffect(() => {
    if (!canUseProfessionalEmail && replyMode === 'email') {
      setReplyMode(selectedConv?.chatConversationId ? 'chat' : 'note');
    }
  }, [canUseProfessionalEmail, replyMode, selectedConv?.chatConversationId]);

  const trackUnreadAlerts = (rows: UnifiedCustomerConversation[], allowSound: boolean) => {
    const ids = new Set(rows.flatMap(row => row.latestUnreadCustomerMessageIds || []));
    if (!alertsSeededRef.current) { ids.forEach(id => alertedMessageIdsRef.current.add(id)); alertsSeededRef.current = true; return; }
    const newIds = [...ids].filter(id => !alertedMessageIdsRef.current.has(id));
    newIds.forEach(id => alertedMessageIdsRef.current.add(id));
    if (allowSound && newIds.length > 0 && soundEnabledRef.current) playStaffAlertChime();
  };

  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next); soundEnabledRef.current = next;
    try { localStorage.setItem(SALES_CHAT_SOUND_KEY, next ? 'on' : 'off'); } catch { /* no-op */ }
    if (next) { await unlockStaffAlertAudio(); playStaffAlertChime(); }
  };

  const refreshProfessionalMailState = async () => {
    if (!canUseProfessionalEmail) {
      setProfessionalEmailConnected(false);
      return null;
    }
    try {
      const status = await professionalMailService.getMyStatus();
      const connected = Boolean(status.eligible && status.sendConnected);
      setProfessionalEmailConnected(connected);
      return status;
    } catch { setProfessionalEmailConnected(false); return null; }
  };

  const syncProfessionalInbox = async (silent = true) => {
    if (!isAuthorizedRole || !canUseProfessionalEmail || emailSyncing) return false;
    setEmailSyncing(true); if (!silent) setInboxError('');
    try {
      const status = await refreshProfessionalMailState();
      if (!status?.eligible || !status.sendConnected) return false;
      await professionalMailService.syncInbox();
      return true;
    } catch (error: any) {
      if (!silent) setInboxError(error?.message || 'Professional email could not be synchronized.');
      return false;
    } finally { setEmailSyncing(false); }
  };

  const selectConversation = async (conversation: UnifiedCustomerConversation) => {
    setSelectedConv(conversation); setInboxError(''); setPendingFiles([]);
    try {
      const [timeline, nextCapabilities] = await Promise.all([
        getUnifiedCustomerTimeline(conversation),
        whatsappBusinessService.getCapabilities(conversation.capabilityConversationId),
      ]);
      const mailStatus = await refreshProfessionalMailState();
      const mailConnected = Boolean(mailStatus?.eligible && mailStatus.sendConnected);
      const opened = clearUnread(conversation);
      setSelectedConv(opened);
      setConversations(previous => previous.map(row => sameUnifiedConversation(row, conversation) ? clearUnread(row) : row));
      setMessages(timeline); setCapabilities(nextCapabilities);
      setReplyMode(modeFromConversation(opened, timeline, nextCapabilities, mailConnected));
    } catch (error: any) {
      setCapabilities(null); setInboxError(error?.message || 'This customer conversation could not be opened.');
    }
  };

  const loadData = async (syncMail = false) => {
    setLoading(true);
    try {
      if (syncMail) await syncProfessionalInbox(true);
      const [unified, reps] = await Promise.all([
        getUnifiedCustomerConversations(),
        showSalesTeam ? getSalesReps() : Promise.resolve([] as SalesRep[]),
      ]);
      trackUnreadAlerts(unified, false); setConversations(unified); setSalesReps(reps);
      const requested = requestedConversationId
        ? unified.find(conv => conv.id === requestedConversationId || conv.conversationIds.includes(requestedConversationId))
        : requestedLeadId ? unified.find(conv => conv.crmLeadId === requestedLeadId || conv.crmLeadIds.includes(requestedLeadId)) : null;
      const current = selectedConv
        ? unified.find(conv => conv.id === selectedConv.id || conv.conversationIds.some(id => selectedConv.conversationIds.includes(id))) : null;
      const target = requested || current || unified[0] || null;
      if (target) { await selectConversation(target); setActiveTab(target.status === 'resolved' ? 'resolved' : 'active'); }
      else { setSelectedConv(null); setMessages([]); setCapabilities(null); }
    } catch (error: any) {
      console.error('Error loading unified customer communication:', error);
      setInboxError(error?.message || 'The unified customer communication center could not be loaded.');
    } finally { setLoading(false); }
  };

  const refreshDataSilent = async () => {
    try {
      const unified = await getUnifiedCustomerConversations(); trackUnreadAlerts(unified, true); let nextRows = unified;
      if (selectedConv) {
        const current = unified.find(conv => conv.id === selectedConv.id || conv.conversationIds.some(id => selectedConv.conversationIds.includes(id))) || selectedConv;
        const timeline = await getUnifiedCustomerTimeline(current); const opened = clearUnread(current);
        nextRows = unified.map(row => sameUnifiedConversation(row, current) ? clearUnread(row) : row);
        setSelectedConv(opened); setMessages(timeline);
      }
      setConversations(nextRows);
    } catch { /* keep current view */ }
  };

  const refreshAll = async () => { setInboxError(''); await syncProfessionalInbox(false); await loadData(false); };

  useEffect(() => {
    alertsSeededRef.current = false; alertedMessageIdsRef.current.clear();
    if (isAuthorizedRole) void loadData(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, user?.id, requestedConversationId, requestedLeadId]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => {
    if (!isAuthorizedRole) return undefined;
    const interval = setInterval(() => { void refreshDataSilent(); }, 4000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorizedRole, selectedConv?.id]);
  useEffect(() => {
    if (!isAuthorizedRole) return undefined;
    const interval = setInterval(() => { void (async () => { const changed = await syncProfessionalInbox(true); if (changed) await refreshDataSilent(); })(); }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthorizedRole, selectedConv?.id]);

  const cleanupUnused = async (uploaded: UploadedCommunicationAttachment[]) => {
    await Promise.allSettled(uploaded.map(attachment => deleteCommunicationAttachment({ attachment })));
  };

  const handleSendReply = async () => {
    if (!selectedConv || sending || (!replyText.trim() && pendingFiles.length === 0)) return;
    if (replyMode === 'whatsapp' && pendingFiles.length > 0) {
      setInboxError(`WhatsApp media is not enabled in the current provider connection. Send the file through ${canUseProfessionalEmail ? 'Website Chat or Professional Email' : 'Website Chat'}.`);
      return;
    }
    setSending(true); setInboxError('');
    const uploaded: UploadedCommunicationAttachment[] = [];
    try {
      const staffName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'ProFox Team';
      if (replyMode === 'note') {
        const conversationId = selectedConv.chatConversationId || selectedConv.capabilityConversationId;
        for (const file of pendingFiles) uploaded.push(await uploadSalesAttachment({ conversationId, channel: 'note', file, internalNote: true }));
        await sendChatMessage({ conversationId, senderType: 'sales_rep', senderName: staffName, senderId: user?.id, messageText: replyText.trim(), isInternalNote: true, attachmentIds: uploaded.map(item => item.id) });
      } else if (replyMode === 'email') {
        if (!canUseProfessionalEmail || !capabilities?.canSendEmail || !selectedConv.crmLeadId) throw new Error('Professional Email is available only to authorized Management/Admin accounts.');
        const status = await professionalMailService.getMyStatus();
        if (!status.eligible || !status.sendConnected) throw new Error('Connect your Professional Email before sending customer email.');
        for (const file of pendingFiles) uploaded.push(await uploadSalesAttachment({ conversationId: selectedConv.capabilityConversationId, channel: 'email', file }));
        const latestEmail = [...messages].reverse().find(message => (message as any).channel === 'email') as any;
        await professionalMailService.sendLeadEmail({ leadId: selectedConv.crmLeadId, subject: replySubject(latestEmail?.subject, selectedConv.customerName), body: replyText.trim(), idempotencyKey: crypto.randomUUID(), attachments: uploaded });
      } else if (replyMode === 'whatsapp') {
        if (!replyText.trim()) throw new Error('Enter a WhatsApp message.');
        if (!capabilities?.canSendWhatsApp) throw new Error(capabilities?.whatsappConfigured
          ? 'WhatsApp cannot start this conversation yet. A valid customer number and an open service window or approved outbound template are required.'
          : 'WhatsApp Business is not connected by an administrator yet.');
        await whatsappBusinessService.sendMessage({ conversationId: selectedConv.capabilityConversationId, message: replyText.trim(), idempotencyKey: crypto.randomUUID() });
      } else {
        if (!selectedConv.chatConversationId) throw new Error(canUseProfessionalEmail ? 'This customer does not have a website-chat channel. Use Professional Email or WhatsApp if appropriate.' : 'This customer does not have a website-chat channel. Use WhatsApp if available or start the secure Website Chat relationship.');
        for (const file of pendingFiles) uploaded.push(await uploadSalesAttachment({ conversationId: selectedConv.chatConversationId, channel: 'chat', file }));
        await sendChatMessage({ conversationId: selectedConv.chatConversationId, senderType: 'sales_rep', senderName: staffName, senderId: user?.id, messageText: replyText.trim(), isInternalNote: false, attachmentIds: uploaded.map(item => item.id) });
      }

      setReplyText(''); setPendingFiles([]);
      const unified = await getUnifiedCustomerConversations(); setConversations(unified);
      const current = unified.find(conv => conv.conversationIds.some(id => selectedConv.conversationIds.includes(id))) || selectedConv;
      setSelectedConv(current);
      const [timeline, nextCapabilities] = await Promise.all([
        getUnifiedCustomerTimeline(current), whatsappBusinessService.getCapabilities(current.capabilityConversationId),
      ]);
      setMessages(timeline); setCapabilities(nextCapabilities);
    } catch (error: any) {
      if (uploaded.length) await cleanupUnused(uploaded);
      console.error('Failed sending unified customer reply:', error);
      setInboxError(error?.message || 'Customer reply could not be sent.');
    } finally { setSending(false); }
  };

  const handleStatusChange = async (newStatus: 'open' | 'pending' | 'resolved') => {
    if (!selectedConv || !capabilities?.canManageStatus) return;
    setInboxError('');
    try { await updateUnifiedCustomerStatus(selectedConv, newStatus); setSelectedConv({ ...selectedConv, status: newStatus }); await refreshDataSilent(); }
    catch (error: any) { setInboxError(error?.message || 'Customer conversation status could not be updated.'); }
  };

  const filteredConversations = conversations.filter(conversation => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch = !query || conversation.customerName.toLowerCase().includes(query) || conversation.customerEmail.toLowerCase().includes(query)
      || String((conversation as any).customerPhone || '').includes(query) || String(conversation.lastMessage || '').toLowerCase().includes(query);
    if (!matchesSearch) return false;
    return activeTab === 'resolved' ? conversation.status === 'resolved' : conversation.status !== 'resolved';
  });

  if (!isAuthorizedRole) return <div className="flex min-h-[500px] flex-col items-center justify-center space-y-4 rounded-2xl border border-red-200 bg-white p-8 text-center"><div className="rounded-full bg-red-100 p-4 text-red-700"><Shield className="h-10 w-10" /></div><div><h2 className="text-lg font-bold text-slate-900">Access Restricted</h2><p className="mt-1 max-w-md text-xs text-slate-500">Customer communication is available only to authorized Sales/Management users or delivery specialists with an active project-specific client-chat grant.</p></div></div>;

  const canEmail = Boolean(canUseProfessionalEmail && capabilities?.canSendEmail && selectedConv?.crmLeadId && professionalEmailConnected);
  const canWhatsapp = Boolean(capabilities?.canSendWhatsApp);
  const unreadTotal = conversations.reduce((total, conversation) => total + Math.max(0, Number(conversation.unreadCount || 0)), 0);
  const whatsappUnavailableReason = !capabilities?.whatsappConfigured ? 'Not connected' : !capabilities?.customerPhone ? 'No customer number' : !capabilities?.whatsappSessionOpen && !capabilities?.whatsappTemplateConfigured ? 'Template required' : '';
  const sendDisabled = sending || (!replyText.trim() && pendingFiles.length === 0) || (replyMode === 'whatsapp' && !replyText.trim());

  return <div className="flex h-[82vh] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white font-sans shadow-sm" onPointerDown={() => { if (soundEnabledRef.current) void unlockStaffAlertAudio(); }}>
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-6 py-4">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-[#000080] p-2.5 text-white shadow-sm"><MessageSquare className="h-5 w-5" /></div><div><div className="flex items-center gap-2"><h2 className="text-base font-bold text-slate-900">Unified Customer Conversations</h2><span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-[#000080]"><Shield className="h-3 w-3" />Controlled access</span>{unreadTotal > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">{unreadTotal > 99 ? '99+' : unreadTotal} unread</span>}</div><p className="text-xs text-slate-500">{canUseProfessionalEmail ? 'One customer timeline for Website Chat, Professional Email, WhatsApp and private team notes.' : 'One customer timeline for Website Chat, WhatsApp and private team notes.'}</p></div></div>
      <div className="flex items-center gap-2"><button type="button" onClick={() => void toggleSound()} className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${soundEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>{soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{soundEnabled ? 'Alerts On' : 'Alerts Off'}</button>{showSalesTeam && <button type="button" onClick={() => setShowTeamModal(true)} className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><Users className="h-4 w-4" />Sales Team</button>}<button onClick={() => void refreshAll()} disabled={loading || emailSyncing} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading || emailSyncing ? 'animate-spin' : ''}`} /></button></div>
    </div>
    {inboxError && <div className="border-b border-rose-200 bg-rose-50 px-5 py-2.5 text-xs font-bold text-rose-700">{inboxError}</div>}

    <div className="flex flex-1 overflow-hidden">
      <div className="flex w-80 flex-col border-r border-slate-200 bg-slate-50/50 sm:w-96">
        <div className="space-y-2.5 border-b border-slate-200 bg-white p-3"><div className="flex gap-1 rounded-xl bg-slate-100 p-1"><button onClick={() => setActiveTab('active')} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${activeTab === 'active' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600'}`}>Active ({conversations.filter(c => c.status !== 'resolved').length})</button><button onClick={() => setActiveTab('resolved')} className={`flex-1 rounded-lg py-1.5 text-xs font-bold ${activeTab === 'resolved' ? 'bg-[#000080] text-white shadow-sm' : 'text-slate-600'}`}>Archive ({conversations.filter(c => c.status === 'resolved').length})</button></div><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search customer, email, phone or message..." className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-xs font-medium focus:border-[#000080] focus:outline-none" /></div></div>
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">{filteredConversations.length === 0 ? <div className="p-8 text-center text-xs leading-5 text-slate-400">No customer conversations are available to this account.</div> : filteredConversations.map(conversation => {
          const selected = selectedConv?.conversationIds.some(id => conversation.conversationIds.includes(id)); const rep = salesReps.find(item => item.id === conversation.currentSalesId) || salesReps.find(item => item.id === conversation.originalSalesId); const unread = Math.max(0, Number(conversation.unreadCount || 0));
          return <button key={`${conversation.currentSalesId}-${conversation.customerIdentityId || conversation.customerEmail}`} onClick={() => void selectConversation(conversation)} className={`block w-full p-4 text-left transition hover:bg-white ${selected ? 'border-l-4 border-l-[#000080] bg-white shadow-sm' : ''}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0 flex-1"><h4 className={`truncate text-xs ${unread > 0 ? 'font-black text-slate-950' : 'font-bold text-slate-900'}`}>{conversation.customerName}</h4><p className="mt-0.5 truncate text-[11px] text-slate-500">{conversation.customerEmail || (conversation as any).customerPhone || 'Customer'}</p></div>{unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 py-0.5 text-[9px] font-black text-white">{unread > 99 ? '99+' : unread}</span>}</div><div className="mt-2 flex flex-wrap gap-1.5">{conversation.hasChat && <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">Chat</span>}{canUseProfessionalEmail && conversation.hasEmail && <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-sky-700">Email</span>}{conversation.hasWhatsApp && <span className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">WhatsApp</span>}</div><p className="mt-2 line-clamp-1 text-xs text-slate-600">{conversation.lastMessage || 'Conversation ready'}</p>{showSalesTeam && <div className="mt-2.5 flex items-center gap-1 border-t border-slate-100 pt-2 text-[10px] text-slate-500"><UserCheck className="h-3 w-3 text-[#000080]" />{rep?.name || 'Assigned seller'}</div>}</button>;
        })}</div>
      </div>

      {selectedConv ? <div className="flex h-full flex-1 flex-col bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/50 p-4"><div className="flex items-center gap-3"><div className="rounded-xl bg-[#000080]/10 p-2 text-[#000080]"><User className="h-5 w-5" /></div><div><h3 className="text-sm font-bold text-slate-900">{selectedConv.customerName}</h3><p className="text-xs text-slate-500">{selectedConv.customerEmail}</p></div></div>{capabilities?.canManageStatus ? <select value={selectedConv.status} onChange={event => void handleStatusChange(event.target.value as any)} className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold"><option value="open">🟢 Open / Active</option><option value="pending">🟡 Pending Customer</option><option value="resolved">✅ Resolved / Archive</option></select> : null}</div>
        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-6">{messages.map(message => {
          const meta = message as any;
          if (message.senderType === 'system') return <div key={`system-${message.id}`} className="my-2 text-center"><span className="inline-block rounded-full bg-slate-200 px-3 py-1 text-[10px] font-bold text-slate-700">{message.messageText}</span></div>;
          if (message.isInternalNote) return <div key={`note-${message.id}`} className="space-y-1 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 shadow-sm"><div className="flex items-center justify-between text-[10px] font-bold text-amber-800"><span className="flex items-center gap-1.5"><StickyNote className="h-3.5 w-3.5" />Internal Note · Never shown to customer</span><span>{new Date(message.createdAt).toLocaleString()}</span></div><RichMessageText text={message.messageText} /><CommunicationAttachmentList attachments={meta.attachments || []} /></div>;
          const customer = message.senderType === 'customer'; const channel = String(meta.channel || 'chat'); const status = !customer ? channel === 'chat' ? (meta.customerReadAt ? 'Read' : 'Sent') : deliveryLabel(meta.deliveryStatus) : '';
          return <div key={`${channel}-${message.id}`} className={`flex ${customer ? 'justify-start' : 'justify-end'}`}><div className={`max-w-[78%] rounded-2xl p-4 text-xs shadow-sm ${customer ? 'rounded-tl-none border border-slate-200 bg-white text-slate-900' : 'rounded-tr-none bg-[#000080] text-white'}`}><div className="mb-1 flex items-center justify-between gap-4 text-[10px] opacity-75"><span className="flex items-center gap-1 font-bold">{channel === 'email' ? <Mail className="h-3 w-3" /> : channel === 'whatsapp' ? <MessageCircle className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}{message.senderName || (customer ? selectedConv.customerName : 'ProFox Team')} · {channelName(channel)}</span><span>{new Date(message.createdAt).toLocaleString()}</span></div>{channel === 'email' && meta.subject && <div className={`mb-2 text-[10px] font-black ${customer ? 'text-slate-500' : 'text-white/75'}`}>Subject: {meta.subject}</div>}<div className="font-medium leading-relaxed"><RichMessageText text={message.messageText} inverse={!customer} /></div><CommunicationAttachmentList attachments={meta.attachments || []} inverse={!customer} />{status && <div className={`mt-2 flex items-center justify-end gap-1 text-[9px] font-bold ${meta.deliveryStatus === 'failed' ? 'text-rose-200' : 'opacity-65'}`}><CheckCircle2 className="h-3 w-3" />{status}</div>}</div></div>;
        })}<div ref={messagesEndRef} /></div>

        <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200 bg-white px-4 py-2"><span className="shrink-0 text-[10px] font-bold text-slate-400">Quick:</span><button type="button" onClick={() => setReplyText('Hello! Thank you for reaching out to ProFox. How can I assist you with your project today?')} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">👋 Welcome</button><button type="button" onClick={() => setReplyText('Would you like a package recommendation or a custom quote based on your requirements?')} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">💼 Package</button><button type="button" onClick={() => setReplyText("I've shared your requirements with our team. We'll update you here as soon as the next step is ready.")} className="whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700">🎯 Update</button></div>

        <div className="space-y-3 border-t border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Send via</span><button type="button" disabled={!selectedConv.chatConversationId} onClick={() => setReplyMode('chat')} className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${replyMode === 'chat' ? 'border-indigo-300 bg-indigo-50 text-indigo-800' : 'border-slate-200 text-slate-600'}`}>Website Chat</button>{canUseProfessionalEmail && <button type="button" disabled={!canEmail} onClick={() => setReplyMode('email')} className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-40 ${replyMode === 'email' ? 'border-sky-300 bg-sky-50 text-sky-800' : 'border-slate-200 text-slate-600'}`}>Professional Email{capabilities?.canSendEmail && !professionalEmailConnected ? ' · Connect' : ''}</button>}<button type="button" disabled={!canWhatsapp} onClick={() => setReplyMode('whatsapp')} className={`rounded-lg border px-3 py-1.5 text-xs font-bold disabled:opacity-50 ${replyMode === 'whatsapp' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 text-slate-600'}`}>WhatsApp{!canWhatsapp && whatsappUnavailableReason ? ` · ${whatsappUnavailableReason}` : ''}</button><button type="button" onClick={() => setReplyMode('note')} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${replyMode === 'note' ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-600'}`}>Internal Note</button></div>
          <CommunicationComposerTools files={pendingFiles} onFilesChange={setPendingFiles} text={replyText} onTextChange={setReplyText} disabled={sending} attachmentsEnabled={replyMode !== 'whatsapp'} maxTotalBytes={replyMode === 'email' ? PROFESSIONAL_EMAIL_ATTACHMENT_MAX_TOTAL_BYTES : undefined} compact />
          {replyMode === 'whatsapp' && <div className="text-[10px] text-slate-400">{canUseProfessionalEmail ? 'WhatsApp is text-only in the current provider connection. Use Website Chat or Professional Email for files.' : 'WhatsApp is text-only in the current provider connection. Use Website Chat for files.'}</div>}
          <div className="flex items-end gap-2"><textarea rows={2} value={replyText} onChange={event => setReplyText(event.target.value)} placeholder={replyMode === 'note' ? 'Write a private team note...' : replyMode === 'email' ? 'Write professional email reply...' : replyMode === 'whatsapp' ? 'Write WhatsApp message...' : 'Write website chat reply...'} className={`flex-1 rounded-xl border p-3 text-xs font-medium focus:outline-none ${replyMode === 'note' ? 'border-amber-300 bg-amber-50/80 text-amber-950' : 'border-slate-200 bg-slate-50 text-slate-900'}`} /><button onClick={() => void handleSendReply()} disabled={sendDisabled} className={`flex min-h-[48px] items-center gap-2 rounded-xl px-5 text-xs font-bold shadow-md disabled:opacity-50 ${replyMode === 'note' ? 'bg-amber-500 text-slate-950' : replyMode === 'whatsapp' ? 'bg-emerald-700 text-white' : 'bg-[#000080] text-white'}`}><Send className="h-4 w-4" />{sending ? 'Sending…' : replyMode === 'note' ? 'Save Note' : replyMode === 'email' ? 'Send Email' : replyMode === 'whatsapp' ? 'Send WhatsApp' : 'Send Chat'}</button></div>
          <div className="text-[10px] leading-4 text-slate-400">Files for Chat/Email are stored privately in Cloudflare R2 and remain tied to the same customer timeline. Internal-note files remain private to staff.</div>
        </div>
      </div> : <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/50 text-slate-400"><MessageSquare className="mb-2 h-12 w-12 text-slate-300" /><p className="text-sm font-bold text-slate-700">Select a customer</p></div>}
    </div>

    {showTeamModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"><div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 pb-4"><div><h3 className="text-base font-bold text-slate-900">Verified Sales Representatives</h3><p className="text-xs text-slate-500">Customer ownership remains visible to Sales/Admin.</p></div><button type="button" onClick={() => setShowTeamModal(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><div className="flex-1 overflow-y-auto py-4"><div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200">{salesReps.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">No active sales representative is available.</div> : salesReps.map((rep, index) => <div key={`${rep.id}-${index}`} className="flex items-center gap-4 p-4">{rep.avatar ? <img src={rep.avatar} alt={rep.name} className="h-11 w-11 rounded-full object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#000080]/10 text-xs font-black text-[#000080]">{rep.name.slice(0,2).toUpperCase()}</div>}<div className="min-w-0"><h4 className="truncate text-xs font-bold text-slate-900">{rep.name}</h4><p className="mt-0.5 text-[11px] text-slate-500">{rep.title}</p></div></div>)}</div></div></div></div>}
  </div>;
}
