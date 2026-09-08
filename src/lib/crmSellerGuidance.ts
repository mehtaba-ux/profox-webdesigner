import type {
  CRMDiscoveryQuestion,
  CRMDiscoveryQuestionState,
  CRMInformationCertainty,
  CRMRequirementClass,
  CRMRequirementDefinition,
} from './crmSalesDiscoveryService';
import {
  DISCOVERY_FOCUS,
  DISCOVERY_GUIDANCE_KEYS,
  REQUIREMENT_GUIDANCE_KEY_SET,
  REQUIREMENT_GUIDANCE_KEYS,
} from './crmSellerGuidanceData';

export type SellerGuidanceEntry = {
  key: string;
  title: string;
  shortHelp: string;
  meaning?: string;
  whyItMatters?: string;
  sellerAction?: string;
  askExample?: string;
  listenFor?: string[];
  usefulAnswerExample?: string;
  avoid?: string;
  followUp?: string;
  escalation?: string;
  securityNote?: string;
  certaintyNote?: string;
  sopReference?: string;
};

const make = (key: string, title: string, shortHelp: string, details: Omit<SellerGuidanceEntry, 'key' | 'title' | 'shortHelp'> = {}): SellerGuidanceEntry => ({
  key,
  title,
  shortHelp,
  ...details,
});

const humanize = (value: string) => value
  .replaceAll('_', ' ')
  .replace(/\b\w/g, character => character.toUpperCase());

const DISCOVERY_LISTEN_FOR: Array<[RegExp, string[]]> = [
  [/^business_/, ['What the business sells', 'Current process', 'Business priority', 'Existing tools or constraints']],
  [/^problem_/, ['The client’s own description', 'Where the problem occurs', 'Frequency or examples', 'What has already been tried']],
  [/^impact_/, ['Operational consequence', 'Lead or revenue effect if the client can evidence it', 'Time/customer impact', 'Client-provided examples or estimates']],
  [/^outcome_/, ['Desired business change', 'Observable success', 'Important user action', 'Any client-owned success measure']],
  [/^audience_/, ['Customer type', 'Location/market', 'Customer problem or motivation', 'Meaningful segments or exclusions']],
  [/^scope_/, ['Required user behavior', 'Pages/sections', 'Dependencies', 'What happens before and after the main action']],
  [/^content_/, ['Existing usable assets', 'Ownership', 'Approval responsibility', 'Compliance or proof requirements']],
  [/^brand_/, ['Final brand assets', 'What should remain', 'What may change', 'Reason behind preferences']],
  [/^commercial_/, ['Requested timing', 'Reason for timing', 'Investment context', 'Trade-off priorities']],
  [/^decision_/, ['Approvers', 'Influencers', 'Decision criteria', 'Internal approval steps']],
  [/^complex_/, ['Economic authority', 'Procurement/security steps', 'Internal champion', 'Multi-stakeholder dependencies']],
  [/^integration_/, ['Exact systems', 'Data', 'Direction', 'Trigger/action', 'Ownership', 'Launch criticality']],
  [/^ecommerce_/, ['Checkout need', 'Catalogue complexity', 'Payments', 'Shipping/tax/inventory rules', 'Recurring billing where relevant']],
  [/^booking_/, ['Appointment types', 'Platform', 'Availability rules', 'Notifications', 'Staff/location/time-zone needs']],
  [/^seo_/, ['Business-search priority', 'Services/topics', 'Locations', 'Existing SEO assets', 'Migration risk']],
  [/^analytics_/, ['Current platform', 'Conversion actions', 'Events', 'Reporting audience and decisions']],
  [/^technical_/, ['Current ownership/platform', 'Migration need', 'Security/access requirements', 'Uncertainties needing validation']],
  [/^app_/, ['User types', 'Workflow', 'Permissions', 'Data', 'Admin operations', 'Scale and acceptance criteria']],
  [/^risk_/, ['Dependencies', 'Known risks', 'Assumptions', 'Explicit exclusions', 'What still needs confirmation']],
];

const TECHNICAL_OR_SECURITY_DISCOVERY = /^(integration_|ecommerce_payments|booking_provider|analytics_current|technical_|app_)/;
const TECHNICAL_VALIDATION_DISCOVERY = /^(integration_|technical_|app_|ecommerce_|booking_)/;

const DISCOVERY_OVERRIDES: Record<string, Partial<SellerGuidanceEntry>> = {
  decision_who_involved: {
    shortHelp: 'Identify who can approve the project and who influences the decision. Do not assume the person in the meeting has final authority.',
    askExample: 'Besides you, who else needs to be comfortable with this before you can move forward?',
    listenFor: ['Final approver', 'Financial authority', 'Influencers', 'Technical reviewers', 'Approval sequence'],
    avoid: 'Do not pressure your contact to bypass another stakeholder.',
  },
  impact_business: {
    shortHelp: 'Understand what the current problem affects in leads, revenue, time, conversion, customer experience or operational risk. Ask for real examples or estimates—never invent a number.',
    meaning: 'Separate the problem itself from the business consequence it creates.',
    avoid: 'Do not manufacture a financial impact, urgency or ROI figure the client did not provide.',
  },
  integration_any: {
    shortHelp: 'Understand which systems need to connect, what data must move, when it moves and what should happen. Do not promise feasibility before technical validation when the integration is unclear.',
    listenFor: ['System', 'Data', 'Direction', 'Trigger', 'Action', 'Authentication/access type', 'Volume', 'Failure impact'],
    escalation: 'Use Needs specialist validation when API feasibility, security, data flow, effort or implementation approach is unclear.',
    securityNote: 'Never request or store passwords, API secret keys, private keys, recovery credentials or authentication secrets in this field.',
  },
  commercial_budget: {
    avoid: 'Do not invent a budget, push an unapproved discount, change approved pricing or treat this answer as permission to recommend a package automatically.',
  },
  commercial_timeline: {
    avoid: 'A requested date is planning context, not a delivery commitment. Do not promise a date before scope, dependencies and delivery feasibility are validated.',
  },
  seo_importance: {
    avoid: 'Do not promise rankings, traffic, lead volume or a guaranteed SEO outcome.',
  },
  technical_security: {
    securityNote: 'Capture the requirement, not secret material. Never store passwords, API secrets, private keys, recovery codes, payment-card data or authentication secrets.',
    escalation: 'Escalate unclear security, privacy, compliance or sensitive-data requirements to the appropriate specialist.',
  },
};

export function getDiscoveryQuestionGuidance(question: CRMDiscoveryQuestion): SellerGuidanceEntry | undefined {
  const focus = DISCOVERY_FOCUS.get(question.question_key);
  if (!focus) return undefined;
  const listenFor = DISCOVERY_LISTEN_FOR.find(([pattern]) => pattern.test(question.question_key))?.[1];
  const override = DISCOVERY_OVERRIDES[question.question_key] ?? {};
  const related = Array.isArray(question.applicability?.relatedRequirementKeys)
    ? question.applicability.relatedRequirementKeys.map(humanize)
    : [];
  return make(`discovery.question.${question.question_key}`, question.question_text, focus, {
    meaning: question.purpose?.trim() || `Use this question to understand ${humanize(question.category).toLowerCase()} before recommending a solution.`,
    whyItMatters: 'A factual answer reduces assumptions and gives the Seller clearer context for scope, follow-up and later recommendation without creating a promise or automatic decision.',
    sellerAction: 'Ask naturally, record what the client actually says, and keep the certainty/status accurate. If the answer is incomplete or inferred, leave that visible rather than filling the gap yourself.',
    askExample: question.question_text,
    listenFor: override.listenFor ?? (related.length ? [...(listenFor ?? []), `Related requirement areas: ${related.join(', ')}`] : listenFor),
    avoid: override.avoid ?? 'Do not lead the client, manufacture urgency, convert an assumption into a fact, or promise an outcome from the answer.',
    followUp: 'If the answer is unclear, conflicting or incomplete, keep it unresolved or mark follow-up required and revisit it with the client.',
    escalation: override.escalation ?? (TECHNICAL_VALIDATION_DISCOVERY.test(question.question_key)
      ? 'If feasibility, implementation effort, integration/security detail or technical scope is uncertain, use Needs specialist validation rather than promising an answer.'
      : undefined),
    securityNote: override.securityNote ?? (TECHNICAL_OR_SECURITY_DISCOVERY.test(question.question_key)
      ? 'Record access/technical requirements only. Never store passwords, API secrets, private keys, recovery codes, authentication secrets or payment-card credentials in Discovery.'
      : undefined),
    certaintyNote: 'Client confirmed is only for information the client explicitly provided or confirmed. Seller research, observation, interpretation and hypothesis remain separate.',
    sopReference: `Part 3 Discovery · ${humanize(question.framework)}`,
    ...override,
  });
}

const REQUIREMENT_CATEGORY_HELP: Record<string, { short: string; listen: string[]; avoid?: string; escalation?: string; security?: string }> = {
  BUSINESS: { short: 'Record the verified business context this Requirement represents so later scope and recommendations are based on the client’s actual situation.', listen: ['Client-stated business context', 'Current operating reality', 'Priority or constraint', 'What is confirmed vs inferred'] },
  PROBLEM: { short: 'Record the client’s problem, consequence or urgency accurately and keep evidence separate from Seller interpretation.', listen: ['Client wording', 'Observed consequence', 'Examples or estimates supplied by the client', 'Unresolved assumptions'], avoid: 'Do not exaggerate pain, invent impact or manufacture urgency.' },
  DESIRED_OUTCOME: { short: 'Record the client’s desired business outcome or success definition without turning an aspiration into a guaranteed result.', listen: ['Desired change', 'Observable success', 'Client-owned measure', 'Important qualification or limitation'], avoid: 'Do not guarantee performance, ROI or an outcome the delivery team has not committed to.' },
  AUDIENCE_CUSTOMER: { short: 'Record who the project must serve and the market context that should shape messaging, UX and scope.', listen: ['Audience type', 'Location/market', 'Motivation/problem', 'Segments and exclusions'] },
  PROJECT_SCOPE: { short: 'Record what the project needs to include or enable at a requirements level; keep requested scope separate from approved commercial scope.', listen: ['Required user behavior', 'Pages/sections', 'Dependencies', 'Post-action journey'], avoid: 'Do not treat a request as an approved inclusion or delivery promise.' },
  CONTENT: { short: 'Record content ownership, availability, proof and compliance needs so missing assets or approval responsibilities stay visible.', listen: ['Existing usable content', 'Who supplies it', 'Who approves it', 'Proof/compliance needs'], avoid: 'Do not imply copy, photography, video or legal review is included unless approved commercial scope says so.' },
  BRAND: { short: 'Record the current brand state and the level of visual change the client expects without promising branding work automatically.', listen: ['Final assets', 'Guidelines', 'Desired change', 'Approval responsibility'], avoid: 'Do not copy reference brands or promise a rebrand that is not commercially approved.' },
  INTEGRATIONS: { short: 'Record the business need for system connections, data flow and automation while keeping technical feasibility unresolved until validated.', listen: ['Systems', 'Data', 'Direction', 'Trigger/action', 'Ownership', 'Criticality'], escalation: 'Use Needs specialist validation when API, security, data-flow or implementation feasibility is unclear.', security: 'Never store passwords, API secrets, private keys, recovery codes or authentication credentials.' },
  ECOMMERCE: { short: 'Record the commerce behavior the client needs—catalogue, checkout, payment, shipping, tax, inventory or subscriptions—without collecting payment secrets.', listen: ['What is sold', 'Checkout/payment need', 'Operational rules', 'Third-party dependencies'], escalation: 'Escalate unclear payment, tax, inventory or integration feasibility.', security: 'Never store card numbers, CVV, payment credentials, secret keys or account passwords.' },
  BOOKING: { short: 'Record the booking journey, platform and scheduling rules the client needs without assuming the implementation is simple or already supported.', listen: ['Appointment type', 'Provider', 'Availability rules', 'Notifications', 'Staff/location/time-zone needs'], escalation: 'Escalate custom booking logic or uncertain provider/API constraints.', security: 'Do not store booking-platform passwords or secret credentials.' },
  SEO: { short: 'Record the client’s SEO priorities, markets and migration considerations as requirements—not as ranking or traffic guarantees.', listen: ['Services/topics', 'Markets/locations', 'Existing assets', 'Migration risk'], avoid: 'Do not promise rankings, traffic or lead volume.' },
  ANALYTICS: { short: 'Record what should be measured, which actions count as conversions and who needs reporting so tracking supports real decisions.', listen: ['Current platform', 'Conversions', 'Events', 'Reporting audience'], security: 'Do not store analytics account passwords or secret credentials.' },
  TECHNICAL: { short: 'Record platform, hosting, migration, security, accessibility and technical needs at a requirements level; unresolved feasibility stays unresolved.', listen: ['Current ownership/platform', 'Migration need', 'Security/access constraint', 'Uncertainty'], escalation: 'Use Needs specialist validation for unclear feasibility, security, compliance or implementation detail.', security: 'Never store passwords, API secrets, private keys, recovery codes or authentication secrets.' },
  COMMERCIAL: { short: 'Record the client’s budget/timing context accurately while keeping approved pricing, discounts and delivery commitments in their canonical commercial sources.', listen: ['Investment context', 'Requested timing', 'Reason for deadline', 'Trade-offs'], avoid: 'Do not invent budget, offer unapproved discounts, alter approved pricing or promise a delivery date.' },
  DECISION_BUYING_PROCESS: { short: 'Record how the client will evaluate and approve the project so stakeholders, authority and internal steps are visible.', listen: ['Approvers', 'Influencers', 'Decision criteria', 'Internal process', 'Procurement where relevant'], avoid: 'Do not pressure a contact to bypass another stakeholder or assume authority.' },
  CUSTOM_APPLICATION: { short: 'Record the application workflow, users, permissions, data and acceptance needs without promising custom technical feasibility before validation.', listen: ['User types', 'Workflow', 'Permissions', 'Data', 'Admin/reporting needs', 'Scale/acceptance'], escalation: 'Custom application feasibility, architecture, security and effort require specialist validation when unclear.', security: 'Capture data/access requirements only; never secret credentials.' },
  RISKS_DEPENDENCIES: { short: 'Record dependencies, assumptions, exclusions and unresolved risks explicitly so they cannot silently become commitments or facts.', listen: ['Client dependencies', 'Assumptions', 'Exclusions', 'Known risks', 'Access needed later'], avoid: 'Do not hide uncertainty or present an assumption as client-confirmed.', security: 'For access needed later, record the type of access only—never passwords, API secrets, private keys, recovery codes or payment credentials.' },
};

export function getRequirementGuidance(definition: CRMRequirementDefinition): SellerGuidanceEntry | undefined {
  if (!REQUIREMENT_GUIDANCE_KEY_SET.has(definition.requirementKey)) return undefined;
  const category = REQUIREMENT_CATEGORY_HELP[definition.category] ?? {
    short: 'Record the client need or constraint accurately and keep confirmation, feasibility and commercial approval separate.',
    listen: ['Client-stated need', 'Constraint', 'Dependencies', 'Confirmation state'],
  };
  return make(
    `requirement.${definition.requirementKey}`,
    definition.title,
    `${category.short} This item is “${definition.title}”.`,
    {
      meaning: `This Requirement captures the current understanding of “${definition.title}”. It is a factual discovery record, not an automatic promise, package inclusion or delivery commitment.`,
      whyItMatters: 'Keeping this explicit prevents scope assumptions and preserves the distinction between client-confirmed facts, Seller observations/hypotheses and items awaiting validation.',
      sellerAction: 'Record meaningful detail or mark it Not applicable when appropriate. Choose the certainty state that matches the evidence and preserve unresolved technical/commercial questions instead of guessing.',
      listenFor: category.listen,
      avoid: category.avoid ?? 'Do not convert a client request into an approved inclusion, price, timeline, technical commitment or guaranteed outcome.',
      followUp: 'If the client has not confirmed the detail, keep it Awaiting client or another accurate unresolved certainty state and follow up.',
      escalation: category.escalation,
      securityNote: category.security,
      certaintyNote: 'Client confirmed requires explicit client confirmation. Seller observation, Seller hypothesis, Awaiting client and Needs specialist validation remain intentionally distinct.',
      sopReference: `Part 2 Requirements · ${humanize(definition.category)} · ${definition.requirementClass}`,
    },
  );
}

export const QUESTION_CLASS_GUIDANCE: Record<CRMRequirementClass, SellerGuidanceEntry> = {
  CORE: make('priority.CORE', 'Core', 'High-priority discovery information the Seller should normally resolve to understand the client and scope correctly. If it remains unclear, do not guess—record the gap or follow up.', {
    meaning: 'Core identifies the information that normally matters most for diagnosis and scope understanding.',
    avoid: 'Core is informational priority. It does not automatically block quotation, pipeline progression, payment or Won unless a separate enforced workflow explicitly says so.',
  }),
  RECOMMENDED: make('priority.RECOMMENDED', 'Recommended', 'Useful information that improves understanding and scope quality. Ask it when relevant, but do not force every Recommended question into every conversation.', {
    meaning: 'Recommended questions improve context and reduce avoidable assumptions when they fit the client situation.',
  }),
  CONDITIONAL: make('priority.CONDITIONAL', 'Conditional', 'Ask this only when the client’s situation makes it relevant. Do not make a simple project go through unnecessary questions.', {
    meaning: 'Conditional items become useful when a specific need, feature, platform or situation is present.',
    followUp: 'If the trigger is unclear, clarify whether the area applies before asking detailed follow-up questions.',
  }),
  COMPLEX: make('priority.COMPLEX', 'Complex', 'Used when the opportunity includes advanced technical, operational, integration, security, multi-stakeholder or custom requirements. Capture the need, but do not promise feasibility before appropriate validation.', {
    escalation: 'Use specialist validation when architecture, security, integration, custom workflow or implementation effort is uncertain.',
  }),
};

export const DISCOVERY_STATE_GUIDANCE: Record<CRMDiscoveryQuestionState, SellerGuidanceEntry> = {
  NOT_ASKED: make('discovery.state.NOT_ASKED', 'Not asked', 'No usable answer has been recorded yet. It does not mean the answer is “No”.', {
    sellerAction: 'Ask when relevant or leave it unresolved. Do not infer an answer from silence.',
  }),
  ASKED: make('discovery.state.ASKED', 'Asked', 'The question has been raised, but a usable final answer has not yet been captured.', {
    sellerAction: 'Capture the answer when available or mark follow-up if the response remains incomplete.',
  }),
  ANSWERED: make('discovery.state.ANSWERED', 'Answered', 'A Discovery response has been captured. This does not automatically make a linked Requirement client-confirmed.', {
    certaintyNote: 'Use the separate certainty field to show whether the answer is client-confirmed, observed, hypothesized, awaiting confirmation or needs validation.',
  }),
  NEEDS_FOLLOW_UP: make('discovery.state.NEEDS_FOLLOW_UP', 'Needs follow-up', 'Some information exists, but it is incomplete, unclear, conflicting or needs confirmation. Revisit it with the client.', {
    sellerAction: 'Keep the gap visible and return to it in a future contact. Do not fill it with an assumption.',
  }),
  NOT_APPLICABLE: make('discovery.state.NOT_APPLICABLE', 'Not applicable', 'This question does not apply to the client’s current situation. Use this only when irrelevance is understood, not when the answer is merely unknown.', {
    avoid: 'Do not use Not applicable to hide missing information.',
  }),
};

export const CERTAINTY_GUIDANCE: Record<CRMInformationCertainty, SellerGuidanceEntry> = {
  CLIENT_CONFIRMED: make('certainty.CLIENT_CONFIRMED', 'Client confirmed', 'Use this only when the client has explicitly provided or confirmed the information. A Seller assumption, research finding or interpretation is not client confirmation.', {
    certaintyNote: 'Evidence comes directly from the client or an explicit client confirmation.',
  }),
  SELLER_OBSERVATION: make('certainty.SELLER_OBSERVATION', 'Seller observation', 'Use this for something the Seller directly observed or verified independently, while keeping it separate from what the client explicitly confirmed.', {
    avoid: 'Do not relabel an observation as Client confirmed without client confirmation.',
  }),
  SELLER_HYPOTHESIS: make('certainty.SELLER_HYPOTHESIS', 'Seller hypothesis', 'Use this for a working interpretation or theory that still needs confirmation. It is deliberately not a client fact.', {
    followUp: 'Validate the hypothesis with the client or appropriate evidence before treating it as confirmed.',
  }),
  AWAITING_CLIENT: make('certainty.AWAITING_CLIENT', 'Awaiting client', 'The information still needs the client to provide or confirm it. Keep the gap visible rather than guessing.', {
    followUp: 'Revisit the item with the client and update certainty only when new evidence exists.',
  }),
  NEEDS_SPECIALIST_VALIDATION: make('certainty.NEEDS_SPECIALIST_VALIDATION', 'Needs specialist validation', 'The business need is understood, but feasibility, implementation details, security, integration effort or technical scope still needs review by the appropriate specialist.', {
    escalation: 'Route the uncertainty through the appropriate specialist process when that workflow exists. Part 3.5 does not create the review workflow.',
    avoid: 'Do not promise feasibility while this state remains unresolved.',
  }),
  NOT_APPLICABLE: make('certainty.NOT_APPLICABLE', 'Not applicable', 'The information is intentionally resolved as not relevant to this client/project.', {
    avoid: 'Do not use this state when the information is simply missing or inconvenient to collect.',
  }),
};

export const SELLER_GUIDANCE: Record<string, SellerGuidanceEntry> = {
  'section.discovery': make('section.discovery', 'Discovery', 'Use Discovery to understand the client before recommending a solution. Capture facts, uncertainty and follow-up without creating package, pipeline, quotation, payment or Won decisions.', {
    sellerAction: 'Ask naturally, keep answers faithful to the client, and use status/certainty to show what is known versus unresolved.',
  }),
  'section.requirements': make('section.requirements', 'Requirements', 'Requirements are the structured record of needs, constraints and current understanding. They do not automatically become promises or approved scope.', {
    sellerAction: 'Record meaningful detail, preserve certainty and use Not applicable only when an item truly does not apply.',
  }),
  'section.client_voice': make('section.client_voice', 'Client Voice', 'Keep the client’s words separate from the Seller’s interpretation so evidence and interpretation cannot silently merge.', {
    sellerAction: 'Record a faithful client statement, then place any Seller interpretation in its separate field.',
  }),
  'field.client_voice_statement': make('field.client_voice_statement', 'What the client said', 'Record the client’s actual words or a faithful paraphrase. Do not insert a training example or Seller interpretation here.', {
    avoid: 'Do not rewrite the quote to make the case stronger than what the client actually said.',
    certaintyNote: 'This field records client language; the separate certainty state still communicates how the information is being treated.',
  }),
  'field.client_voice_interpretation': make('field.client_voice_interpretation', 'Seller interpretation', 'Record your interpretation separately from the client statement. It is not automatically a confirmed client fact.', {
    followUp: 'If the interpretation matters to scope or recommendation, validate it with the client before marking it Client confirmed.',
  }),
  'field.custom_question': make('field.custom_question', 'Custom question', 'Use a custom question only for a deal-specific gap the standard Discovery catalog does not already cover.', {
    sellerAction: 'Search/scan the existing standard questions first. Write one clear, neutral question tied to a real information gap.',
    avoid: 'Do not create a duplicate wording of an existing standard question or a leading question designed to force a preferred answer.',
  }),
  'field.custom_question_purpose': make('field.custom_question_purpose', 'Custom question purpose', 'Explain why this custom question exists and what information it is meant to clarify.', {
    sellerAction: 'Keep the purpose short and operational so another Seller understands why the question matters.',
  }),
  'field.follow_up_required': make('field.follow_up_required', 'Follow-up required', 'Use this when an answer needs another client touch because it is incomplete, unclear, conflicting or still needs confirmation.', {
    sellerAction: 'Keep the indicator on until the gap is resolved. It does not itself create a follow-up task.',
  }),
  'field.requirement_source': make('field.requirement_source', 'Source', 'Source explains where the recorded information came from. Source and certainty are related but not interchangeable.', {
    certaintyNote: 'A manual Seller entry may still be Client confirmed if the Seller faithfully records something the client explicitly confirmed; otherwise choose the accurate certainty state.',
  }),
  'action.add_custom_question': make('action.add_custom_question', 'Add custom question', 'Adds one Lead-specific Discovery question when the standard catalog does not cover the information gap.', {
    avoid: 'Do not use this to create a parallel playbook or duplicate standard questions.',
  }),
  'action.add_custom_requirement': make('action.add_custom_requirement', 'Add custom Requirement', 'Adds one Lead-specific Requirement when the canonical Requirement catalog does not represent a genuine deal-specific need.', {
    avoid: 'Do not use custom Requirements to bypass the standard definitions or create unapproved commercial scope.',
  }),
  'action.archive_custom_requirement': make('action.archive_custom_requirement', 'Archive custom Requirement', 'Soft-archives a custom Requirement while preserving its history. Standard Requirement Definitions are not archived this way.', {
    sellerAction: 'Archive only when the custom item is no longer active/relevant and keep the historical record intact.',
  }),
  'action.qualify_lead': make('action.qualify_lead', 'Qualified', 'Use the existing qualification checkpoint to confirm the lead meets ProFox’s current qualification standard before moving it into Pipeline.', {
    avoid: 'Qualification does not create new Discovery answers or Requirement confirmations automatically.',
  }),
};

export const DISCOVERY_GUIDANCE_COVERAGE_KEYS = DISCOVERY_GUIDANCE_KEYS;
export const REQUIREMENT_GUIDANCE_COVERAGE_KEYS = REQUIREMENT_GUIDANCE_KEYS;

export const getQuestionClassGuidance = (value: CRMRequirementClass) => QUESTION_CLASS_GUIDANCE[value];
export const getDiscoveryStateGuidance = (value: CRMDiscoveryQuestionState) => DISCOVERY_STATE_GUIDANCE[value];
export const getCertaintyGuidance = (value: CRMInformationCertainty) => CERTAINTY_GUIDANCE[value];
export const getSellerGuidance = (key: string) => SELLER_GUIDANCE[key];
