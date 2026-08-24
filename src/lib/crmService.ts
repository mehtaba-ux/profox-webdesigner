import { supabase } from './supabase';
import { CRMLead, CRMOpportunity, CRMActivity, LeadStatus, OpportunityStage, OpportunityStatus, ActivityStatus, ActivityType } from '../types';

export const crmService = {
  async getLeads() {
    const { data, error } = await supabase.from('crm_leads').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(this.mapLeadFromDb);
  },

  async createLead(lead: Partial<CRMLead>) {
    const { data: userData } = await supabase.auth.getUser();
    const dbData = { ...this.mapLeadToDb(lead), created_by: userData.user?.id };
    const { data, error } = await supabase.from('crm_leads').insert([dbData]).select().single();
    if (error) throw error;
    return this.mapLeadFromDb(data);
  },

  async updateLead(id: string, updates: Partial<CRMLead>) {
    const { data, error } = await supabase.from('crm_leads').update(this.mapLeadToDb(updates)).eq('id', id).select().single();
    if (error) throw error;
    return this.mapLeadFromDb(data);
  },

  async convertToOpportunity(leadId: string, opportunityData: Partial<CRMOpportunity>) {
    const { data: opportunityId, error } = await supabase.rpc('convert_lead_to_opportunity', {
      p_lead_id: leadId,
      p_name: opportunityData.name || null,
      p_expected_value: opportunityData.expectedValue ?? null
    });
    if (error) throw error;
    const { data, error: fetchError } = await supabase.from('crm_opportunities').select('*').eq('id', opportunityId).single();
    if (fetchError) throw fetchError;
    return this.mapOpportunityFromDb(data);
  },

  async getOpportunities() {
    const { data, error } = await supabase.from('crm_opportunities').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(this.mapOpportunityFromDb);
  },

  async updateOpportunity(id: string, updates: Partial<CRMOpportunity>) {
    const { data, error } = await supabase.from('crm_opportunities').update(this.mapOpportunityToDb(updates)).eq('id', id).select().single();
    if (error) throw error;
    return this.mapOpportunityFromDb(data);
  },

  async markWon(_id: string) {
    throw new Error('Opportunities may only become Won through Admin-verified advance/full payment.');
  },

  async markLost(id: string, reason: string) {
    return this.updateOpportunity(id, { status: 'Lost', lostReason: reason, lostAt: new Date().toISOString() });
  },

  async getActivities() {
    const { data, error } = await supabase.from('crm_activities').select('*').order('due_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(this.mapActivityFromDb);
  },

  async createActivity(activity: Partial<CRMActivity>) {
    const { data: userData } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('crm_activities').insert([{ ...this.mapActivityToDb(activity), created_by: userData.user?.id }]).select().single();
    if (error) throw error;
    return this.mapActivityFromDb(data);
  },

  async updateActivity(id: string, updates: Partial<CRMActivity>) {
    const { data, error } = await supabase.from('crm_activities').update(this.mapActivityToDb(updates)).eq('id', id).select().single();
    if (error) throw error;
    return this.mapActivityFromDb(data);
  },

  mapLeadFromDb(db: any): CRMLead {
    return {
      id: db.id, title: db.title, companyName: db.company_name, contactName: db.contact_name, email: db.email,
      phone: db.phone, website: db.website, country: db.country, industry: db.industry, source: db.source,
      salespersonId: db.salesperson_id, serviceInterest: db.service_interest, estimatedValue: Number(db.estimated_value),
      currency: db.currency, status: db.status as LeadStatus, loomVideoUrl: db.loom_video_url,
      initialOutreachChannel: db.initial_outreach_channel, lastContactAt: db.last_contact_at,
      nextFollowUpAt: db.next_follow_up_at, notes: db.notes, selfGenerated: db.self_generated,
      convertedOpportunityId: db.converted_opportunity_id, createdBy: db.created_by, createdAt: db.created_at, updatedAt: db.updated_at
    };
  },

  mapLeadToDb(app: Partial<CRMLead>): any {
    const db: any = {};
    if (app.title !== undefined) db.title = app.title;
    if (app.companyName !== undefined) db.company_name = app.companyName;
    if (app.contactName !== undefined) db.contact_name = app.contactName;
    if (app.email !== undefined) db.email = app.email;
    if (app.phone !== undefined) db.phone = app.phone;
    if (app.website !== undefined) db.website = app.website;
    if (app.country !== undefined) db.country = app.country;
    if (app.industry !== undefined) db.industry = app.industry;
    if (app.source !== undefined) db.source = app.source;
    if (app.salespersonId !== undefined) db.salesperson_id = app.salespersonId;
    if (app.serviceInterest !== undefined) db.service_interest = app.serviceInterest;
    if (app.estimatedValue !== undefined) db.estimated_value = app.estimatedValue;
    if (app.currency !== undefined) db.currency = app.currency;
    if (app.status !== undefined) db.status = app.status;
    if (app.loomVideoUrl !== undefined) db.loom_video_url = app.loomVideoUrl;
    if (app.initialOutreachChannel !== undefined) db.initial_outreach_channel = app.initialOutreachChannel;
    if (app.lastContactAt !== undefined) db.last_contact_at = app.lastContactAt;
    if (app.nextFollowUpAt !== undefined) db.next_follow_up_at = app.nextFollowUpAt;
    if (app.notes !== undefined) db.notes = app.notes;
    if (app.selfGenerated !== undefined) db.self_generated = app.selfGenerated;
    if (app.convertedOpportunityId !== undefined) db.converted_opportunity_id = app.convertedOpportunityId;
    return db;
  },

  mapOpportunityFromDb(db: any): CRMOpportunity {
    return {
      id: db.id, leadId: db.lead_id, name: db.name, companyName: db.company_name, contactName: db.contact_name,
      email: db.email, phone: db.phone, website: db.website, country: db.country, industry: db.industry, source: db.source,
      selfGenerated: db.self_generated, salespersonId: db.salesperson_id, serviceInterest: db.service_interest,
      expectedValue: Number(db.expected_value), currency: db.currency, stage: db.stage as OpportunityStage,
      status: db.status as OpportunityStatus, probability: db.probability, meetingAt: db.meeting_at, meetingUrl: db.meeting_url,
      requirementsSummary: db.requirements_summary, nextFollowUpAt: db.next_follow_up_at, notes: db.notes,
      lostReason: db.lost_reason, wonAt: db.won_at, lostAt: db.lost_at, createdBy: db.created_by,
      createdAt: db.created_at, updatedAt: db.updated_at
    };
  },

  mapOpportunityToDb(app: Partial<CRMOpportunity>): any {
    const db: any = {};
    if (app.name !== undefined) db.name = app.name;
    if (app.companyName !== undefined) db.company_name = app.companyName;
    if (app.contactName !== undefined) db.contact_name = app.contactName;
    if (app.email !== undefined) db.email = app.email;
    if (app.phone !== undefined) db.phone = app.phone;
    if (app.website !== undefined) db.website = app.website;
    if (app.country !== undefined) db.country = app.country;
    if (app.industry !== undefined) db.industry = app.industry;
    if (app.source !== undefined) db.source = app.source;
    if (app.selfGenerated !== undefined) db.self_generated = app.selfGenerated;
    if (app.salespersonId !== undefined) db.salesperson_id = app.salespersonId;
    if (app.serviceInterest !== undefined) db.service_interest = app.serviceInterest;
    if (app.expectedValue !== undefined) db.expected_value = app.expectedValue;
    if (app.currency !== undefined) db.currency = app.currency;
    if (app.stage !== undefined) db.stage = app.stage;
    if (app.status !== undefined) db.status = app.status;
    if (app.probability !== undefined) db.probability = app.probability;
    if (app.meetingAt !== undefined) db.meeting_at = app.meetingAt;
    if (app.meetingUrl !== undefined) db.meeting_url = app.meetingUrl;
    if (app.requirementsSummary !== undefined) db.requirements_summary = app.requirementsSummary;
    if (app.nextFollowUpAt !== undefined) db.next_follow_up_at = app.nextFollowUpAt;
    if (app.notes !== undefined) db.notes = app.notes;
    if (app.lostReason !== undefined) db.lost_reason = app.lostReason;
    if (app.wonAt !== undefined) db.won_at = app.wonAt;
    if (app.lostAt !== undefined) db.lost_at = app.lostAt;
    return db;
  },

  mapActivityFromDb(db: any): CRMActivity {
    return {
      id: db.id, leadId: db.lead_id, opportunityId: db.opportunity_id, assignedTo: db.assigned_to,
      activityType: db.activity_type as ActivityType, subject: db.subject, dueAt: db.due_at,
      completedAt: db.completed_at, status: db.status as ActivityStatus, channel: db.channel,
      loomVideoUrl: db.loom_video_url, notes: db.notes, createdBy: db.created_by, createdAt: db.created_at, updatedAt: db.updated_at
    };
  },

  mapActivityToDb(app: Partial<CRMActivity>): any {
    const db: any = {};
    if (app.leadId !== undefined) db.lead_id = app.leadId;
    if (app.opportunityId !== undefined) db.opportunity_id = app.opportunityId;
    if (app.assignedTo !== undefined) db.assigned_to = app.assignedTo;
    if (app.activityType !== undefined) db.activity_type = app.activityType;
    if (app.subject !== undefined) db.subject = app.subject;
    if (app.dueAt !== undefined) db.due_at = app.dueAt;
    if (app.completedAt !== undefined) db.completed_at = app.completedAt;
    if (app.status !== undefined) db.status = app.status;
    if (app.channel !== undefined) db.channel = app.channel;
    if (app.loomVideoUrl !== undefined) db.loom_video_url = app.loomVideoUrl;
    if (app.notes !== undefined) db.notes = app.notes;
    return db;
  }
};
