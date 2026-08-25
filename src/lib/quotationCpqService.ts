import { supabase } from './supabase';

export type CpqLineType = 'product' | 'custom' | 'section' | 'note';
export type CpqDiscountType = 'none' | 'percent' | 'fixed';

export interface CpqLine {
  id?: string;
  salesProductId?: string | null;
  productCodeSnapshot: string;
  productNameSnapshot: string;
  descriptionSnapshot?: string;
  quantity: number;
  unitPrice: number;
  lineTotal?: number;
  itemType: string;
  sortOrder: number;
  lineType: CpqLineType;
  discountType: CpqDiscountType;
  discountValue: number;
  discountAmount?: number;
  optionalForClient: boolean;
  sectionKey?: string | null;
  configurationSnapshot?: Record<string, unknown>;
  durationMinSnapshot?: number | null;
  durationMaxSnapshot?: number | null;
  durationUnitSnapshot?: string;
  timelineImpactSnapshot?: string;
  durationNoteSnapshot?: string;
  managerApprovalRequired?: boolean;
  priceMode?: string;
}

export interface CpqDraft {
  id?: string;
  quotationNumber?: string;
  opportunityId?: string | null;
  salespersonId?: string | null;
  customerName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  country?: string;
  currency: string;
  status: string;
  validUntil?: string;
  paymentTerms?: string;
  scopeSummary?: string;
  exclusions?: string;
  customerNotes?: string;
  internalNotes?: string;
  quotationTemplateKey?: string;
  proposalTitle?: string;
  executiveSummary?: string;
  coverMessage?: string;
  clientResponsibilities?: string;
  deliveryAssumptions?: string;
  reviewProcess?: string;
  handoverSupport?: string;
  termsAndConditions?: string;
  acceptanceMethod?: string;
  quoteDiscountType?: CpqDiscountType;
  quoteDiscountValue?: number;
  taxRate?: number;
  revisionNumber?: number;
  supersededById?: string | null;
}

function quotationPayload(q: Partial<CpqDraft>) {
  const row: Record<string, unknown> = {};
  const map: Array<[keyof CpqDraft, string]> = [
    ['opportunityId','opportunity_id'], ['salespersonId','salesperson_id'], ['customerName','customer_name'],
    ['contactName','contact_name'], ['email','email'], ['phone','phone'], ['country','country'], ['currency','currency'],
    ['status','status'], ['validUntil','valid_until'], ['paymentTerms','payment_terms'], ['scopeSummary','scope_summary'],
    ['exclusions','exclusions'], ['customerNotes','customer_notes'], ['internalNotes','internal_notes'],
    ['quotationTemplateKey','quotation_template_key'], ['proposalTitle','proposal_title'], ['executiveSummary','executive_summary'],
    ['coverMessage','cover_message'], ['clientResponsibilities','client_responsibilities'], ['deliveryAssumptions','delivery_assumptions'],
    ['reviewProcess','review_process'], ['handoverSupport','handover_support'], ['termsAndConditions','terms_and_conditions'],
    ['acceptanceMethod','acceptance_method'], ['quoteDiscountType','quote_discount_type'], ['quoteDiscountValue','quote_discount_value'],
    ['taxRate','tax_rate']
  ];
  map.forEach(([key, db]) => { if (q[key] !== undefined) row[db] = q[key] ?? null; });
  return row;
}

function linePayload(line: CpqLine) {
  return {
    sales_product_id: line.salesProductId || null,
    product_code_snapshot: line.productCodeSnapshot || 'CUSTOM',
    product_name_snapshot: line.productNameSnapshot || (line.lineType === 'section' ? 'Section' : line.lineType === 'note' ? 'Note' : 'Custom Item'),
    description_snapshot: line.descriptionSnapshot || null,
    quantity: Math.max(1, Number(line.quantity || 1)),
    unit_price: Math.max(0, Number(line.unitPrice || 0)),
    item_type: line.itemType || 'custom',
    sort_order: Number(line.sortOrder || 0),
    line_type: line.lineType || 'product',
    discount_type: line.discountType || 'none',
    discount_value: Math.max(0, Number(line.discountValue || 0)),
    optional_for_client: Boolean(line.optionalForClient),
    section_key: line.sectionKey || null,
    configuration_snapshot: line.configurationSnapshot || {}
  };
}

function rowToDraft(row: any): CpqDraft {
  return {
    id: row.id,
    quotationNumber: row.quotation_number,
    opportunityId: row.opportunity_id,
    salespersonId: row.salesperson_id,
    customerName: row.customer_name || '',
    contactName: row.contact_name || '',
    email: row.email || '',
    phone: row.phone || '',
    country: row.country || '',
    currency: row.currency || 'USD',
    status: row.status || 'Draft',
    validUntil: row.valid_until || '',
    paymentTerms: row.payment_terms || '',
    scopeSummary: row.scope_summary || '',
    exclusions: row.exclusions || '',
    customerNotes: row.customer_notes || '',
    internalNotes: row.internal_notes || '',
    quotationTemplateKey: row.quotation_template_key || '',
    proposalTitle: row.proposal_title || '',
    executiveSummary: row.executive_summary || '',
    coverMessage: row.cover_message || '',
    clientResponsibilities: row.client_responsibilities || '',
    deliveryAssumptions: row.delivery_assumptions || '',
    reviewProcess: row.review_process || '',
    handoverSupport: row.handover_support || '',
    termsAndConditions: row.terms_and_conditions || '',
    acceptanceMethod: row.acceptance_method || 'click_accept',
    quoteDiscountType: row.quote_discount_type || 'none',
    quoteDiscountValue: Number(row.quote_discount_value || 0),
    taxRate: Number(row.tax_rate || 0),
    revisionNumber: Number(row.revision_number || 1),
    supersededById: row.superseded_by_id
  };
}

function rowToLine(row: any): CpqLine {
  return {
    id: row.id,
    salesProductId: row.sales_product_id,
    productCodeSnapshot: row.product_code_snapshot || 'CUSTOM',
    productNameSnapshot: row.product_name_snapshot || 'Custom Item',
    descriptionSnapshot: row.description_snapshot || '',
    quantity: Number(row.quantity || 1),
    unitPrice: Number(row.unit_price || 0),
    lineTotal: Number(row.line_total || 0),
    itemType: row.item_type || 'custom',
    sortOrder: Number(row.sort_order || 0),
    lineType: row.line_type || 'product',
    discountType: row.discount_type || 'none',
    discountValue: Number(row.discount_value || 0),
    discountAmount: Number(row.discount_amount || 0),
    optionalForClient: Boolean(row.optional_for_client),
    sectionKey: row.section_key,
    configurationSnapshot: row.configuration_snapshot || {},
    durationMinSnapshot: row.duration_min_snapshot == null ? null : Number(row.duration_min_snapshot),
    durationMaxSnapshot: row.duration_max_snapshot == null ? null : Number(row.duration_max_snapshot),
    durationUnitSnapshot: row.duration_unit_snapshot || 'business_days',
    timelineImpactSnapshot: row.timeline_impact_snapshot || 'assessment_required',
    durationNoteSnapshot: row.duration_note_snapshot || ''
  };
}

export const quotationCpqService = {
  async getSettings() {
    return await supabase.rpc('get_quotation_cpq_settings');
  },
  async saveSettings(config: Record<string, unknown>) {
    return await supabase.rpc('admin_save_quotation_cpq_settings', { p_config: config });
  },
  async getSummary(id: string) {
    return await supabase.rpc('get_quotation_cpq_summary', { p_quotation_id: id });
  },
  async getWorkspace(id: string) {
    const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', id).single();
    if (error || !data) return { data: null, error };
    return {
      data: { quotation: rowToDraft(data), lines: (data.quotation_items || []).map(rowToLine).sort((a: CpqLine,b: CpqLine) => a.sortOrder-b.sortOrder) },
      error: null
    };
  },
  async getRecentProductIds(limit = 6) {
    const { data, error } = await supabase
      .from('quotation_items')
      .select('sales_product_id,created_at')
      .not('sales_product_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(Math.max(limit * 5, 20));
    const unique = Array.from(new Set((data || []).map((row: any) => row.sales_product_id).filter(Boolean))).slice(0, limit);
    return { data: unique as string[], error };
  },
  async createDraft(quotation: CpqDraft, lines: CpqLine[]) {
    const { data: id, error } = await supabase.rpc('create_quotation_atomic', { p_quotation: quotationPayload(quotation), p_items: lines.map(linePayload) });
    if (error) return { data: null, error };
    return { data: { id: String(id) }, error: null };
  },
  async saveDraft(id: string, quotation: Partial<CpqDraft>, lines: CpqLine[] | null) {
    const { error } = await supabase.rpc('update_quotation_atomic', { p_quotation_id: id, p_updates: quotationPayload(quotation), p_items: lines ? lines.map(linePayload) : null });
    return { error };
  },
  async requestApproval(id: string, quotation: Partial<CpqDraft>, lines: CpqLine[]) {
    const { error } = await supabase.rpc('update_quotation_atomic', { p_quotation_id: id, p_updates: quotationPayload({ ...quotation, status: 'Ready for Approval' }), p_items: lines.map(linePayload) });
    return { error };
  },
  async approve(id: string, note?: string) {
    return await supabase.rpc('admin_approve_quotation_cpq', { p_quotation_id: id, p_note: note || null });
  },
  async setDurationOverride(id: string, min: number | null, max: number | null, note: string | null, clear = false) {
    return await supabase.rpc('admin_set_quotation_duration_override', { p_quotation_id: id, p_min: min, p_max: max, p_note: note, p_clear: clear });
  },
  async duplicate(id: string) {
    return await supabase.rpc('duplicate_quotation_cpq', { p_quotation_id: id });
  },
  async createRevision(id: string) {
    return await supabase.rpc('create_quotation_revision', { p_quotation_id: id });
  },
  async send(id: string, recipient: string, cc: string[], subject: string, message: string) {
    return await supabase.rpc('send_quotation_professional', { p_quotation_id: id, p_recipient: recipient, p_cc: cc, p_subject: subject || null, p_message: message || null });
  },
  async openPublic(token: string) {
    return await supabase.rpc('open_public_quotation', { p_token: token });
  },
  async respondPublic(token: string, response: 'accept' | 'reject' | 'request_changes', note = '') {
    return await supabase.rpc('respond_public_quotation', { p_token: token, p_response: response, p_note: note });
  }
};
