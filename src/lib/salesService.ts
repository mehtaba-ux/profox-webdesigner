import { supabase } from './supabase';
import {
  SalesProduct,
  Quotation,
  QuotationItem,
  QuotationStatus,
  Payment,
  SalesClient
} from '../types';

function mapProductFromDb(row: any): SalesProduct {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category,
    productType: row.product_type,
    priceMode: row.price_mode,
    basePrice: Number(row.base_price || 0),
    currency: row.currency || 'USD',
    billingPeriod: row.billing_period,
    shortDescription: row.short_description,
    fullDescription: row.full_description,
    scope: Array.isArray(row.scope) ? row.scope : [],
    technology: row.technology,
    managerApprovalRequired: Boolean(row.manager_approval_required),
    active: Boolean(row.active),
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deliveryDurationMin: row.delivery_duration_min == null ? null : Number(row.delivery_duration_min),
    deliveryDurationMax: row.delivery_duration_max == null ? null : Number(row.delivery_duration_max),
    deliveryDurationUnit: row.delivery_duration_unit || 'business_days',
    timelineImpact: row.timeline_impact || 'assessment_required',
    deliveryDurationNote: row.delivery_duration_note || ''
  } as SalesProduct;
}

function mapProductToDb(product: Partial<SalesProduct>) {
  const row: any = {};
  if (product.code !== undefined) row.code = product.code;
  if (product.name !== undefined) row.name = product.name;
  if (product.category !== undefined) row.category = product.category;
  if (product.productType !== undefined) row.product_type = product.productType;
  if (product.priceMode !== undefined) row.price_mode = product.priceMode;
  if (product.basePrice !== undefined) row.base_price = product.basePrice;
  if (product.currency !== undefined) row.currency = product.currency;
  if (product.billingPeriod !== undefined) row.billing_period = product.billingPeriod;
  if (product.shortDescription !== undefined) row.short_description = product.shortDescription;
  if (product.fullDescription !== undefined) row.full_description = product.fullDescription;
  if (product.scope !== undefined) row.scope = product.scope;
  if (product.technology !== undefined) row.technology = product.technology;
  if (product.managerApprovalRequired !== undefined) row.manager_approval_required = product.managerApprovalRequired;
  if (product.active !== undefined) row.active = product.active;
  if (product.sortOrder !== undefined) row.sort_order = product.sortOrder;
  const timeline = product as any;
  if (timeline.deliveryDurationMin !== undefined) row.delivery_duration_min = timeline.deliveryDurationMin;
  if (timeline.deliveryDurationMax !== undefined) row.delivery_duration_max = timeline.deliveryDurationMax;
  if (timeline.deliveryDurationUnit !== undefined) row.delivery_duration_unit = timeline.deliveryDurationUnit;
  if (timeline.timelineImpact !== undefined) row.timeline_impact = timeline.timelineImpact;
  if (timeline.deliveryDurationNote !== undefined) row.delivery_duration_note = timeline.deliveryDurationNote;
  return row;
}

function mapQuotationFromDb(row: any): Quotation & { quotation_items?: QuotationItem[] } {
  const mapped: any = {
    id: row.id,
    quotationNumber: row.quotation_number,
    opportunityId: row.opportunity_id,
    clientId: row.client_id,
    salespersonId: row.salesperson_id,
    customerName: row.customer_name,
    contactName: row.contact_name,
    email: row.email,
    phone: row.phone,
    country: row.country,
    currency: row.currency || 'USD',
    status: row.status,
    validUntil: row.valid_until,
    paymentTerms: row.payment_terms,
    scopeSummary: row.scope_summary,
    exclusions: row.exclusions,
    customerNotes: row.customer_notes,
    internalNotes: row.internal_notes,
    subtotal: Number(row.subtotal || 0),
    total: Number(row.total || 0),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at,
    sentAt: row.sent_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    estimatedDurationMin: row.estimated_duration_min == null ? null : Number(row.estimated_duration_min),
    estimatedDurationMax: row.estimated_duration_max == null ? null : Number(row.estimated_duration_max),
    durationUnit: row.duration_unit || 'business_days',
    durationSnapshotText: row.duration_snapshot_text || '',
    durationSnapshottedAt: row.duration_snapshotted_at,
    durationRequiresAssessment: row.duration_requires_assessment !== false,
    durationSource: row.duration_source || 'unresolved',
    durationOverrideMin: row.duration_override_min == null ? null : Number(row.duration_override_min),
    durationOverrideMax: row.duration_override_max == null ? null : Number(row.duration_override_max),
    durationOverrideNote: row.duration_override_note || '',
    durationOverrideBy: row.duration_override_by,
    durationOverrideAt: row.duration_override_at
  };
  if (Array.isArray(row.quotation_items)) mapped.quotation_items = row.quotation_items.map(mapQuotationItemFromDb);
  return mapped;
}

function mapQuotationToRpc(q: Partial<Quotation>) {
  const row: any = {};
  if (q.opportunityId !== undefined) row.opportunity_id = q.opportunityId;
  if (q.salespersonId !== undefined) row.salesperson_id = q.salespersonId;
  if (q.customerName !== undefined) row.customer_name = q.customerName;
  if (q.contactName !== undefined) row.contact_name = q.contactName;
  if (q.email !== undefined) row.email = q.email;
  if (q.phone !== undefined) row.phone = q.phone;
  if (q.country !== undefined) row.country = q.country;
  if (q.currency !== undefined) row.currency = q.currency;
  if (q.status !== undefined) row.status = q.status;
  if (q.validUntil !== undefined) row.valid_until = q.validUntil;
  if (q.paymentTerms !== undefined) row.payment_terms = q.paymentTerms;
  if (q.scopeSummary !== undefined) row.scope_summary = q.scopeSummary;
  if (q.exclusions !== undefined) row.exclusions = q.exclusions;
  if (q.customerNotes !== undefined) row.customer_notes = q.customerNotes;
  if (q.internalNotes !== undefined) row.internal_notes = q.internalNotes;
  if (q.subtotal !== undefined) row.subtotal = q.subtotal;
  if (q.total !== undefined) row.total = q.total;
  return row;
}

function mapQuotationItemFromDb(row: any): QuotationItem {
  return {
    id: row.id,
    quotationId: row.quotation_id,
    salesProductId: row.sales_product_id,
    productCodeSnapshot: row.product_code_snapshot,
    productNameSnapshot: row.product_name_snapshot,
    descriptionSnapshot: row.description_snapshot,
    quantity: Number(row.quantity || 1),
    unitPrice: Number(row.unit_price || 0),
    lineTotal: Number(row.line_total || 0),
    itemType: row.item_type,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    durationMinSnapshot: row.duration_min_snapshot == null ? null : Number(row.duration_min_snapshot),
    durationMaxSnapshot: row.duration_max_snapshot == null ? null : Number(row.duration_max_snapshot),
    durationUnitSnapshot: row.duration_unit_snapshot || 'business_days',
    timelineImpactSnapshot: row.timeline_impact_snapshot || 'assessment_required',
    durationNoteSnapshot: row.duration_note_snapshot || ''
  } as QuotationItem;
}

function mapQuotationItemToRpc(item: Partial<QuotationItem>) {
  return {
    sales_product_id: item.salesProductId || null,
    product_code_snapshot: item.productCodeSnapshot || 'CUSTOM',
    product_name_snapshot: item.productNameSnapshot || 'Custom Item',
    description_snapshot: item.descriptionSnapshot || null,
    quantity: item.quantity ?? 1,
    unit_price: item.unitPrice ?? 0,
    line_total: item.lineTotal ?? ((item.unitPrice || 0) * (item.quantity || 1)),
    item_type: item.itemType || 'custom',
    sort_order: item.sortOrder ?? 0
  };
}

function mapPaymentFromDb(row: any): Payment {
  return {
    id: row.id,
    paymentReference: row.payment_reference,
    quotationId: row.quotation_id,
    opportunityId: row.opportunity_id,
    clientId: row.client_id,
    salespersonId: row.salesperson_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    paymentType: row.payment_type,
    milestoneNumber: row.milestone_number,
    milestoneLabel: row.milestone_label,
    amountDue: Number(row.amount_due || 0),
    amountPaid: Number(row.amount_paid || 0),
    currency: row.currency || 'USD',
    paymentMethod: row.payment_method,
    paymentProvider: row.payment_provider,
    paymentLink: row.payment_link,
    providerPaymentId: row.provider_payment_id,
    status: row.status,
    dueDate: row.due_date,
    paidAt: row.paid_at,
    verifiedAt: row.verified_at,
    verifiedBy: row.verified_by,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPaymentToDb(payment: Partial<Payment>) {
  const row: any = {};
  if (payment.quotationId !== undefined) row.quotation_id = payment.quotationId;
  if (payment.opportunityId !== undefined) row.opportunity_id = payment.opportunityId;
  if (payment.clientId !== undefined) row.client_id = payment.clientId;
  if (payment.salespersonId !== undefined) row.salesperson_id = payment.salespersonId;
  if (payment.customerName !== undefined) row.customer_name = payment.customerName;
  if (payment.customerEmail !== undefined) row.customer_email = payment.customerEmail;
  if (payment.paymentType !== undefined) row.payment_type = payment.paymentType;
  if (payment.milestoneNumber !== undefined) row.milestone_number = payment.milestoneNumber;
  if (payment.milestoneLabel !== undefined) row.milestone_label = payment.milestoneLabel;
  if (payment.amountDue !== undefined) row.amount_due = payment.amountDue;
  if (payment.currency !== undefined) row.currency = payment.currency;
  if (payment.paymentMethod !== undefined) row.payment_method = payment.paymentMethod;
  if (payment.paymentProvider !== undefined) row.payment_provider = payment.paymentProvider;
  if (payment.paymentLink !== undefined) row.payment_link = payment.paymentLink;
  if (payment.providerPaymentId !== undefined) row.provider_payment_id = payment.providerPaymentId;
  if (payment.status !== undefined && !['Verified','Refunded','Partially Refunded'].includes(payment.status)) row.status = payment.status;
  if (payment.dueDate !== undefined) row.due_date = payment.dueDate;
  if (payment.paidAt !== undefined) row.paid_at = payment.paidAt;
  if (payment.notes !== undefined) row.notes = payment.notes;
  if (payment.createdBy !== undefined) row.created_by = payment.createdBy;
  return row;
}

function mapClientFromDb(row: any): SalesClient {
  return {
    id: row.id,
    companyName: row.company_name,
    primaryContactName: row.primary_contact_name,
    email: row.email,
    phone: row.phone,
    website: row.website,
    country: row.country,
    industry: row.industry,
    salespersonId: row.salesperson_id,
    sourceOpportunityId: row.source_opportunity_id,
    firstQuotationId: row.first_quotation_id,
    totalSalesValue: Number(row.total_sales_value || 0),
    currency: row.currency || 'USD',
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export const salesService = {
  async getProducts() {
    const { data, error } = await supabase.from('sales_products').select('*').order('sort_order', { ascending: true });
    return { data: (data || []).map(mapProductFromDb), error };
  },

  async getActiveProducts() {
    const { data, error } = await supabase.from('sales_products').select('*').eq('active', true).order('sort_order', { ascending: true });
    return { data: (data || []).map(mapProductFromDb), error };
  },

  async getProductByCode(code: string) {
    const { data, error } = await supabase.from('sales_products').select('*').eq('code', code).single();
    return { data: data ? mapProductFromDb(data) : null, error };
  },

  async createProduct(product: Partial<SalesProduct>) {
    const { data, error } = await supabase.from('sales_products').insert([mapProductToDb(product)]).select().single();
    return { data: data ? mapProductFromDb(data) : null, error };
  },

  async updateProduct(id: string, updates: Partial<SalesProduct>) {
    const { data, error } = await supabase.from('sales_products').update(mapProductToDb(updates)).eq('id', id).select().single();
    return { data: data ? mapProductFromDb(data) : null, error };
  },

  async deleteProduct(id: string) {
    const { count, error: countError } = await supabase.from('quotation_items').select('*', { count: 'exact', head: true }).eq('sales_product_id', id);
    if (countError) return { error: countError };
    if (count && count > 0) return await this.updateProduct(id, { active: false });
    const { error } = await supabase.from('sales_products').delete().eq('id', id);
    return { error };
  },

  async getQuotations() {
    const { data, error } = await supabase.from('quotations').select('*').order('created_at', { ascending: false });
    return { data: (data || []).map(mapQuotationFromDb), error };
  },

  async getQuotationById(id: string) {
    const { data, error } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', id).single();
    return { data: data ? mapQuotationFromDb(data) : null, error };
  },

  async getQuotationsByOpportunity(opportunityId: string) {
    const { data, error } = await supabase.from('quotations').select('*').eq('opportunity_id', opportunityId).order('created_at', { ascending: false });
    return { data: (data || []).map(mapQuotationFromDb), error };
  },

  async getQuotationsBySalesperson(salespersonId: string) {
    const { data, error } = await supabase.from('quotations').select('*').eq('salesperson_id', salespersonId).order('created_at', { ascending: false });
    return { data: (data || []).map(mapQuotationFromDb), error };
  },

  async createQuotation(quotation: Partial<Quotation>, items: Partial<QuotationItem>[]) {
    const { data: id, error } = await supabase.rpc('create_quotation_atomic', {
      p_quotation: mapQuotationToRpc(quotation),
      p_items: items.map(mapQuotationItemToRpc)
    });
    if (error) return { data: null, error };
    return await this.getQuotationById(id);
  },

  async updateQuotation(id: string, updates: Partial<Quotation>, items?: Partial<QuotationItem>[]) {
    const { error } = await supabase.rpc('update_quotation_atomic', {
      p_quotation_id: id,
      p_updates: mapQuotationToRpc(updates),
      p_items: items ? items.map(mapQuotationItemToRpc) : null
    });
    if (error) return { data: null, error };
    return await this.getQuotationById(id);
  },

  async updateQuotationStatus(id: string, status: QuotationStatus, metadata?: Partial<Quotation>) {
    return await this.updateQuotation(id, { ...(metadata || {}), status });
  },

  async duplicateQuotation(id: string) {
    const { data: original, error } = await this.getQuotationById(id);
    if (error || !original) return { data: null, error: error || new Error('Quotation not found') };
    const rawItems = (original as any).quotation_items || [];
    return await this.createQuotation({
      opportunityId: original.opportunityId,
      salespersonId: original.salespersonId,
      customerName: original.customerName,
      contactName: original.contactName,
      email: original.email,
      phone: original.phone,
      country: original.country,
      currency: original.currency,
      status: 'Draft',
      validUntil: original.validUntil,
      paymentTerms: original.paymentTerms,
      scopeSummary: original.scopeSummary,
      exclusions: original.exclusions,
      customerNotes: original.customerNotes,
      internalNotes: original.internalNotes,
      subtotal: original.subtotal,
      total: original.total
    }, rawItems.map((item: QuotationItem) => ({ ...item, id: undefined as any, quotationId: undefined as any })));
  },

  async getPayments() {
    const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
    return { data: (data || []).map(mapPaymentFromDb), error };
  },

  async getPaymentById(id: string) {
    const { data, error } = await supabase.from('payments').select('*').eq('id', id).single();
    return { data: data ? mapPaymentFromDb(data) : null, error };
  },

  async getPaymentsByQuotation(quotationId: string) {
    const { data, error } = await supabase.from('payments').select('*').eq('quotation_id', quotationId).order('created_at', { ascending: true });
    return { data: (data || []).map(mapPaymentFromDb), error };
  },

  async createPayment(payment: Partial<Payment>) {
    const { data, error } = await supabase.from('payments').insert([mapPaymentToDb(payment)]).select().single();
    return { data: data ? mapPaymentFromDb(data) : null, error };
  },

  async updatePayment(id: string, updates: Partial<Payment>) {
    const { data, error } = await supabase.from('payments').update(mapPaymentToDb(updates)).eq('id', id).select().single();
    return { data: data ? mapPaymentFromDb(data) : null, error };
  },

  async verifyPayment(id: string, verifiedBy: string, notes?: string, amountReceived?: number) {
    if (amountReceived !== undefined && (!Number.isFinite(amountReceived) || amountReceived <= 0)) {
      return { data: null, error: new Error('Confirmed amount received must be greater than zero.') };
    }

    const { error: rpcError } = await supabase.rpc('verify_payment_atomic', {
      p_payment_id: id,
      p_admin_id: verifiedBy,
      p_notes: notes || '',
      p_amount_received: amountReceived ?? null
    });
    if (rpcError) return { data: null, error: rpcError };
    return await this.getPaymentById(id);
  },

  async getClients() {
    const { data, error } = await supabase.from('clients').select('*').order('company_name', { ascending: true });
    return { data: (data || []).map(mapClientFromDb), error };
  },

  async getClientById(id: string) {
    const { data, error } = await supabase.from('clients').select('*').eq('id', id).single();
    return { data: data ? mapClientFromDb(data) : null, error };
  },

  async ensureClientForOpportunity(opportunityId: string, _quotationId: string) {
    const { data: opportunity, error } = await supabase.from('crm_opportunities').select('client_id').eq('id', opportunityId).single();
    if (error) return { data: null, error };
    if (!opportunity?.client_id) {
      return { data: null, error: new Error('Client is created and linked only after Admin-verified advance/full payment.') };
    }
    return await this.getClientById(opportunity.client_id);
  }
};