import { supabase, dbProcedure } from './supabase';
import { SalesRep, ChatConversation, ChatMessage } from '../types';

export const DEFAULT_SALES_REPS: SalesRep[] = [];

// Helper to play notification sound for sales reps
export const playChatChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, now); // C5
    osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.12); // E5
    
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.35);
  } catch (e) {
    console.warn('Audio chime unsupported:', e);
  }
};

// Storage keys
const LOCAL_CONVERSATIONS_KEY = 'profox_chat_conversations_v2';
const LOCAL_MESSAGES_KEY = 'profox_chat_messages_v2';
const LOCAL_SALES_REPS_KEY = 'profox_sales_reps_v2';

// 1. Get Sales Reps
export const getSalesReps = async (): Promise<SalesRep[]> => {
  try {
    const cached = localStorage.getItem(LOCAL_SALES_REPS_KEY);
    let reps: SalesRep[] = cached ? JSON.parse(cached) : DEFAULT_SALES_REPS;

    // Filter out dummy reps if they exist in cache
    const dummyIds = ['rep_alex_miller', 'rep_sarah_jenkins', 'rep_michael_chen', 'rep_jessica_taylor'];
    reps = reps.filter(r => !dummyIds.includes(r.id));

    // Check CMS content cache if team members exist
    const cmsCache = localStorage.getItem('cms_content_cache');
    if (cmsCache) {
      const cms = JSON.parse(cmsCache);
      if (cms.team_members && Array.isArray(cms.team_members)) {
        const cmsSales = cms.team_members.filter((m: any) => m.role === 'sales_team');
        if (cmsSales.length > 0) {
          // Merge CMS sales members with current reps, prioritizing CMS team members
          const cmsRepObjects: SalesRep[] = cmsSales.map((m: any) => ({
            id: m.id || m.userId || `rep_${m.fullName.toLowerCase().replace(/\s+/g, '_')}`,
            name: m.fullName,
            email: m.email || `${m.fullName.toLowerCase().replace(/\s+/g, '.')}@profoxweb.com`,
            avatar: m.avatar || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=250',
            title: m.title || 'Sales Representative',
            specialties: m.specialties || ['Packages & Quotations', 'Website Consulting'],
            rating: m.rating || 5.0,
            reviewCount: m.reviewCount || 12,
            isOnline: true,
            bio: m.bio || ''
          }));
          
          // Combine and deduplicate by id
          const map = new Map<string, SalesRep>();
          cmsRepObjects.forEach(r => map.set(r.id, r));
          reps.forEach(r => {
            if (!map.has(r.id)) map.set(r.id, r);
          });
          reps = Array.from(map.values());
        }
      }
    }

    // Try Supabase fetch
    const { data: dbData } = await supabase.from('sales_reps').select('*');
    if (dbData && dbData.length > 0) {
      reps = dbData;
    }

    localStorage.setItem(LOCAL_SALES_REPS_KEY, JSON.stringify(reps));
    return reps;
  } catch (e) {
    return DEFAULT_SALES_REPS;
  }
};

// Add Sales Rep
export const addSalesRep = async (newRepData: Partial<SalesRep>): Promise<SalesRep> => {
  const newRep: SalesRep = {
    id: newRepData.id || `rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    name: newRepData.name || 'Sales Rep',
    email: newRepData.email || 'sales@profoxweb.com',
    avatar: newRepData.avatar || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&q=80&w=250',
    title: newRepData.title || 'Sales Representative',
    specialties: newRepData.specialties || ['Web Packages', 'Pricing & Quotes'],
    rating: newRepData.rating || 5.0,
    reviewCount: newRepData.reviewCount || 10,
    isOnline: true,
    bio: newRepData.bio || ''
  };

  try {
    await supabase.from('sales_reps').insert(newRep);
  } catch (e) {
    console.warn('Supabase insert sales rep fallback:', e);
  }

  const currentReps = await getSalesReps();
  if (!currentReps.some(r => r.id === newRep.id)) {
    currentReps.push(newRep);
  }
  localStorage.setItem(LOCAL_SALES_REPS_KEY, JSON.stringify(currentReps));

  // Sync to CMS team_members
  try {
    const cmsCache = localStorage.getItem('cms_content_cache');
    if (cmsCache) {
      const cms = JSON.parse(cmsCache);
      const team = cms.team_members || [];
      if (!team.some((t: any) => t.id === newRep.id)) {
        team.push({
          id: newRep.id,
          userId: newRep.id,
          role: 'sales_team',
          fullName: newRep.name,
          title: newRep.title,
          bio: newRep.bio || '',
          avatar: newRep.avatar,
          createdAt: new Date().toISOString()
        });
        cms.team_members = team;
        localStorage.setItem('cms_content_cache', JSON.stringify(cms));
        await dbProcedure.upsertContentItem('team_members', team);
      }
    }
  } catch (e) {
    console.warn('Sync to CMS team_members error:', e);
  }

  return newRep;
};

// Delete Sales Rep
export const deleteSalesRep = async (id: string): Promise<void> => {
  try {
    await supabase.from('sales_reps').delete().eq('id', id);
  } catch (e) {
    console.warn('Supabase delete sales rep fallback:', e);
  }

  const currentReps = await getSalesReps();
  const updatedReps = currentReps.filter(r => r.id !== id);
  localStorage.setItem(LOCAL_SALES_REPS_KEY, JSON.stringify(updatedReps));

  // Also remove from CMS team_members
  try {
    const cmsCache = localStorage.getItem('cms_content_cache');
    if (cmsCache) {
      const cms = JSON.parse(cmsCache);
      if (cms.team_members && Array.isArray(cms.team_members)) {
        cms.team_members = cms.team_members.filter((m: any) => m.id !== id && m.userId !== id);
        localStorage.setItem('cms_content_cache', JSON.stringify(cms));
        await dbProcedure.upsertContentItem('team_members', cms.team_members);
      }
    }
  } catch (e) {
    console.warn('Remove from CMS team_members error:', e);
  }
};

// 2. Get Conversations
export const getConversations = async (): Promise<ChatConversation[]> => {
  try {
    const { data: dbData, error } = await supabase
      .from('chat_conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!error && dbData) {
      localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(dbData));
      return dbData as ChatConversation[];
    }
  } catch (err) {
    console.warn('Failed fetching conversations from Supabase, using local store:', err);
  }

  const local = localStorage.getItem(LOCAL_CONVERSATIONS_KEY);
  return local ? JSON.parse(local) : [];
};

// 3. Get Conversations by Email
export const getConversationsByEmail = async (email: string): Promise<ChatConversation[]> => {
  if (!email) return [];
  const cleanEmail = email.trim().toLowerCase();
  const allConvs = await getConversations();
  return allConvs.filter(c => c.customerEmail.toLowerCase() === cleanEmail);
};

// 4. Get Original Sales Rep for an existing customer email
export const getOriginalSalesAssignment = async (email: string): Promise<{
  originalRep: SalesRep | null;
  previousConversation: ChatConversation | null;
}> => {
  if (!email) return { originalRep: null, previousConversation: null };
  const userConvs = await getConversationsByEmail(email);
  if (userConvs.length === 0) return { originalRep: null, previousConversation: null };

  // Sort by oldest created_at
  const sorted = [...userConvs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const oldestConv = sorted[0];

  const reps = await getSalesReps();
  const rep = reps.find(r => r.id === oldestConv.originalSalesId) || reps.find(r => r.id === oldestConv.currentSalesId) || reps[0];

  return {
    originalRep: rep || null,
    previousConversation: userConvs[0] || null
  };
};

// 5. Create or Retrieve Chat Conversation
export const createOrGetConversation = async (data: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  intent: 'new_package' | 'existing_issue';
  selectedSalesId?: string;
}): Promise<ChatConversation> => {
  const cleanEmail = data.customerEmail.trim().toLowerCase();
  const userConvs = await getConversationsByEmail(cleanEmail);
  const reps = await getSalesReps();

  let targetSalesId = data.selectedSalesId || reps[0].id;
  let originalSalesId = targetSalesId;

  // If customer already exists, use their original seller
  if (userConvs.length > 0) {
    const sorted = [...userConvs].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    originalSalesId = sorted[0].originalSalesId || sorted[0].currentSalesId;
    if (data.intent === 'existing_issue') {
      targetSalesId = originalSalesId;
    }
  }

  // Check if there is an active open thread for this email
  const activeConv = userConvs.find(c => c.status !== 'resolved');
  if (activeConv) {
    return activeConv;
  }

  // Create brand new conversation thread
  const newConv: ChatConversation = {
    id: `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    customerName: data.customerName,
    customerEmail: cleanEmail,
    customerPhone: data.customerPhone || '',
    intent: data.intent,
    originalSalesId: originalSalesId,
    currentSalesId: targetSalesId,
    status: 'open',
    lastMessage: 'Chat conversation started.',
    lastMessageTime: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Save to DB and local storage
  try {
    await supabase.from('chat_conversations').insert(newConv);
  } catch (e) {
    console.warn('Supabase insert failed, saved locally:', e);
  }

  const currentList = await getConversations();
  currentList.unshift(newConv);
  localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(currentList));

  // Auto-post initial system welcome message
  const rep = reps.find(r => r.id === targetSalesId) || reps[0];
  await sendChatMessage({
    conversationId: newConv.id,
    senderType: 'system',
    senderName: 'System',
    messageText: data.intent === 'existing_issue'
      ? `Welcome back, ${data.customerName}! You are re-connected directly with your assigned seller, ${rep.name}.`
      : `Connected with ${rep.name} (${rep.title}). Welcome to Profox Web Solutions!`
  });

  return newConv;
};

// 6. Get Messages for a Conversation
export const getChatMessages = async (conversationId: string): Promise<ChatMessage[]> => {
  try {
    const { data: dbData, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversationId', conversationId)
      .order('createdAt', { ascending: true });

    if (!error && dbData) {
      return dbData as ChatMessage[];
    }
  } catch (e) {
    console.warn('Failed fetching messages from DB, using fallback');
  }

  const local = localStorage.getItem(LOCAL_MESSAGES_KEY);
  const allMsgs: ChatMessage[] = local ? JSON.parse(local) : [];
  return allMsgs.filter(m => m.conversationId === conversationId);
};

// 7. Send Chat Message
export const sendChatMessage = async (msgData: {
  conversationId: string;
  senderType: 'customer' | 'sales_rep' | 'system';
  senderName: string;
  senderId?: string;
  messageText: string;
  isInternalNote?: boolean;
}): Promise<ChatMessage> => {
  const newMsg: ChatMessage = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    conversationId: msgData.conversationId,
    senderType: msgData.senderType,
    senderName: msgData.senderName,
    senderId: msgData.senderId || '',
    messageText: msgData.messageText,
    isInternalNote: msgData.isInternalNote || false,
    createdAt: new Date().toISOString()
  };

  // Try DB save
  try {
    await supabase.from('chat_messages').insert(newMsg);
    if (!newMsg.isInternalNote) {
      await supabase
        .from('chat_conversations')
        .update({
          lastMessage: msgData.messageText,
          lastMessageTime: newMsg.createdAt,
          updatedAt: newMsg.createdAt
        })
        .eq('id', msgData.conversationId);
    }
  } catch (e) {
    console.warn('Failed saving message to DB, updating local storage:', e);
  }

  // Local storage backup
  const local = localStorage.getItem(LOCAL_MESSAGES_KEY);
  const allMsgs: ChatMessage[] = local ? JSON.parse(local) : [];
  allMsgs.push(newMsg);
  localStorage.setItem(LOCAL_MESSAGES_KEY, JSON.stringify(allMsgs));

  // Update conversation record
  const allConvs = await getConversations();
  const convIndex = allConvs.findIndex(c => c.id === msgData.conversationId);
  if (convIndex !== -1) {
    if (!newMsg.isInternalNote) {
      allConvs[convIndex].lastMessage = msgData.messageText;
      allConvs[convIndex].lastMessageTime = newMsg.createdAt;
      allConvs[convIndex].updatedAt = newMsg.createdAt;
    }
    localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(allConvs));
  }

  // Play chime for sales rep if sender is customer
  if (msgData.senderType === 'customer') {
    playChatChime();
  }

  return newMsg;
};

// 8. Submit Post-Chat Rating & Feedback
export const submitChatRating = async (
  conversationId: string, 
  rating: number, 
  feedback?: string
): Promise<void> => {
  try {
    await supabase
      .from('chat_conversations')
      .update({
        ratingGiven: rating,
        feedbackComment: feedback || '',
        status: 'resolved',
        updatedAt: new Date().toISOString()
      })
      .eq('id', conversationId);
  } catch (e) {
    console.warn('Failed rating update in DB:', e);
  }

  const allConvs = await getConversations();
  const conv = allConvs.find(c => c.id === conversationId);
  if (conv) {
    conv.ratingGiven = rating;
    conv.feedbackComment = feedback || '';
    conv.status = 'resolved';
    localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(allConvs));
  }
};

// 9. Update Conversation Status
export const updateConversationStatus = async (
  conversationId: string, 
  status: 'open' | 'pending' | 'resolved'
): Promise<void> => {
  try {
    await supabase
      .from('chat_conversations')
      .update({ status, updatedAt: new Date().toISOString() })
      .eq('id', conversationId);
  } catch (e) {
    console.warn('Failed status update in DB:', e);
  }

  const allConvs = await getConversations();
  const conv = allConvs.find(c => c.id === conversationId);
  if (conv) {
    conv.status = status;
    localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(allConvs));
  }
};
