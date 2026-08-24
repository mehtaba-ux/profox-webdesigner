export interface ProductQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface NichePlaybook {
  id: string;
  niche: string;
  idealProspect: string;
  decisionMaker: string;
  commonBusinessProblems: string[];
  websiteProblems: string[];
  recommendedService: string;
  outreachAngle: string;
  commonObjections: string[];
  discoveryQuestions: string[];
}

export interface OutreachTemplate {
  id: string;
  category: 'cold_email' | 'linkedin' | 'followup' | 'loom_intro' | 'meeting_request' | 'quote_followup' | 'payment_followup';
  title: string;
  subject?: string;
  body: string;
  variables: string[];
}

export interface PracticeScenario {
  id: string;
  title: string;
  industry: string;
  prospectProfile: string;
  corePain: string;
  budgetExpectation: string;
  keyObjection: string;
  recommendedSolution: string;
  scriptPrompt: string;
}

export interface DefaultModuleData {
  id: string;
  title: string;
  slug: string;
  description: string;
  module_type: 'lesson' | 'quiz' | 'assignment' | 'practical';
  sort_order: number;
  required: boolean;
  active: boolean;
  passing_score?: number;
  requires_admin_review: boolean;
  lessons: {
    id: string;
    title: string;
    content: string;
    video_url?: string;
    sort_order: number;
  }[];
}

export const PRODUCT_QUIZ_QUESTIONS: ProductQuizQuestion[] = [
  {
    id: 'pq1',
    question: 'Which ProFox package is best suited for a growth-stage business needing SEO optimization, custom UI, and dynamic CMS capabilities?',
    options: ['ProFox Launch', 'ProFox Growth', 'Discovery Sprint', 'ProFox Scale'],
    correctIndex: 1,
    explanation: 'ProFox Growth is specifically designed for established businesses requiring dynamic CMS content, conversion optimization, and SEO.'
  },
  {
    id: 'pq2',
    question: 'Are Sales Representatives permitted to grant custom price reductions or discount catalog prices below approved rates without Admin approval?',
    options: ['Yes, up to 15% discount', 'Yes, for fast closing', 'Strictly No, Admin approval is required for any custom pricing', 'Yes, if paid in cash'],
    correctIndex: 2,
    explanation: 'Sales reps CANNOT reduce fixed catalog prices or grant custom pricing without explicit Admin approval.'
  },
  {
    id: 'pq3',
    question: 'When does an Opportunity status officially change to "Won" in the ProFox CRM?',
    options: ['When the quotation is sent', 'When the customer agrees verbally', 'Only after the required advance payment is verified by an Admin', 'When the contract draft is created'],
    correctIndex: 2,
    explanation: 'An opportunity becomes Won only after the required advance deposit is Admin-verified.'
  },
  {
    id: 'pq4',
    question: 'What is the purpose of a Discovery Sprint ($1,499)?',
    options: ['A free consultation call', 'A paid scoping & architecture workshop for complex, custom digital projects', 'A discount coupon for Launch package', 'A fast 2-hour bug fix service'],
    correctIndex: 1,
    explanation: 'Discovery Sprints are paid scoping and architecture workshops for enterprise or custom digital experiences.'
  },
  {
    id: 'pq5',
    question: 'Can a Sales Representative verify payments or mark payments as verified themselves?',
    options: ['Yes, if they hold proof of wire transfer', 'Strictly No, payment verification is exclusively an Admin operation', 'Yes, for amounts under $1,000', 'Yes, if the client sends a screenshot'],
    correctIndex: 1,
    explanation: 'Sales reps CANNOT verify payments. Only Admins can verify payments in ProFox.'
  }
];

export const NICHE_PLAYBOOKS: NichePlaybook[] = [
  {
    id: 'roofing',
    niche: 'Roofing Contractors',
    idealProspect: 'Independent & regional roofing companies with 5-30 field crew members.',
    decisionMaker: 'Owner, Managing Director, General Manager',
    commonBusinessProblems: [
      'High dependence on expensive lead aggregators (Angi, HomeAdvisor)',
      'Low conversion rates from Google Ads due to slow, outdated mobile sites',
      'Inability to showcase past roofing projects and material quality effectively'
    ],
    websiteProblems: [
      'Non-responsive mobile view causing 60%+ lead dropoff',
      'No instant quote request or emergency repair booking form',
      'Missing trust badges, warranty details, or verified Google review widgets'
    ],
    recommendedService: 'ProFox Growth or ProFox Launch + Emergency Lead Capture Add-on',
    outreachAngle: 'Demonstrate how a high-converting mobile site reduces cost-per-lead by 40% compared to lead brokers.',
    commonObjections: [
      'We rely on word of mouth',
      'We already buy leads from HomeAdvisor'
    ],
    discoveryQuestions: [
      'What percentage of your roofing leads currently come directly through your website versus purchased leads?',
      'How fast do your emergency storm damage leads get followed up on?'
    ]
  },
  {
    id: 'hvac',
    niche: 'HVAC & Climate Control',
    idealProspect: 'Residential & commercial HVAC service providers with 3+ service vans.',
    decisionMaker: 'Business Owner, Operations Director',
    commonBusinessProblems: [
      'Seasonal demand fluctuations causing revenue dips in shoulder months',
      'Difficulty selling annual maintenance plans online'
    ],
    websiteProblems: [
      'No online booking widget for AC tune-ups or furnace repairs',
      'Outdated design that lacks professional credibility against national franchises'
    ],
    recommendedService: 'ProFox Growth + Online Booking & Maintenance Plan Portal',
    outreachAngle: 'Automate annual HVAC maintenance agreement signups directly through a modern web application.',
    commonObjections: ['Our phone number on the site is enough for bookings'],
    discoveryQuestions: ['How easily can homeowners schedule an urgent tune-up on your website at 8 PM?']
  },
  {
    id: 'plumbing',
    niche: 'Plumbing Services',
    idealProspect: 'Local plumbing service companies offering residential and commercial services.',
    decisionMaker: 'Owner, Master Plumber Manager',
    commonBusinessProblems: ['High competition on Google Local Service Ads', 'Losing emergency dispatch jobs to faster online competitors'],
    websiteProblems: ['No click-to-call sticky header on mobile phones', 'Slow page loading speeds (>4 seconds)'],
    recommendedService: 'ProFox Launch + Mobile Click-to-Call Emergency Conversion Suite',
    outreachAngle: 'Sub-2-second mobile load time to capture emergency plumbing searchers before they click away.',
    commonObjections: ['We have been in business 20 years without a fancy site'],
    discoveryQuestions: ['When someone has a burst pipe, can they reach your dispatch within 2 taps on mobile?']
  },
  {
    id: 'clinics',
    niche: 'Medical & Specialty Clinics',
    idealProspect: 'Private medical clinics, wellness centers, and specialized care practices.',
    decisionMaker: 'Practice Manager, Lead Doctor, Medical Director',
    commonBusinessProblems: ['High staff phone workload for routine appointment scheduling', 'High no-show rates'],
    websiteProblems: ['Cluttered navigation, poor accessibility, missing online intake forms'],
    recommendedService: 'ProFox Scale + Patient Intake & Appointment Booking Portal',
    outreachAngle: 'Reduce front-desk admin time by 15 hours/week with seamless digital intake and prepayments.',
    commonObjections: ['We use an existing medical EHR system'],
    discoveryQuestions: ['Can new patients complete intake forms on their phone prior to arriving at the clinic?']
  },
  {
    id: 'dental',
    niche: 'Dental Practices',
    idealProspect: 'Cosmetic & family dental practices seeking high-value treatments (Implants, Invisalign).',
    decisionMaker: 'Owner Dentist, Practice Administrator',
    commonBusinessProblems: ['Low volume of high-margin cosmetic dentistry patients'],
    websiteProblems: ['Generic stock photos, no smile transformation gallery or video testimonials'],
    recommendedService: 'ProFox Growth + Before/After Transformation Showcase',
    outreachAngle: 'Transform static site into a luxury patient experience that converts high-value cosmetic consults.',
    commonObjections: ['Our patient base is older and does not care about websites'],
    discoveryQuestions: ['How are you currently presenting $5k+ implant cases to prospective patients online?']
  },
  {
    id: 'hospitality',
    niche: 'Hotels & Hospitality',
    idealProspect: 'Boutique hotels, luxury resorts, and bed & breakfast venues.',
    decisionMaker: 'General Manager, Marketing Director',
    commonBusinessProblems: ['Paying 15%-25% commission fees to OTAs (Booking.com, Expedia)'],
    websiteProblems: ['Outdated direct booking engine, poor visual gallery, slow mobile checkout'],
    recommendedService: 'ProFox Scale or Custom Digital Experience + Direct Booking Engine',
    outreachAngle: 'Shift 20% of OTA bookings to direct website reservations, saving tens of thousands in commission.',
    commonObjections: ['OTAs handle all our marketing'],
    discoveryQuestions: ['How much commission did your property pay to Booking.com last quarter?']
  },
  {
    id: 'real_estate',
    niche: 'Real Estate Agencies',
    idealProspect: 'Independent real estate brokerages and luxury property developers.',
    decisionMaker: 'Managing Broker, Agency Owner',
    commonBusinessProblems: ['Difficulty standing out against Zillow and national portals'],
    websiteProblems: ['Slow MLS property search, outdated property presentation pages, lack of lead capture'],
    recommendedService: 'ProFox Scale + Property Search & Interactive Map Integration',
    outreachAngle: 'Custom luxury property showcases with interactive floorplans and instant valuation leads.',
    commonObjections: ['We use our MLS default template'],
    discoveryQuestions: ['How do you capture seller leads looking for home valuations on your current site?']
  },
  {
    id: 'professional_services',
    niche: 'Professional Services (Legal, Accounting, Consulting)',
    idealProspect: 'Law firms, CPA practices, and management consulting agencies.',
    decisionMaker: 'Managing Partner, Practice Head',
    commonBusinessProblems: ['Need to build premium authority and attract high-retainer corporate clients'],
    websiteProblems: ['Dry, text-heavy layout, no clear practice area landing pages or consultation booking'],
    recommendedService: 'ProFox Growth + Authority Content & Consult Booking Engine',
    outreachAngle: 'Elevate digital brand authority to command higher retainer fees and pre-qualify corporate clients.',
    commonObjections: ['Our business comes entirely from referrals'],
    discoveryQuestions: ['When referred clients research your partners online, does your site reflect your $500/hr expertise?']
  },
  {
    id: 'ecommerce',
    niche: 'E-commerce & Brands',
    idealProspect: 'D2C brands generating $20k-$200k/month looking to scale conversion rate.',
    decisionMaker: 'Founder, Head of E-commerce',
    commonBusinessProblems: ['High cart abandonment, slow mobile loading speed, poor average order value (AOV)'],
    websiteProblems: ['Cluttered checkout flow, lack of cross-sell bundles or instant cart drawer'],
    recommendedService: 'ProFox Scale + Headless E-commerce & Conversion Rate Optimization (CRO)',
    outreachAngle: 'Increase store conversion rate from 1.5% to 3.2% with ultra-fast custom storefront architecture.',
    commonObjections: ['We already use basic Shopify'],
    discoveryQuestions: ['What is your current mobile cart abandonment rate and page speed score?']
  },
  {
    id: 'technology',
    niche: 'Technology & SaaS Companies',
    idealProspect: 'B2B SaaS startups, tech consultancies, and IT providers.',
    decisionMaker: 'CEO, Chief Marketing Officer, Head of Sales',
    commonBusinessProblems: ['Complex product value proposition that prospective buyers do not understand quickly'],
    websiteProblems: ['Generic tech template, weak product demo interaction, static landing pages'],
    recommendedService: 'ProFox Scale or Custom + Interactive Demo & Product Visualization',
    outreachAngle: 'Interactive product walkthroughs and dynamic pricing calculators that drive instant demo requests.',
    commonObjections: ['Our internal developers will build our marketing site'],
    discoveryQuestions: ['Is taking your engineering team off product roadmap to build marketing web pages the best use of dev time?']
  },
  {
    id: 'home_services',
    niche: 'General Home Services & Remodeling',
    idealProspect: 'Kitchen/bath remodelers, landscapers, painters, and general contractors.',
    decisionMaker: 'Owner, General Contractor',
    commonBusinessProblems: ['Price shopping prospective clients asking for free estimates'],
    websiteProblems: ['No interactive project cost calculator or high-resolution project portfolio slider'],
    recommendedService: 'ProFox Growth + Interactive Estimate Calculator Add-on',
    outreachAngle: 'Pre-qualify budget before spending hours driving out for physical estimates.',
    commonObjections: ['Every job is custom so we cannot show prices'],
    discoveryQuestions: ['How many hours a week do you waste driving to give estimates to unqualified homeowners?']
  }
];

export const OUTREACH_TEMPLATES: OutreachTemplate[] = [
  {
    id: 't1',
    category: 'cold_email',
    title: 'Personalized Loom Teaser (Cold Email)',
    subject: 'Quick video regarding {{company_name}}\'s website conversion',
    body: `Hi {{first_name}},

I recorded a quick 60-second Loom video showing a specific UX friction point on {{company_name}}'s website that is likely costing you mobile leads:

{{loom_url}}

We recently solved this exact issue for a similar {{industry}} business, boosting their direct website inquiries by 38%.

Are you open to a 15-minute chat this Thursday at 10 AM or 2 PM to explore this?

Best regards,
{{salesperson_name}}
ProFox Digital Architecture`,
    variables: ['company_name', 'first_name', 'loom_url', 'industry', 'salesperson_name']
  },
  {
    id: 't2',
    category: 'linkedin',
    title: 'LinkedIn Connection & First Message',
    body: `Hi {{first_name}}, noticed your work leading {{company_name}}. I made a short 45s video breaking down 2 conversion improvements for your website: {{loom_url}}. Would love to connect!`,
    variables: ['first_name', 'company_name', 'loom_url']
  },
  {
    id: 't3',
    category: 'followup',
    title: 'Day 3 Value Follow-Up',
    subject: 'Re: {{company_name}} website benchmark',
    body: `Hi {{first_name}},

Following up on my previous note. Here is a quick breakdown of how top-performing {{industry}} sites structure their mobile lead flow:

1. Sub-2-second load times
2. Sticky instant-action bar
3. Verified trust badges directly above the fold

Did you get a chance to check the 60-second video breakdown I sent earlier? {{loom_url}}

Let me know if you have 10 minutes later this week!

Best,
{{salesperson_name}}`,
    variables: ['company_name', 'first_name', 'industry', 'loom_url', 'salesperson_name']
  },
  {
    id: 't4',
    category: 'loom_intro',
    title: 'Loom Video Opening Script',
    body: `"Hey {{first_name}}, {{salesperson_name}} here from ProFox. I was researching top {{industry}} companies in {{country}} and came across {{company_name}}. I noticed a small mobile layout issue that is likely causing prospective clients to bounce back to Google. Let me show you on my screen right now..."`,
    variables: ['first_name', 'salesperson_name', 'industry', 'country', 'company_name']
  },
  {
    id: 't5',
    category: 'meeting_request',
    title: 'Direct Meeting Invitation',
    subject: '15-min discovery call: ProFox & {{company_name}}',
    body: `Hi {{first_name}},

To help {{company_name}} capture more direct clients online, I would like to invite you to a short 15-minute discovery call.

You can select a time that fits your calendar directly here: {{booking_link}}

On the call, we will share a tailored digital architecture blueprint with zero obligation.

Looking forward to speaking,
{{salesperson_name}}`,
    variables: ['first_name', 'company_name', 'booking_link', 'salesperson_name']
  },
  {
    id: 't6',
    category: 'quote_followup',
    title: 'Quotation Follow-Up & Scoping Clarification',
    subject: 'Reviewing proposal for {{company_name}}',
    body: `Hi {{first_name}},

I wanted to check if you had any questions regarding the ProFox proposal we sent over for {{company_name}}.

As a reminder, all scope items, milestones, and deliverables are fully locked in with our guarantee.

Are you available for a brief 10-minute call tomorrow to review any final questions?

Best regards,
{{salesperson_name}}`,
    variables: ['first_name', 'company_name', 'salesperson_name']
  },
  {
    id: 't7',
    category: 'payment_followup',
    title: 'Advance Payment Link & Onboarding Setup',
    subject: 'Next steps to initiate {{company_name}} project launch',
    body: `Hi {{first_name}},

We are excited to kick off {{company_name}}'s web development project!

To reserve your dev sprint and assign our Senior UI/UX Designer, please complete the initial advance deposit via our secure company payment link:

{{payment_link}}

Once completed, our system automatically provisions your Client Portal and project board.

Warm regards,
{{salesperson_name}}
ProFox Team`,
    variables: ['first_name', 'company_name', 'payment_link', 'salesperson_name']
  }
];

export const PRACTICE_SCENARIOS: PracticeScenario[] = [
  {
    id: 'ps1',
    title: 'Roofing Company with Outdated Mobile Site',
    industry: 'Roofing',
    prospectProfile: 'Owner of Apex Roofing, generating $1.8M/yr, spending $3k/mo on Google Ads but site takes 5s to load on mobile.',
    corePain: 'High ad spend with low conversion rate; losing storm damage leads to local competitors.',
    budgetExpectation: '$3,500 - $6,000',
    keyObjection: '"We already spend a lot on Google Ads, why do we need a new website?"',
    recommendedSolution: 'ProFox Growth package with emergency lead capture bar & fast mobile architecture.',
    scriptPrompt: 'Roleplay a discovery opening explaining how fixing their 5s mobile speed cuts their lead acquisition cost in half.'
  },
  {
    id: 'ps2',
    title: 'Private Dental Practice Seeking Cosmetic Patients',
    industry: 'Dental / Healthcare',
    prospectProfile: 'Lead Dentist at City Dental, wants to attract 10 new Invisalign/Implant patients per month ($5k/case).',
    corePain: 'Current site looks generic, no patient transformation gallery, front desk spends hours answering basic pricing calls.',
    budgetExpectation: '$5,000 - $8,500',
    keyObjection: '"Our current website was built 3 years ago by a local freelancer and works fine."',
    recommendedSolution: 'ProFox Growth with custom Before/After smile showcase & patient intake portal.',
    scriptPrompt: 'Pitch the visual trust showcase and show how 1 extra implant case per month pays for the entire site in 30 days.'
  },
  {
    id: 'ps3',
    title: 'Established B2B Firm Considering Full Digital Redesign',
    industry: 'Professional Services',
    prospectProfile: 'Managing Partner at Meridian Consulting, 25 employees, corporate clientele, current site looks like 2014.',
    corePain: 'Lacks modern authority brand, enterprise prospects do not take their digital presence seriously.',
    budgetExpectation: '$10,000 - $18,000',
    keyObjection: '"We get all our deals through referrals so website quality doesn\'t matter as much."',
    recommendedSolution: 'ProFox Scale package with custom brand design, authority case studies, and corporate consult booking.',
    scriptPrompt: 'Demonstrate how enterprise buyers validate referrals online before signing $50k retainers.'
  }
];

export const DEFAULT_TRAINING_MODULES_FULL: DefaultModuleData[] = [
  {
    id: 'm1',
    title: 'Welcome to ProFox',
    slug: 'welcome-to-profox',
    description: 'Introduction to ProFox vision, company mission, target markets, sales role, and customer-first sales philosophy.',
    module_type: 'lesson',
    sort_order: 1,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l1_1',
        title: 'The ProFox Vision & High-Performance Sales Culture',
        content: `
# Welcome to ProFox

Welcome to ProFox! At ProFox, we engineer **high-converting web applications, bespoke e-commerce architectures, custom digital experiences, and enterprise web solutions** for growing businesses globally.

---

### 1. What ProFox Does
- **High-Converting Websites**: Modern, sub-2-second, mobile-first web platforms engineered to convert visitors into qualified sales leads and bookings.
- **E-Commerce Architectures**: High-performance online store platforms with optimized checkout flows and custom conversion integrations.
- **Custom Web Applications**: Bespoke portals, SaaS platforms, internal management tools, and custom workflow automations.
- **Discovery Sprints ($1,499+)**: Paid 1-week scoping and architecture workshops for enterprise clients or complex, custom project requirements.

---

### 2. Who ProFox Serves
We focus on active commercial SMBs, practice groups, contractors, and growing brands across our priority international markets:
- **Target Markets**: United States, United Kingdom, Canada, Australia.
- **Core Verticals**: Home services (Roofing, HVAC, Plumbing, Remodeling), Healthcare & Clinics (Medical, Dental), Hospitality & Real Estate, Professional Services (Legal, Accounting, Consulting), E-commerce & D2C Brands, and Technology & SaaS.

---

### 3. Your Role as an Independent Sales Representative
As an Independent Commission-Based Sales Representative, your role is to drive business acquisition by:
1. Prospecting and qualifying high-potential commercial leads in target markets.
2. Creating personalized 45–90s Loom video audits to demonstrate genuine value.
3. Conducting discovery calls to diagnose business friction and recommend the right ProFox catalog package.
4. Preparing formal quotations and securing initial advance deposit commitments.

---

### 4. Consultative, Customer-First Sales Philosophy
- **Consultative Advisory**: We solve real business problems (lost leads, slow speed, poor mobile conversion). We never pitch generic "pretty pictures" or engage in aggressive telemarketing tactics.
- **Trust & Transparency**: Always set accurate expectations. Focus on business ROI, clear project scopes, and guaranteed milestones.

---

### 5. Professional Standards & CRM Discipline
- **Communication Standards**: Maintain prompt, articulate, empathetic, and highly polished written and spoken English in all prospect interactions.
- **CRM-First Record Keeping**: Log every lead, interaction, meeting note, quote request, and follow-up in the ProFox CRM immediately.
- **Zero Unauthorized Promises**: Never promise unapproved discounts, free custom work, artificial delivery dates, or sign binding agreements without Admin signoff.

---

### Completion Checklist
- [x] Understand ProFox product lines & priority markets (US, UK, CA, AU).
- [x] Adopt the consultative, problem-solving sales approach.
- [x] Commit to CRM-first record keeping and zero unauthorized discounts.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm2',
    title: 'Agreement & Sales Rules',
    slug: 'agreement-sales-rules',
    description: 'Non-negotiable sales rules of engagement, permitted conduct, ethics, and anti-spam policies.',
    module_type: 'assignment',
    sort_order: 2,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l2_1',
        title: 'ProFox Sales Rules of Engagement & Boundaries',
        content: `
# ProFox Sales Rules of Engagement

To protect the ProFox brand reputation and maintain strict commercial standards, all Sales Representatives must adhere strictly to these rules of engagement:

---

### What Sales Representatives MAY Do:
1. **Target Qualified Prospects**: Identify and prospect commercial businesses in target markets (US, UK, CA, AU).
2. **Personalized Outreach**: Contact prospects professionally using personalized 45–90s Loom videos, email, and LinkedIn.
3. **Book Discovery Calls**: Invite qualified decision makers to 15-minute discovery meetings using approved Calendly/CRM booking links.
4. **Conduct Diagnostic Calls**: Ask diagnostic questions to identify site friction and qualify project budgets.
5. **Recommend Catalog Packages**: Present approved catalog solutions (**Launch $599+**, **Growth $2,379+**, **Scale $5,799+**, **Discovery Sprint $1,499+**).
6. **Generate Quotations**: Create formal, locked quotations using official catalog pricing and approved add-ons in the ProFox CRM.
7. **Follow Up on Payments**: Provide official company payment links to clients for advance deposit processing.

---

### What Sales Representatives MAY NOT Do:
1. ❌ **No Unauthorized Discounts**: Never reduce catalog prices, grant custom discounts, or alter commission structures without written Admin approval in the CRM.
2. ❌ **No False Scope Promises**: Never promise features, custom integrations, or rush turnarounds outside the official package specifications unless approved in a custom quotation draft by Admin.
3. ❌ **No Free Work or Trials**: Never offer free design mockups, free trial builds, or speculative work to prospects without written Admin consent.
4. ❌ **No Binding Signatures**: Never sign contracts, legal waivers, or binding agency agreements on behalf of ProFox.
5. ❌ **No Personal Payment Collection**: Never accept or solicit client payments into personal bank accounts, PayPal, Wise, or cryptocurrency wallets. All payments must go through official ProFox payment links.
6. ❌ **No Self-Verification of Payments**: Never mark deals as "Won" or self-verify client deposits. Payment verification is strictly an Admin operation upon bank/gateway deposit confirmation.
7. ❌ **No Confidentiality Breaches**: Never share client records, internal pricing margins, or ProFox source materials with unauthorized third parties.

---

### Agreement Acknowledgment
Please review and acknowledge these rules below to confirm your commitment to upholding ProFox sales standards.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm3',
    title: 'Product & Package Training',
    slug: 'product-package-training',
    description: 'Master the official ProFox catalog: Launch, Growth, Scale, Custom, Discovery Sprint, Care Plans & Quiz.',
    module_type: 'quiz',
    sort_order: 3,
    required: true,
    active: true,
    passing_score: 80,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l3_1',
        title: 'ProFox Sales Catalog & Package Specifications',
        content: `
# ProFox Sales Catalog & Commercial Pricing

Mastering the official ProFox product catalog enables you to align client needs with the perfect digital architecture package.

---

### 1. ProFox Launch — $599+ (One-Time)
- **Target Client**: Small businesses, startups, local service providers needing a fast, high-converting digital presence.
- **Deliverables**: 1–3 high-converting pages, sub-2-second mobile load speed, mobile-first responsive layout, lead capture form, Google Maps integration, basic SEO metadata.
- **Inclusions**: SSL, basic analytics setup, contact form routing.
- **Excludes**: Dynamic CMS, blog/case study managers, custom portal logic.

---

### 2. ProFox Growth — $2,379+ (One-Time)
- **Target Client**: Established businesses needing stronger market authority, custom UI/UX, SEO foundation, and dynamic content.
- **Deliverables**: Up to 10 custom-designed pages, dynamic CMS (blog, portfolio, case studies), conversion rate optimization (CRO) widgets, advanced lead forms, full SEO optimization.
- **Inclusions**: Dedicated Senior UI/UX designer, brand style integration, interactive quote calculators/booking forms.
- **Excludes**: Multi-role authenticated client portals or bespoke database applications.

---

### 3. ProFox Scale — $5,799+ (One-Time)
- **Target Client**: Mid-market firms requiring advanced digital architecture, client portals, custom workflow integrations, or complex web applications.
- **Deliverables**: Bespoke web app architecture, multi-role client/user portal, real-time database sync, CRM integrations, high-traffic performance tuning, custom API endpoints.
- **Inclusions**: Comprehensive QA testing, custom API hooks, multi-environment staging, priority dev sprint allocation.

---

### 4. Custom Digital Experience — Custom Pricing (Escalated)
- **Target Client**: Enterprise clients, SaaS platforms, complex multi-portal systems, or custom database software.
- **Process**: Requires custom scoping and Admin escalation.

---

### 5. Discovery Sprint — $1,499+ (One-Time)
- **Target Client**: Prospects with complex, unformed, or large-scale web app requirements.
- **Deliverables**: 1-week paid architecture & technical scoping workshop. Produces wireframes, database schema blueprint, API specification, and exact fixed-fee build roadmap.

---

### 6. Add-ons & Recurring Care Plans
- **ProFox Care**: **$99/month** — Secure cloud hosting, SSL, automated weekly backups, core updates, up to 1 hr small edits/mo.
- **ProFox Growth Care**: **$249/month** — High-performance hosting, up to 3 hrs monthly content edits, performance & analytics review, priority support.
- **ProFox Priority Care**: **$499/month** — Enterprise cloud infrastructure, up to 6 hrs monthly website work, priority queue, quarterly strategy review.

---

### Upgrade Triggers & Escalation Rules
- **Upgrade Trigger (Launch → Growth)**: Recommend Growth when the client needs dynamic blog/portfolio managers, SEO content strategy, or more than 3 custom pages.
- **Upgrade Trigger (Growth → Scale)**: Recommend Scale when the client requires user accounts, client login portals, real-time database logic, or complex API sync.
- **Admin Escalation**: When a prospect's requirements exceed standard catalog limits or involve custom software architecture, recommend a **Discovery Sprint ($1,499)** or submit a custom quote request to Admin.

---

### Product Knowledge Quiz
Pass the 5-question test below with at least an **80% score** (4 out of 5 correct) to complete this module.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm4',
    title: 'Niche-Specific Training',
    slug: 'niche-specific-training',
    description: 'Vertical playbooks for Roofing, HVAC, Plumbing, Clinics, Dental, Real Estate, E-commerce, SaaS & more.',
    module_type: 'lesson',
    sort_order: 4,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l4_1',
        title: '11 Practical Industry Niche Playbooks',
        content: `
# Industry Niche Playbooks

Tailoring your outreach to specific industry pain points increases response rates by 3x. Use the interactive **Niche Playbooks** tab to master these 11 verticals:

---

### 1. Roofing Contractors
- **Decision Maker**: Owner, General Manager
- **Core Pain**: Buying expensive leads from Angi/HomeAdvisor; losing Google Ads clicks to slow mobile sites.
- **Best ProFox Package**: **ProFox Growth ($2,379+)** or **Launch ($599+)** + Emergency Lead Capture Add-on.
- **Outreach Angle**: "Cut cost-per-lead by 40% with a sub-2s mobile estimate generator."

---

### 2. HVAC & Climate Control
- **Decision Maker**: Operations Director, Owner
- **Core Pain**: Off-season revenue dips; dispatch calls dropping off after hours.
- **Best ProFox Package**: **ProFox Growth ($2,379+)** + 24/7 Online Repair Booking.
- **Outreach Angle**: "Capture after-hours repair requests automatically without expanding phone staff."

---

### 3. Plumbing Services
- **Decision Maker**: Master Plumber / Owner
- **Core Pain**: Emergency searchers bouncing due to missing click-to-call headers.
- **Best ProFox Package**: **ProFox Launch ($599+)** + Instant Click-to-Call Emergency Bar.
- **Outreach Angle**: "Ensure 2-tap emergency booking for burst pipe searchers on mobile."

---

### 4. General Home Services & Remodeling
- **Decision Maker**: General Contractor / Owner
- **Core Pain**: Wasting hours driving to give free estimates to price-shoppers.
- **Best ProFox Package**: **ProFox Growth ($2,379+)** + Interactive Project Cost Calculator.
- **Outreach Angle**: "Pre-qualify homeowner budgets before driving out for physical estimates."

---

### 5. Medical & Specialty Clinics
- **Decision Maker**: Practice Manager, Lead Doctor
- **Core Pain**: High staff phone workload; patient no-shows; manual paper intake.
- **Best ProFox Package**: **ProFox Scale ($5,799+)** + Patient Intake & Booking Portal.
- **Outreach Angle**: "Save 15 hours/week of front-desk admin time with digital patient intake."

---

### 6. Dental Practices
- **Decision Maker**: Owner Dentist, Practice Administrator
- **Core Pain**: Low volume of high-margin cosmetic dentistry cases (Implants, Invisalign).
- **Best ProFox Package**: **ProFox Growth ($2,379+)** + Smile Transformation Gallery.
- **Outreach Angle**: "Convert $5k+ cosmetic consults with a luxury before/after showcase."

---

### 7. Hotels & Hospitality
- **Decision Maker**: General Manager, Marketing Director
- **Core Pain**: Paying 15%–25% commission fees to OTAs (Booking.com, Expedia).
- **Best ProFox Package**: **ProFox Scale ($5,799+)** + Direct Booking Engine.
- **Outreach Angle**: "Shift 20% of OTA bookings to direct website reservations, saving thousands in commission."

---

### 8. Real Estate Agencies & Developers
- **Decision Maker**: Managing Broker, Agency Owner
- **Core Pain**: Weak lead capture on MLS search pages; standing out against Zillow.
- **Best ProFox Package**: **ProFox Scale ($5,799+)** + Luxury Property Search Integration.
- **Outreach Angle**: "Capture seller valuation leads with interactive custom home estimate pages."

---

### 9. Professional Services (Legal, Accounting, Consulting)
- **Decision Maker**: Managing Partner, Practice Head
- **Core Pain**: Outdated website fails to reflect $400/hr retainer expertise to referred clients.
- **Best ProFox Package**: **ProFox Growth ($2,379+)** + Consult Booking Engine.
- **Outreach Angle**: "Elevate digital brand authority to command higher retainer fees."

---

### 10. E-commerce & D2C Brands
- **Decision Maker**: Founder, Head of E-commerce
- **Core Pain**: High cart abandonment on mobile; slow page speeds killing ad ROI.
- **Best ProFox Package**: **ProFox Scale ($5,799+)** + Custom High-Speed Storefront & Instant Checkout.
- **Outreach Angle**: "Double mobile conversion rate with an ultra-fast headless checkout architecture."

---

### 11. Technology & B2B SaaS
- **Decision Maker**: CEO, Chief Marketing Officer
- **Core Pain**: Prospects fail to understand complex value proposition; slow dev team turnaround on marketing site.
- **Best ProFox Package**: **ProFox Scale ($5,799+)** or **Discovery Sprint ($1,499+)**.
- **Outreach Angle**: "Interactive product walkthroughs and dynamic pricing calculators that drive instant demo requests."
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm5',
    title: 'Lead Research & Qualification',
    slug: 'lead-research-qualification',
    description: 'Learn how to identify high-converting prospects and submit 5 qualified leads for Admin review.',
    module_type: 'assignment',
    sort_order: 5,
    required: true,
    active: true,
    requires_admin_review: true,
    lessons: [
      {
        id: 'l5_1',
        title: 'ProFox Lead Qualification & Prospecting Methodology',
        content: `
# Lead Research & Qualification Methodology

Prospecting the right target account is 80% of sales efficiency. Do not waste time on dead leads or uncontactable prospects.

---

### 1. Research Channels
- **Google Maps**: Search commercial verticals in high-income cities across US, UK, CA, AU. Look for 4.0+ star ratings with outdated, non-responsive websites.
- **LinkedIn & Sales Navigator**: Identify true decision makers (Owner, CEO, Managing Director, Practice Manager, Head of Marketing).
- **Google Search**: Search local keywords (e.g. "roofing contractor Austin TX"). Inspect top page 2 & 3 organic search results for businesses running Google Ads to outdated landing pages.
- **Business Directories**: Yelp, Clutch, YellowPages, local Chambers of Commerce.

---

### 2. The ProFox 4-Point Lead Qualification Standard
To qualify a prospect, verify:
1. **Active Commercial Business**: Real revenue, active operations, and staff (not pre-revenue ideas).
2. **Identified Digital Friction**: Clear website flaws (sub-standard design, >3s mobile load time, broken contact forms, no click-to-call, dated UI).
3. **Reachable Decision Maker**: Verified full name, email address, phone number, and LinkedIn profile.
4. **Target Market Alignment**: Located in priority target countries (US, UK, CA, AU).

---

### 3. Required Prospect Data Fields for CRM Logging
When submitting qualified leads, log:
- **Company Name & Website URL**
- **Country & Target Industry**
- **Decision Maker Name & Title**
- **Direct Email & Phone Number**
- **Identified Website Issue** (e.g. 4.8s mobile speed, broken quote form)
- **Recommended ProFox Solution** (e.g. ProFox Growth $2,379+)
- **Qualification Rationale**

---

### Practical Assignment
Use the interactive form below to submit **5 qualified commercial prospects**. Your submission will be evaluated by an Admin based on target market alignment, clear friction identification, and correct package matching.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm6',
    title: 'Personalized Loom Outreach',
    slug: 'personalized-loom-outreach',
    description: 'Record 45–90 second personalized video pitches and submit Loom URLs for Admin certification.',
    module_type: 'assignment',
    sort_order: 6,
    required: true,
    active: true,
    requires_admin_review: true,
    lessons: [
      {
        id: 'l6_1',
        title: 'The 45–90 Second High-Converting Loom Structure',
        content: `
# The 45–90 Second Loom Outreach Framework

A 60-second personalized Loom video breaks through cold email clutter by delivering immediate, undeniable value.

---

### The 5-Step Video Script Structure:
1. **Personalized Greeting (0–10s)**: "Hi [Name], [Your Name] from ProFox here. I was reviewing [Company] on Google today..."
2. **Show Their Website (10–25s)**: Share your screen showing their site on mobile view.
3. **Identify 1–2 Specific Improvements (25–45s)**: "I noticed your main quote form takes 5 taps on mobile, and the page loads in over 4 seconds..."
4. **Explain Business Impact (45–65s)**: "Fixing this mobile friction typically reclaims 20%–30% of lost quote requests from mobile searchers."
5. **Low-Friction Call to Action (65–80s)**: "I put together a quick breakdown of how we fixed this for a similar {{industry}} brand. Would you be open to a quick 15-minute chat this Thursday?"

---

### Non-Negotiable Video Rules:
- **Personalize Every Loom**: Show their actual website on screen (never use generic templates or broadcast recordings).
- **Helpful & Respectful Tone**: Never disrespect or insult their current site ("ugly", "terrible"). Frame observations as opportunities for growth.
- **No False Claims**: Never guarantee exact revenue numbers or make fake technical claims.
- **No Premature Price Pitching**: Focus on the problem and business impact, not price packages.
- **Length Constraint**: Keep strictly between **45 and 90 seconds**.

---

### Practical Assignment
Record up to 3 practice Loom videos and submit your Loom URL in the form below. At least **1 approved submission** is required to pass this module.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm7',
    title: 'Outreach Messages & Follow-Up',
    slug: 'outreach-messages-followup',
    description: 'Master the 9-day 5-touch cadence and explore 7 approved outreach templates.',
    module_type: 'lesson',
    sort_order: 7,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l7_1',
        title: 'The ProFox 9-Day 5-Touch Sales Cadence',
        content: `
# The ProFox 9-Day 5-Touch Cadence

Consistency and strategic timing turn cold outreach into booked discovery calls. 80% of sales close after the 3rd follow-up.

---

### The 9-Day Cadence Breakdown:
- **Day 1**: Personalized Loom Video + Short Email (Template 1)
- **Day 2**: Short LinkedIn Touch / Connection Request (Template 2)
- **Day 3**: Value-Focused Follow-Up Email — Industry Benchmark (Template 3)
- **Day 6**: Check-In Follow-Up Email — Fresh Insight
- **Day 9**: Final Breakup Email — Professional Close-the-Loop

---

### Core Execution Rules:
1. **Stop Immediately Upon Response**: Once a prospect replies, pause all automated or scheduled follow-ups immediately and engage manually.
2. **Log All Touches in CRM**: Record every email sent, LinkedIn message, and response date in the CRM.
3. **Multi-Channel Precision**: Combine Email + LinkedIn without spamming multiple inbox channels simultaneously.

---

### Approved Outreach Templates
Use the **Outreach Templates** tab to inspect and copy our 7 official email and LinkedIn templates.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm8',
    title: 'Meeting Booking',
    slug: 'meeting-booking',
    description: 'How to ask for 15-minute discovery calls, share booking links, and confirm meeting setup.',
    module_type: 'practical',
    sort_order: 8,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l8_1',
        title: 'Securing High-Converting Discovery Call Appointments',
        content: `
# Booking Discovery Meetings

Moving a warm lead from an email response to a confirmed calendar invite requires clear value framing and zero friction.

---

### 1. Value + Low-Friction Commitment Framing
Instead of asking "Can we meet for an hour?", frame the request around a short, zero-obligation value delivery:
> *"I noticed 2 friction points on your mobile quote page that might be costing you 15-20% of mobile inquiries. Would you be open to a brief 15-minute chat this Thursday at 10 AM EST to review a tailored digital architecture blueprint?"*

---

### 2. Meeting Booking Best Practices:
- **Offer 2 Specific Options**: Always propose two specific time slots (e.g. "Thursday at 10 AM or 2 PM EST").
- **Provide Approved Calendly/CRM Link**: Include your official scheduling link for direct selection.
- **Always Confirm Timezones**: Explicitly specify timezones (EST, CST, GMT, AEST) to prevent missed calls.
- **Send Immediate Calendar Invite**: Issue an official Google Meet / Zoom invite with a brief agenda upon booking.
- **Log in CRM**: Record the booked meeting in the ProFox CRM under the corresponding Opportunity.

---

### Meeting Setup Checklist
Complete the interactive setup checklist in this module to verify your calendar booking configuration.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm9',
    title: 'Discovery / Call Script',
    slug: 'discovery-call-script',
    description: 'Approved 9-step discovery call flow and questioning methodology.',
    module_type: 'lesson',
    sort_order: 9,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l9_1',
        title: 'The ProFox 9-Step Discovery Call Framework',
        content: `
# The ProFox Discovery Call Framework

A structured discovery call allows you to diagnose prospect pain points, establish commercial value, and recommend the ideal ProFox catalog package.

---

### The 9-Step Discovery Call Structure:
1. **Opening & Rapport (1 min)**: Build quick, warm professional rapport.
2. **Permission & Agenda (1 min)**: *"Thanks for taking the time, John. The goal today is to learn about {{company_name}}'s growth targets, share a few insights, and see if ProFox is a good fit. Fair?"*
3. **Business Context & Goals**: Ask about current business size, active marketing channels, and 12-month revenue goals.
4. **Current Lead Journey**: Walk through how prospective customers currently find and interact with their site.
5. **Identify Website Pain & Friction**: Where do inquiries drop off? What issues frustrate their team?
6. **Quantify Cost of Inaction**: *"What is a single lost client worth to your business? If slow mobile performance loses 3 leads a month, what does that cost annually?"*
7. **Define Desired Outcome**: Establish what success looks like in 6 months.
8. **Recommend Package Direction**: Present the matching catalog solution (**Launch $599+**, **Growth $2,379+**, **Scale $5,799+**, **Discovery Sprint $1,499+**).
9. **Agree Next Step**: Set a firm follow-up call to review the formal CRM quotation.

---

### 9 Core Diagnostic Questions:
1. *"What is the primary commercial goal of your website today?"*
2. *"Where do most of your qualified inquiries currently come from?"*
3. *"What happens after a prospective client lands on your homepage on mobile?"*
4. *"Are there specific technical or design issues bothering you on your current site?"*
5. *"Are you currently running Google Ads, Meta Ads, or SEO campaigns to drive traffic?"*
6. *"How many inquiries per month do you currently capture through your online forms?"*
7. *"What is the average lifetime value of a new client for your business?"*
8. *"Who else in your organization will be involved in evaluating this web development project?"*
9. *"What target timeline do you have in mind for launching the new digital platform?"*

---

### CRM Note-Taking Discipline:
Log every answer in the ProFox CRM under the Lead/Opportunity record immediately following the call.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm10',
    title: 'Call Practice',
    slug: 'call-practice',
    description: 'Interactive roleplay scenarios for Roofing, Dental Clinics, and B2B Consultancies.',
    module_type: 'practical',
    sort_order: 10,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l10_1',
        title: '3 Real-World Practice Scenarios & Discovery Roleplay',
        content: `
# ProFox Discovery Call Roleplay Scenarios

Master your discovery call flow by reviewing these 3 real-world sales scenarios:

---

### Scenario A — Roofing Contractor (Apex Roofing Co)
- **Profile**: Owner generating $1.8M/yr, spending $3k/mo on Google Ads, but mobile site takes 5 seconds to load.
- **Pain Point**: High ad spend with low inquiry conversion; losing storm leads to local competitors.
- **Objection**: *"We spend a lot on Google Ads, why do we need a new site?"*
- **Recommended Solution**: **ProFox Growth ($2,379+)** with emergency mobile estimate bar.
- **Discovery Strategy**: Show how cutting load speed from 5s to 1.8s doubles ad lead conversions.

---

### Scenario B — Dental Clinic (Horizon Dental & Wellness)
- **Profile**: Lead Dentist looking to attract 10 new Invisalign/Implant patients per month ($5k/case).
- **Pain Point**: Generic website lacks smile transformation showcases; front desk spends hours answering basic calls.
- **Objection**: *"Our site was built 3 years ago and works fine."*
- **Recommended Solution**: **ProFox Growth ($2,379+)** or **Scale ($5,799+)** with patient intake & cosmetic showcase.
- **Discovery Strategy**: Demonstrate how 1 extra implant case pays for the entire website investment.

---

### Scenario C — Established B2B Consultancy (Apex Global Advisory)
- **Profile**: Managing Partner at a 25-employee corporate consulting firm; site looks like 2014.
- **Pain Point**: Lacks modern authority brand; enterprise prospects question digital credibility during referral diligence.
- **Objection**: *"We get all our clients through referrals, so our site doesn't matter much."*
- **Recommended Solution**: **ProFox Scale ($5,799+)** or **Discovery Sprint ($1,499+)**.
- **Discovery Strategy**: Explain how high-value enterprise buyers validate referrals online before signing $50k retainers.

---

### Roleplay Practice Guide
Review each scenario profile and practice asking diagnostic questions until your presentation is fluent and confident.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm11',
    title: 'Mock Sales Call Test',
    slug: 'mock-sales-call-test',
    description: 'Practical certification evaluated by Admin out of 100 across 9 criteria (75 pass threshold).',
    module_type: 'practical',
    sort_order: 11,
    required: true,
    active: true,
    passing_score: 75,
    requires_admin_review: true,
    lessons: [
      {
        id: 'l11_1',
        title: 'Mock Sales Call Certification',
        content: `
# Mock Sales Call Certification

Submit your recorded or live mock sales call for Admin evaluation.

### Admin Evaluation Categories (Score out of 100):
1. **Opening & Agenda** (10 pts)
2. **Confidence & Tone** (10 pts)
3. **Discovery Questioning** (15 pts)
4. **Active Listening** (10 pts)
5. **Problem Identification** (15 pts)
6. **Value Presentation** (10 pts)
7. **Objection Handling** (10 pts)
8. **Closing & Next Steps** (10 pts)
9. **Professional Communication** (10 pts)

**Pass Score**: 75/100. If failed, Admin feedback will be provided and retries are permitted.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm12',
    title: 'Product Presentation',
    slug: 'product-presentation',
    description: 'Diagnose before prescribing: Problem → Impact → Recommendation → Package → Add-ons → Next Step.',
    module_type: 'lesson',
    sort_order: 12,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l12_1',
        title: 'Product Presentation Framework',
        content: `
# Product Presentation Framework

Never present a package without linking it to the prospect's stated pain.

### Framework:
1. **Summarize Problem**: "You mentioned losing 40% of mobile visitors due to slow load speed..."
2. **Confirm Impact**: "...which costs roughly $12,000/mo in lost roofing jobs."
3. **Present Recommendation**: "To fix this, we recommend ProFox Growth..."
4. **Show Deliverables**: Up to 15 pages, sub-2s speed, emergency booking widget.
5. **Add-ons**: Include care plan or calculator if relevant.
6. **Next Step**: "Shall we prepare the formal quotation for your review today?"
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm13',
    title: 'Objection Handling',
    slug: 'objection-handling',
    description: 'Handling 8 common objections using Acknowledge → Clarify → Respond → Confirm → Next Step.',
    module_type: 'lesson',
    sort_order: 13,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l13_1',
        title: '5-Step Objection Response Formula',
        content: `
# 5-Step Objection Response Formula

1. **Acknowledge**: "I completely understand..."
2. **Clarify**: "When you say it's too expensive, are you comparing it to a freelancer or looking at ROI?"
3. **Respond**: Reframe cost as a revenue investment.
4. **Confirm**: "Does that make sense?"
5. **Next Step**: Move back to agreement.

### Common Objections Covered:
- Too expensive
- Need to think
- Another agency is cheaper
- Already have developer
- No budget right now
- Need partner approval
- Send information first
- Not now
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm14',
    title: 'Closing Training',
    slug: 'closing-training',
    description: 'Professional closing strategies, securing commitment, and avoiding aggressive pressure.',
    module_type: 'lesson',
    sort_order: 14,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l14_1',
        title: 'Consultative Closing Strategies',
        content: `
# Consultative Closing Strategies

At ProFox, we do not use pushy high-pressure sales tactics. We facilitate natural, logical decisions.

### Effective Closing Techniques:
1. **The Summary Close**: "We agree that fixing mobile speed and adding the quote widget will generate ~8 extra leads/mo. Package price is $5,000. Shall we kick off dev next Monday?"
2. **The Calendar Close**: "Our senior UI/UX designer has an opening starting next week. If we finalize the advance deposit today, we can lock in your delivery date for the 25th."
3. **The Next Step Close**: "I will generate the official ProFox quotation right now. Once approved, you can complete the deposit online."
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm15',
    title: 'Quotation Process',
    slug: 'quotation-process',
    description: 'Step-by-step quotation engine workflow and non-negotiable sales rules.',
    module_type: 'lesson',
    sort_order: 15,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l15_1',
        title: 'ProFox Quotation Engine Workflow',
        content: `
# ProFox Quotation Engine Workflow

### Sequence:
1. **Opportunity**: Ensure deal is in Qualification or Proposal stage.
2. **Requirements Confirmed**: Select package, scope, add-ons.
3. **Create Quotation Draft**: Generate draft in Quotations Manager.
4. **Submit for Admin Approval**: All quotations MUST be Admin-approved before sending to client.
5. **Send to Client**: Once Admin approves, client receives secure quote link.

### Non-Negotiables:
- No unauthorized price drops.
- No self-approval.
- Custom pricing requires Admin review.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm16',
    title: 'Payment Process',
    slug: 'payment-process',
    description: 'Payment requests, company payment links, Admin verification, and Won opportunity status.',
    module_type: 'lesson',
    sort_order: 16,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l16_1',
        title: 'Payment Verification & Opportunity Won Protocol',
        content: `
# Payment Verification & Opportunity Won Protocol

### Flow:
1. **Accepted Quotation**: Client accepts quotation.
2. **Payment Request**: Generate official payment link.
3. **Customer Pays**: Deposit received.
4. **Admin Verifies**: Admin checks bank/gateway and verifies payment.
5. **Opportunity Won**: System automatically marks Opportunity as Won and provisions Client record.

### Strict Rules:
- Sales reps CANNOT verify payments.
- Cannot change verified amount.
- Cannot use personal payment accounts.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm17',
    title: 'CRM Training',
    slug: 'crm-training',
    description: 'Managing leads, opportunities, pipelines, activities, and client communication in ProFox CRM.',
    module_type: 'practical',
    sort_order: 17,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l17_1',
        title: 'CRM Pipeline Excellence & Practice',
        content: `
# CRM Pipeline Excellence

Learn how to maintain clean pipeline hygiene:
- Move deals between stages (Lead → Qualification → Proposal → Negotiation → Won).
- Log every call, email, and meeting activity.
- Keep opportunity expected value and closing dates updated.

### Practical CRM Workflow Walkthrough
1. Create demo lead & research notes
2. Add Loom video link
3. Log outreach activity
4. Qualify lead to Opportunity
5. Add meeting & update requirements
6. Draft quotation
7. Check payment status
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm18',
    title: 'Calendar / Meeting Setup',
    slug: 'calendar-meeting-setup',
    description: 'Complete your 9-point setup checklist (timezone, working hours, booking link, camera/mic).',
    module_type: 'practical',
    sort_order: 18,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l18_1',
        title: 'Meeting Tooling & Professional Setup',
        content: `
# Meeting Tooling & Professional Setup

Complete all 9 checklist items in the interactive checklist below to verify your meeting readiness:
1. Timezone set
2. Working hours entered
3. Approved booking link added
4. Zoom / Google Meet capability confirmed
5. Microphone checked
6. Camera checked
7. Professional display name
8. Professional email signature ready
9. Test booking completed
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm19',
    title: 'Confidentiality & Data Protection',
    slug: 'confidentiality-data-protection',
    description: 'Protecting client data, password security, trade secrets, and compliance.',
    module_type: 'lesson',
    sort_order: 19,
    required: true,
    active: true,
    requires_admin_review: false,
    lessons: [
      {
        id: 'l19_1',
        title: 'Data Protection & Trade Secrets',
        content: `
# Data Protection & Trade Secrets

### Standards:
- All client files, proposals, and contact details are strictly confidential.
- Use strong, unique passwords and 2FA where available.
- Never download client databases to personal devices.
- Adhere to GDPR / privacy regulations when collecting prospect data.
`,
        sort_order: 1
      }
    ]
  },
  {
    id: 'm20',
    title: 'Final Certification',
    slug: 'final-certification',
    description: 'Review all completed milestones and request Management Final Approval for CRM activation.',
    module_type: 'practical',
    sort_order: 20,
    required: true,
    active: true,
    requires_admin_review: true,
    lessons: [
      {
        id: 'l20_1',
        title: 'Final Onboarding Checklist & Activation',
        content: `
# Final Onboarding Checklist & Activation

Once all 20 required onboarding modules and practical tests have passed, click **Request Final Approval**.

An Admin will review your complete training transcript and execute **Approve & Activate**, granting you full production access as an active ProFox Sales Representative.
`,
        sort_order: 1
      }
    ]
  }
];
