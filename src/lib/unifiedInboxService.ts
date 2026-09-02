import type { ChatConversation, ChatMessage } from '../types';
import { getChatMessages, getConversations, updateConversationStatus } from './chatService';

export type UnifiedCustomerConversation = ChatConversation & {
  conversationIds: string[];
  chatConversationId?: string;
  capabilityConversationId: string;
  crmLeadId?: string;
  crmLeadIds: string[];
  hasChat: boolean;
  hasEmail: boolean;
  hasWhatsApp: boolean;
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

function sellerId(conversation: any) {
  return String(conversation?.currentSalesId || conversation?.originalSalesId || 'unassigned');
}

function sameCustomer(a: ChatConversation, b: ChatConversation) {
  if (sellerId(a) !== sellerId(b)) return false;
  const aMeta = a as any;
  const bMeta = b as any;
  const aIdentity = String(aMeta.customerIdentityId || '').trim();
  const bIdentity = String(bMeta.customerIdentityId || '').trim();
  const aEmail = normalizedEmail(a.customerEmail);
  const bEmail = normalizedEmail(b.customerEmail);
  return Boolean((aIdentity && bIdentity && aIdentity === bIdentity) || (aEmail && bEmail && aEmail === bEmail));
}

function conversationStatus(rows: ChatConversation[]): ChatConversation['status'] {
  if (rows.every(row => row.status === 'resolved')) return 'resolved';
  if (rows.some(row => row.status === 'open')) return 'open';
  return 'pending';
}

export function groupCustomerConversations(rows: ChatConversation[]): UnifiedCustomerConversation[] {
  const groups: ChatConversation[][] = [];

  for (const row of rows) {
    const matchingIndexes = groups
      .map((group, index) => group.some(existing => sameCustomer(existing, row)) ? index : -1)
      .filter(index => index >= 0);

    if (!matchingIndexes.length) {
      groups.push([row]);
      continue;
    }

    const targetIndex = matchingIndexes[0];
    groups[targetIndex].push(row);

    for (const index of matchingIndexes.slice(1).sort((a, b) => b - a)) {
      groups[targetIndex].push(...groups[index]);
      groups.splice(index, 1);
    }
  }

  return groups.map(group => {
    const sorted = [...group].sort((a, b) => activityTime(b as any) - activityTime(a as any));
    const base = sorted[0];
    const metadata = sorted.map(row => row as any);
    const conversationIds = sorted.map(row => row.id);
    const chatTarget = sorted.find(row => String((row as any).conversationKind || '') !== 'email');
    const crmLeadIds = [...new Set(metadata.map(row => String(row.crmLeadId || '')).filter(Boolean))];
    const preferredLeadId = String((base as any).crmLeadId || crmLeadIds[0] || '') || undefined;
    const capabilityTarget = sorted.find(row => preferredLeadId && String((row as any).crmLeadId || '') === preferredLeadId) || base;
    const hasChat = metadata.some(row => String(row.conversationKind || '') !== 'email');
    const hasEmail = Boolean(preferredLeadId) || metadata.some(row => row.conversationKind === 'email' || String(row.lastMessage || '').startsWith('Email:'));
    const hasWhatsApp = metadata.some(row => Boolean(row.hasWhatsApp) || String(row.lastMessage || '').startsWith('WhatsApp:'));

    return {
      ...base,
      status: conversationStatus(sorted),
      conversationIds,
      chatConversationId: chatTarget?.id,
      capabilityConversationId: capabilityTarget.id,
      crmLeadId: preferredLeadId,
      crmLeadIds,
      hasChat,
      hasEmail,
      hasWhatsApp,
      channelCount: Number(hasChat) + Number(hasEmail) + Number(hasWhatsApp),
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
