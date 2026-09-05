import type { CareerApplicationFieldConfig, CareerApplicationFormConfig, CareerApplicationStepConfig } from './careerService';

export type UIUXFieldKind = 'text' | 'email' | 'url' | 'number' | 'date' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'file';

export interface UIUXFieldDefinition {
  id: string;
  stepId: string;
  kind: UIUXFieldKind;
  label: string;
  help?: string;
  placeholder?: string;
  required?: boolean;
  lockedRequired?: boolean;
  options?: string[];
}

export const UIUX_FIELD_DEFINITIONS: UIUXFieldDefinition[] = [
  { id:'fullName', stepId:'profile', kind:'text', label:'Full name', required:true, lockedRequired:true, placeholder:'Your full name' },
  { id:'email', stepId:'profile', kind:'email', label:'Professional email', required:true, lockedRequired:true, placeholder:'you@example.com' },
  { id:'phone', stepId:'profile', kind:'text', label:'Phone / WhatsApp', help:'Optional at the application stage.', placeholder:'+91 ...' },
  { id:'country', stepId:'profile', kind:'text', label:'Country of residence', required:true, lockedRequired:true, placeholder:'India' },
  { id:'timezone', stepId:'profile', kind:'text', label:'Timezone', required:true, lockedRequired:true, help:'Use an IANA timezone such as Asia/Kolkata. We prefill this from your device.', placeholder:'Asia/Kolkata' },
  { id:'linkedinUrl', stepId:'profile', kind:'url', label:'LinkedIn profile', placeholder:'https://linkedin.com/in/...' },
  { id:'currentRole', stepId:'profile', kind:'select', label:'Current professional status', required:true, options:['Employed full-time','Employed part-time','Freelancer','Contractor','Agency','Student','Between roles','Other'] },

  { id:'yearsExperience', stepId:'experience', kind:'select', label:'Professional UI/UX or web-design experience', required:true, options:['Less than 1 year','1–2 years','2–3 years','3–5 years','5–8 years','8+ years'] },
  { id:'designWorkTypes', stepId:'experience', kind:'multiselect', label:'What type of design work have you completed professionally?', required:true, options:['Business websites','Landing pages','SaaS / web applications','Dashboards','Mobile applications','E-commerce','User flows / information architecture','Wireframes','Prototypes','Design systems','Conversion-focused design','Other'] },
  { id:'strongestCapability', stepId:'experience', kind:'select', label:'Which area best describes your strongest capability?', required:true, options:['UX / Information Architecture','Conversion-focused web design','Visual UI design','SaaS / Product UI','Responsive web design','Design systems','Prototyping / interaction design','Generalist UI/UX'] },

  { id:'portfolioUrl', stepId:'portfolio', kind:'url', label:'Portfolio / case studies URL', required:true, lockedRequired:true, help:'Share a link we can review without private customer credentials.', placeholder:'https://...' },
  { id:'strongestCaseStudy', stepId:'portfolio', kind:'textarea', label:'Which case study best represents your ability?', required:true, help:'Name the project or portfolio section and explain the problem you were solving.', placeholder:'Project name, problem, users and context...' },
  { id:'caseStudyContribution', stepId:'portfolio', kind:'textarea', label:'What exactly did YOU personally contribute?', required:true, help:'Separate your work from the work completed by other team members.', placeholder:'Research, IA, flows, wireframes, UI, components, prototype, testing, handoff...' },
  { id:'caseStudyOutcome', stepId:'portfolio', kind:'textarea', label:'What was the outcome?', required:true, help:'Share a measurable result if one exists. If metrics were unavailable, explain the practical outcome instead.' },
  { id:'portfolioSharingConsent', stepId:'portfolio', kind:'checkbox', label:'I confirm that I am authorized to share the portfolio material submitted for recruitment review and have not included private client credentials or information I am prohibited from sharing.', required:true, lockedRequired:true },

  { id:'figmaConfidence', stepId:'skills', kind:'select', label:'How confident are you using Figma professionally?', required:true, options:['Beginner','Intermediate','Advanced','Expert'] },
  { id:'figmaCapabilities', stepId:'skills', kind:'multiselect', label:'Which Figma capabilities do you regularly use in production?', required:true, options:['Auto Layout','Components','Component properties','Variants','Variables','Styles','Design tokens','Libraries','Interactive prototypes','Responsive component structures','Dev Mode / handoff','Version history','Branching'] },
  { id:'figmaExperience', stepId:'skills', kind:'textarea', label:'How do you structure a production Figma file for another designer or developer?', required:true, placeholder:'Pages, components, naming, variables, libraries, handoff...' },
  { id:'designSystemsExperience', stepId:'skills', kind:'textarea', label:'Tell us about your design-system or component experience.', required:true },
  { id:'uxProcess', stepId:'skills', kind:'textarea', label:'How do you approach a new project before creating the final UI?', required:true, help:'Briefly describe how you move from requirements to IA, user flow, wireframes and final interface.' },
  { id:'responsiveExperience', stepId:'skills', kind:'textarea', label:'How do you approach responsive design?', required:true, help:'Explain layout behavior across desktop, tablet and mobile, including content priority and interaction states.' },
  { id:'interfaceStates', stepId:'skills', kind:'multiselect', label:'Which interface states do you normally design?', required:true, options:['Default','Hover','Focus','Active','Disabled','Loading','Empty','Success','Warning','Error','Validation','Responsive variations'] },
  { id:'accessibilityConsiderations', stepId:'skills', kind:'multiselect', label:'Which accessibility considerations are part of your normal process?', required:true, options:['Colour contrast','Text readability','Focus states','Keyboard navigation considerations','Form labels','Error messaging','Touch-target sizing','Content hierarchy','Screen-reader considerations','Motion / accessibility considerations','WCAG familiarity','I have limited accessibility experience'] },
  { id:'accessibilityExperience', stepId:'skills', kind:'textarea', label:'Give one example of how accessibility changed a design decision.', required:true },
  { id:'businessConversionThinking', stepId:'skills', kind:'textarea', label:'How do you balance user needs, business goals and conversion?', required:true, help:'A short practical answer is enough. We are looking for your reasoning, not marketing jargon.' },

  { id:'handoffFrequency', stepId:'work', kind:'select', label:'How often have you handed designs to developers?', required:true, options:['Regularly','Occasionally','Once or twice','Never'] },
  { id:'handoffContents', stepId:'work', kind:'multiselect', label:'What do you normally include in a development-ready handoff?', required:true, options:['Approved design / version','Components','Design tokens / variables','Responsive rules','Interaction states','Form / error states','Assets','Prototype','Accessibility notes','Content','Animation / motion guidance','Technical notes','Developer questions / clarifications'] },
  { id:'developerHandoffExperience', stepId:'work', kind:'textarea', label:'How do you work with developers when something is unclear or technically difficult?', required:true },
  { id:'clientFeedbackScenario', stepId:'work', kind:'textarea', label:'A client asks for a visually attractive change that you believe will hurt usability or conversion. What would you do?', required:true, help:'Keep your answer practical and concise.' },
  { id:'availableHoursPerWeek', stepId:'work', kind:'number', label:'Weekly availability', required:true, lockedRequired:true },
  { id:'preferredWorkWindow', stepId:'work', kind:'text', label:'Preferred work window', required:true, placeholder:'e.g. 10:00–18:00 IST' },
  { id:'earliestStartDate', stepId:'work', kind:'date', label:'Earliest start date', required:true },
  { id:'canMaintainAvailability', stepId:'work', kind:'checkbox', label:'I can consistently maintain my stated availability when I accept a ProFox project.', required:true },
  { id:'comfortableWithMeetings', stepId:'work', kind:'checkbox', label:'I am comfortable attending occasional project, design-review or client meetings when required.', required:true },
  { id:'hasLaptopInternet', stepId:'work', kind:'checkbox', label:'I have a reliable computer, stable internet connection and a suitable environment for professional remote design work.', required:true, lockedRequired:true },
  { id:'structuredReviewAcknowledgement', stepId:'work', kind:'checkbox', label:'I understand that ProFox design work goes through defined quality reviews and I am comfortable receiving and responding professionally to feedback.', required:true },
  { id:'assessmentAcknowledgement', stepId:'work', kind:'checkbox', label:'I understand that shortlisted applicants may be asked to complete a controlled UI/UX / Figma assessment before final selection.', required:true },
  { id:'designAcademyAcknowledgement', stepId:'work', kind:'checkbox', label:'If selected, I am willing to complete the required ProFox Design Academy, certification and final approval process before receiving production access.', required:true },
  { id:'projectBasedAcknowledgement', stepId:'work', kind:'checkbox', label:'I understand this opportunity starts as paid, project-based contract work and that project volume, monthly earnings and fixed paid hours are not guaranteed.', required:true },

  { id:'motivation', stepId:'review', kind:'textarea', label:'Why does this ProFox UI/UX opportunity fit what you want to do next?', required:true, help:'A short, specific answer is better than a long essay.' },
  { id:'cv', stepId:'review', kind:'file', label:'CV / résumé', required:true, lockedRequired:true, help:'PDF, DOC or DOCX · max 8 MB.' },
  { id:'heardAboutSource', stepId:'review', kind:'select', label:'How did you hear about ProFox?', required:true },
  { id:'heardAboutDetail', stepId:'review', kind:'text', label:'Source detail', help:'Shown when the selected source needs more detail.' },
  { id:'consentAccurate', stepId:'review', kind:'checkbox', label:'I confirm that this application is accurate and that I have described my personal contribution to portfolio projects truthfully.', required:true, lockedRequired:true },
  { id:'consentPrivacy', stepId:'review', kind:'checkbox', label:'I consent to ProFox processing this information for recruitment, assessment, interview, onboarding and related recruitment purposes.', required:true, lockedRequired:true },
];

export const DEFAULT_UIUX_STEPS: CareerApplicationStepConfig[] = [
  { id:'profile', title:'Profile', description:'Your contact details and current professional status.', fields:UIUX_FIELD_DEFINITIONS.filter((field)=>field.stepId==='profile').map((field)=>field.id) },
  { id:'experience', title:'Experience', description:'A quick picture of the work you have actually done.', fields:UIUX_FIELD_DEFINITIONS.filter((field)=>field.stepId==='experience').map((field)=>field.id) },
  { id:'portfolio', title:'Portfolio', description:'Show us the work and your real contribution.', fields:UIUX_FIELD_DEFINITIONS.filter((field)=>field.stepId==='portfolio').map((field)=>field.id) },
  { id:'skills', title:'Design skills', description:'How you think, design and prepare work for production.', fields:UIUX_FIELD_DEFINITIONS.filter((field)=>field.stepId==='skills').map((field)=>field.id) },
  { id:'work', title:'Work & collaboration', description:'Handoff, feedback, availability and delivery readiness.', fields:UIUX_FIELD_DEFINITIONS.filter((field)=>field.stepId==='work').map((field)=>field.id) },
  { id:'review', title:'Review & submit', description:'Final details, résumé and confirmations.', fields:UIUX_FIELD_DEFINITIONS.filter((field)=>field.stepId==='review').map((field)=>field.id) },
];

export const DEFAULT_UIUX_APPLICATION_CONFIG: CareerApplicationFormConfig = {
  version: 2,
  minimumWeeklyHours: 20,
  cvRequired: true,
  portfolioRequired: true,
  sourceOptions: ['LinkedIn','Google Search','Social media','Job board','Referral','ProFox website','Other'],
  intro: {
    eyebrow: 'Apply for paid project opportunities',
    title: 'A focused application. Clear steps. No guesswork.',
    description: 'Tell us what you have actually designed, how you think and how ready you are to deliver inside a professional client workflow. You can review everything before you submit.',
    notice: 'This role starts as paid, project-based contract work. Project availability and monthly earnings are not guaranteed.',
  },
  steps: DEFAULT_UIUX_STEPS,
  fieldConfig: Object.fromEntries(UIUX_FIELD_DEFINITIONS.map((field)=>[field.id, {
    label: field.label,
    help: field.help,
    placeholder: field.placeholder,
    visible: true,
    required: Boolean(field.required),
    options: field.options,
  } satisfies CareerApplicationFieldConfig])),
};

export const UIUX_FIELD_MAP = Object.fromEntries(UIUX_FIELD_DEFINITIONS.map((field)=>[field.id, field])) as Record<string, UIUXFieldDefinition>;

export function getUIUXApplicationConfig(raw?: CareerApplicationFormConfig | null): CareerApplicationFormConfig {
  const current = raw || {};
  const defaultFields = DEFAULT_UIUX_APPLICATION_CONFIG.fieldConfig || {};
  const incomingFields = current.fieldConfig || {};
  const fieldConfig = Object.fromEntries(UIUX_FIELD_DEFINITIONS.map((field)=>[
    field.id,
    { ...defaultFields[field.id], ...incomingFields[field.id], required: field.lockedRequired ? true : (incomingFields[field.id]?.required ?? defaultFields[field.id]?.required) },
  ]));
  return {
    ...DEFAULT_UIUX_APPLICATION_CONFIG,
    ...current,
    intro: { ...DEFAULT_UIUX_APPLICATION_CONFIG.intro, ...(current.intro || {}) },
    sourceOptions: Array.isArray(current.sourceOptions) && current.sourceOptions.length ? current.sourceOptions : DEFAULT_UIUX_APPLICATION_CONFIG.sourceOptions,
    steps: Array.isArray(current.steps) && current.steps.length ? current.steps : DEFAULT_UIUX_STEPS,
    fieldConfig,
  };
}

export function isUIUXFieldRequired(fieldId: string, config: CareerApplicationFormConfig) {
  const definition = UIUX_FIELD_MAP[fieldId];
  if (definition?.lockedRequired) return true;
  return Boolean(config.fieldConfig?.[fieldId]?.required);
}

export function isUIUXFieldVisible(fieldId: string, config: CareerApplicationFormConfig) {
  return config.fieldConfig?.[fieldId]?.visible !== false;
}
