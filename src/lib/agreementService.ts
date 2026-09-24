import { supabase } from './supabase';

const getBaseUrl = () => String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
type EdgeResponse = { success?: boolean; error?: string; [key: string]: unknown };

async function rpc<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}

export const agreementService = {
  getPublicAgreement(token: string) { return rpc<any>('public_get_sales_partner_agreement', { p_token: token }); },
  async signPublicAgreement(token: string, signerName: string, signatureSvg: string, acknowledgements: Record<string, boolean>) {
    const response = await fetch(`${getBaseUrl()}/functions/v1/sales-agreement-signing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sign', token, signerName, signatureSvg, acknowledgements }) });
    const data = await response.json().catch(() => ({})) as EdgeResponse;
    if (!response.ok || data.success === false) throw new Error(data.error || 'Agreement could not be signed.');
    return data;
  },
  async declinePublicAgreement(token: string, reason: string) {
    const response = await fetch(`${getBaseUrl()}/functions/v1/sales-agreement-signing`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'decline', token, reason }) });
    const data = await response.json().catch(() => ({})) as EdgeResponse;
    if (!response.ok || data.success === false) throw new Error(data.error || 'Agreement could not be declined.');
    return data;
  },
  getTemplate() { return rpc<any>('admin_get_sales_agreement_template'); },
  saveTemplate(value: any) { return rpc<string>('admin_save_sales_agreement_template', { p_title: value.title, p_subtitle: value.subtitle || '', p_introduction: value.introduction || '', p_sections: value.sections || [], p_acknowledgements: value.acknowledgements || [] }); },
  publishTemplate(templateId: string) { return rpc<void>('admin_publish_sales_agreement_template', { p_template_id: templateId }); },
  previewDynamicData(applicantId?: string) { return rpc<any>('admin_preview_sales_agreement_dynamic_data', { p_applicant_id: applicantId || null }); },
  // One role-aware entry point. The server selects Sales, UI/UX or Web Developer agreement from the candidate's career job.
  issue(applicantId: string) { return rpc<any>('admin_issue_candidate_agreement', { p_applicant_id: applicantId }); },
  resend(agreementId: string) { return rpc<any>('admin_resend_sales_partner_agreement', { p_agreement_id: agreementId }); },
  getForApplicant(applicantId: string) { return rpc<any>('admin_get_sales_partner_agreement', { p_applicant_id: applicantId }); },
  list() { return rpc<any[]>('admin_list_sales_partner_agreements'); },
  async verify(agreementId: string, signerName: string, signerTitle: string, signatureSvg: string) {
    const result = await rpc<any>('admin_verify_sales_partner_agreement', { p_agreement_id: agreementId, p_signer_name: signerName, p_signer_title: signerTitle, p_signature_svg: signatureSvg });

    // The Admin screen historically refreshed the list after verification but could
    // leave its selected agreement snapshot at "Partner Signed" when the page was
    // opened without an applicant query parameter. Canonicalize the successful
    // result to the same page with that applicant selected so both panels reload
    // from the verified database record. Verification itself is idempotent server-side.
    if (typeof window !== 'undefined' && result?.success === true) {
      try {
        const agreements = await rpc<any[]>('admin_list_sales_partner_agreements');
        const current = (agreements || []).find((item: any) => item?.id === agreementId);
        const applicantId = String(current?.applicantId || current?.applicant_id || '').trim();
        if (applicantId) {
          const url = new URL(window.location.href);
          url.searchParams.set('applicant', applicantId);
          window.location.replace(url.toString());
        }
      } catch (refreshError) {
        console.warn('Agreement verified but canonical Admin refresh could not be prepared.', refreshError);
      }
    }

    return result;
  }
};
