import { Department, UserRole } from '../types';

export interface AgencyDepartmentDefinition {
  value: Department;
  label: string;
  shortLabel: string;
  description: string;
}

/**
 * UI-only operating model for the ProFox workspace.
 *
 * The stored department values stay unchanged so existing RLS, workflows and data remain
 * compatible. These labels give every role one clear primary home in the interface.
 */
export const AGENCY_DEPARTMENTS: AgencyDepartmentDefinition[] = [
  {
    value: 'Management',
    label: 'Leadership & Management',
    shortLabel: 'Management',
    description: 'Founder oversight, leadership, approvals and cross-functional management.'
  },
  {
    value: 'Sales',
    label: 'Sales & Business Development',
    shortLabel: 'Sales',
    description: 'Lead generation, CRM, meetings, quotations, closing and commercial follow-up.'
  },
  {
    value: 'Project Management',
    label: 'Project Management & Delivery',
    shortLabel: 'Project Delivery',
    description: 'Client handoff, planning, coordination, timelines, dependencies and delivery ownership.'
  },
  {
    value: 'Content',
    label: 'Content Writing',
    shortLabel: 'Content',
    description: 'Research, copywriting, content production, review and approved content handoff.'
  },
  {
    value: 'UI/UX Design',
    label: 'Design & UX',
    shortLabel: 'Design',
    description: 'UX strategy, UI design, design systems, reviews and developer-ready handoff.'
  },
  {
    value: 'Development',
    label: 'Development & Engineering',
    shortLabel: 'Development',
    description: 'Implementation, engineering evidence, integrations, release readiness and handover.'
  },
  {
    value: 'Quality Assurance',
    label: 'Quality Assurance & Release',
    shortLabel: 'QA',
    description: 'Independent quality review, regression checks, release gates and delivery assurance.'
  },
  {
    value: 'Finance',
    label: 'Finance & Payouts',
    shortLabel: 'Finance',
    description: 'Payable earnings, payout batches, holds and protected payment confirmation.'
  },
  {
    value: 'General',
    label: 'General / External',
    shortLabel: 'General',
    description: 'Pending, customer or intentionally unassigned profiles.'
  }
];

export const ROLE_PRIMARY_DEPARTMENT: Record<UserRole, Department> = {
  admin: 'Management',
  sales: 'Sales',
  sales_rep: 'Sales',
  sales_team: 'Sales',
  project_manager: 'Project Management',
  site_manager: 'Project Management',
  content_writer: 'Content',
  editor: 'Content',
  finance: 'Finance',
  accountant: 'Finance',
  uiux_designer: 'UI/UX Design',
  developer: 'Development',
  web_developer: 'Development',
  developer_designer: 'Development',
  qa: 'Quality Assurance',
  customer: 'General',
  pending: 'General'
};

export function primaryDepartmentForRole(role: UserRole | string | null | undefined): Department {
  if (!role) return 'General';
  return ROLE_PRIMARY_DEPARTMENT[role as UserRole] || 'General';
}

export function departmentDefinition(value: Department | string | null | undefined): AgencyDepartmentDefinition {
  return AGENCY_DEPARTMENTS.find(item => item.value === value)
    || AGENCY_DEPARTMENTS.find(item => item.value === 'General')!;
}

export function departmentDefinitionForRole(role: UserRole | string | null | undefined): AgencyDepartmentDefinition {
  return departmentDefinition(primaryDepartmentForRole(role));
}

export function departmentLabel(value: Department | string | null | undefined): string {
  return departmentDefinition(value).label;
}
