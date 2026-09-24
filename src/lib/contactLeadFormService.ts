import { supabase } from './supabase';

export type LeadFormFieldType = 'text' | 'email' | 'url' | 'tel' | 'textarea' | 'single_select';
export type LeadFormFieldWidth = 'half' | 'full';
export type LeadFormDisplay = 'default' | 'cards';

export interface LeadFormOption {
  value: string;
  label: string;
  score?: number;
  estimatedValue?: number;
}

export interface LeadFormCondition {
  fieldId: string;
  operator: 'equals' | 'not_equals' | 'contains';
  value: string;
}

export interface LeadFormField {
  id: string;
  purpose?: string;
  type: LeadFormFieldType;
  display?: LeadFormDisplay;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  enabled: boolean;
  locked?: boolean;
  stepId: string;
  order: number;
  width: LeadFormFieldWidth;
  minLength?: number;
  maxLength?: number;
  options: LeadFormOption[];
  condition?: LeadFormCondition;
}

export interface LeadFormStep {
  id: string;
  title: string;
  subtitle?: string;
}

export interface PublicContactFormConfiguration {
  version: number;
  enabled: boolean;
  experience: {
    eyebrow: string;
    title: string;
    subtitle: string;
    estimatedTime: string;
    previousLabel: string;
    nextLabel: string;
    submitLabel: string;
    successTitle: string;
    successMessage: string;
    privacyText: string;
  };
  steps: LeadFormStep[];
  scoring: {
    highThreshold: number;
    mediumThreshold: number;
    businessEmailBonus: number;
    projectDetailBonus: number;
  };
  fields: LeadFormField[];
}

export interface LeadAssignmentConfiguration {
  version: number;
  mode: 'manual' | 'round_robin';
  managerUserIds: string[];
  eligibleSalespersonIds: string[];
  firstResponseSlaMinutes: number;
  notifyManagersOnNewLead: boolean;
  notifyAssigneeOnAssignment: boolean;
  escalateOverdueToManagers: boolean;
}

export interface ContactLeadConfigPerson {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: string;
}

export interface AdminContactLeadConfiguration {
  form: PublicContactFormConfiguration;
  assignment: LeadAssignmentConfiguration;
  staff: ContactLeadConfigPerson[];
  salespeople: ContactLeadConfigPerson[];
}

export const DEFAULT_PUBLIC_CONTACT_FORM: PublicContactFormConfiguration = {
  version: 1,
  enabled: true,
  experience: {
    eyebrow: 'Start your project',
    title: "Tell us what you're building",
    subtitle: 'A few focused questions help us understand your goals and recommend the right next step.',
    estimatedTime: 'Takes about 2 minutes',
    previousLabel: 'Back',
    nextLabel: 'Continue',
    submitLabel: 'Request My Project Review',
    successTitle: 'Thank you — your project is in review.',
    successMessage: 'Our team will review your requirements and respond with the best next step.',
    privacyText: 'Your information stays private. No spam. No obligation.',
  },
  steps: [
    { id: 'about', title: 'About you & your project', subtitle: 'Start with the essentials so we know who we are helping.' },
    { id: 'fit', title: 'Goals, budget & timing', subtitle: 'This helps us recommend the right scope and next step.' },
  ],
  scoring: { highThreshold: 70, mediumThreshold: 40, businessEmailBonus: 5, projectDetailBonus: 5 },
  fields: [
    { id: 'fullName', purpose: 'fullName', type: 'text', label: 'Full name', placeholder: 'John Smith', required: true, enabled: true, locked: true, stepId: 'about', order: 10, width: 'half', options: [] },
    { id: 'email', purpose: 'email', type: 'email', label: 'Business email', placeholder: 'john@company.com', helpText: 'Personal email is okay if that is what you use for business.', required: true, enabled: true, locked: true, stepId: 'about', order: 20, width: 'half', options: [] },
    { id: 'companyName', purpose: 'companyName', type: 'text', label: 'Company / business name', placeholder: 'Acme Roofing Ltd.', required: true, enabled: true, stepId: 'about', order: 30, width: 'half', options: [] },
    { id: 'website', purpose: 'website', type: 'url', label: 'Company website', placeholder: 'https://example.com', helpText: 'Optional — share it if you already have one.', required: false, enabled: true, stepId: 'about', order: 40, width: 'half', options: [] },
    { id: 'serviceInterest', purpose: 'serviceInterest', type: 'single_select', display: 'cards', label: 'What do you need help with?', helpText: 'Choose the closest fit. You can explain details on the next step.', required: true, enabled: true, stepId: 'about', order: 50, width: 'full', options: [
      { value: 'Website Design & Development', label: 'Website Design & Development', score: 5 },
      { value: 'Website Redesign / Conversion Improvement', label: 'Website Redesign / Conversion Improvement', score: 5 },
      { value: 'Custom Web Application', label: 'Custom Web Application', score: 5 },
      { value: 'E-commerce Website', label: 'E-commerce Website', score: 5 },
      { value: 'UI/UX Design', label: 'UI/UX Design', score: 5 },
      { value: 'Email Marketing & Business Automation', label: 'Email Marketing & Business Automation', score: 5 },
      { value: 'Website Maintenance / Ongoing Support', label: 'Website Maintenance / Ongoing Support', score: 4 },
      { value: 'Not Sure — I Need Guidance', label: 'Not Sure — I Need Guidance', score: 2 },
      { value: 'Other', label: 'Other', score: 2 },
    ] },
    { id: 'businessGoal', purpose: 'businessGoal', type: 'single_select', display: 'cards', label: 'What would you most like this project to achieve?', helpText: 'Pick the outcome that matters most right now.', required: true, enabled: true, stepId: 'fit', order: 10, width: 'full', options: [
      { value: 'Generate more qualified leads', label: 'Generate more qualified leads', score: 10 },
      { value: 'Increase conversions / sales', label: 'Increase conversions / sales', score: 10 },
      { value: 'Build stronger credibility and positioning', label: 'Build stronger credibility and positioning', score: 10 },
      { value: 'Launch a new business / product / service', label: 'Launch a new business / product / service', score: 10 },
      { value: 'Replace an outdated website', label: 'Replace an outdated website', score: 10 },
      { value: 'Improve customer experience', label: 'Improve customer experience', score: 10 },
      { value: 'Automate a manual business process', label: 'Automate a manual business process', score: 10 },
      { value: 'Build a custom web platform / application', label: 'Build a custom web platform / application', score: 10 },
      { value: 'Other', label: 'Other', score: 5 },
    ] },
    { id: 'budgetRange', purpose: 'budgetRange', type: 'single_select', display: 'cards', label: 'What budget have you allocated for this project?', helpText: 'A range is enough. It helps us recommend a realistic scope without wasting your time.', required: true, enabled: true, stepId: 'fit', order: 20, width: 'full', options: [
      { value: 'Under $1,000', label: 'Under $1,000', score: 0, estimatedValue: 750 },
      { value: '$1,000 – $3,000', label: '$1,000 – $3,000', score: 8, estimatedValue: 2000 },
      { value: '$3,000 – $6,000', label: '$3,000 – $6,000', score: 16, estimatedValue: 4500 },
      { value: '$6,000 – $15,000', label: '$6,000 – $15,000', score: 25, estimatedValue: 10500 },
      { value: '$15,000 – $30,000', label: '$15,000 – $30,000', score: 30, estimatedValue: 22500 },
      { value: '$30,000+', label: '$30,000+', score: 35, estimatedValue: 30000 },
      { value: 'Not sure — I need guidance', label: 'Not sure — I need guidance', score: 10, estimatedValue: 0 },
    ] },
    { id: 'timeline', purpose: 'timeline', type: 'single_select', display: 'cards', label: 'When would you like to get started?', helpText: 'An approximate timeframe is perfect.', required: true, enabled: true, stepId: 'fit', order: 30, width: 'full', options: [
      { value: 'As soon as possible', label: 'As soon as possible', score: 25 },
      { value: 'Within 2–4 weeks', label: 'Within 2–4 weeks', score: 20 },
      { value: 'Within 1–3 months', label: 'Within 1–3 months', score: 15 },
      { value: 'Within 3–6 months', label: 'Within 3–6 months', score: 8 },
      { value: '6+ months', label: '6+ months', score: 4 },
      { value: 'Just exploring for now', label: 'Just exploring for now', score: 0 },
    ] },
    { id: 'decisionRole', purpose: 'decisionRole', type: 'single_select', display: 'cards', label: 'What best describes your role in this project?', helpText: 'This helps us prepare the right kind of conversation.', required: true, enabled: true, stepId: 'fit', order: 40, width: 'full', options: [
      { value: "I'm the primary decision-maker", label: "I'm the primary decision-maker", score: 20 },
      { value: "I'm part of the decision-making team", label: "I'm part of the decision-making team", score: 15 },
      { value: "I'm researching options for my company", label: "I'm researching options for my company", score: 5 },
      { value: "I'm gathering information for a client", label: "I'm gathering information for a client", score: 8 },
      { value: 'Other', label: 'Other', score: 3 },
    ] },
    { id: 'projectDetails', purpose: 'projectDetails', type: 'textarea', label: 'Tell us a little about your project', placeholder: 'What are you looking to improve, build, or achieve?', helpText: 'A short summary is enough — no need to prepare a formal brief.', required: true, enabled: true, stepId: 'fit', order: 50, width: 'full', minLength: 20, maxLength: 4000, options: [] },
    { id: 'phone', purpose: 'phone', type: 'tel', label: 'Phone / WhatsApp', placeholder: '+1 555 123 4567', helpText: 'Optional — useful if you prefer a call or WhatsApp follow-up.', required: false, enabled: true, stepId: 'fit', order: 60, width: 'half', options: [] },
  ],
};

function normalizeForm(value: any): PublicContactFormConfiguration {
  const source = value && typeof value === 'object' ? value : DEFAULT_PUBLIC_CONTACT_FORM;
  return {
    ...DEFAULT_PUBLIC_CONTACT_FORM,
    ...source,
    experience: { ...DEFAULT_PUBLIC_CONTACT_FORM.experience, ...(source.experience || {}) },
    scoring: { ...DEFAULT_PUBLIC_CONTACT_FORM.scoring, ...(source.scoring || {}) },
    steps: Array.isArray(source.steps) && source.steps.length ? source.steps : DEFAULT_PUBLIC_CONTACT_FORM.steps,
    fields: Array.isArray(source.fields) && source.fields.length ? source.fields.map((field: any, index: number) => ({
      id: String(field.id || `field_${index + 1}`),
      purpose: field.purpose ? String(field.purpose) : undefined,
      type: ['text', 'email', 'url', 'tel', 'textarea', 'single_select'].includes(field.type) ? field.type : 'text',
      display: field.display === 'cards' ? 'cards' : 'default',
      label: String(field.label || 'Field'),
      placeholder: String(field.placeholder || ''),
      helpText: String(field.helpText || ''),
      required: Boolean(field.required),
      enabled: field.enabled !== false,
      locked: Boolean(field.locked),
      stepId: String(field.stepId || source.steps?.[0]?.id || 'about'),
      order: Number(field.order ?? index * 10),
      width: field.width === 'half' ? 'half' : 'full',
      minLength: field.minLength === undefined ? undefined : Number(field.minLength),
      maxLength: field.maxLength === undefined ? undefined : Number(field.maxLength),
      options: Array.isArray(field.options) ? field.options.map((option: any) => ({
        value: String(option.value || option.label || ''), label: String(option.label || option.value || ''),
        score: option.score === undefined ? undefined : Number(option.score),
        estimatedValue: option.estimatedValue === undefined ? undefined : Number(option.estimatedValue),
      })).filter((option: LeadFormOption) => Boolean(option.value)) : [],
      condition: field.condition?.fieldId ? {
        fieldId: String(field.condition.fieldId),
        operator: ['not_equals', 'contains'].includes(field.condition.operator) ? field.condition.operator : 'equals',
        value: String(field.condition.value || ''),
      } : undefined,
    })) : DEFAULT_PUBLIC_CONTACT_FORM.fields,
  };
}

function normalizeAssignment(value: any): LeadAssignmentConfiguration {
  return {
    version: Number(value?.version || 1),
    mode: value?.mode === 'round_robin' ? 'round_robin' : 'manual',
    managerUserIds: Array.isArray(value?.managerUserIds) ? value.managerUserIds.map(String) : [],
    eligibleSalespersonIds: Array.isArray(value?.eligibleSalespersonIds) ? value.eligibleSalespersonIds.map(String) : [],
    firstResponseSlaMinutes: Math.max(5, Math.min(1440, Number(value?.firstResponseSlaMinutes || 30))),
    notifyManagersOnNewLead: value?.notifyManagersOnNewLead !== false,
    notifyAssigneeOnAssignment: value?.notifyAssigneeOnAssignment !== false,
    escalateOverdueToManagers: value?.escalateOverdueToManagers !== false,
  };
}

export const contactLeadFormService = {
  async getPublicConfiguration(): Promise<PublicContactFormConfiguration> {
    const { data, error } = await supabase.rpc('get_public_contact_form_configuration');
    if (error) throw error;
    return normalizeForm(data);
  },

  async getAdminConfiguration(): Promise<AdminContactLeadConfiguration> {
    const { data, error } = await supabase.rpc('crm_admin_get_contact_lead_configuration');
    if (error) throw error;
    return {
      form: normalizeForm(data?.form),
      assignment: normalizeAssignment(data?.assignment),
      staff: Array.isArray(data?.staff) ? data.staff : [],
      salespeople: Array.isArray(data?.salespeople) ? data.salespeople : [],
    };
  },

  async saveAdminConfiguration(form: PublicContactFormConfiguration, assignment: LeadAssignmentConfiguration): Promise<AdminContactLeadConfiguration> {
    const { data, error } = await supabase.rpc('crm_admin_save_contact_lead_configuration', { p_form: form, p_assignment: assignment });
    if (error) throw error;
    return {
      form: normalizeForm(data?.form),
      assignment: normalizeAssignment(data?.assignment),
      staff: Array.isArray(data?.staff) ? data.staff : [],
      salespeople: Array.isArray(data?.salespeople) ? data.salespeople : [],
    };
  },
};
