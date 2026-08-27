import { supabase } from './supabase';
import type { ChatConversation, ChatMessage, SalesRep } from '../types';

export const DEFAULT_SALES_REPS: SalesRep[] = [];

const LOCAL_SALES_REPS_KEY = 'profox_verified_sales_reps_v1';
const LOCAL_CHAT_TOKENS_KEY = 'profox_sales_chat_tokens_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ChatTokenRecord = { token: string; email: string };
type ChatTokenMap = Record<string, ChatTokenRecord>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function readChatTokens(): ChatTokenMap {
  return readJson<ChatTokenMap>(LOCAL_CHAT_TOKENS_KEY, {});
}

function rememberChatToken(conversationId: string, token: string, email: string) {
  const records = readChatTokens();
  records[conversationId] = { token, email: email.trim().toLowerCase() };
  localStorage.setItem(LOCAL_CHAT_TOKENS_KEY, JSON.stringify(records));
}

function chatTokenFor(conversationId: string) {
  return readChatTokens()[conversationId]?.token || '';
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function rpcError(error: any, fallback: string) {
  return new Error(error?.message || fallback);
}

async function hasSignedInSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return Boolean(data.session?.user);
}

function normalizeInboxMessage(value: any): ChatMessage {
  return {
    ...value,
    senderType: value?.senderType === 'staff' ? 'sales_rep' : value?.senderType,
    senderName: String(value?.senderName || value?.fromEmail || ''),
    messageText: String(value?.messageText || ''),
    isInternalNote: Boolean(value?.isInternalNote),
    createdAt: String(value?.createdAt || new Date().toISOString()),
  } as ChatMessage;
}

// Small audible notification used by the seller inbox. It only runs after a
// user gesture, which keeps it compatible with browser autoplay restrictions.
export const playChatChime = () => {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523.25, now);
    oscillator.frequency.exponentialRampToValueAtTime(659.25, now + 0.12);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.35);
  } catch (error) {
    console.warn('Audio chime unsupported:', error);
  }
};

export const getSalesReps = async (): Promise<SalesRep[]> => {
  const cached = readJson<SalesRep[]>(LOCAL_SALES_REPS_KEY, [])
    .filter(rep => UUID_PATTERN.test(rep.id));

  const { data, error } = await supabase.rpc('get_public_sales_reps');
  if (error) return cached;

  const reps = asArray<SalesRep>(data).map(rep => ({
    ...rep,
    email: '',
    avatar: rep.avatar || '',
    specialties: Array.isArray(rep.specialties) ? rep.specialties : [],
    rating: Number(rep.rating ?? 0),
    reviewCount: Number(rep.reviewCount || 0),
    isOnline: Boolean(rep.isOnline),
  })).filter(rep => UUID_PATTERN.test(rep.id));

  localStorage.setItem(LOCAL_SALES_REPS_KEY, JSON.stringify(reps));
  return reps;
};

export const getConversations = async (): Promise<ChatConversation[]> => {
  if (await hasSignedInSession()) {
    const { data, error } = await supabase.rpc('sales_chat_list_conversations');
    if (!error) return asArray<ChatConversation>(data);
    // Signed-in non-sales users may still use the public widget. Only an
    // authorization rejection falls through to token-scoped customer chats;
    // connectivity and server failures remain visible to the seller inbox.
    if (!/sales chat access required/i.test(error.message || '')) {
      throw rpcError(error, 'The sales inbox could not be loaded.');
    }
  }

  const records = readChatTokens();
  const conversations = await Promise.all(Object.entries(records).map(async ([conversationId, record]) => {
    if (!UUID_PATTERN.test(conversationId) || !UUID_PATTERN.test(record.token)) return null;
    const { data, error } = await supabase.rpc('public_sales_chat_get_conversation', {
      p_conversation_id: conversationId,
      p_access_token: record.token,
    });
    return error ? null : data as ChatConversation;
  }));
  return conversations.filter((conversation): conversation is ChatConversation => Boolean(conversation));
};

export const getConversationsByEmail = async (email: string): Promise<ChatConversation[]> => {
  if (!email) return [];
  const normalizedEmail = email.trim().toLowerCase();
  return (await getConversations()).filter(conversation => conversation.customerEmail.toLowerCase() === normalizedEmail);
};

export const getOriginalSalesAssignment = async (email: string): Promise<{
  originalRep: SalesRep | null;
  previousConversation: ChatConversation | null;
}> => {
  if (!email) return { originalRep: null, previousConversation: null };
  const conversations = await getConversationsByEmail(email);
  if (!conversations.length) return { originalRep: null, previousConversation: null };

  const sorted = [...conversations].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const oldest = sorted[0];
  const reps = await getSalesReps();
  const rep = reps.find(item => item.id === oldest.originalSalesId)
    || reps.find(item => item.id === oldest.currentSalesId)
    || null;
  return { originalRep: rep, previousConversation: conversations[0] };
};

export const createOrGetConversation = async (input: {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  intent: 'new_package' | 'existing_issue';
  selectedSalesId?: string;
}): Promise<ChatConversation> => {
  const email = input.customerEmail.trim().toLowerCase();
  const existing = (await getConversationsByEmail(email)).find(conversation => conversation.status !== 'resolved');
  if (existing) return existing;

  const reps = await getSalesReps();
  if (!reps.length) throw new Error('No verified sales representative is currently available.');
  const selectedSalesId = input.selectedSalesId || reps[0].id;
  if (!UUID_PATTERN.test(selectedSalesId)) throw new Error('Select a verified sales representative.');

  const accessToken = crypto.randomUUID();
  const { data, error } = await supabase.rpc('public_sales_chat_open', {
    p_payload: {
      customerName: input.customerName.trim(),
      customerEmail: email,
      customerPhone: input.customerPhone?.trim() || '',
      intent: input.intent,
      selectedSalesId,
    },
    p_access_token: accessToken,
  });
  if (error || !data?.id) throw rpcError(error, 'The conversation could not be opened.');
  rememberChatToken(data.id, accessToken, email);
  return data as ChatConversation;
};

export const getChatMessages = async (conversationId: string): Promise<ChatMessage[]> => {
  const publicToken = chatTokenFor(conversationId);
  if (publicToken) {
    const { data, error } = await supabase.rpc('public_sales_chat_get_messages', {
      p_conversation_id: conversationId,
      p_access_token: publicToken,
    });
    if (error) throw rpcError(error, 'Messages could not be loaded.');
    return asArray<ChatMessage>(data);
  }

  // Staff use the canonical client timeline. It reuses the existing Sales Chat
  // conversation and merges external client email into that same thread; it does
  // not create a second inbox or a second customer/conversation identity.
  const { data, error } = await supabase.rpc('sales_client_inbox_timeline', {
    p_conversation_id: conversationId,
  });
  if (!error) return asArray<any>(data).map(normalizeInboxMessage);

  // Compatibility fallback for development environments that have not applied
  // the provider-neutral migration yet. Production uses the unified RPC above.
  if (!/sales_client_inbox_timeline|function .* does not exist/i.test(error.message || '')) {
    throw rpcError(error, 'Messages could not be loaded.');
  }
  const legacy = await supabase.rpc('sales_chat_get_messages', { p_conversation_id: conversationId });
  if (legacy.error) throw rpcError(legacy.error, 'Messages could not be loaded.');
  return asArray<ChatMessage>(legacy.data);
};

export const sendChatMessage = async (input: {
  conversationId: string;
  senderType: 'customer' | 'sales_rep' | 'system';
  senderName: string;
  senderId?: string;
  messageText: string;
  isInternalNote?: boolean;
}): Promise<ChatMessage> => {
  const message = input.messageText.trim();
  if (!message) throw new Error('Enter a message before sending.');

  if (input.senderType === 'customer') {
    const accessToken = chatTokenFor(input.conversationId);
    if (!accessToken) throw new Error('This browser is not authorized for the conversation.');
    const { data, error } = await supabase.rpc('public_sales_chat_send_message', {
      p_conversation_id: input.conversationId,
      p_access_token: accessToken,
      p_message: message,
    });
    if (error || !data?.id) throw rpcError(error, 'The message could not be sent.');
    playChatChime();
    return data as ChatMessage;
  }

  if (input.senderType !== 'sales_rep') throw new Error('System messages can only be created by the secure chat workflow.');
  const { data, error } = await supabase.rpc('sales_chat_send_message', {
    p_conversation_id: input.conversationId,
    p_message: message,
    p_internal_note: Boolean(input.isInternalNote),
  });
  if (error || !data?.id) throw rpcError(error, 'The reply could not be sent.');
  return data as ChatMessage;
};

export const submitChatRating = async (conversationId: string, rating: number, feedback = ''): Promise<void> => {
  const accessToken = chatTokenFor(conversationId);
  if (!accessToken) throw new Error('This browser is not authorized for the conversation.');
  const { error } = await supabase.rpc('public_sales_chat_submit_rating', {
    p_conversation_id: conversationId,
    p_access_token: accessToken,
    p_rating: rating,
    p_feedback: feedback,
  });
  if (error) throw rpcError(error, 'The rating could not be saved.');
};

export const updateConversationStatus = async (
  conversationId: string,
  status: 'open' | 'pending' | 'resolved',
): Promise<void> => {
  const { error } = await supabase.rpc('sales_chat_update_status', {
    p_conversation_id: conversationId,
    p_status: status,
  });
  if (error) throw rpcError(error, 'The conversation status could not be updated.');
};
