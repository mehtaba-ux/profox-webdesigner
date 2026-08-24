import { supabase } from './supabase';
import {
  CommissionEntry,
  CommissionRule,
  CommissionSettingsConfig,
  CommissionStatus,
  CommissionPayoutBatch,
  CommissionStats
} from '../types';
import { configService } from './configService';

const COMMISSION_ENTRIES_KEY = 'profox_commission_entries';
const COMMISSION_SETTINGS_KEY = 'profox_commission_settings';
const COMMISSION_BATCHES_KEY = 'profox_commission_batches';

function getLocal<T>(key: string, fallback: T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setLocal<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage is only a cache. Supabase remains the source of truth.
  }
}

export const DEFAULT_COMMISSION_RULES: CommissionRule[] = [
  {
    id: 'PF-WEB-LAUNCH',
    packageCode: 'PF-WEB-LAUNCH',
    packageName: 'ProFox Launch',
    baseRatePercent: 10,
    minRatePercent: 10,
    maxRatePercent: 10,
    requiresAdminApproval: false,
    active: true,
    sortOrder: 1,
    effectiveFrom: '2026-01-01',
    description: '10% commission on verified customer payments.'
  },
  {
    id: 'PF-WEB-GROWTH',
    packageCode: 'PF-WEB-GROWTH',
    packageName: 'ProFox Growth',
    baseRatePercent: 12,
    minRatePercent: 12,
    maxRatePercent: 12,
    requiresAdminApproval: false,
    active: true,
    sortOrder: 2,
    effectiveFrom: '2026-01-01',
    description: '12% commission on verified customer payments.'
  },
  {
    id: 'PF-WEB-SCALE',
    packageCode: 'PF-WEB-SCALE',
    packageName: 'ProFox Scale',
    baseRatePercent: 15,
    minRatePercent: 15,
    maxRatePercent: 15,
    requiresAdminApproval: false,
    active: true,
    sortOrder: 3,
    effectiveFrom: '2026-01-01',
    description: '15% commission on verified customer payments.'
  },
  {
    id: 'PF-CUSTOM',
    packageCode: 'PF-CUSTOM',
    packageName: 'ProFox Custom Digital Experience & Web Application',
    baseRatePercent: 10,
    minRatePercent: 10,
    maxRatePercent: 15,
    requiresAdminApproval: true,
    active: true,
    sortOrder: 4,
    effectiveFrom: '2026-01-01',
    description: '10%–15% commission; the base rate requires Admin approval per quotation.'
  }
];

export const DEFAULT_COMMISSION_SETTINGS: CommissionSettingsConfig = {
  packageRules: DEFAULT_COMMISSION_RULES,
  selfGeneratedBonusPercent: 5,
  performanceBonusThreshold: 10,
  performanceBonusPercent: 2,
  payoutScheduleDescription: '15th and last working day of each month',
  customDealMinRate: 10,
  customDealMaxRate: 15,
  lastUpdated: new Date().toISOString()
};

function mapRule(row: any, index = 0): CommissionRule {
  return {
    id: String(row.product_code),
    packageCode: String(row.product_code),
    packageName: String(row.product_name || row.product_code),
    baseRatePercent: Number(row.base_rate_percent || 0),
    minRatePercent: Number(row.min_rate_percent ?? row.base_rate_percent ?? 0),
    maxRatePercent: Number(row.max_rate_percent ?? row.base_rate_percent ?? 0),
    requiresAdminApproval: Boolean(row.requires_admin_rate),
    active: Boolean(row.enabled),
    sortOrder: index + 1,
    effectiveFrom: '2026-01-01',
    updatedAt: row.updated_at || undefined
  };
}

function mapEntry(
  row: any,
  profiles: Map<string, any>,
  clients: Map<string, any>,
  quotations: Map<string, any>,
  payments: Map<string, any>,
  opportunities: Map<string, any>
): CommissionEntry {
  const profile = row.salesperson_id ? profiles.get(row.salesperson_id) : undefined;
  const client = row.client_id ? clients.get(row.client_id) : undefined;
  const quotation = row.quotation_id ? quotations.get(row.quotation_id) : undefined;
  const payment = row.payment_id ? payments.get(row.payment_id) : undefined;
  const opportunity = row.opportunity_id ? opportunities.get(row.opportunity_id) : undefined;
  const selfBonus = Number(row.self_generated_bonus_percent || 0);
  const performanceBonus = Number(row.performance_bonus_percent || 0);

  return {
    id: row.id,
    entryNumber: row.entry_number || `COM-${String(row.id).slice(0, 8)}`,
    salespersonId: row.salesperson_id || '',
    salespersonName: profile?.full_name || 'Sales Representative',
    salespersonEmail: profile?.email || undefined,
    clientId: row.client_id || '',
    clientName: client?.company_name || payment?.customer_name || 'Client',
    opportunityId: row.opportunity_id || undefined,
    quotationId: row.quotation_id || undefined,
    quotationNumber: quotation?.quotation_number || undefined,
    paymentId: row.payment_id,
    paymentReference: payment?.payment_reference || String(row.payment_id || ''),
    milestoneLabel: payment?.milestone_label || payment?.payment_type || 'Verified Payment',
    packageCode: row.product_code || '',
    packageName: row.product_name || row.product_code || 'Service',
    verifiedPaymentAmount: Number(row.verified_payment_amount || 0),
    currency: row.currency || 'USD',
    baseCommissionRate: Number(row.base_rate_percent || 0),
    isSelfGenerated: Boolean(opportunity?.self_generated) || selfBonus > 0,
    selfGeneratedBonusRate: selfBonus,
    isPerformanceBonusEligible: performanceBonus > 0,
    performanceSaleRank: Number(row.sale_rank || 0),
    performanceBonusRate: performanceBonus,
    effectiveCommissionRate: Number(row.effective_rate_percent || 0),
    commissionAmount: Number(row.commission_amount || 0),
    eligibilityDate: payment?.verified_at || row.created_at,
    status: row.status as CommissionStatus,
    ruleSnapshot: row.rule_snapshot || {},
    payoutBatchId: row.payout_batch_id || undefined,
    payoutReference: row.payout_reference || undefined,
    paidAt: row.paid_at || undefined,
    paidBy: row.paid_by || undefined,
    adminReviewNotes: row.admin_review_notes || undefined,
    reversalReason: row.reversal_reason || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function calculateStats(entries: CommissionEntry[], settings: CommissionSettingsConfig): CommissionStats {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  let earnedTotal = 0;
  let approvedTotal = 0;
  let paidTotal = 0;
  let pendingReviewTotal = 0;
  let earnedThisMonth = 0;
  let paidThisMonth = 0;
  const monthDeals = new Set<string>();

  for (const entry of entries) {
    if (entry.status === 'Reversed') continue;
    const date = new Date(entry.eligibilityDate);
    const isCurrentMonth = date.getFullYear() === currentYear && date.getMonth() === currentMonth;

    if (entry.status === 'Earned') earnedTotal += entry.commissionAmount;
    if (entry.status === 'Approved') approvedTotal += entry.commissionAmount;
    if (entry.status === 'Paid') paidTotal += entry.commissionAmount;
    if (entry.status === 'Under Review' || entry.status === 'Disputed') pendingReviewTotal += entry.commissionAmount;

    if (isCurrentMonth) {
      earnedThisMonth += entry.commissionAmount;
      if (entry.status === 'Paid') paidThisMonth += entry.commissionAmount;
      monthDeals.add(entry.quotationId || entry.paymentId);
    }
  }

  return {
    earnedTotal: Math.round(earnedTotal * 100) / 100,
    approvedTotal: Math.round(approvedTotal * 100) / 100,
    paidTotal: Math.round(paidTotal * 100) / 100,
    pendingReviewTotal: Math.round(pendingReviewTotal * 100) / 100,
    earnedThisMonth: Math.round(earnedThisMonth * 100) / 100,
    paidThisMonth: Math.round(paidThisMonth * 100) / 100,
    salesCountThisMonth: monthDeals.size,
    nextPayoutSchedule: settings.payoutScheduleDescription
  };
}

async function persistSettings(settings: CommissionSettingsConfig): Promise<void> {
  const { error } = await supabase
    .from('commission_settings')
    .update({
      self_generated_bonus_percent: settings.selfGeneratedBonusPercent,
      performance_threshold: settings.performanceBonusThreshold,
      performance_bonus_percent: settings.performanceBonusPercent,
      payout_schedule: settings.payoutScheduleDescription,
      updated_at: new Date().toISOString()
    })
    .eq('id', 'default');
  if (error) console.warn('Commission settings persistence failed:', error.message);
}

async function persistRule(rule: CommissionRule): Promise<void> {
  const { error } = await supabase.from('commission_rules').upsert({
    product_code: rule.packageCode,
    product_name: rule.packageName,
    enabled: rule.active,
    base_rate_percent: rule.baseRatePercent,
    min_rate_percent: rule.minRatePercent ?? rule.baseRatePercent,
    max_rate_percent: rule.maxRatePercent ?? rule.baseRatePercent,
    requires_admin_rate: rule.requiresAdminApproval,
    updated_at: new Date().toISOString()
  }, { onConflict: 'product_code' });
  if (error) console.warn('Commission rule persistence failed:', error.message);
}

export const commissionService = {
  getSettings(): CommissionSettingsConfig {
    return getLocal<CommissionSettingsConfig>(COMMISSION_SETTINGS_KEY, DEFAULT_COMMISSION_SETTINGS);
  },

  async refreshSettings(): Promise<CommissionSettingsConfig> {
    const [settingsResult, rulesResult] = await Promise.all([
      supabase.from('commission_settings').select('*').eq('id', 'default').maybeSingle(),
      supabase.from('commission_rules').select('*').order('product_code')
    ]);

    if (settingsResult.error) throw settingsResult.error;
    if (rulesResult.error) throw rulesResult.error;

    const rules = (rulesResult.data || []).map(mapRule);
    const db = settingsResult.data;
    const settings: CommissionSettingsConfig = {
      packageRules: rules.length ? rules : DEFAULT_COMMISSION_RULES,
      selfGeneratedBonusPercent: Number(db?.self_generated_bonus_percent ?? 5),
      performanceBonusThreshold: Number(db?.performance_threshold ?? 10),
      performanceBonusPercent: Number(db?.performance_bonus_percent ?? 2),
      payoutScheduleDescription: db?.payout_schedule || DEFAULT_COMMISSION_SETTINGS.payoutScheduleDescription,
      customDealMinRate: Number(rules.find(r => r.packageCode === 'PF-CUSTOM')?.minRatePercent ?? 10),
      customDealMaxRate: Number(rules.find(r => r.packageCode === 'PF-CUSTOM')?.maxRatePercent ?? 15),
      lastUpdated: db?.updated_at || new Date().toISOString()
    };
    setLocal(COMMISSION_SETTINGS_KEY, settings);
    return settings;
  },

  updateSettings(settings: Partial<CommissionSettingsConfig>, userEmail: string): CommissionSettingsConfig {
    const current = this.getSettings();
    const updated: CommissionSettingsConfig = {
      ...current,
      ...settings,
      lastUpdated: new Date().toISOString()
    };
    setLocal(COMMISSION_SETTINGS_KEY, updated);
    void persistSettings(updated);
    configService.logAuditEntry({
      entity: 'Commission Settings',
      recordId: 'commission_settings',
      action: 'update',
      field: 'commission_config',
      oldValue: current,
      newValue: updated,
      userEmail,
      label: 'Commission Rules & Thresholds'
    });
    return updated;
  },

  getRules(): CommissionRule[] {
    return (this.getSettings().packageRules || DEFAULT_COMMISSION_RULES).filter(rule => rule.active);
  },

  saveRule(rule: Partial<CommissionRule>, userEmail: string): CommissionRule {
    const settings = this.getSettings();
    const rules = [...(settings.packageRules || DEFAULT_COMMISSION_RULES)];
    const index = rules.findIndex(item => item.id === rule.id || item.packageCode === rule.packageCode);
    const previous = index >= 0 ? rules[index] : undefined;
    const saved: CommissionRule = {
      id: rule.id || rule.packageCode || `RULE-${Date.now()}`,
      packageCode: rule.packageCode || previous?.packageCode || `CUSTOM-${Date.now()}`,
      packageName: rule.packageName || previous?.packageName || 'Commission Rule',
      baseRatePercent: Number(rule.baseRatePercent ?? previous?.baseRatePercent ?? 10),
      minRatePercent: Number(rule.minRatePercent ?? previous?.minRatePercent ?? 10),
      maxRatePercent: Number(rule.maxRatePercent ?? previous?.maxRatePercent ?? 15),
      requiresAdminApproval: Boolean(rule.requiresAdminApproval ?? previous?.requiresAdminApproval ?? false),
      active: Boolean(rule.active ?? previous?.active ?? true),
      sortOrder: Number(rule.sortOrder ?? previous?.sortOrder ?? rules.length + 1),
      effectiveFrom: rule.effectiveFrom || previous?.effectiveFrom || new Date().toISOString().slice(0, 10),
      description: rule.description ?? previous?.description,
      createdAt: previous?.createdAt,
      updatedAt: new Date().toISOString()
    };
    if (index >= 0) rules[index] = saved; else rules.push(saved);
    this.updateSettings({ packageRules: rules }, userEmail);
    void persistRule(saved);
    return saved;
  },

  async refreshEntries(salespersonId?: string): Promise<CommissionEntry[]> {
    let query = supabase.from('commission_entries').select('*').order('created_at', { ascending: false });
    if (salespersonId) query = query.eq('salesperson_id', salespersonId);
    const { data: rows, error } = await query;
    if (error) throw error;

    const entries = rows || [];
    const profileIds = [...new Set(entries.map((row: any) => row.salesperson_id).filter(Boolean))];
    const clientIds = [...new Set(entries.map((row: any) => row.client_id).filter(Boolean))];
    const quotationIds = [...new Set(entries.map((row: any) => row.quotation_id).filter(Boolean))];
    const paymentIds = [...new Set(entries.map((row: any) => row.payment_id).filter(Boolean))];
    const opportunityIds = [...new Set(entries.map((row: any) => row.opportunity_id).filter(Boolean))];

    const [profilesResult, clientsResult, quotationsResult, paymentsResult, opportunitiesResult] = await Promise.all([
      profileIds.length ? supabase.from('user_profiles').select('id,full_name,email').in('id', profileIds) : Promise.resolve({ data: [], error: null } as any),
      clientIds.length ? supabase.from('clients').select('id,company_name').in('id', clientIds) : Promise.resolve({ data: [], error: null } as any),
      quotationIds.length ? supabase.from('quotations').select('id,quotation_number').in('id', quotationIds) : Promise.resolve({ data: [], error: null } as any),
      paymentIds.length ? supabase.from('payments').select('id,payment_reference,milestone_label,payment_type,verified_at,customer_name').in('id', paymentIds) : Promise.resolve({ data: [], error: null } as any),
      opportunityIds.length ? supabase.from('crm_opportunities').select('id,self_generated').in('id', opportunityIds) : Promise.resolve({ data: [], error: null } as any)
    ]);

    const toMap = (data: any[] | null | undefined) => new Map((data || []).map(row => [row.id, row]));
    const mapped = entries.map((row: any) => mapEntry(
      row,
      toMap(profilesResult.data),
      toMap(clientsResult.data),
      toMap(quotationsResult.data),
      toMap(paymentsResult.data),
      toMap(opportunitiesResult.data)
    ));

    if (!salespersonId) {
      setLocal(COMMISSION_ENTRIES_KEY, mapped);
    } else {
      const existing = getLocal<CommissionEntry[]>(COMMISSION_ENTRIES_KEY, []).filter(e => e.salespersonId !== salespersonId);
      setLocal(COMMISSION_ENTRIES_KEY, [...existing, ...mapped]);
    }
    return mapped;
  },

  getAllEntries(): CommissionEntry[] {
    return [...getLocal<CommissionEntry[]>(COMMISSION_ENTRIES_KEY, [])]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async getCommissions(filter?: {
    salespersonId?: string;
    status?: CommissionStatus | 'All';
    month?: string;
    packageCode?: string;
    search?: string;
  }): Promise<{ data: CommissionEntry[]; error: any }> {
    try {
      let entries = await this.refreshEntries(filter?.salespersonId);
      if (filter?.status && filter.status !== 'All') entries = entries.filter(e => e.status === filter.status);
      if (filter?.month) entries = entries.filter(e => e.eligibilityDate.startsWith(filter.month!));
      if (filter?.packageCode && filter.packageCode !== 'All') entries = entries.filter(e => e.packageCode === filter.packageCode);
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        entries = entries.filter(e =>
          e.entryNumber.toLowerCase().includes(q) ||
          e.salespersonName.toLowerCase().includes(q) ||
          e.clientName.toLowerCase().includes(q) ||
          e.paymentReference.toLowerCase().includes(q) ||
          e.packageName.toLowerCase().includes(q)
        );
      }
      return { data: entries, error: null };
    } catch (error) {
      return { data: [], error };
    }
  },

  getSalespersonCommissions(salespersonId: string): CommissionEntry[] {
    return this.getAllEntries().filter(entry => entry.salespersonId === salespersonId);
  },

  getStats(salespersonId?: string): CommissionStats {
    const entries = salespersonId ? this.getSalespersonCommissions(salespersonId) : this.getAllEntries();
    return calculateStats(entries, this.getSettings());
  },

  async generateCommissionForPayment(paymentId: string, _adminUserEmail: string): Promise<{ data: CommissionEntry | null; error: Error | null; isNew: boolean }> {
    try {
      const before = this.getAllEntries().find(entry => entry.paymentId === paymentId);
      const { error } = await supabase.rpc('generate_commission_for_verified_payment', { p_payment_id: paymentId });
      if (error) throw error;
      const entries = await this.refreshEntries();
      const entry = entries.find(item => item.paymentId === paymentId) || null;
      return { data: entry, error: null, isNew: !before && Boolean(entry) };
    } catch (error: any) {
      return { data: null, error: error instanceof Error ? error : new Error(error?.message || 'Commission generation failed'), isNew: false };
    }
  },

  async updateStatus(entryId: string, newStatus: CommissionStatus, adminUserEmail: string, notes?: string, payoutReference?: string): Promise<CommissionEntry | null> {
    const { error } = await supabase.rpc('admin_update_commission_status', {
      p_entry_id: entryId,
      p_status: newStatus,
      p_notes: notes || '',
      p_payout_reference: payoutReference || ''
    });
    if (error) throw error;
    const entries = await this.refreshEntries();
    const updated = entries.find(entry => entry.id === entryId) || null;
    if (updated) {
      configService.logAuditEntry({
        entity: 'Sales Commission', recordId: entryId, action: 'update', field: 'status',
        oldValue: null, newValue: newStatus, userEmail: adminUserEmail, label: `${updated.entryNumber} Status Change`
      });
    }
    return updated;
  },

  async updateCustomDealRate(entryId: string, newBaseRate: number, adminUserEmail: string, notes?: string): Promise<CommissionEntry | null> {
    const cached = this.getAllEntries().find(entry => entry.id === entryId);
    let quotationId = cached?.quotationId;
    if (!quotationId) {
      const { data, error } = await supabase.from('commission_entries').select('quotation_id').eq('id', entryId).single();
      if (error) throw error;
      quotationId = data?.quotation_id || undefined;
    }
    if (!quotationId) throw new Error('Quotation is required for custom commission approval.');

    const { error } = await supabase.rpc('admin_approve_custom_commission_rate', {
      p_quotation_id: quotationId,
      p_rate: newBaseRate,
      p_notes: notes || ''
    });
    if (error) throw error;
    const entries = await this.refreshEntries();
    const updated = entries.find(entry => entry.id === entryId) || null;
    if (updated) {
      configService.logAuditEntry({
        entity: 'Sales Commission', recordId: entryId, action: 'update', field: 'custom_rate_approval',
        oldValue: null, newValue: newBaseRate, userEmail: adminUserEmail, label: `${updated.entryNumber} Custom Rate Approved`
      });
    }
    return updated;
  },

  async reverseCommission(entryId: string, reason: string, adminUserEmail: string): Promise<{ original: CommissionEntry } | null> {
    const { error } = await supabase.rpc('admin_reverse_commission', { p_entry_id: entryId, p_reason: reason });
    if (error) throw error;
    const entries = await this.refreshEntries();
    const updated = entries.find(entry => entry.id === entryId);
    if (!updated) return null;
    configService.logAuditEntry({
      entity: 'Sales Commission', recordId: entryId, action: 'update', field: 'reversal',
      oldValue: null, newValue: 'Reversed', userEmail: adminUserEmail, label: `${updated.entryNumber} Reversed`
    });
    return { original: updated };
  },

  getPayoutBatches(): CommissionPayoutBatch[] {
    return [...getLocal<CommissionPayoutBatch[]>(COMMISSION_BATCHES_KEY, [])]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async refreshPayoutBatches(): Promise<CommissionPayoutBatch[]> {
    const [{ data: batches, error }, { data: entries, error: entriesError }] = await Promise.all([
      supabase.from('commission_payout_batches').select('*').order('created_at', { ascending: false }),
      supabase.from('commission_entries').select('id,payout_batch_id').not('payout_batch_id', 'is', null)
    ]);
    if (error) throw error;
    if (entriesError) throw entriesError;

    const idsByBatch = new Map<string, string[]>();
    for (const row of entries || []) {
      if (!row.payout_batch_id) continue;
      const list = idsByBatch.get(row.payout_batch_id) || [];
      list.push(row.id);
      idsByBatch.set(row.payout_batch_id, list);
    }

    const mapped: CommissionPayoutBatch[] = (batches || []).map((row: any) => ({
      id: row.id,
      batchNumber: row.batch_number,
      title: row.title || row.batch_number,
      scheduledDate: row.scheduled_date,
      status: row.status,
      totalAmount: Number(row.total_amount || 0),
      totalEntriesCount: Number(row.total_entries_count || 0),
      totalSalespeopleCount: Number(row.total_salespeople_count || 0),
      entryIds: idsByBatch.get(row.id) || [],
      processedBy: row.processed_by || undefined,
      completedAt: row.completed_at || undefined,
      notes: row.notes || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    setLocal(COMMISSION_BATCHES_KEY, mapped);
    return mapped;
  },

  async createPayoutBatch(title: string, scheduledDate: string, entryIds: string[], adminUserEmail: string, notes?: string): Promise<CommissionPayoutBatch | null> {
    const { data: batchId, error } = await supabase.rpc('admin_create_commission_payout_batch', {
      p_scheduled_date: scheduledDate,
      p_entry_ids: entryIds,
      p_title: title || null,
      p_notes: notes || null
    });
    if (error) throw error;
    await this.refreshEntries();
    const batches = await this.refreshPayoutBatches();
    const batch = batches.find(item => item.id === batchId) || null;
    if (batch) {
      configService.logAuditEntry({
        entity: 'Commission Payout Batch', recordId: batch.id, action: 'create', field: 'new_batch',
        oldValue: null, newValue: batch, userEmail: adminUserEmail, label: batch.batchNumber
      });
    }
    return batch;
  },

  async finalizePayoutBatch(batchId: string, adminUserEmail: string, payoutRefText?: string, notes?: string): Promise<CommissionPayoutBatch | null> {
    const { error } = await supabase.rpc('admin_finalize_commission_payout_batch', {
      p_batch_id: batchId,
      p_payout_reference: payoutRefText || '',
      p_notes: notes || ''
    });
    if (error) throw error;
    await this.refreshEntries();
    const batches = await this.refreshPayoutBatches();
    const batch = batches.find(item => item.id === batchId) || null;
    if (batch) {
      configService.logAuditEntry({
        entity: 'Commission Payout Batch', recordId: batch.id, action: 'update', field: 'batch_completed_payout',
        oldValue: 'Approved', newValue: 'Completed', userEmail: adminUserEmail, label: batch.batchNumber
      });
    }
    return batch;
  }
};
