export const defaultPricingTemplateData = {
  hero: {
    eyebrow: 'Website Design & Development Pricing',
    quote: 'A better website should make your business easier to understand, easier to trust, and easier to choose.',
    highlight: 'Starting at $599.',
    description: 'Choose the level of strategy, design, functionality, and support your business needs. Every ProFox website is professionally designed and developed—the packages simply reflect how deep the strategy, customization, integrations, and support need to go.',
    primaryCtaText: 'View Website Packages',
    primaryCtaUrl: '#website-packages',
    secondaryCtaText: 'Get a Custom Recommendation',
    secondaryCtaUrl: '/contact-us',
    note: 'Your final investment is confirmed after we understand and approve the project scope together.',
    reviewLabel: 'Client-reviewed website strategy, design, and development',
    trustedFallbackTitle: 'Trusted by:'
  },
  assurance: {
    eyebrow: 'Simple, transparent pricing',
    title: 'Know what you are investing in before development begins.',
    description: 'We start with the package closest to your needs, then adjust only what your business genuinely requires. No confusing hourly estimates. No surprise upgrades after work begins. No unnecessary features added to inflate the project.',
    points: ['Business and website goals', 'Page count and content requirements', 'Required functionality and integrations', 'Design direction and technology', 'Delivery timeline', 'Approved final project investment']
  },
  plansEyebrow: 'Four clear starting points',
  plansHeading: 'Choose the right website package',
  plansDescription: 'Start with the outcome you need today. We can expand the scope when your growth plan calls for more.',
  planLabels: {
    popular: 'Popular',
    bestFor: 'Best for',
    included: 'What is included',
    technology: 'Typical technology'
  },
  plans: [
    {
      id: 'launch',
      name: 'ProFox Launch',
      price: '$599',
      pricePrefix: 'Starting at',
      badge: 'Professional foundation',
      summary: 'A credible, modern website for businesses that need to look established and make it easy for customers to get in touch.',
      bestFor: 'Small businesses, startups, consultants, local service companies, and independent professionals.',
      features: ['Up to 5 core pages', 'Business requirements discovery', 'Professional customized design', 'Responsive desktop, tablet, and mobile experience', 'Content refinement for included pages', 'Conversion-focused page structure', 'Contact, call, email, social, and WhatsApp actions', 'SEO titles, descriptions, headings, and search-friendly URLs', 'XML sitemap, image, performance, and browser optimization', 'Analytics and Search Console setup where applicable', '2 structured revision rounds', '14 days of post-launch support'],
      technologies: [
        { name: 'WordPress', logoUrl: 'https://cdn.simpleicons.org/wordpress/21759B' },
        { name: 'Google Analytics', logoUrl: 'https://cdn.simpleicons.org/googleanalytics/E37400' },
        { name: 'Google Search Console', logoUrl: 'https://cdn.simpleicons.org/google/4285F4' }
      ],
      quote: 'We need a professional website that clearly explains our business and helps customers contact us.',
      ctaText: 'Start With Launch',
      ctaUrl: '/contact-us',
      featured: false
    },
    {
      id: 'growth',
      name: 'ProFox Growth',
      price: '$2,379',
      pricePrefix: 'Starting at',
      badge: 'Most popular',
      summary: 'A custom, conversion-focused website for businesses that expect their digital presence to generate trust, enquiries, and measurable growth.',
      bestFor: 'Established companies, clinics, hospitality, real estate, home services, professional services, and lead-focused B2B teams.',
      features: ['Everything in Launch', 'Detailed strategy, audience, and competitor analysis', 'Customer journey, sitemap, and information architecture', 'Approximately 10–12 agreed pages', 'Fully custom UI/UX and key-page wireframes', 'Custom homepage and service-page layouts', 'Conversion copywriting and message refinement', 'Strategic calls to action, FAQs, and trust content', 'Keyword research and page-level SEO planning', 'Enhanced on-page SEO and internal linking', 'Structured data where appropriate', 'Conversion, form, call, and email tracking', 'Up to 2 standard integrations', '3 structured revision rounds', '30 days of priority post-launch support'],
      technologies: [
        { name: 'WordPress', logoUrl: 'https://cdn.simpleicons.org/wordpress/21759B' },
        { name: 'WooCommerce', logoUrl: 'https://cdn.simpleicons.org/woocommerce/96588A' },
        { name: 'Shopify', logoUrl: 'https://cdn.simpleicons.org/shopify/7AB55C' },
        { name: 'Webflow', logoUrl: 'https://cdn.simpleicons.org/webflow/4353FF' }
      ],
      quote: 'Our website needs to generate leads, improve credibility, and actively support business growth.',
      ctaText: 'Choose Growth',
      ctaUrl: '/contact-us',
      featured: true
    },
    {
      id: 'scale',
      name: 'ProFox Scale',
      price: '$5,799+',
      pricePrefix: 'Starting at',
      badge: 'Premium growth system',
      summary: 'A differentiated digital experience for established organizations that need advanced UX, deeper strategy, and scalable technology.',
      bestFor: 'Growing brands, technology companies, SaaS teams, premium providers, multi-location businesses, and organizations in digital transformation.',
      features: ['Everything in Growth', 'Stakeholder discovery and deep competitor benchmarking', 'Website, UX, content-gap, conversion-path, and analytics review', 'Advanced information architecture and journey mapping', 'Full key-page wireframing and interactive prototyping', 'Premium bespoke UI and custom visual direction', 'Design system and reusable component library', 'Advanced responsive behavior and micro-interactions', 'Premium animation strategy within scope', 'Advanced conversion copywriting and technical SEO', 'Search and AI-discovery content structure', 'Advanced lead qualification and event architecture', 'Multiple approved integrations', 'Enhanced accessibility and performance implementation', '50+ point pre-launch QA process', 'Milestone-based review and approval', '60 days of priority post-launch support'],
      technologies: [
        { name: 'Next.js', logoUrl: 'https://cdn.simpleicons.org/nextdotjs/000000' },
        { name: 'React', logoUrl: 'https://cdn.simpleicons.org/react/087EA4' },
        { name: 'TypeScript', logoUrl: 'https://cdn.simpleicons.org/typescript/3178C6' },
        { name: 'Supabase', logoUrl: 'https://cdn.simpleicons.org/supabase/3FCF8E' },
        { name: 'Cloudflare', logoUrl: 'https://cdn.simpleicons.org/cloudflare/F38020' }
      ],
      quote: 'Our website is a serious part of our sales, marketing, brand, and growth strategy.',
      ctaText: 'Discuss Scale',
      ctaUrl: '/contact-us',
      featured: false
    },
    {
      id: 'custom',
      name: 'Custom Digital Experience',
      price: 'Custom quote',
      pricePrefix: 'Scoped for your system',
      badge: 'Beyond a traditional website',
      summary: 'For portals, dashboards, SaaS products, booking platforms, marketplaces, and business systems that need custom product design and engineering.',
      bestFor: 'Organizations building a platform, portal, dashboard, workflow, multi-user product, or custom application.',
      features: ['Product discovery and requirements', 'Customer, employee, vendor, or partner portals', 'Admin dashboards and custom reporting', 'Authentication and role-based permissions', 'Custom databases and backend architecture', 'SaaS and subscription systems', 'Complex booking, commerce, and payment workflows', 'CRM, ERP, and custom API integrations', 'Workflow automation and webhooks', 'UX, wireframes, UI design, and technical architecture', 'QA, user acceptance testing, documentation, and training', 'Project-specific launch and support plan'],
      technologies: [
        { name: 'React', logoUrl: 'https://cdn.simpleicons.org/react/087EA4' },
        { name: 'Node.js', logoUrl: 'https://cdn.simpleicons.org/nodedotjs/5FA04E' },
        { name: 'ASP.NET Core', logoUrl: 'https://cdn.simpleicons.org/dotnet/512BD4' },
        { name: 'PostgreSQL', logoUrl: 'https://cdn.simpleicons.org/postgresql/4169E1' },
        { name: 'Firebase', logoUrl: 'https://cdn.simpleicons.org/firebase/DD2C00' },
        { name: 'Cloudflare', logoUrl: 'https://cdn.simpleicons.org/cloudflare/F38020' }
      ],
      quote: 'We need a system, platform, portal, dashboard, or custom application—not just a website.',
      ctaText: 'Discuss Your Custom Project',
      ctaUrl: '/contact-us',
      featured: false
    }
  ],
  comparison: {
    eyebrow: 'Detailed comparison',
    title: 'Compare website packages',
    description: 'Use this table to find the closest starting point. We will confirm the precise scope with you before work begins.',
    tableHeaderLabel: 'Plans & features',
    note: 'Package details are planning guides. The approved proposal and scope are the final source of truth for your project.',
    categories: [
      { name: 'Foundation', rows: [
        { label: 'Starting price', values: ['$599', '$2,379', '$5,799+', 'Custom'] },
        { label: 'Professional design', values: ['Included', 'Included', 'Included', 'Included'] },
        { label: 'Responsive design', values: ['Included', 'Included', 'Included', 'Included'] },
        { label: 'Pages', values: ['Up to 5', 'Approx. 10–12', 'Scope based', 'Scope based'] }
      ]},
      { name: 'Strategy & experience', rows: [
        { label: 'Business discovery', values: ['Basic', 'Detailed', 'Strategic', 'Deep discovery'] },
        { label: 'Competitor research', values: ['Basic', 'Included', 'Advanced', 'Project specific'] },
        { label: 'Custom UI/UX', values: ['Customized system', 'Fully custom', 'Premium bespoke', 'Product UX/UI'] },
        { label: 'Wireframes', values: ['—', 'Key pages', 'Advanced', 'Included'] },
        { label: 'Customer journey strategy', values: ['—', 'Included', 'Advanced', 'Included'] },
        { label: 'Copywriting', values: ['Included', 'Conversion focused', 'Advanced', 'Project specific'] }
      ]},
      { name: 'Growth & technology', rows: [
        { label: 'SEO foundation', values: ['Included', 'Enhanced', 'Advanced', 'Project specific'] },
        { label: 'Search & AI discovery structure', values: ['—', 'Basic', 'Advanced', 'Project specific'] },
        { label: 'Conversion strategy', values: ['Basic', 'Included', 'Advanced', 'Custom'] },
        { label: 'Analytics', values: ['Basic', 'Advanced', 'Advanced', 'Custom'] },
        { label: 'Standard integrations', values: ['Basic', 'Up to 2', 'Multiple', 'Custom'] },
        { label: 'Advanced animation', values: ['—', 'Limited', 'Included', 'Included'] },
        { label: 'E-commerce', values: ['Add-on', 'Add-on', 'Available', 'Custom'] },
        { label: 'User login / dashboard', values: ['—', '—', 'Separate scope', 'Included'] },
        { label: 'Custom backend', values: ['—', '—', 'Separate scope', 'Included'] }
      ]},
      { name: 'Delivery & support', rows: [
        { label: 'Quality assurance', values: ['Standard', 'Comprehensive', '50+ point QA', 'Full QA / UAT'] },
        { label: 'Revision process', values: ['2 rounds', '3 rounds', 'Milestone based', 'Milestone based'] },
        { label: 'Post-launch support', values: ['14 days', '30 days', '60 days', 'Project specific'] },
        { label: 'Typical technology', values: ['WordPress', 'WordPress / Shopify / Webflow', 'Custom / Headless / Next.js', 'Project architecture'] }
      ]}
    ]
  },
  pricingProcess: {
    eyebrow: 'How pricing works',
    title: 'A clear path from package to approved scope.',
    description: 'You do not need to define every technical detail before talking with us. We turn your business requirements into a documented scope, investment, and delivery plan before work begins.',
    stepLabel: 'Step',
    currentStageLabel: 'Current stage',
    desktopHint: 'Hover or focus a stage to explore',
    mobileJourneyLabel: 'Scroll through the journey',
    mobileJourneyHint: 'Every stage opens automatically.',
    steps: [
      { number: '01', title: 'Choose a starting package', description: 'Select the package that most closely matches what your business needs today.' },
      { number: '02', title: 'Tell us what you need', description: 'We review your business, goals, pages, functionality, integrations, content, technology, and preferred timeline.' },
      { number: '03', title: 'We confirm the scope', description: 'You receive a clear project scope, quotation, deliverables, exclusions, and milestone plan.' },
      { number: '04', title: 'You approve before work begins', description: 'Nothing additional is added without discussion and written approval.' },
      { number: '05', title: 'Your project enters delivery', description: 'Once the agreed initial payment is received, your project moves into our delivery process.' }
    ]
  },
  scopeAndPayment: {
    eyebrow: 'Complete cost clarity',
    title: 'Understand what can change the investment.',
    description: 'Starting prices assume the package’s documented scope. If your project needs more depth, functionality, content, or speed, we confirm the effect before you approve the quotation.',
    priceFactorsTitle: 'Requirements that can change the final price',
    scopeMapLabel: 'Scope map',
    considerationsLabel: 'considerations',
    selectedAreaLabel: 'Selected area',
    scopeGroups: [
      { title: 'Experience & content', description: 'Pages, messaging, design depth, and visual production.' },
      { title: 'Commerce & workflows', description: 'Transactions, bookings, products, and customer journeys.' },
      { title: 'Systems & integrations', description: 'Accounts, data, platforms, APIs, and custom engineering.' },
      { title: 'Reach & delivery', description: 'Markets, discoverability, locations, and delivery speed.' }
    ],
    priceFactors: ['Additional pages', 'More unique page designs', 'Advanced content strategy', 'Complex copywriting', 'Advanced animations', 'E-commerce and additional products', 'Booking functionality', 'Membership or login areas', 'Custom databases', 'CRM and API integrations', 'Payment systems', 'Multiple languages or locations', 'Advanced SEO', 'Large content migration', 'Custom graphics', 'Accelerated delivery', 'Custom backend development'],
    paymentTitle: 'Typical payment structure',
    paymentJourneyLabel: 'Payment journey',
    paymentDescription: 'Choose a package to see how its approved investment is typically divided across delivery milestones.',
    selectedPackageLabel: 'Selected package',
    milestoneLabel: 'Milestone',
    milestonesLabel: 'Milestones',
    paymentPlans: [
      { name: 'ProFox Launch', milestones: ['50% to begin', '50% before launch'] },
      { name: 'ProFox Growth', milestones: ['50% to begin', '30% after design approval', '20% before launch'] },
      { name: 'ProFox Scale', milestones: ['40% to begin', '30% after design approval', '20% after staging approval', '10% before launch'] },
      { name: 'Custom Digital Experience', milestones: ['Milestones follow the approved scope and delivery phases'] }
    ],
    transparencyTitle: 'No hidden surprises',
    transparencyDescription: 'Your quotation identifies what is included. Any request outside the approved scope is discussed before additional work or charges are authorized.',
    thirdPartyTitle: 'Third-party costs are separate unless specifically included',
    thirdPartyCosts: ['Domain registration', 'Hosting', 'Premium plugins', 'Third-party applications', 'SaaS subscriptions', 'Stock media', 'API usage', 'Payment-provider charges', 'External licenses']
  },
  carePlans: {
    eyebrow: 'Support after launch',
    title: 'Keep your website healthy, current, and improving.',
    description: 'Every project includes an initial support period. When you need ongoing maintenance and improvement after that period, choose the ProFox Care level that matches how actively your business uses its website.',
    plans: [
      { id: 'care', name: 'ProFox Care', price: '$99', period: '/month', badge: 'Reliable website care', description: 'For businesses that need dependable maintenance and a clear support channel.', features: ['Routine website maintenance', 'Updates where applicable', 'Backup checks where supported', 'Basic monitoring', 'Up to 1 hour of small website changes per month', 'Standard support'], ctaText: 'Choose Care', ctaUrl: '/contact-us', featured: false },
      { id: 'growth-care', name: 'ProFox Growth Care', price: '$249', period: '/month', badge: 'For active marketing websites', description: 'For businesses using their website consistently for marketing, enquiries, and lead generation.', features: ['Everything in ProFox Care', 'Up to 3 hours of small website changes per month', 'Performance review', 'Analytics review', 'Basic SEO and conversion checks', 'Priority support'], ctaText: 'Choose Growth Care', ctaUrl: '/contact-us', featured: true },
      { id: 'priority-care', name: 'ProFox Priority Care', price: '$499', period: '/month', badge: 'Ongoing improvement', description: 'For businesses that want priority service and proactive website improvement throughout the year.', features: ['Everything in Growth Care', 'Up to 6 hours of website work per month', 'Priority service queue', 'Proactive improvement recommendations', 'Performance monitoring', 'Conversion and analytics review', 'Quarterly website strategy review'], ctaText: 'Choose Priority Care', ctaUrl: '/contact-us', featured: false }
    ],
    note: 'Care-plan work covers reasonable updates within the included monthly time. Larger features, redesigns, integrations, and development projects are scoped separately before work begins.'
  },
  recommendation: {
    eyebrow: 'Not sure which package fits?',
    title: 'Tell us the business outcome. We will recommend the right starting point.',
    description: 'You do not need to understand web technology before talking with us. Share the context below and we will recommend the smallest sensible approach without unnecessary upgrades or technical confusion.',
    promptTitle: 'Tell us:',
    prompts: ['What your business does', 'What you want the website to achieve', 'What is not working today', 'Any functionality or integrations you need'],
    ctaText: 'Get My Recommendation',
    ctaUrl: '/contact-us'
  },
  faq: {
    eyebrow: 'Questions before you choose',
    title: 'Website pricing, explained clearly.',
    items: [
      { question: 'Is the starting price the final project price?', answer: 'The starting price shows the minimum investment for that package. Your final fixed project price is confirmed after we agree on pages, functionality, content, integrations, technology, and timeline.' },
      { question: 'How do I know which package is right for me?', answer: 'Tell us what the website must achieve, what is not working today, and what functionality you need. We will recommend the smallest sensible package and explain why.' },
      { question: 'Can a package be customized?', answer: 'Yes. The packages are clear starting points, not rigid boxes. We can adjust scope, remove items you do not need, or quote additional functionality separately.' },
      { question: 'Are hosting, domains, and paid tools included?', answer: 'Third-party subscriptions, domain registration, hosting, premium plugins, and paid platforms are identified before approval and listed separately whenever they are required.' },
      { question: 'Can you redesign an existing website?', answer: 'Yes. We can audit your current website, preserve valuable content and search equity, and rebuild the experience around clearer customer journeys and stronger performance.' },
      { question: 'Do you offer payment milestones?', answer: 'Yes. Launch typically uses two payments, while Growth and Scale use documented design, staging, and launch milestones. Custom-project milestones follow the approved delivery phases.' },
      { question: 'Will you confirm the final cost before starting?', answer: 'Yes. Your project scope, deliverables, exclusions, pricing, and payment milestones are confirmed before development begins.' },
      { question: 'Do I have to purchase add-ons?', answer: 'No. Add-ons are optional and are recommended only when they directly support your business requirements.' },
      { question: 'Which technology will you use?', answer: 'We select technology around the project rather than forcing every business into one platform. Depending on the requirements, that may include WordPress, WooCommerce, Shopify, Webflow, Next.js, React, a headless CMS, or a custom stack.' },
      { question: 'Can I upgrade my package?', answer: 'Yes. A project can move to a higher package when requirements grow before the final scope is approved.' },
      { question: 'Do you build WordPress and custom-coded websites?', answer: 'Yes. WordPress is a strong option for many content-driven business websites. Scale and Custom projects can also use Next.js, React, TypeScript, ASP.NET Core, Supabase, PostgreSQL, Firebase, and other appropriate technologies.' },
      { question: 'Do you build e-commerce websites?', answer: 'Yes. E-commerce can be added to a suitable package or scoped as a Scale or Custom project depending on catalog size, payments, integrations, fulfillment, and workflow complexity.' },
      { question: 'Do you guarantee SEO rankings?', answer: 'No reputable provider can guarantee a particular organic ranking. We build strong technical and content foundations and can scope additional SEO support around your requirements.' },
      { question: 'Who owns the website?', answer: 'Ownership, licenses, third-party services, credentials, and transfer terms are defined clearly in the approved agreement and quotation.' },
      { question: 'What happens after launch?', answer: 'Every website package includes an initial post-launch support period. Ongoing maintenance, monitoring, updates, and improvement are available through ProFox Care plans.' },
      { question: 'Can you improve an existing website without rebuilding everything?', answer: 'Yes. We review the current website first, then recommend whether focused improvements, a redesign, migration, or rebuilding will produce the better business outcome.' }
    ]
  },
  closing: {
    eyebrow: 'A better website should do more than look good',
    title: 'Give customers a clear reason to understand you, trust you, and take the next step.',
    description: 'Share your goals, required pages, functionality, and timeline. We will respond with a practical recommendation—without pushing unnecessary scope.',
    ctaText: 'Start Your Project',
    ctaUrl: '/contact-us',
    secondaryCtaText: 'Request a Custom Recommendation',
    secondaryCtaUrl: '/contact-us'
  }
};
