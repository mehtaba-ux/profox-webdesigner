import { supabase } from './supabase';

export interface SellerProfileContext {
  profile: {
    id: string;
    email: string;
    fullName: string;
    phone: string;
    country: string;
    timezone: string;
    role: string;
    status: string;
    onboardingStatus: string;
    onboardingProgress: number;
    avatarUrl: string;
  };
  activation: {
    stage: string | null;
    activatedAt: string | null;
    finalApproval: boolean | null;
  };
  agreement: {
    status: string | null;
    agreementNumber: string | null;
    partnerSignedAt: string | null;
    companySignedAt: string | null;
    verifiedAt: string | null;
    commissionTermsAcknowledgedThroughAgreement: boolean;
  };
  academy: {
    finalCertificationStatus: string | null;
    finalCertificationScore: number | null;
    finalCertificationReviewStatus: string | null;
    finalCertificationCompletedAt: string | null;
  };
  commission: {
    payoutSchedule: string;
  };
}

export const sellerProfileService = {
  async getMyContext(): Promise<SellerProfileContext> {
    const { data, error } = await supabase.rpc('get_my_seller_profile_context');
    if (error) throw error;
    if (!data) throw new Error('Seller profile context is unavailable.');
    return data as SellerProfileContext;
  }
};
