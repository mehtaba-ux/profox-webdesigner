import { supabase } from './supabase';
import { talentPartnerService } from './talentPartnerService';

export interface DeveloperApplicationPayload {
  fullName: string;
  email: string;
  phone?: string;
  country: string;
  timezone: string;
  linkedinUrl?: string;
  githubUrl: string;
  portfolioUrl?: string;
  cvUrl?: string;
  cvStoragePath?: string;
  currentRole?: string;
  yearsExperience: string;
  primaryStack: string;
  frontendExperience: string;
  backendExperience: string;
  wordpressExperience: string;
  gitWorkflowExperience: string;
  testingExperience: string;
  accessibilityExperience: string;
  performanceExperience: string;
  securityExperience: string;
  designHandoffExperience: string;
  strongestProject: string;
  projectContribution: string;
  availableHoursPerWeek: number;
  preferredWorkWindow?: string;
  earliestStartDate?: string;
  skills?: string;
  source?: string;
  heardAboutSource?: string;
  heardAboutDetail?: string;
  motivation: string;
  hasLaptopInternet: boolean;
  consentAccurate: boolean;
  consentPrivacy: boolean;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  landingPage?: string;
  referrerUrl?: string;
}

export interface DeveloperApplicationResult {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  applicantId?: string;
  reference?: string;
  stage?: string;
}

export const developerHiringService = {
  async submit(jobSlug: string, application: DeveloperApplicationPayload): Promise<DeveloperApplicationResult> {
    const cleanSlug = jobSlug.trim();
    if (!cleanSlug) throw new Error('Developer role is missing.');
    const payload = {
      ...application,
      fullName: application.fullName.trim(),
      email: application.email.trim().toLowerCase(),
      githubUrl: application.githubUrl.trim(),
      portfolioUrl: application.portfolioUrl?.trim() || '',
      linkedinUrl: application.linkedinUrl?.trim() || '',
      cvStoragePath: application.cvStoragePath?.trim() || '',
      cvUrl: application.cvUrl?.trim() || ''
    };
    const { data, error } = await supabase.rpc('submit_public_developer_application', {
      p_job_slug: cleanSlug,
      p_application: payload
    });
    if (error) throw new Error(error.message || 'We could not submit your Web Developer application.');
    const result = (data || { success: false }) as DeveloperApplicationResult;
    if (result.success && result.reference) await talentPartnerService.claimApplication(result.reference, application.email);
    return result;
  }
};
