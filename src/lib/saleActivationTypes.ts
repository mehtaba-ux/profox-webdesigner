export interface SaleActivationAcceptedQuotation {
  id: string;
  quotationNumber: string;
  status: string;
  acceptedAt: string;
  total: number;
  currency: string;
  url: string;
}

export interface SaleActivationPaymentState {
  id: string;
  paymentReference: string;
  paymentType: string;
  status: string;
  amountDue: number;
  amountPaid: number;
  outstandingAmount: number;
  currency: string;
  dueDate?: string | null;
  requestAvailable: boolean;
  externalWaitRepresented: boolean;
  overdue: boolean;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
}

export interface SaleActivationFollowUp {
  id: string;
  subject: string;
  dueAt: string;
  assignedTo?: string | null;
  ownerName?: string | null;
  overdue: boolean;
}

export interface SaleActivationNextAction {
  kind: 'quotation' | 'payment' | 'activity' | 'external_wait' | 'verification' | 'admin_review' | 'activated' | 'history' | string;
  label: string;
  url?: string | null;
  dueAt?: string | null;
  waitingOn?: string | null;
  ownerId?: string | null;
  ownerName?: string | null;
}

export interface SaleActivationBlocker {
  code: string;
  message: string;
}

export interface SaleActivationState {
  opportunityId: string;
  opportunityStage: string;
  opportunityStatus: string;
  wonAt?: string | null;
  acceptedQuotation?: SaleActivationAcceptedQuotation | null;
  payment?: SaleActivationPaymentState | null;
  paymentFollowUp?: SaleActivationFollowUp | null;
  operationalLabel: string;
  nextAction?: SaleActivationNextAction | null;
  blockers: SaleActivationBlocker[];
  client: { linked: boolean; id?: string | null };
  project: { created: boolean; id?: string | null; stage?: string | null; status?: string | null };
  onboarding: { created: boolean; id?: string | null; status?: string | null };
  commission: { created: boolean; id?: string | null; status?: string | null };
  canVerifyPayment: boolean;
  paymentWorkspaceUrl: string;
  activityWorkspaceUrl: string;
}
