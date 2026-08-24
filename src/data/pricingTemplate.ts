export const defaultPricingTemplateData = {
  hero: {
    eyebrow: 'Website Design & Development Pricing',
    quote: 'A better website should make your business easier to understand, easier to trust, and easier to choose.',
    // Current starting investment is injected from the live Sales Catalog.
    highlight: '',
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
  plansEyebrow: 'Clear starting points',
  plansHeading: 'Choose the right website package',
  plansDescription: 'Start with the outcome you need today. We can expand the scope when your growth plan calls for more.',
  planLabels: {
    popular: 'Popular',
    bestFor: 'Best for',
    included: 'What is included',
    technology: 'Typical technology'
  },
  // Package cards are deliberately empty here. Sales Catalog owns all package-specific
  // names, prices, inclusions, descriptions, CTAs, technologies and public metadata.
  plans: [],
  comparison: {
    eyebrow: 'Detailed comparison',
    title: 'Compare website packages',
    description: 'Use this table to find the closest starting point. We will confirm the precise scope with you before work begins.',
    tableHeaderLabel: 'Plans & features',
    note: 'Package details are planning guides. The approved proposal and scope are the final source of truth for your project.',
    // The Pricing template owns only the comparison structure/labels. Every package
    // value is injected from sales_products.public_details.comparison.
    categories: [
      { name: 'Foundation', rows: [
        { label: 'Starting price', values: [] },
        { label: 'Professional design', values: [] },
        { label: 'Responsive design', values: [] },
        { label: 'Pages', values: [] }
      ]},
      { name: 'Strategy & experience', rows: [
        { label: 'Business discovery', values: [] },
        { label: 'Competitor research', values: [] },
        { label: 'Custom UI/UX', values: [] },
        { label: 'Wireframes', values: [] },
        { label: 'Customer journey strategy', values: [] },
        { label: 'Copywriting', values: [] }
      ]},
      { name: 'Growth & technology', rows: [
        { label: 'SEO foundation', values: [] },
        { label: 'Search & AI discovery structure', values: [] },
        { label: 'Conversion strategy', values: [] },
        { label: 'Analytics', values: [] },
        { label: 'Standard integrations', values: [] },
        { label: 'Advanced animation', values: [] },
        { label: 'E-commerce', values: [] },
        { label: 'User login / dashboard', values: [] },
        { label: 'Custom backend', values: [] }
      ]},
      { name: 'Delivery & support', rows: [
        { label: 'Quality assurance', values: [] },
        { label: 'Revision process', values: [] },
        { label: 'Post-launch support', values: [] },
        { label: 'Typical technology', values: [] }
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
    paymentDescription: 'Choose a package to see how its current approved investment is divided across delivery milestones.',
    selectedPackageLabel: 'Selected package',
    milestoneLabel: 'Milestone',
    milestonesLabel: 'Milestones',
    // Package payment schedules are injected from Sales Catalog.
    paymentPlans: [],
    transparencyTitle: 'No hidden surprises',
    transparencyDescription: 'Your quotation identifies what is included. Any request outside the approved scope is discussed before additional work or charges are authorized.',
    thirdPartyTitle: 'Third-party costs are separate unless specifically included',
    thirdPartyCosts: ['Domain registration', 'Hosting', 'Premium plugins', 'Third-party applications', 'SaaS subscriptions', 'Stock media', 'API usage', 'Payment-provider charges', 'External licenses']
  },
  carePlans: {
    eyebrow: 'Support after launch',
    title: 'Keep your website healthy, current, and improving.',
    description: 'When you need ongoing maintenance and improvement, choose the current ProFox Care level that matches how actively your business uses its website.',
    // Care-plan price, period, features and public metadata are injected from Sales Catalog.
    plans: [],
    note: 'Care-plan work follows the inclusions on the selected current catalog plan. Larger features, redesigns, integrations, and development projects are scoped separately before work begins.'
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
      { question: 'Is the starting price the final project price?', answer: 'The starting price shown from the current Sales Catalog is the minimum investment for that package. Your final fixed project price is confirmed after we agree on pages, functionality, content, integrations, technology, and timeline.' },
      { question: 'How do I know which package is right for me?', answer: 'Tell us what the website must achieve, what is not working today, and what functionality you need. We will recommend the smallest sensible current package and explain why.' },
      { question: 'Can a package be customized?', answer: 'Yes. The packages are clear starting points, not rigid boxes. We can adjust scope, remove items you do not need, or quote additional functionality separately.' },
      { question: 'Are hosting, domains, and paid tools included?', answer: 'Check the current package inclusions shown above. Third-party subscriptions, domain registration, hosting, premium plugins, and paid platforms are identified before approval and listed separately whenever they are required.' },
      { question: 'Can you redesign an existing website?', answer: 'Yes. We can audit your current website, preserve valuable content and search equity, and rebuild the experience around clearer customer journeys and stronger performance.' },
      { question: 'Do you offer payment milestones?', answer: 'Yes. Each current package displays its approved payment milestones from the Sales Catalog. Custom-project milestones follow the approved quotation and delivery phases.' },
      { question: 'Will you confirm the final cost before starting?', answer: 'Yes. Your project scope, deliverables, exclusions, pricing, and payment milestones are confirmed before development begins.' },
      { question: 'Do I have to purchase add-ons?', answer: 'No. Add-ons are optional and are recommended only when they directly support your business requirements.' },
      { question: 'Which technology will you use?', answer: 'We select technology around the project rather than forcing every business into one platform. Typical technologies for each current package are shown in its package card above.' },
      { question: 'Can I upgrade my package?', answer: 'Yes. A project can move to a higher available package when requirements grow before the final scope is approved.' },
      { question: 'Do you build WordPress and custom-coded websites?', answer: 'Yes. We choose the implementation approach that best fits the approved scope, maintainability, integrations, performance, and long-term business requirements.' },
      { question: 'Do you build e-commerce websites?', answer: 'Yes. E-commerce can be included or added when it fits the approved package and project scope. More complex commerce requirements can be scoped as a custom project.' },
      { question: 'Do you guarantee SEO rankings?', answer: 'No reputable provider can guarantee a particular organic ranking. We build strong technical and content foundations and can scope additional SEO support around your requirements.' },
      { question: 'Who owns the website?', answer: 'Ownership, licenses, third-party services, credentials, and transfer terms are defined clearly in the approved agreement and quotation.' },
      { question: 'What happens after launch?', answer: 'Post-launch support follows the current inclusion shown for the selected package. Ongoing maintenance, monitoring, updates, and improvement are available through the current ProFox Care plans.' },
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
