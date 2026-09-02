import type { ChatConversation, ChatMessage } from '../types';
import { getChatMessages, getConversations, updateConversationStatus } from './chatService';

export type UnifiedCustomerConversation = ChatConversation & {
  conversationIds: string[];
  chatConversationId?: string;
  crmLeadId?: string;
  crmLeadIds: string[];
  hasChat: boolean;
  hasEmail: boolean;
  channelCount: number;
  customerIdentityId?: string;
  conversationKind?: string;
};

function normalizedEmail(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function timestamp(value: unknown) {
  const time = new Date(String(value || '')).getTime();
  return Number.isFinite(time) ? time : 0;
}

function activityTime(conversation: any) {
  return Math.max(
    timestamp(conversation?.lastMessageTime),
    timestamp(conversation?.updatedAt),
    timestamp(conversation?.createdAt),
  );
}

function customerGroupKey(conversation: any) {
  const sellerId = String(conversation?.currentSalesId || conversation?.originalSalesId || 'unassigned');
  const identityId = String(conversation?.customerIdentityId || '').trim();
  const email = normalizedEmail(conversation?.customerEmail);
  return `${sellerId}:${identityId ? `identity:${identityId}` : `email:${email}`}`;
}

function conversationStatus(rows: ChatConversation[]): ChatConversation['status'] {
  if (rows.every(row => row.status === 'resolved')) return 'resolved';
  if (rows.some(row => row.status === 'open')) return 'open';
  return 'pending';
}

export function groupCustomerConversations(rows: ChatConversation[]): UnifiedCustomerConversation[] {
  const groups = new Map<string, ChatConversation[]>();

  for (const row of rows) {
    const key = customerGroupKey(row as any);
    const existing = groups.get(key) || [];
    existing.push(row);
    groups.set(key, existing);
  }

  return [...groups.values()].map(group => {
    const sorted = [...group].sort((a, b) => activityTime(b as any) - activityTime(a as any));
    const base = sorted[0];
    const metadata = sorted.map(row => row as any);
    const conversationIds = sorted.map(row => row.id);
    const chatTarget = sorted.find(row => String((row as any).conversationKind || '') !== 'email');
    const crmLeadIds = [...new Set(metadata.map(row => String(row.crmLeadId || '')).filter(Boolean))];
    const preferredLeadId = String((base as any).crmLeadId || crmLeadIds[0] || '') || undefined;
    const hasEmail = metadata.some(row => row.conversationKind === 'email' || String(row.lastMessage || '').startsWith('Email:'));
    const hasChat = Boolean(chatTarget);

    return {
      ...base,
      status: conversationStatus(sorted),
      conversationIds,
      chatConversationId: chatTarget?.id,
      crmLeadId: preferredLeadId,
      crmLeadIds,
      hasChat,
      hasEmail,
      channelCount: Number(hasChat) + Number(hasEmail),
      conversationKind: 'unified',
      customerIdentityId: String((base as any).customerIdentityId || '') || undefined,
    } as UnifiedCustomerConversation;
  }).sort((a, b) => activityTime(b as any) - activityTime(a as any));
}

export async function getUnifiedCustomerConversations(): Promise<UnifiedCustomerConversation[]> {
  return groupCustomerConversations(await getConversations());
}

export async function getUnifiedCustomerTimeline(conversation: UnifiedCustomerConversation): Promise<ChatMessage[]> {
  const batches = await Promise.all(conversation.conversationIds.map(async conversationId => {
    const messages = await getChatMessages(conversationId);
    return messages.map(message => ({ ...message, _sourceConversationId: conversationId } as ChatMessage & { _sourceConversationId: string }));
  }));

  const unique = new Map<string, ChatMessage>();
  for (const message of batches.flat()) {
    const meta = message as any;
    const key = `${String(meta.channel || 'chat')}:${String(message.id)}`;
    if (!unique.has(key)) unique.set(key, message);
  }

  return [...unique.values()].sort((a, b) => timestamp((a as any).createdAt) - timestamp((b as any).createdAt));
}

export async function updateUnifiedCustomerStatus(
  conversation: UnifiedCustomerConversation,
  status: 'open' | 'pending' | 'resolved',
): Promise<void> {
  await Promise.all(conversation.conversationIds.map(conversationId => updateConversationStatus(conversationId, status)));
}
