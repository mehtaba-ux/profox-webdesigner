import type { SellerGuidanceEntry } from './crmSellerGuidance';

const make = (key: string, title: string, shortHelp: string, details: Partial<SellerGuidanceEntry> = {}): SellerGuidanceEntry => ({
  key,
  title,
  shortHelp,
  ...details,
});

export const PACKAGE_FIT_GUIDANCE: Record<string, SellerGuidanceEntry> = {
  'section.package_fit': make(
    'section.package_fit',
    'Package Fit',
    "Package Fit compares the confirmed and currently known project requirements with ProFox's current Sales Catalog. It is guidance—not technical approval, commercial approval, timeline approval, or quotation approval.",
    {
      sellerAction: 'Review the reasons, unresolved information and validation signals before relying on the current likely fit. Resolve missing Requirements or Discovery instead of guessing.',
      certaintyNote: 'Only client-confirmed facts can drive a hard minimum-package classification. Seller observations and hypotheses remain provisional.',
      sopReference: 'Part 6 Package Fit & Complexity Classification',
    },
  ),
  'field.package_fit_status': make(
    'field.package_fit_status',
    'Package Fit status',
    'Fit status describes what the deterministic policy can currently conclude from known scope. FIT is guidance, POSSIBLE FIT means important uncertainty remains, MISMATCH means known scope exceeds a candidate, and REVIEW REQUIRED means the system cannot safely decide yet.',
    { avoid: 'Do not treat Package Fit status as technical, commercial, manager, timeline, proposal, quotation, or Pipeline approval.' },
  ),
  'field.package_fit_confidence': make(
    'field.package_fit_confidence',
    'Package Fit confidence',
    'Confidence shows how complete and reliable the information behind this recommendation is. Awaiting Client, hypotheses, custom unmapped scope or specialist-validation items can reduce confidence.',
    { avoid: 'Do not convert LOW or MEDIUM confidence into a stronger claim just to move the sale forward.' },
  ),
  'section.package_fit_reasons': make(
    'section.package_fit_reasons',
    'Why this fits',
    'These reasons come from structured CRM Requirements that the current deterministic policy recognizes. They explain why the minimum likely package moved upward.',
    { sellerAction: 'Use the source reason to verify the underlying Requirement rather than relying on the recommendation alone.' },
  ),
  'section.package_fit_mismatch': make(
    'section.package_fit_mismatch',
    'Mismatch / complexity',
    'A mismatch means known requirements appear to exceed or conflict with this package’s approved fit rules. Review the specific reasons instead of choosing a package based only on page count or price.',
  ),
  'section.package_fit_missing_information': make(
    'section.package_fit_missing_information',
    'Need clarification',
    'These Package Fit-relevant facts are missing, awaiting the client, provisional, or unresolved. The evaluator does not invent the missing answer.',
    { sellerAction: 'Resolve the underlying Requirement or Discovery item when it matters to package choice.' },
  ),
  'section.package_fit_validation': make(
    'section.package_fit_validation',
    'Validation needed',
    'This requirement may need specialist review before ProFox can safely confirm feasibility, effort, timing or commercial treatment. Package Fit does not approve it.',
    { escalation: 'Part 6 identifies the signal only. The specialist-review workflow is intentionally deferred to the next controlled phase.' },
  ),
  'field.current_catalog_guidance': make(
    'field.current_catalog_guidance',
    'Current catalog guidance',
    'Name, price mode, price, scope, technology and delivery guidance shown here come directly from the current sales_products catalog. They are current guidance, not a customer’s historical accepted agreement.',
    { avoid: 'Do not copy these values into a separate Package Fit source or use current catalog changes to rewrite an accepted quotation snapshot.' },
  ),
  'field.manager_approval_required': make(
    'field.manager_approval_required',
    'Manager approval required',
    'This indicator comes directly from the current sales_products record. It signals that manager approval is required by the catalog; Part 6 does not create or complete that approval workflow.',
  ),
  'field.timeline_assessment_required': make(
    'field.timeline_assessment_required',
    'Timeline assessment required',
    'This indicator comes directly from the current catalog timeline_impact. It means timing needs assessment; it is not a delivery-date promise or an approval.',
  ),
};

export const getPackageFitGuidance = (key: string): SellerGuidanceEntry | undefined => PACKAGE_FIT_GUIDANCE[key];
