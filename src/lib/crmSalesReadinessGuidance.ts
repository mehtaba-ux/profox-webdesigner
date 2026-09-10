import { SELLER_GUIDANCE, type SellerGuidanceEntry } from './crmSellerGuidance';

const entry = (
  key: string,
  title: string,
  shortHelp: string,
  details: Omit<SellerGuidanceEntry, 'key' | 'title' | 'shortHelp'> = {},
): SellerGuidanceEntry => ({ key, title, shortHelp, ...details });

/**
 * Part 8 augments the existing central Seller Guidance registry.
 * It does not create a second tooltip/guidance system; SellerGuidanceHelp continues to read the same registry.
 */
export const SALES_READINESS_GUIDANCE: Record<string, SellerGuidanceEntry> = {
  'section.requirements_confirmed_readiness': entry(
    'section.requirements_confirmed_readiness',
    'Requirements Confirmed readiness',
    'Requirements Confirmed means ProFox has enough reliable, structured information to understand what the client needs and safely continue the Sales process. It is more than a written summary.',
    {
      sellerAction: 'Resolve the structured blockers shown here. Use Requirements, Discovery, Package Fit, Sales Validation, Meeting Management, and Follow-Ups as directed by the blocker actions.',
      avoid: 'Do not bypass a hard blocker, rely on requirements_summary alone, or treat an informational score as permission to advance.',
      certaintyNote: 'Client confirmed, Seller observation, Seller hypothesis, Awaiting client, Needs specialist validation, and Not applicable remain distinct.',
      sopReference: 'Part 8 Requirements Confirmed Gate',
    },
  ),
  'section.proposal_readiness': entry(
    'section.proposal_readiness',
    'Proposal Readiness',
    'Proposal Readiness checks whether the current discovery, scope, Package Fit and required reviews are sufficiently resolved for proposal preparation. Final quotation-send enforcement will use additional scope/promise checks in later workflow phases.',
    {
      sellerAction: 'Resolve current blockers and review warnings before preparing the commercial proposal.',
      avoid: 'Do not interpret this preview as “ready to send,” quotation approval, manager approval, a pricing decision, or customer acceptance.',
      sopReference: 'Part 8 Proposal Readiness Foundation',
    },
  ),
  'field.readiness_status': entry(
    'field.readiness_status',
    'Readiness status',
    'Status summarizes the current server-side assessment. BLOCKED means at least one hard blocker exists; WARNING means work can continue with visible uncertainty; PASS/READY means no current Part 8 blocker remains.',
    {
      avoid: 'Do not use status as a substitute for quotation approval, payment verification, Won, or delivery handoff.',
      sopReference: 'Part 8 Readiness Status',
    },
  ),
  'field.readiness_score': entry(
    'field.readiness_score',
    'Readiness score',
    'The percentage is an informational coverage indicator across the current Proposal Readiness dimensions. It is intentionally whole-number guidance, not a predictive confidence score.',
    {
      avoid: 'A high score never overrides a hard blocker and is not a probability of winning the deal.',
      sopReference: 'Part 8 Readiness Score',
    },
  ),
  'section.readiness_blockers': entry(
    'section.readiness_blockers',
    'Readiness blockers',
    'Hard blockers are current unresolved conditions that must be resolved before the guarded stage can advance.',
    {
      sellerAction: 'Use the action on each blocker to return to the canonical source of truth and resolve the underlying issue.',
      avoid: 'Do not recreate the information in a parallel note or ask Admin to bypass normal evidence/review requirements.',
      sopReference: 'Part 8 Hard Blockers',
    },
  ),
  'section.readiness_warnings': entry(
    'section.readiness_warnings',
    'Readiness warnings',
    'Warnings preserve useful uncertainty or downstream conditions without pretending they are hard blockers for the current Part 8 gate.',
    {
      sellerAction: 'Review the warning and resolve it when practical, especially before proposal preparation.',
      sopReference: 'Part 8 Warnings',
    },
  ),
  'field.hard_blocker': entry(
    'field.hard_blocker',
    'Hard blocker',
    "A hard blocker is an unresolved item that can materially affect scope, feasibility, commercial treatment or the client's decision. Resolve it rather than bypassing it.",
    {
      avoid: 'A score, Seller note, legacy summary, or stale frontend result cannot override a hard blocker.',
      sopReference: 'Part 8 Hard Blocker',
    },
  ),
  'field.future_readiness_dimension': entry(
    'field.future_readiness_dimension',
    'Future readiness dimension',
    'This dimension is intentionally NOT_YET_EVALUATED because its authoritative workflow belongs to a later SOP phase.',
    {
      sellerAction: 'Treat it as explicit future coverage, not missing data to invent or silently mark complete.',
      avoid: 'Do not create a Promise Register, quotation snapshot gate, or parallel Scope Conditions system in Part 8.',
      sopReference: 'Part 8 Future Dimensions',
    },
  ),
  'action.resolve_readiness_blocker': entry(
    'action.resolve_readiness_blocker',
    'Resolve readiness blocker',
    'Open the blocker’s canonical source and resolve the real underlying information, review, Package Fit, or next-action issue.',
    {
      avoid: 'Do not duplicate the source record or bypass server-side re-evaluation.',
      sopReference: 'Part 8 Blocker Actions',
    },
  ),
  'status.readiness_ready': entry(
    'status.readiness_ready',
    'Ready / Pass',
    'No current Part 8 hard blocker remains for this assessment. The server will still re-evaluate a guarded Pipeline transition at the exact transition point.',
    {
      avoid: 'Ready/Pass is not final quotation-send approval, customer acceptance, payment verification, Won, or delivery readiness.',
      sopReference: 'Part 8 Status',
    },
  ),
  'status.readiness_warning': entry(
    'status.readiness_warning',
    'Warning',
    'No current hard blocker is reported, but one or more uncertainties or downstream conditions should remain visible and be reviewed.',
    {
      sellerAction: 'Read the warning details before advancing or preparing the proposal.',
      sopReference: 'Part 8 Status',
    },
  ),
  'status.readiness_blocked': entry(
    'status.readiness_blocked',
    'Blocked',
    'One or more current hard blockers prevent the guarded Requirements Confirmed transition.',
    {
      sellerAction: 'Resolve the exact blockers in their canonical systems, then refresh/retry. The server re-evaluates rather than trusting a stale result.',
      avoid: 'Do not bypass the blocker with a legacy summary, fake confirmation, or parallel record.',
      sopReference: 'Part 8 Status',
    },
  ),
};

Object.assign(SELLER_GUIDANCE, SALES_READINESS_GUIDANCE);

export const getSalesReadinessGuidance = (key: string) => SELLER_GUIDANCE[key];
