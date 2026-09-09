import { SellerGuidanceEntry } from './crmSellerGuidance';

const validationGuidance: Record<string, SellerGuidanceEntry> = {
  'section.sales_validation': {
    title: 'Sales Validation',
    quickHelp: 'Use specialist review when a specific technical, commercial, timeline, compliance/risk or scope question needs an authorized decision before ProFox makes a commitment.',
    whyItMatters: 'A review separates Seller discovery from specialist feasibility and constraint decisions without changing client-confirmed facts or advancing the deal.',
    example: 'A custom API requirement can remain a confirmed client requirement while a Technical validation separately decides whether ProFox can support it and under what constraints.',
  },
  'field.validation_type': {
    title: 'Validation Type', quickHelp: 'The review domain: Technical, Commercial, Timeline, Compliance/Risk or Scope.', whyItMatters: 'The type routes the request to the appropriate existing role/team policy. It is not a Pipeline stage or quotation approval.', example: 'A custom authentication feasibility question is Technical; a pre-proposal nonstandard commercial arrangement is Commercial.',
  },
  'field.validation_severity': {
    title: 'Validation Severity', quickHelp: 'GREEN is informational, AMBER is material uncertainty, and RED is high-risk/critical unresolved uncertainty.', whyItMatters: 'Severity is derived server-side from the versioned validation policy. Sellers cannot lower it to bypass later controls.', example: 'Compliance/Risk defaults to RED in the current policy; ordinary Technical review defaults to AMBER.',
  },
  'field.validation_status': {
    title: 'Validation Status', quickHelp: 'Pending, In Review, Needs Information, Approved, Rejected, Cancelled or Stale describe the specialist-review lifecycle.', whyItMatters: 'The status describes only this review question. Approved does not mean Requirements Confirmed, proposal ready, quotation approved, payment received or deal won.', example: 'Approved with constraints means the specific request is supported only within the recorded constraints.',
  },
  'action.request_validation': {
    title: 'Request Review', quickHelp: 'Create an explicit specialist-review request only when current CRM facts show a real uncertainty.', whyItMatters: 'Opening Package Fit or Requirements stays read-only; review records are created only by an intentional Seller action.', example: 'Request review for “Confirm feasibility of one-way HubSpot contact sync.”',
  },
  'action.start_validation': {
    title: 'Start Review', quickHelp: 'An eligible reviewer claims the review and acknowledges the current canonical source before deciding.', whyItMatters: 'Seller users cannot place a specialist review In Review, and the requester cannot self-review.', example: 'A Development reviewer starts a Technical review from the team queue.',
  },
  'action.request_more_information': {
    title: 'Needs Information', quickHelp: 'Ask a precise question that must be answered in canonical Requirements/Discovery before the review can continue.', whyItMatters: 'This avoids creating a parallel chat or second truth source inside the review record.', example: 'Confirm whether HubSpot synchronization is one-way or bidirectional.',
  },
  'action.resubmit_validation': {
    title: 'Resubmit Review', quickHelp: 'After canonical CRM information is updated, return the existing review to Pending with an optional short note.', whyItMatters: 'The clarification loop stays on the same review instead of generating unrelated duplicates.', example: 'Requirement updated to one-way sync; resubmit for specialist decision.',
  },
  'action.approve_validation': {
    title: 'Approve Validation', quickHelp: 'Approve the specific review question with a meaningful decision summary and any necessary constraints.', whyItMatters: 'Approval is auditable and scoped. It does not confirm client facts or approve quotation-specific exceptions.', example: 'Approved only for standard OAuth and one-way synchronization.',
  },
  'action.reject_validation': {
    title: 'Reject Validation', quickHelp: 'Reject only with a meaningful rework/scope reason.', whyItMatters: 'The requested Requirement remains canonical; rejection tells the Seller what must change or be resolved with the client.', example: 'Requested API does not provide the required data access.',
  },
  'action.cancel_validation': {
    title: 'Cancel Validation', quickHelp: 'Withdraw a review only under the safe cancellation policy and provide a reason.', whyItMatters: 'Sales validation history is never hard-deleted; cancellation remains auditable.', example: 'Client removed the optional integration before specialist work began.',
  },
  'status.validation_pending': { title: 'Pending', quickHelp: 'Requested and waiting for eligible reviewer action.', whyItMatters: 'The issue remains unresolved.', example: 'A Technical review is in the Development/Admin queue.' },
  'status.validation_in_review': { title: 'In Review', quickHelp: 'An eligible specialist has started assessment.', whyItMatters: 'No client commitment should treat the decision as complete yet.', example: 'Reviewer is evaluating the current Requirement.' },
  'status.validation_needs_information': { title: 'Needs Information', quickHelp: 'The reviewer needs a specific clarification before deciding.', whyItMatters: 'Update the canonical CRM source, then resubmit the same review.', example: 'Clarify one-way vs bidirectional sync.' },
  'status.validation_approved': { title: 'Approved', quickHelp: 'The specific request was validated within any recorded constraints.', whyItMatters: 'This is not deal approval, Requirements Confirmed or quotation approval.', example: 'Feasible only with standard OAuth.' },
  'status.validation_rejected': { title: 'Rejected', quickHelp: 'The requested approach was not approved.', whyItMatters: 'The Requirement is not deleted automatically; the Seller must resolve scope or expectations.', example: 'Current API cannot satisfy the requested access.' },
  'status.validation_cancelled': { title: 'Cancelled', quickHelp: 'The review was legitimately withdrawn before decision.', whyItMatters: 'The historical request remains auditable.', example: 'Client removed the request.' },
  'status.validation_stale': {
    title: 'Stale', quickHelp: 'The source Requirement changed after the specialist decision.', whyItMatters: 'The previous decision remains historical but must not be treated as current approval. Request a fresh review.', example: 'One-way HubSpot sync was approved, then the Requirement changed to bidirectional workflow automation.',
  },
  'field.approved_constraints': {
    title: 'Approved Constraints', quickHelp: 'Conditions under which the specialist approved this specific request.', whyItMatters: 'These constraints remain visible and auditable for later proposal/delivery planning unless superseded by a fresh review.', example: 'Approved only if synchronization remains one-way.',
  },
  'field.validation_decision': { title: 'Decision Summary', quickHelp: 'A concise specialist conclusion for the specific review question.', whyItMatters: 'A meaningful decision prevents ambiguous “approved” states.', example: 'Standard OAuth implementation is feasible with the current API.' },
  'field.validation_rejection_reason': { title: 'Rejection / Rework Reason', quickHelp: 'Explain why the requested approach is not supported and what must be resolved.', whyItMatters: 'The Seller needs an actionable reason, not a blank or generic rejection.', example: 'The third-party API does not expose the required endpoint.' },
  'type.technical_validation': {
    title: 'Technical Validation', quickHelp: 'Confirms whether a specific requested capability is feasible and under what constraints.', whyItMatters: 'It does not make the underlying client requirement client-confirmed and does not approve commercial terms.', example: 'Validate custom API feasibility and authentication constraints.',
  },
  'type.commercial_validation': {
    title: 'Commercial Validation', quickHelp: 'Reviews nonstandard commercial expectations before proposal preparation.', whyItMatters: 'Quote-specific discounts, pricing and payment exceptions still use the existing Quotation Approval workflow.', example: 'Review whether a nonstandard guarantee can be considered in principle before proposal drafting.',
  },
  'type.timeline_validation': {
    title: 'Timeline Validation', quickHelp: 'Checks whether requested timing can reasonably be supported given current scope, catalog guidance and dependencies.', whyItMatters: 'A client-requested date is not automatically an approved delivery commitment.', example: 'Assess an accelerated launch date against current scope/dependencies.',
  },
  'type.compliance_risk_validation': {
    title: 'Compliance / Risk Validation', quickHelp: 'Use when regulatory, contractual security, privacy, accessibility or sensitive-data requirements need specialist judgment.', whyItMatters: 'Seller input is not legal/compliance approval.', example: 'Review a contractual security requirement before ProFox commits to it.',
  },
  'type.scope_validation': {
    title: 'Scope Validation', quickHelp: 'Use when standard-vs-custom boundaries or material scope uncertainty need expert interpretation.', whyItMatters: 'Scope review does not replace Part 6 Package Fit; it resolves a specific ambiguity around current scope.', example: 'Review whether a migration requirement is within standard package boundaries.',
  },
};

export const getSalesValidationGuidance = (key: string): SellerGuidanceEntry =>
  validationGuidance[key] || validationGuidance['section.sales_validation'];
