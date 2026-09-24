import { NavItem, Service, Client, CaseStudy, PortfolioItem, PortfolioCategory, CustomPage } from './types';
import { DEFAULT_MAIN_NAVIGATION } from './lib/siteNavigation';
import { defaultPricingTemplateData } from './data/pricingTemplate';

export const navItems: NavItem[] = DEFAULT_MAIN_NAVIGATION;

export const services: Service[] = [
  {
    id: 'digital-experience',
    title: 'Turn your website into a 24/7 salesperson that builds trust and drives growth.',
    subtitle: '',
    description: 'Website Design & Development',
    icon: 'monitor',
    tags: [],
    link: '/services/website-design-and-development',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
  },
  {
    id: 'technology',
    title: 'Custom solutions that make technology work for you, not the other way around.',
    subtitle: '',
    description: 'Technology Solutions',
    icon: 'grid',
    tags: [],
    link: '/services/web-and-mobile-application-development',
    image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200',
  },
  {
    id: 'ai',
    title: 'Automate workflows & secure your digital foundation',
    subtitle: '',
    description: 'Email Marketing & Business Automation',
    icon: 'workflow',
    tags: [],
    link: '/services/email-marketing-and-business-automation',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200',
  },
];

export const clients: Client[] = [
  { name: 'BROWN', logo: '' },
  { name: 'McDonald\'s', logo: '' },
  { name: 'Unilever', logo: '' },
  { name: 'CLEAR', logo: '' },
];

export const featuredCaseStudies = [
  {
    title: 'Turning Vehicle Valuation Interest Into a Fast, Conversion-Focused Car-Selling Journey',
    client: 'Quik Car Buyers',
    image: '/quik_car_buyers_cover.webp',
    slug: 'quik-car-buyers'
  },
  {
    title: 'Turning a Large Research Library Into a Structured, Searchable Knowledge Platform',
    client: 'National Research Center on Hispanic Children & Families',
    image: '/hispanic_research_cover.webp',
    slug: 'hispanic-research-center'
  },
];

export const recentSuccess: CaseStudy[] = [
  {
    title: 'Bringing Content, Community, Membership, and Commerce Together...',
    category: 'YLRACH',
    image: '/ylrach_cover.webp',
    slug: 'ylrach'
  },
  {
    title: 'Strengthening Microsoft Dynamics 365 Consulting Through...',
    category: 'Lambert Consulting',
    image: '/lambert_dynamics_cover.webp',
    slug: 'lambert-dynamics-365'
  },
  {
    title: 'Transforming Complex Microsoft Teams Voice Management...',
    category: 'NEXTEAMS365',
    image: '/nexteams365.webp',
    slug: 'nexteams365'
  },
  {
    title: 'Centralizing Hotel Operations Through One Secure Full-Stack...',
    category: 'PROHMS',
    image: 'https://images.unsplash.com/photo-1542314831-c6a4d27ece11?auto=format&fit=crop&q=80&w=800',
    slug: 'prohms'
  },
];

export const defaultCustomPages: CustomPage[] = [
  {
    id: 'plans-pricing',
    title: 'Website Design & Development Pricing',
    slug: 'pricing',
    template: 'plans-pricing',
    status: 'published',
    createdAt: '2026-08-13',
    updatedAt: '2026-08-13',
    heroTitle: defaultPricingTemplateData.hero.quote,
    heroHighlight: '',
    heroSubtitle: defaultPricingTemplateData.hero.reviewLabel,
    bodyContent: 'Transparent website design and development packages for businesses that need a professional launch, stronger growth infrastructure, advanced integrations, or a fully custom digital experience.',
    serviceDetailData: defaultPricingTemplateData,
    seo: {
      metaTitle: 'Website Design & Development Pricing | ProFox Web Designer',
      metaDescription: 'Compare ProFox website design and development packages, starting with Launch ($599), Growth ($2,379), Scale ($5,799+), and Custom Digital Experience.',
      focusKeyword: 'website design and development pricing',
      canonicalUrl: 'https://www.profoxwebdesigner.com/pricing',
      ogTitle: 'Website Design & Development Pricing | ProFox Web Designer',
      ogDescription: 'Clear ProFox website packages built around strategy, design, technology, integrations, and measurable business growth.',
      ogImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=82&w=1600',
      noIndex: false,
      schemaType: 'Service'
    }
  },
  {
    id: 'about-us',
    title: 'About ProFox Web Designer',
    slug: 'about-us',
    template: 'about-us',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-04',
    heroTitle: 'Connected Digital Systems. Built for Real Growth.',
    heroSubtitle: '8+ years of experience, 40+ websites and applications delivered, and one growth-focused team connecting websites, applications, and business automation.',
    coverImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    bodyContent: 'ProFox Web Designer is the client-facing brand of ProFox Digital Solution, based in Shimla, Himachal Pradesh. We help businesses attract customers, simplify operations, reduce manual work, and measure growth through connected websites, custom applications, and automation systems. Registered Udyam number: UDYAM-HP-09-0022689.',
    seo: {
      metaTitle: 'About ProFox Web Designer | Premium Custom Web Design & Development',
      metaDescription: 'Learn how ProFox Web Designer helps brands simplify user journeys, build bespoke custom web apps, and integrate high-end interactive designs.',
      focusKeyword: 'Custom Web Design',
      canonicalUrl: 'https://www.profoxwebdesigner.com/about-us',
      ogTitle: 'About ProFox Web Designer - Premium High-End Web Design',
      ogDescription: 'Simplifying complex digital environments with premium web design, user-centered application development, and technical expertise.',
      ogImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
      noIndex: false,
      schemaType: 'Organization'
    }
  },
  {
    id: 'careers',
    title: 'Careers & Opportunities',
    slug: 'careers',
    template: 'careers',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-04',
    heroTitle: 'Open Positions at ProFox',
    heroSubtitle: 'We value experience, curiosity, empathy, and dedication; we look for thoughtful teammates who enjoy learning and helping others succeed.',
    coverImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
    bodyContent: 'Explore careers at ProFox Web Designer. Join our engineering, design, and automation teams building high-impact digital experiences.',
    seo: {
      metaTitle: 'Careers & Opportunities | ProFox Web Designer',
      metaDescription: 'Join ProFox Web Designer. Explore open roles across product design, full-stack software engineering, solutions architecture, and automation.',
      focusKeyword: 'ProFox Careers',
      canonicalUrl: 'https://www.profoxwebdesigner.com/careers',
      ogTitle: 'Careers & Opportunities | ProFox Web Designer',
      ogDescription: 'Join our growth-focused team creating connected digital systems for global clients.',
      ogImage: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
      noIndex: false,
      schemaType: 'WebPage'
    }
  },
  {
    id: 'contact-us',
    title: 'Contact ProFox Web Designer',
    slug: 'contact-us',
    template: 'contact-us',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-04',
    heroTitle: 'Get in Touch with Our Team',
    heroSubtitle: 'Have a project in mind? We would love to hear from you. Reach out for website design, custom software, or automation.',
    coverImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1600',
    bodyContent: 'Contact our strategy and development team to schedule a discovery session for your upcoming digital project.',
    seo: {
      metaTitle: 'Contact ProFox Web Designer | Digital Strategy & Engineering',
      metaDescription: 'Get in touch with ProFox Web Designer to discuss your website design, web/mobile application, or business automation project.',
      focusKeyword: 'Contact Web Designer',
      canonicalUrl: 'https://www.profoxwebdesigner.com/contact-us',
      ogTitle: 'Contact ProFox Web Designer',
      ogDescription: 'Start a conversation with our digital strategy and engineering team.',
      ogImage: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=1600',
      noIndex: false,
      schemaType: 'WebPage'
    }
  },
  {
    id: 'website-design-and-development',
    title: 'Website Design & Development',
    slug: 'services/website-design-and-development',
    template: 'digital-experience',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-04',
    heroTitle: 'Turn Your Website Into a Growth Engine That Solves Problems & Drives Revenue',
    heroSubtitle: 'Stop losing customers to a confusing or outdated website. We build strategic, user-focused digital experiences that solve your customers\' pain points and build trust.',
    coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1600',
    bodyContent: 'We design and develop high-converting, performance-focused websites that turn casual visitors into loyal customers.',
    seo: {
      metaTitle: 'Website Design & Development Services | ProFox Web Designer',
      metaDescription: 'Custom, high-conversion website design and development engineered for fast load speeds, SEO performance, and measurable business growth.',
      focusKeyword: 'Website Design & Development',
      canonicalUrl: 'https://www.profoxwebdesigner.com/services/website-design-and-development',
      ogTitle: 'Website Design & Development | ProFox Web Designer',
      ogDescription: 'Strategic web design and development that transforms your site into a 24/7 revenue engine.',
      ogImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1600',
      noIndex: false,
      schemaType: 'Service'
    }
  },
  {
    id: 'web-and-mobile-application-development',
    title: 'Web & Mobile Application Development',
    slug: 'services/web-and-mobile-application-development',
    template: 'web-mobile-dev',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-04',
    heroTitle: 'Enterprise-Grade Web & Mobile Application Development',
    heroSubtitle: 'We engineer secure, scalable digital infrastructure, web platforms, SaaS portals, and native iOS/Android mobile applications.',
    coverImage: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80&w=1600',
    bodyContent: 'Custom software, full-stack web applications, mobile apps, and scalable cloud architectures built for speed, security, and growth.',
    seo: {
      metaTitle: 'Web & Mobile Application Development | ProFox Web Designer',
      metaDescription: 'Scalable custom web apps, iOS/Android mobile applications, SaaS platforms, and enterprise backend engineering.',
      focusKeyword: 'Web & Mobile Application Development',
      canonicalUrl: 'https://www.profoxwebdesigner.com/services/web-and-mobile-application-development',
      ogTitle: 'Web & Mobile Application Development | ProFox Web Designer',
      ogDescription: 'Full-lifecycle software engineering from architecture and UI/UX to cloud deployment and API integrations.',
      ogImage: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&q=80&w=1600',
      noIndex: false,
      schemaType: 'Service'
    }
  },
  {
    id: 'email-marketing-and-business-automation',
    title: 'Email Marketing & Business Automation',
    slug: 'services/email-marketing-and-business-automation',
    template: 'ai-automation',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-04',
    heroTitle: 'Email Marketing Journeys & Business Automation',
    heroSubtitle: 'Connect your customer journeys, CRM, email sequences, and workflow automation into one seamless growth system.',
    coverImage: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200',
    bodyContent: 'Eliminate repetitive tasks, nurture leads automatically, and synchronize data across your marketing and sales stack with customized automation pipelines.',
    seo: {
      metaTitle: 'Email Marketing & Business Automation | ProFox Web Designer',
      metaDescription: 'Automate your customer communication, CRM synchronization, and marketing workflows with reliable business automation solutions.',
      focusKeyword: 'Email Marketing & Business Automation',
      canonicalUrl: 'https://www.profoxwebdesigner.com/services/email-marketing-and-business-automation',
      ogTitle: 'Email Marketing & Business Automation | ProFox Web Designer',
      ogDescription: 'Turn fragmented tools into connected, automated workflows that drive retention and revenue.',
      ogImage: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200',
      noIndex: false,
      schemaType: 'Service'
    }
  },
  {
    id: 'privacy-policy',
    title: 'Privacy Policy',
    slug: 'privacy-policy',
    template: 'privacy-policy',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-07',
    heroTitle: 'Privacy Policy',
    heroSubtitle: 'How we collect, use, and protect your personal information.',
    bodyContent: 'We respect your privacy and are committed to protecting your personal data in accordance with applicable data protection regulations.',
    seo: {
      metaTitle: 'Privacy Policy | ProFox Web Designer',
      metaDescription: 'Read the ProFox Web Designer privacy policy covering data collection, processing, and user privacy rights.',
      focusKeyword: 'Privacy Policy',
      canonicalUrl: 'https://www.profoxwebdesigner.com/privacy-policy',
      noIndex: false,
      schemaType: 'WebPage'
    }
  },
  {
    id: 'terms-and-conditions',
    title: 'Terms & Conditions',
    slug: 'terms-and-conditions',
    template: 'privacy-policy',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-07',
    heroTitle: 'Terms & Conditions',
    heroSubtitle: 'These terms and conditions govern your use of our digital services and website.',
    bodyContent: 'Please read these Terms & Conditions carefully before using our digital platforms and services.',
    seo: {
      metaTitle: 'Terms & Conditions | ProFox Web Designer',
      metaDescription: 'Legal terms and conditions for engaging ProFox Web Designer services and digital products.',
      focusKeyword: 'Terms and Conditions',
      canonicalUrl: 'https://www.profoxwebdesigner.com/terms-and-conditions',
      noIndex: false,
      schemaType: 'WebPage'
    }
  },
  {
    id: 'cookie-policy',
    title: 'Cookie Policy',
    slug: 'cookie-policy',
    template: 'privacy-policy',
    status: 'published',
    createdAt: '2026-08-01',
    updatedAt: '2026-08-07',
    heroTitle: 'Cookie Policy',
    heroSubtitle: 'Information on how we use cookies and similar technologies on our website.',
    bodyContent: 'We use cookies and similar tracking technologies to enhance user experience and analyze website traffic.',
    seo: {
      metaTitle: 'Cookie Policy | ProFox Web Designer',
      metaDescription: 'Learn how ProFox Web Designer uses cookies, analytics, and session storage.',
      focusKeyword: 'Cookie Policy',
      canonicalUrl: 'https://www.profoxwebdesigner.com/cookie-policy',
      noIndex: false,
      schemaType: 'WebPage'
    }
  }
];

export const articles = [
  {
    category: 'AI in Business',
    title: 'ChatGPT vs Claude for Business Operations: Which AI Assistant...',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=400',
    href: '#',
  },
  {
    category: 'AI in Business',
    title: 'Why Most AI Pilots Fail and How to Ensure Yours Does Not',
    image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=400',
    href: '#',
  },
  {
    category: 'Latest Insights',
    title: 'Why Your Website Redesign Must Be Built for AI Search...',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=400',
    href: '#',
  },
];

export const defaultPortfolioItems: PortfolioItem[] = [
  {
    id: 'starke-viehweger',
    slug: 'starke-viehweger',
    title: "Extending a Professional Legal Website With Custom WordPress Templates, Plugins, and Advanced Motion Experiences",
    client: "Starke + Viehweger Rechtsanwälte",
    category: 'Digital Experience',
    shortDescription: "Extending WordPress and Elementor implementation with custom templates, bespoke plugin development, PHP/JS/CSS logic, and advanced motion experiences for a Dresden law office.",
    coverImage: '/starke_cover.webp',
    gallery: [],
    content: `<h3>Custom Content Architecture</h3><p>Reusable blog and news templates create a consistent framework for publishing legal updates, events, and specialist content</p><h3>Bespoke WordPress Functionality</h3><p>Custom plugin development extends the website beyond standard Elementor functionality</p><h3>Advanced Motion Experience</h3><p>Custom JavaScript and CSS animations, including logo animation, add visual depth and interaction across the website</p>`,
    problemTitle: "The problem",
    problemContent: "Starke + Viehweger needed a flexible digital platform capable of presenting multiple legal practice areas, lawyer profiles, news, events, downloadable resources, and client-contact pathways within a professional experience. The website represents a Dresden legal office whose lawyers work across areas including employment, inheritance, real estate, traffic, accident, and insurance law, while also publishing specialist content and hosting seminars, webinars, and lectures. Beyond standard WordPress content management, the implementation required more customized presentation and interaction capabilities—particularly reusable content templates, bespoke functionality, and motion effects that could give important visual elements greater impact without compromising the professional character expected from a legal-services brand.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox extended the WordPress and Elementor implementation with custom development tailored specifically to the site's content and visual requirements. Custom templates were created for blog and news posts to provide a more consistent publishing experience, while a bespoke WordPress plugin was developed to introduce functionality beyond the standard theme and page-builder capabilities. Additional custom elements were implemented using PHP, JavaScript, and CSS, alongside advanced interface animations and custom logo-animation treatments. These enhancements allowed Elementor's visual-building workflow to remain flexible while custom code handled more specialized functionality and interaction behavior.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The resulting implementation combines the maintainability of WordPress and Elementor with a deeper level of custom development. Structured post templates give legal and editorial content a more consistent presentation, while the custom plugin and coded components expand what can be achieved beyond standard page-builder features. Motion and logo animations add a more distinctive visual layer to the experience, while reusable development components create a stronger technical foundation for ongoing content publishing and future website updates.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Custom WordPress Website' },
      { label: 'Custom Development', value: 'Templates + Plugin' },
      { label: 'Motion Experience', value: 'Advanced Animations' }
    ],
    industry: "Legal Services / Law Practice",
    companySize: "Boutique legal office with four lawyers currently presented on the website",
    painPoint: "The website needed to accommodate a diverse content ecosystem that includes legal-service information, individual lawyer profiles, news, events, downloadable documents, job information, and client enquiries. The firm's own website emphasizes specialization, personal client relationships, and more than 20 years of legal experience, making it important that the digital presentation remained professional while still supporting modern interaction and content-management requirements. Standard WordPress and Elementor functionality alone was not sufficient for every part of the desired experience. More flexible post presentation, custom functionality, and sophisticated animation behavior required purpose-built development using PHP, JavaScript, and CSS.",
    solutionsProvided: [
      "Custom WordPress and Elementor implementation",
      "Custom blog and news post templates",
      "Bespoke WordPress plugin development",
      "PHP-based custom functionality",
      "JavaScript interaction development",
      "Custom CSS implementation",
      "Advanced website animations",
      "Custom logo-animation implementation",
      "Reusable custom website elements",
      "Responsive front-end enhancements"
    ],
    aboutCompany: "Starke + Viehweger is a Dresden-based legal office established in its current shared-office structure on July 1, 2023, continuing legal work previously carried out through Hirsch, Thiem & Collegen. The lawyers state that they have represented companies, self-employed professionals, freelancers, and private individuals for more than 20 years. Their principal areas of practice include inheritance law, real estate law, traffic law, insurance law, employment law, and related legal services. The firm's digital platform also supports specialist activities beyond traditional service pages, including seminars, webinars, lectures, news, downloadable event materials, lawyer profiles, search functionality, and client-contact experiences.",
    techStack: [
      "WordPress",
      "Elementor",
      "Custom WordPress Plugin",
      "PHP",
      "JavaScript",
      "CSS3",
      "Custom Post Templates",
      "Custom Website Components",
      "Advanced Web Animations",
      "Logo Animation"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Custom Blog & News Templates",
          caption: "Purpose-built post templates create a repeatable presentation system for legal news, professional updates, events, and specialist content. This allows new material to follow a consistent visual structure while remaining manageable through WordPress.",
          category: "Content",
          imageUrl: "/starke_templates.webp"
        },
        {
          title: "Advanced Motion & Logo Animation",
          caption: "Custom animation treatments add movement and visual personality to selected interface elements, including branded logo interactions. JavaScript and CSS were used to move beyond standard Elementor animation options and create more specialized motion behavior.",
          category: "Animation",
          imageUrl: "/starke_animation.webp"
        },
        {
          title: "Custom WordPress Functionality",
          caption: "A bespoke WordPress plugin and additional PHP-based components extend the underlying website functionality without forcing every requirement into third-party plugins or standard Elementor widgets. This creates greater flexibility for project-specific behavior and future enhancements.",
          category: "Custom Development",
          imageUrl: "/starke_plugin.webp"
        }
      ],
      colorPalette: [
        { hex: "#1E293B", name: "Deep Navy Legal Slate" },
        { hex: "#C5A059", name: "Muted Warm Gold Accent" },
        { hex: "#F8FAFC", name: "Clean Parchment Light Canvas" },
        { hex: "#0F172A", name: "Slate Neutral Dark" }
      ]
    },
    seo: {
      metaTitle: "Starke + Viehweger Legal Website Case Study | Profox",
      metaDescription: "Extending a professional legal website with custom WordPress templates, bespoke plugins, and advanced motion experiences.",
      focusKeyword: "Custom WordPress Website",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/starke-viehweger",
      ogTitle: "Starke + Viehweger Legal Website Case Study",
      ogDescription: "Extending a professional legal website with custom templates, plugins, and motion experiences.",
      ogImage: "/starke_cover.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'aquatrace',
    slug: 'aquatrace',
    title: "Turning Pool Water-Loss Uncertainty Into a Clear, Trust-Driven Service Experience",
    client: "AquaTrace Swimming Pool Leak Detection",
    category: 'Healthcare & Services',
    shortDescription: "A lead-generating WordPress website that combines specialist service presentation with diagnostic education, water-loss calculator, and clear enquiry pathways.",
    coverImage: '/aquatrace_cover.webp',
    gallery: [],
    content: `<h3>Diagnostic-Led Customer Journey</h3><p>Educational resources and service explanations help customers understand potential water loss before requesting professional testing</p><h3>Interactive Water-Loss Guidance</h3><p>A pool evaporation calculator uses location, water temperature, pool size, and weather conditions to help visitors compare expected evaporation with observed water loss.</p><h3>Trust-Driven Service Conversion</h3><p>Testing methodology, customer education, reviews, and clear service-request pathways reduce uncertainty around a specialized technical service</p>`,
    problemTitle: "The problem",
    problemContent: "Pool owners dealing with unexplained water loss often do not know whether the cause is normal evaporation, plumbing failure, structural damage, or another hidden issue. AquaTrace needed a digital presence that could educate customers before they booked a service, clearly communicate its specialized diagnostic process, establish trust in a highly technical service, and make it easy for residential and commercial pool owners to request professional leak detection. The experience also needed to support customers across multiple service areas while turning uncertainty into a clear next step.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox developed a lead-generating WordPress website that combines specialist service presentation with diagnostic education and clear enquiry pathways. The experience explains AquaTrace's leak-detection process, including water-loss confirmation, pool and spa inspections, pressure testing, acoustic detection, and underwater investigation. Quote and service-request functionality, customer testimonials, service-area information, mobile calling, educational resources, and a water-loss/evaporation calculator were integrated to help visitors better understand their problem before contacting the company. Responsive implementation and analytics support the experience across devices and marketing channels.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The completed website gives pool owners a clearer path from recognizing potential water loss to understanding possible causes and requesting professional help. Visitors can learn the signs of a leak, understand AquaTrace's diagnostic process, estimate expected evaporation, explore service information, and move directly toward an inspection request. This creates a stronger connection between educational content and lead generation while helping position AquaTrace as a specialist focused on accurate, non-invasive diagnosis rather than guesswork or unnecessary repairs.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Specialist Service Website' },
      { label: 'Service Coverage', value: '4 U.S. States' },
      { label: 'Industry Experience', value: '30+ Years' }
    ],
    industry: "Swimming Pool Services / Leak Detection & Diagnostics",
    companySize: "2–10 employees",
    painPoint: "AquaTrace serves customers who may already have spent time and money trying to determine why their pool is losing water. The website therefore needed to do more than advertise leak detection—it needed to explain the difference between normal evaporation and potential leakage, communicate how professional testing works, demonstrate the value of precise diagnostics, answer common questions, and provide an easy route to service across its operating areas. Without this education and trust-building, customers could remain uncertain about whether professional detection was necessary or what the service would involve.",
    solutionsProvided: [
      "WordPress specialist service website development",
      "Swimming-pool leak-detection service presentation",
      "Quote and service-request functionality",
      "Water-loss and evaporation calculator integration",
      "Bucket-test and diagnostic educational resources",
      "Service-category and testing-process presentation",
      "Customer testimonial integration",
      "Service-area and location content",
      "Mobile calling functionality",
      "Responsive website implementation",
      "Analytics and performance tracking"
    ],
    aboutCompany: "AquaTrace Swimming Pool Leak Detection is a specialist diagnostics company serving residential and commercial pools and spas. Its technicians use methods including acoustic listening equipment, pressure testing, water-level measurement, dye testing, electronic detection, and SCUBA inspection to identify the source of suspected water loss with minimal unnecessary disruption. AquaTrace currently presents service coverage across Florida, Georgia, North Carolina, and South Carolina, while its company profile states more than 30 years of pool-building experience behind its diagnostic expertise.",
    techStack: [
      "WordPress",
      "Themify Ultra",
      "Themify Builder",
      "Builder Button",
      "HTML5",
      "CSS3",
      "JavaScript",
      "jQuery",
      "Google Site Kit",
      "Google Analytics",
      "Cloudflare"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Problem-to-Service Journey",
          caption: "The experience begins with problems customers already recognize—unexpected water loss, frequent refilling, increased chemical use, wet areas, or possible structural issues—and connects those symptoms with AquaTrace's professional diagnostic services. This gives visitors a logical path from concern to understanding and ultimately to a service request.",
          category: "UI Screens",
          imageUrl: "/aquatrace_journey.webp"
        },
        {
          title: "Interactive Water-Loss Assessment",
          caption: "The evaporation calculator adds a practical diagnostic layer to the website. Visitors can provide their ZIP code, pool-water temperature, pool surface area, and observed water loss to estimate expected evaporation using local weather conditions and compare it with potential leak-related loss. Results can also be exported for reference.",
          category: "Education",
          imageUrl: "/aquatrace_calculator.webp"
        },
        {
          title: "Service Education & Trust Experience",
          caption: "Detailed explanations of water-loss confirmation, structural inspection, pressure testing, acoustic detection, and underwater inspection help demystify a technical service. By showing how leaks are investigated and documented, the website gives prospective customers more context before they commit to an inspection.",
          category: "Lead Generation",
          imageUrl: "/aquatrace_trust.webp"
        }
      ],
      colorPalette: [
        { hex: "#0284C7", name: "AquaTrace Deep Pool Blue" },
        { hex: "#06B6D4", name: "Diagnostic Cyan Accent" },
        { hex: "#F0F9FF", name: "Water Reflection Light Canvas" },
        { hex: "#0F172A", name: "Deep Navy Neutral" }
      ]
    },
    seo: {
      metaTitle: "AquaTrace Swimming Pool Leak Detection Case Study",
      metaDescription: "Turning pool water-loss uncertainty into a clear, trust-driven service experience with a lead-generating WordPress website.",
      focusKeyword: "Specialist Service Website",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/aquatrace",
      ogTitle: "AquaTrace - Pool Leak Detection & Diagnostics Case Study",
      ogDescription: "Turning pool water-loss uncertainty into a clear, trust-driven service experience.",
      ogImage: "/aquatrace_cover.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'jackson-design-remodeling',
    slug: 'jackson-design-remodeling',
    title: "Turning Decades of Design-Build Expertise Into an Immersive, Portfolio-Led Digital Experience",
    client: "Jackson Design and Remodeling",
    category: 'Digital Experience',
    shortDescription: "A media-rich WordPress website bringing Jackson Design and Remodeling's services, project portfolio, client stories, seminars, and consultation pathways into one responsive experience.",
    coverImage: '/jdr_cover.webp',
    gallery: [],
    content: `<h3>Visual Project Discovery</h3><p>Project galleries, photography, video, and client stories turn completed remodeling work into an immersive proof-of-expertise experience.</p><h3>Trust-Driven Customer Journey</h3><p>Homeowner reviews, client success stories, process education, and more than 35 years of experience provide multiple layers of credibility before consultation.</p><h3>Content-to-Consultation Experience</h3><p>Seminars, podcasts, resources, and strategically positioned consultation pathways connect homeowner education with direct business enquiries.</p>`,
    problemTitle: "The problem",
    problemContent: "Jackson Design and Remodeling needed a digital platform capable of communicating the quality and depth of a highly visual design-build business. Prospective homeowners needed to explore remodeling services, understand the company's process, see completed projects, hear directly from previous clients, discover educational resources, and find a clear route toward a consultation. With projects, videos, testimonials, seminars, podcasts, news, and other content all contributing to the buying decision, the challenge was creating a cohesive experience rather than a collection of disconnected pages.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox implemented a media-rich WordPress website that brings Jackson Design and Remodeling's services, project portfolio, client stories, videos, events, educational content, and consultation pathways into one responsive digital experience. Visual galleries and lightbox experiences support project discovery, while testimonial content reinforces credibility. Seminar registration, newsletter and consultation forms, podcast integration, responsive call controls, cookie-consent functionality, and marketing analytics were incorporated to connect inspiration and education with measurable customer-action pathways.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The website gives homeowners multiple ways to evaluate Jackson Design and Remodeling before beginning a conversation with the company. Visitors can explore new homes, whole-home remodels, additions, kitchens, bathrooms, and outdoor living projects; watch client success stories; learn about the design-build process; attend educational seminars; listen to remodeling podcasts; and move toward a design consultation. This creates a stronger digital journey from inspiration and research through trust-building and enquiry.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Portfolio-Led Service Website' },
      { label: 'Industry Experience', value: '35+ Years' },
      { label: 'Client Satisfaction', value: '98%' }
    ],
    industry: "Residential Design-Build / Architecture & Home Remodeling",
    companySize: "Not publicly disclosed",
    painPoint: "A high-consideration remodeling decision cannot be supported by service descriptions alone. Jackson Design and Remodeling needed a website capable of demonstrating architectural and design quality visually while helping homeowners understand its integrated design-build process, evaluate completed work, hear from previous clients, access educational resources, and confidently take the next step. The breadth of project categories and supporting media also required a content structure that could remain easy to navigate despite the volume of information available.",
    solutionsProvided: [
      "Custom WordPress website implementation",
      "Remodeling service and project-portfolio presentation",
      "Media-rich project galleries and visual portfolios",
      "Video and lightbox content integration",
      "Client testimonial and success-story presentation",
      "Seminar and event-registration functionality",
      "Newsletter and consultation forms",
      "Responsive mobile calling controls",
      "Podcast integration",
      "Cookie-consent management",
      "Marketing analytics and conversion tracking",
      "Responsive cross-device implementation"
    ],
    aboutCompany: "Jackson Design and Remodeling is a San Diego design-build company specializing in new homes, whole-home remodeling, additions, ADUs, kitchens, bathrooms, and outdoor living spaces. Its architects, designers, and craftspeople work through an integrated process spanning design, planning, material selection, construction, and project management. The company states that it has more than 35 years of experience, has remodeled thousands of San Diego homes, and reports a 98% client satisfaction rating.",
    techStack: [
      "WordPress",
      "Custom WordPress Theme",
      "WPBakery",
      "Slider Revolution",
      "Swiper",
      "Lightbox2",
      "HTML5",
      "CSS3",
      "JavaScript",
      "jQuery",
      "Gravity Forms",
      "Podcast Player",
      "Call Now Button",
      "Complianz GDPR",
      "Website Analytics",
      "Facebook Pixel",
      "Cloudflare"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Portfolio-Led Project Discovery",
          caption: "The experience places completed work at the center of the customer journey, allowing homeowners to browse project categories including new homes, whole-home remodeling, additions, kitchens, bathrooms, and outdoor living. Rich imagery helps prospective clients evaluate design style and craftsmanship before initiating contact.",
          category: "Portfolio",
          imageUrl: "/jdr_portfolio.webp"
        },
        {
          title: "Client Story & Trust Experience",
          caption: "Testimonials, homeowner reviews, video success stories, and detailed project content create multiple forms of social proof throughout the website. Rather than relying only on marketing claims, the experience allows prospective clients to learn through the experiences and completed homes of previous customers.",
          category: "Media",
          imageUrl: "/jdr_trust.webp"
        },
        {
          title: "Education-to-Enquiry Journey",
          caption: "Educational touchpoints extend beyond standard service pages through remodeling seminars, podcasts, process information, and design resources. These experiences help homeowners become more informed while providing natural pathways toward seminar registration, direct contact, and design consultation.",
          category: "Conversion",
          imageUrl: "/jdr_enquiry.webp"
        }
      ],
      colorPalette: [
        { hex: "#2B2D42", name: "Charcoal Slate Accent" },
        { hex: "#D4AF37", name: "Warm Architectural Gold" },
        { hex: "#F8F9FA", name: "Clean Parchment Background" },
        { hex: "#1A1A1A", name: "Deep Neutral Dark" }
      ]
    },
    seo: {
      metaTitle: "Jackson Design and Remodeling Portfolio Website Case Study",
      metaDescription: "An immersive portfolio-led WordPress website for Jackson Design and Remodeling with project galleries, seminars, and consultation pathways.",
      focusKeyword: "Portfolio-Led Service Website",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/jackson-design-remodeling",
      ogTitle: "Jackson Design and Remodeling - Immersive Portfolio-Led Experience",
      ogDescription: "Turning decades of design-build expertise into an immersive, portfolio-led digital experience.",
      ogImage: "/jdr_cover.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'quik-car-buyers',
    slug: 'quik-car-buyers',
    title: "Turning Vehicle Valuation Interest Into a Fast, Conversion-Focused Car-Selling Journey",
    client: "Quik Car Buyers",
    category: 'E-Commerce',
    shortDescription: "A conversion-focused Webflow website structured around Quik Car Buyers' three-step vehicle-selling process with nationwide coverage and instant valuation leads.",
    coverImage: '/quik_car_buyers_cover.webp',
    gallery: [],
    content: `<h3>Conversion-Focused Selling Journey</h3><p>A clear three-step process moves vehicle owners from initial interest toward valuation and sale</p><h3>Nationwide Service Discovery</h3><p>Location-focused content communicates service availability across Australian states and cities</p><h3>Trust-Driven Lead Generation</h3><p>Testimonials, FAQs, service explanations, and strategically positioned calls to action reduce uncertainty before enquiry</p>`,
    problemTitle: "The problem",
    problemContent: "Selling a vehicle privately can involve advertising, negotiating with potential buyers, arranging inspections, handling payment concerns, and waiting for the right buyer. Quik Car Buyers needed a digital experience that could position its alternative as simpler and faster while encouraging vehicle owners to move immediately from initial interest to valuation. The website also needed to communicate nationwide service availability, establish trust, answer common questions, and maintain strong conversion opportunities throughout the customer journey.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox developed a conversion-focused Webflow website structured around Quik Car Buyers' three-step vehicle-selling process. The experience guides visitors from learning about the service to submitting their vehicle details for valuation and progressing toward inspection and sale. Strong calls to action were positioned throughout the website alongside service information, customer testimonials, FAQs, vehicle-type content, nationwide location coverage, animated statistics, and scroll-based interactions. Responsive implementation and marketing tracking were incorporated to support lead generation across devices and campaign channels.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The completed website creates a direct digital pathway between vehicle-selling intent and lead submission. Visitors can quickly understand how the service works, see that different vehicle types and Australian locations are supported, find answers to common concerns, and move toward requesting a valuation without navigating a complicated process. Repeated conversion opportunities, trust-focused content, and a responsive experience help keep the website centered on its primary commercial objective: generating qualified vehicle-seller enquiries.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Lead-Generation Website' },
      { label: 'Selling Journey', value: '3 Steps' },
      { label: 'Service Coverage', value: 'Australia-Wide' }
    ],
    industry: "Automotive / Vehicle Buying & Lead Generation",
    companySize: "Not publicly disclosed",
    painPoint: "Quik Car Buyers needed to turn high-intent visitors searching for a convenient way to sell their vehicle into actionable leads. The website had to explain why its process was easier than handling a private sale, communicate the valuation and vehicle-buying journey clearly, establish confidence through supporting information and customer proof, represent service availability across Australia, and repeatedly guide visitors toward submitting their vehicle details without making the experience feel complicated.",
    solutionsProvided: [
      "Conversion-focused Webflow website development",
      "Vehicle-valuation lead-generation experience",
      "Three-step vehicle-selling journey",
      "Strategically positioned conversion calls to action",
      "Nationwide service and location presentation",
      "Customer testimonial integration",
      "Frequently asked questions experience",
      "Animated statistical counters",
      "Scroll-based visual interactions",
      "Responsive landing-page implementation",
      "Marketing and conversion tracking"
    ],
    aboutCompany: "Quik Car Buyers is an Australian vehicle-buying service designed to simplify the process of selling a car. Vehicle owners can submit their car details through the website, receive a valuation call, progress through vehicle inspection and evaluation, and consider an offer without relying on the traditional private-sale process. The company presents services across Australian states and cities and purchases multiple vehicle types, including sedans, SUVs, utes, and commercial vehicles.",
    techStack: [
      "Webflow",
      "Webflow CDN",
      "HTML5",
      "CSS3",
      "Webflow JavaScript",
      "JavaScript",
      "jQuery",
      "GSAP",
      "Waypoints",
      "Counter-Up",
      "Google Tag Manager",
      "Cloudflare"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Three-Step Conversion Journey",
          caption: "The experience reduces the vehicle-selling process into three understandable stages, giving visitors a clear mental model of what happens after they provide their vehicle details and reducing unnecessary uncertainty before lead submission.",
          category: "UI Screens",
          imageUrl: "/quik_car_buyers_journey.webp"
        },
        {
          title: "High-Intent CTA Architecture",
          caption: "Repeated “Get Cash for My Car” and valuation-oriented calls to action keep the primary conversion objective visible throughout the customer journey, allowing users to act when they are ready rather than requiring them to return to a single enquiry point.",
          category: "Lead Generation",
          imageUrl: "/quik_car_buyers_cta.webp"
        },
        {
          title: "Trust & Decision-Support Experience",
          caption: "Customer testimonials, frequently asked questions, educational content, vehicle-type information, and location coverage provide supporting information around the core valuation journey, helping visitors resolve common concerns before submitting an enquiry.",
          category: "Conversion",
          imageUrl: "/quik_car_buyers_trust.webp"
        }
      ],
      colorPalette: [
        { hex: "#DC2626", name: "Bold Racing Red" },
        { hex: "#1E293B", name: "Navy Slate" },
        { hex: "#F8FAFC", name: "Clean Snow Bg" },
        { hex: "#111827", name: "Dark Neutral" }
      ]
    },
    seo: {
      metaTitle: "Quik Car Buyers Lead-Generation Website Case Study",
      metaDescription: "A 3-step conversion-focused vehicle-selling Webflow website for Quik Car Buyers with nationwide coverage.",
      focusKeyword: "Lead-Generation Website",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/quik-car-buyers",
      ogTitle: "Quik Car Buyers - Conversion-Focused Car-Selling Journey",
      ogDescription: "Turning vehicle valuation interest into a fast, conversion-focused car-selling journey.",
      ogImage: "/quik_car_buyers_cover.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'hispanic-research-center',
    slug: 'hispanic-research-center',
    title: "Turning a Large Research Library Into a Structured, Searchable Knowledge Platform",
    client: "National Research Center on Hispanic Children & Families",
    category: 'Education',
    shortDescription: "A custom WordPress research platform with layered keyword search, multi-dimensional filtering, custom taxonomies, and structured metadata for policy evidence.",
    coverImage: '/hispanic_research_cover.webp',
    gallery: [],
    content: `<h3>Advanced Research Discovery</h3><p>Keyword search and layered filtering help users narrow resources by research area, topic, type, geography, author, year, and data source</p><h3>Structured Content Architecture</h3><p>Custom taxonomies and publication metadata organize diverse research formats into a consistent, scalable information system</p><h3>Accessible Knowledge Experience</h3><p>Research publications, guides, data tools, webinars, podcasts, and downloadable resources presented through one responsive platform</p>`,
    problemTitle: "The problem",
    problemContent: "The National Research Center on Hispanic Children & Families maintained an extensive and growing body of research covering early care and education, poverty reduction and economic self-sufficiency, family structure, policy, and other topics affecting Hispanic children and families. With publications, fact sheets, data points, webinars, podcasts, interactive tools, guides, and other resources spanning different authors, dates, topics, geographies, and data sources, users needed a more effective way to discover relevant information without manually navigating a large archive.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox developed a structured WordPress research and resource platform designed around content discoverability. A custom resource archive organizes publications with detailed metadata and provides keyword search alongside filters for research area, product type, topic, geography, data source, author, and publication year. Custom taxonomies and archive templates create consistent relationships between resources, while pagination, media management, downloadable materials, newsletter integration, and responsive presentation support researchers, policymakers, practitioners, and other visitors across the content library.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The resulting platform transforms a substantial research collection into a more navigable knowledge resource. Visitors can narrow large sets of publications according to their specific research interests instead of relying on linear browsing, while structured metadata provides essential context such as publication type, research area, author, and date directly within the discovery experience. The implementation creates a scalable foundation for organizing diverse research formats while making valuable evidence easier to find and explore.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Research & Resource Platform' },
      { label: 'Resource Discovery', value: 'Multi-Filter Search' },
      { label: 'Content Types', value: 'Research, Data & Media' }
    ],
    industry: "Social Policy Research / Research & Public Policy",
    companySize: "Not publicly disclosed",
    painPoint: "The Center's research archive contained many different types of resources addressing multiple policy and research areas. Users needed to locate information according to more than a simple category or keyword—for example by research area, publication type, subject, geography, data source, author, or publication year. Without a strong taxonomy and filtering architecture, an expanding research library could become increasingly difficult to explore and reduce the accessibility of valuable evidence for researchers, policymakers, practitioners, and other audiences.",
    solutionsProvided: [
      "Custom WordPress research-platform implementation",
      "Research and resource library architecture",
      "Custom taxonomy development",
      "Advanced keyword search and filtering",
      "Research-area, topic, and product-type categorization",
      "Geography, data-source, author, and publication-year filtering",
      "Custom archive templates and pagination",
      "Structured publication metadata",
      "WordPress media and downloadable-resource management",
      "Newsletter integration",
      "Responsive research-content presentation",
      "WP Engine staging and deployment workflow"
    ],
    aboutCompany: "The National Research Center on Hispanic Children & Families conducted research designed to inform programs and policies serving Hispanic children and families with low incomes. Its work addressed areas including poverty reduction and economic self-sufficiency, child care and early education, parenting, family structure, and family dynamics, while its website provides access to research publications, facts, guides, data resources, webinars, podcasts, and other evidence-based materials. The Center announced that its funded activities ceased effective December 8, 2025, while its online research resources remain accessible.",
    techStack: [
      "WordPress",
      "Custom WordPress Theme",
      "Custom Taxonomies",
      "Custom Archive Templates",
      "WordPress Media Library",
      "HTML5",
      "CSS3",
      "JavaScript",
      "Responsive UI",
      "WP Engine Hosting",
      "WP Engine Staging",
      "Cloudflare"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Multi-Dimensional Resource Filtering",
          caption: "The research archive allows visitors to refine content through multiple criteria, including research areas, product types, topics, geography, data sources, authors, and publication years. This turns a large resource collection into a focused discovery experience built around individual research needs.",
          category: "Filtering",
          imageUrl: "/hispanic_research_filtering.webp"
        },
        {
          title: "Structured Research Metadata",
          caption: "Each resource is presented with meaningful information such as title, publication date, authors, research category, and content type, helping users assess relevance before opening an individual publication or resource.",
          category: "Content",
          imageUrl: "/hispanic_research_metadata.webp"
        },
        {
          title: "Scalable Research Archive",
          caption: "Custom taxonomies, archive templates, pagination, and media management provide a reusable structure capable of accommodating publications, data points, research series, webinars, interactive tools, fact sheets, podcasts, and other content formats within the same platform.",
          category: "UI Screens",
          imageUrl: "/hispanic_research_archive.webp"
        }
      ],
      colorPalette: [
        { hex: "#C85A32", name: "Terracotta Accent" },
        { hex: "#0F4C5C", name: "Deep Teal" },
        { hex: "#FDFBF7", name: "Warm Parchment Bg" },
        { hex: "#1F2937", name: "Charcoal Neutral" }
      ]
    },
    seo: {
      metaTitle: "Hispanic Research Center Knowledge Platform Case Study",
      metaDescription: "Structured WordPress research platform for National Research Center on Hispanic Children & Families with multi-filter search and taxonomy architecture.",
      focusKeyword: "Research & Resource Platform",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/hispanic-research-center",
      ogTitle: "Hispanic Research Center - Searchable Knowledge Platform",
      ogDescription: "Turning a large research library into a structured, searchable knowledge platform for social policy evidence.",
      ogImage: "/hispanic_research_cover.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'ylrach',
    slug: 'ylrach',
    title: "Bringing Content, Community, Membership, and Commerce Together in One Digital Portal",
    client: "YLRACH",
    category: 'E-Commerce',
    shortDescription: "A WordPress-based membership and e-commerce portal combining content publishing, user registration, member profiles, community Q&A, and WooCommerce shopping.",
    coverImage: '/ylrach_cover.webp',
    gallery: [],
    content: `<h3>Integrated Member Experience</h3><p>Registration, profiles, conditional navigation, and community tools brought together within one platform</p><h3>Content-Rich Digital Experience</h3><p>Editorial content, interactive layouts, newsletters, and digital flipbooks organized around ongoing audience engagement</p><h3>Connected E-Commerce Journey</h3><p>WooCommerce catalogue, shopping cart, and checkout functionality integrated directly alongside content and membership experiences</p>`,
    problemTitle: "The problem",
    problemContent: "YLRACH needed more than a conventional content website. The platform had to bring editorial material, member access, community participation, digital publications, multilingual content, and online shopping into one connected experience. Managing these different functions independently could create fragmented navigation and make it harder for visitors to move naturally between discovering content, participating in the community, accessing member functionality, and purchasing products.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox developed YLRACH as a WordPress-based membership and e-commerce portal combining content publishing, user registration, member profiles, community question-and-answer functionality, newsletters, digital flipbooks, multilingual access, and WooCommerce shopping. Conditional navigation was implemented to adapt the experience around user access, while interactive sliders, mosaic layouts, and responsive components created a more engaging presentation across devices. The public preview also provides login and registration pathways alongside an integrated checkout experience.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The resulting platform consolidates several distinct digital experiences into one environment. Visitors can discover editorial content, access membership functionality, participate in community interactions, explore digital publications, subscribe to updates, and move into the shopping experience without relying on separate platforms. This creates a more cohesive foundation for managing content, community engagement, member relationships, and commerce as interconnected parts of the same digital ecosystem.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Membership & E-Commerce Portal' },
      { label: 'Core Experience', value: 'Content, Community & Commerce' }
    ],
    industry: "Digital Publishing / Membership & E-Commerce",
    companySize: "Not publicly disclosed",
    painPoint: "YLRACH required a flexible digital platform capable of supporting multiple types of user activity without creating separate disconnected websites or experiences. Editorial publishing, member registration, profile management, community participation, digital publications, newsletters, multilingual access, and online shopping all needed to coexist within a manageable WordPress environment. The platform also needed navigation and interface behavior capable of serving different users and content types while remaining usable across desktop and mobile devices.",
    solutionsProvided: [
      "WordPress membership and e-commerce portal development",
      "WooCommerce catalogue, cart, and checkout implementation",
      "User registration and member-profile functionality",
      "Community question-and-answer integration",
      "Digital flipbook implementation",
      "Newsletter subscription functionality",
      "Interactive slider and mosaic content layouts",
      "Conditional navigation implementation",
      "Multilingual website functionality",
      "Responsive e-commerce experience"
    ],
    aboutCompany: "YLRACH is a digital content and community platform combining editorial experiences with member access and online commerce. Its public-facing experience includes account login and registration, thematic content areas, links to related publishing websites, and an integrated checkout pathway. The broader implementation extends this foundation with community participation, digital publications, newsletters, multilingual functionality, and e-commerce capabilities.",
    techStack: [
      "WordPress",
      "WooCommerce",
      "Themify Ultra",
      "Themify Builder",
      "Slider Revolution",
      "Builder Mosaic",
      "DearFlip",
      "Profile Builder",
      "DW Question Answer",
      "If Menu",
      "Newsletter",
      "GTranslate",
      "ShopDock",
      "jQuery",
      "Apache"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Member Access Experience",
          caption: "Dedicated login and registration pathways provide the foundation for personalized member participation, allowing account-based experiences to exist alongside the platform's publicly accessible content.",
          category: "Membership",
          imageUrl: "/ylrach_member_access.webp"
        },
        {
          title: "Adaptive Content Navigation",
          caption: "Conditional menus and structured content areas help the interface respond to different user journeys, making it easier to connect editorial discovery, membership features, community activity, and commerce without presenting every option in the same way to every visitor.",
          category: "UI Screens",
          imageUrl: "/ylrach_navigation.webp"
        },
        {
          title: "Content-to-Commerce Experience",
          caption: "The portal integrates content and transactional functionality within one experience. Visitors can move between editorial and community-oriented areas and an active shopping and checkout environment rather than being redirected into a completely separate commerce platform. The live preview exposes an integrated checkout entry point alongside the site's content and member functionality.",
          category: "Commerce",
          imageUrl: "/ylrach_commerce.webp"
        }
      ],
      colorPalette: [
        { hex: "#1E293B", name: "Dark Slate" },
        { hex: "#D97706", name: "Warm Gold Accent" },
        { hex: "#F8FAFC", name: "Clean Background" },
        { hex: "#0F172A", name: "Deep Neutral" }
      ]
    },
    seo: {
      metaTitle: "YLRACH Membership & E-Commerce Portal Case Study",
      metaDescription: "YLRACH digital portal combining content publishing, community Q&A, member access, and WooCommerce e-commerce.",
      focusKeyword: "Membership & E-Commerce Portal",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/ylrach",
      ogTitle: "YLRACH - Bringing Content, Community, Membership, and Commerce Together",
      ogDescription: "A WordPress-based membership and e-commerce portal bringing content, community, and commerce into one connected digital experience.",
      ogImage: "/ylrach_cover.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'lambert-dynamics-365',
    slug: 'lambert-dynamics-365',
    title: "Strengthening Microsoft Dynamics 365 Consulting Through a Multilingual, Performance-Optimized Digital Platform",
    client: "Lambert Consulting SA",
    category: 'Enterprise',
    shortDescription: "A professional, multilingual WordPress experience dedicated to Lambert Consulting's Microsoft Dynamics 365 services.",
    coverImage: '/lambert_dynamics_cover.webp',
    gallery: [],
    content: `<h3>Clear Dynamics 365 Service Discovery</h3><p>Microsoft Dynamics solutions and consulting capabilities organized into accessible customer-focused pathways</p><h3>Multilingual Customer Experience</h3><p>Consistent consulting and solution information made accessible to audiences across multiple languages</p><h3>Consultation-Focused Journey</h3><p>Strategic consultation, quotation, contact, and content pathways connect solution research with direct business enquiries</p>`,
    problemTitle: "The problem",
    problemContent: "Lambert Consulting delivers Microsoft Dynamics 365 licensing, implementation, consulting, integration, migration, training, and support services across multiple industries. Its digital presence needed to communicate a broad and technically complex Dynamics 365 offering in a way that business decision-makers could easily explore. The experience also needed to support multilingual audiences, demonstrate consulting expertise, surface reference projects and expert resources, and create clear pathways for consultation and quotation enquiries.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox implemented a professional, multilingual WordPress experience dedicated to Lambert Consulting's Microsoft Dynamics 365 services. The website structures Dynamics capabilities around business-focused service information while integrating consultation and quotation forms, reference and case-study content, expert articles, contact and popup interactions, multilingual delivery, cookie-consent management, analytics, and performance optimization. Responsive implementation ensures the consulting experience remains accessible across desktop and mobile devices.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The completed digital experience gives prospective customers a clearer way to understand Lambert Consulting's Dynamics 365 capabilities and move between solution research, supporting expertise, reference projects, and direct consultation. Multilingual delivery broadens accessibility for international audiences, while structured service presentation and dedicated enquiry pathways create a more cohesive journey from initial research to commercial conversation. The platform also provides a stronger foundation for publishing ongoing Microsoft expertise and project content.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Microsoft Consulting Website' },
      { label: 'Content Experience', value: 'Multilingual' }
    ],
    industry: "Microsoft Technology Consulting / Dynamics 365 Solutions",
    companySize: "Not publicly disclosed",
    painPoint: "Lambert Consulting needed to present an extensive Microsoft Dynamics 365 portfolio spanning Sales, Customer Service, Customer Insights, Field Service, Project Operations, implementation, process consulting, analytics, migration, integration, cloud services, training, and support. The challenge was turning this breadth of technical expertise into a structured digital experience that could serve different industries and customer requirements without overwhelming prospective buyers.",
    solutionsProvided: [
      "Microsoft Dynamics 365 consulting website implementation",
      "Service and solution content architecture",
      "Multilingual website delivery",
      "Consultation and quotation form integration",
      "Reference and case-study content presentation",
      "Expert article and business-resource integration",
      "Contact and popup form implementation",
      "Cookie-consent management",
      "Search-engine and performance optimization",
      "Website analytics and tracking",
      "Responsive interface implementation"
    ],
    aboutCompany: "Lambert Consulting SA is a Switzerland-based Microsoft technology consulting company delivering complex ICT and digital-transformation projects for national and international organizations. Its Dynamics 365 practice provides licensing and implementation services across industries including retail, pharmaceuticals, life sciences, healthcare, biotech, construction, real estate, telecommunications, and financial services. The company states that it has more than 22 years of experience and has completed over 514 software implementation projects.",
    techStack: [
      "WordPress",
      "Themify Ultra",
      "Child Theme",
      "Themify Builder Pro",
      "HTML5",
      "CSS3",
      "JavaScript",
      "jQuery",
      "Formidable Forms",
      "Themify Popup",
      "Builder Contact",
      "Weglot",
      "Complianz GDPR",
      "WP Rocket",
      "Google Analytics",
      "Google Tag Manager",
      "Cloudflare"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Solution-Led Service Navigation",
          caption: "The information architecture organizes Microsoft Dynamics 365 capabilities into distinct solution areas, helping prospective customers move from broad platform discovery toward services relevant to sales, customer service, customer insights, field operations, and project management.",
          category: "UI Screens",
          imageUrl: "/lambert_dynamics_nav.webp"
        },
        {
          title: "Consultation & Enquiry Journey",
          caption: "Consultation, quotation, contact, and popup interactions provide clear next steps throughout the experience, allowing users to transition from researching technical capabilities to discussing implementation requirements with Lambert Consulting.",
          category: "UX & Wireframes",
          imageUrl: "/lambert_dynamics_enquiry.webp"
        },
        {
          title: "Expertise & Resource Experience",
          caption: "Reference projects, case studies, and expert articles extend the website beyond static service presentation, giving prospective clients additional context around Lambert Consulting's Microsoft expertise, implementation experience, and digital-transformation work.",
          category: "UI Screens",
          imageUrl: "/lambert_dynamics_resources.webp"
        }
      ],
      colorPalette: [
        { hex: "#005A9E", name: "Microsoft Blue" },
        { hex: "#1A1A1A", name: "Dark Neutral" },
        { hex: "#F3F4F6", name: "Light Background" },
        { hex: "#00A4EF", name: "Accent Blue" }
      ]
    },
    seo: {
      metaTitle: "Lambert Dynamics 365 Consulting Website Case Study",
      metaDescription: "A multilingual, performance-optimized digital platform dedicated to Lambert Consulting's Microsoft Dynamics 365 services.",
      focusKeyword: "Microsoft Consulting Website",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/lambert-dynamics-365",
      ogTitle: "Strengthening Microsoft Dynamics 365 Consulting Through a Multilingual, Performance-Optimized Digital Platform",
      ogDescription: "A multilingual, performance-optimized digital platform dedicated to Lambert Consulting's Microsoft Dynamics 365 services.",
      ogImage: "/lambert_dynamics_cover.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'nexteams365',
    slug: 'nexteams365',
    title: "Transforming Complex Microsoft Teams Voice Management Into a Clear Enterprise Digital Experience",
    client: "NEXTEAMS365",
    category: 'SaaS & Tech',
    shortDescription: "A multilingual enterprise website that organizes NEXTEAMS365 around clearly defined product capabilities and business benefits.",
    coverImage: '/nexteams365.webp',
    gallery: [],
    content: `<h3>Clear Enterprise Product Experience</h3><p>Complex Teams voice capabilities organized into clear, business-focused product journeys</p><h3>Multilingual Digital Experience</h3><p>Consistent product information delivered across English, French, Italian, German, and Spanish audiences</p><h3>Conversion-Focused Customer Journey</h3><p>Strategic demo, estimate, and product-resource pathways support enterprise evaluation and enquiries</p>`,
    problemTitle: "The problem",
    problemContent: "NEXTEAMS365 serves enterprise IT teams managing complex Microsoft Teams voice environments across multiple sites, carriers, users, and infrastructure configurations. The challenge was presenting highly technical capabilities—such as provisioning, routing, monitoring, carrier management, and cost tracking—in a digital experience that enterprise decision-makers could understand, navigate, and evaluate without being overwhelmed by technical complexity. The website also needed to support international audiences and provide clear pathways toward demonstrations and pricing estimates.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox developed a multilingual enterprise website that organizes NEXTEAMS365 around clearly defined product capabilities and business benefits. The experience structures complex information across provisioning and automation, multi-site and multi-carrier management, call handling and routing, monitoring and reporting, and billing and cost tracking. Dedicated demo and estimate pathways were integrated alongside downloadable product information, responsive layouts, multilingual delivery, analytics, and performance tracking to support enterprise customers throughout the evaluation journey.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "The completed platform gives enterprise IT teams a clearer way to understand how NEXTEAMS365 can manage Microsoft Teams voice operations across large and complex environments. Product capabilities are easier to discover, business benefits are connected directly to technical functionality, and prospective customers can move naturally from research to product evaluation through demo and estimate requests. Multilingual access further creates a consistent experience for users across international markets.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Enterprise SaaS Website' },
      { label: 'Languages Supported', value: '5' },
      { label: 'Product Capabilities', value: '18+' }
    ],
    industry: "Enterprise Communications Technology / Microsoft Teams Voice Management",
    companySize: "Enterprise-focused platform designed for Microsoft Teams environments with 1,000+ users",
    painPoint: "NEXTEAMS365 needed a digital platform capable of explaining a sophisticated enterprise voice-management solution without making the customer journey unnecessarily technical. Organizations needed to quickly understand capabilities covering user provisioning, number management, multi-site environments, carriers, call routing, monitoring, reporting, billing, and cost control. The website also needed to communicate effectively across multiple languages while guiding qualified enterprise prospects toward demonstrations and commercial enquiries.",
    solutionsProvided: [
      "Enterprise SaaS website development",
      "Product and service information architecture",
      "Microsoft Teams voice-management content presentation",
      "Multilingual website implementation",
      "Feature and business-benefit presentation",
      "Demo and estimate request journeys",
      "Downloadable product-resource integration",
      "Responsive website implementation",
      "Analytics and performance tracking"
    ],
    aboutCompany: "NEXTEAMS365 is an enterprise voice-management platform developed by Lambert Consulting SA to simplify the management of Microsoft Teams telephony environments. It supports IT teams handling users, numbers, routing, carriers, provisioning, monitoring, reporting, and cost tracking across large-scale, multi-site, hybrid, and multi-tenant environments. The platform is designed for organizations that need centralized visibility and control over complex Microsoft Teams voice infrastructure.",
    techStack: [
      "WordPress",
      "Themify Ultra",
      "Themify Builder",
      "HTML5",
      "CSS3",
      "JavaScript",
      "jQuery",
      "Lax.js",
      "Formidable Forms",
      "Honeypot",
      "Weglot",
      "Google Site Kit",
      "Google Tag Manager",
      "Cloudflare"
    ],
    designShowcase: {
      visuals: [
        {
          title: "Enterprise Feature Navigation",
          caption: "A structured product experience groups the platform into major capability areas, allowing enterprise users to understand provisioning, multi-site management, call routing, monitoring, and billing without navigating through disconnected technical information.",
          category: "UI Screens",
          imageUrl: "/nexteams365_feature_nav.webp"
        },
        {
          title: "Demo & Estimate Conversion Journey",
          caption: "Prominent demo and estimate pathways give prospective customers clear next actions throughout the website, helping move users from product discovery toward direct sales engagement.",
          category: "UX & Wireframes",
          imageUrl: "/nexteams365_conversion.webp"
        },
        {
          title: "Multilingual Customer Experience",
          caption: "The website delivers product information across five supported languages, creating a more accessible and consistent digital experience for international enterprise audiences.",
          category: "Multilingual",
          imageUrl: "/nexteams365_multilingual.webp"
        }
      ],
      colorPalette: [
        { hex: "#00326A", name: "Primary Deep Blue" },
        { hex: "#0084B4", name: "Secondary Teal" },
        { hex: "#F3F4F6", name: "Neutral Light" },
        { hex: "#111827", name: "Dark Text" }
      ]
    },
    seo: {
      metaTitle: "NEXTEAMS365 Enterprise SaaS Website Case Study",
      metaDescription: "A multilingual enterprise website organizing complex Microsoft Teams voice management into clear, business-focused product journeys.",
      focusKeyword: "Enterprise SaaS Website",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/nexteams365",
      ogTitle: "Transforming Complex Microsoft Teams Voice Management Into a Clear Enterprise Digital Experience",
      ogDescription: "A multilingual enterprise website organizing complex Microsoft Teams voice management into clear, business-focused product journeys.",
      ogImage: "/nexteams365.webp",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  },
  {
    id: 'prohms',
    slug: 'prohms',
    title: "Centralizing Hotel Operations Through One Secure Full-Stack Management Platform",
    client: "PROHMS",
    category: 'Hospitality',
    shortDescription: "A full-stack hotel management platform designed to centralize essential hospitality operations within one secure system.",
    coverImage: 'https://images.unsplash.com/photo-1542314831-c6a4d27ece11?auto=format&fit=crop&q=80&w=800',
    gallery: [],
    content: `<h3>Unified Hotel Operations</h3><p>Reservations, guests, housekeeping, billing, and reporting managed within one system</p><h3>Smarter Reservation Control</h3><p>Improved booking accuracy through overlap prevention, room availability, and multi-room stay management</p><h3>Secure Operational Management</h3><p>Role-based access, audit logs, authentication, and structured financial controls across hotel workflows</p>`,
    problemTitle: "The problem",
    problemContent: "Hotel operations often involve multiple teams managing reservations, guests, room availability, housekeeping, payments, invoices, and reporting across disconnected processes. This creates greater risk of booking conflicts, fragmented guest information, billing errors, limited operational visibility, and inefficient coordination between hotel departments.",
    problemBullets: [],
    solutionTitle: "The solution",
    solutionContent: "ProFox developed PROHMS as a secure full-stack hotel management system that brings core hotel operations into one centralized platform. The system supports reservation management, overlap prevention, split-stay and multi-room bookings, room assignments, guest profiles, housekeeping workflows, inventory, lost-and-found records, payments, refunds, invoicing, reporting, employee onboarding, and role-based staff access. Administrative audit logs, secure authentication, responsive interfaces, and automated application testing were incorporated to support reliable day-to-day operations.",
    solutionBullets: [],
    resultsTitle: "The results",
    resultsContent: "PROHMS provides hotel teams with a more structured way to manage operational workflows from reservation through checkout. Centralized guest, room, housekeeping, financial, and reporting data reduces dependence on disconnected processes while improving visibility across departments. Built-in booking validation, controlled financial workflows, secure permissions, and operational reporting create a stronger foundation for accurate and efficient hotel management.",
    resultsBullets: [],
    results: [
      { label: 'Platform Type', value: 'Full-Stack' },
      { label: 'Workflows Centralized', value: '10+' }
    ],
    industry: "Hospitality Technology / Hotel Management Software",
    companySize: "Not publicly disclosed",
    painPoint: "Hotel teams needed a centralized system capable of managing interconnected operational processes including room availability, reservations, guest information, front-desk activities, housekeeping, billing, refunds, invoices, staff permissions, and reporting. Without structured controls across these workflows, hotels can face reservation conflicts, fragmented records, financial inconsistencies, and difficulty maintaining visibility across daily operations.",
    solutionsProvided: [
      "Full-stack hotel management system development",
      "Reservation and room-availability management",
      "Guest, front-desk, and checkout workflow development",
      "Housekeeping, inventory, and lost-and-found management",
      "Billing, payment, refund, and immutable invoice workflows",
      "Operational, occupancy, GST, housekeeping, and daily cash reporting",
      "Role-based access, secure authentication, and audit logging",
      "Responsive interface and automated application testing"
    ],
    aboutCompany: "PROHMS is a full-stack hotel management platform designed to centralize essential hospitality operations within one secure system. It brings together reservations, guest management, front-desk workflows, housekeeping, financial operations, reporting, staff access, and employee onboarding to help hotel teams manage day-to-day activities more efficiently from a unified digital environment.",
    seo: {
      metaTitle: "PROHMS Full-Stack Hotel Management System Case Study",
      metaDescription: "A full-stack hotel management platform designed to centralize essential hospitality operations within one secure system.",
      focusKeyword: "Hotel Management Software",
      canonicalUrl: "https://www.profoxwebdesigner.com/portfolio/prohms",
      ogTitle: "Centralizing Hotel Operations Through One Secure Full-Stack Management Platform",
      ogDescription: "A full-stack hotel management platform designed to centralize essential hospitality operations within one secure system.",
      ogImage: "https://images.unsplash.com/photo-1542314831-c6a4d27ece11?auto=format&fit=crop&q=80&w=800",
      noIndex: false,
      schemaType: "Article"
    },
    status: 'published',
    createdAt: '2026-08-15T00:00:00.000Z',
    updatedAt: '2026-08-15T00:00:00.000Z'
  }
];


export const defaultProcessTitle = "Our Process";

export const defaultProcessSteps = [
  {
    step: "01",
    title: "Discovery & Strategy",
    desc: "We analyze your existing workflows, legacy systems, and technical bottlenecks to construct a pragmatic blueprint for modernization.",
    image: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200",
    ctaText: "Let's Talk",
    ctaUrl: "/contact-us"
  },
  {
    step: "02",
    title: "System Architecture & Design",
    desc: "Our senior engineers design scalable, secure system architectures that seamlessly bridge your current tools and future integrations.",
    image: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&q=80&w=1200",
    ctaText: "Let's Talk",
    ctaUrl: "/contact-us"
  },
  {
    step: "03",
    title: "Agile Development & Testing",
    desc: "We write clean, high-performance code with daily standups, robust test coverage, and continuous delivery loops to guarantee momentum.",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=1200",
    ctaText: "Let's Talk",
    ctaUrl: "/contact-us"
  },
  {
    step: "04",
    title: "Deployment & Continuous Growth",
    desc: "We deploy without downtime, provide proactive monitoring, and continuously optimize systems as your user base and operations scale.",
    image: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200",
    ctaText: "Let's Talk",
    ctaUrl: "/contact-us"
  }
];

export const defaultPortfolioCategories: PortfolioCategory[] = [
  { id: 'cat-digital-experience', name: 'Digital Experience', slug: 'digital-experience', description: 'Web design, digital touchpoints, and brand experience' },
  { id: 'cat-education', name: 'Education', slug: 'education', description: 'Educational platforms and campus portals' },
  { id: 'cat-enterprise', name: 'Enterprise', slug: 'enterprise', description: 'Enterprise software and corporate solutions' },
  { id: 'cat-e-commerce', name: 'E-Commerce', slug: 'e-commerce', description: 'B2B and B2C online store experiences' },
  { id: 'cat-saas-tech', name: 'SaaS & Tech', slug: 'saas-tech', description: 'SaaS applications and tech platforms' },
  { id: 'cat-healthcare-services', name: 'Healthcare & Services', slug: 'healthcare-services', description: 'Healthcare and professional language platforms' },
  { id: 'cat-hospitality', name: 'Hospitality', slug: 'hospitality', description: 'Hospitality, travel and luxury direct booking platforms' },
  { id: 'cat-fintech-banking', name: 'Fintech & Banking', slug: 'fintech-banking', description: 'Fintech portals and banking solutions' },
];

export const defaultTheme = {
  fontFamily: 'Inter',
  headingFontFamily: 'Inter',
  baseFontSize: '16px',
  primaryColor: '#000080',
  secondaryColor: '#FF0E0E',
  darkBgColor: '#000080',
  lightBgColor: '#ffffff',
  buttonRadius: 'rounded-lg',
  buttonStyle: 'solid',
  themePreset: 'profox-brand',
  layoutContainerWidth: '1400px'
};

export const defaultSiteSettings = {
  businessName: 'Profox web designer',
  website: 'https://www.profoxwebdesigner.com',
  contactEmail: 'contact@profox-webdesigner.com',
  supportEmail: 'support@profox-webdesigner.com',
  securityContact: 'privacy@profox-webdesigner.com',
  address: 'India',
  businessAddress: 'ProFox Headquarters, India',
  phone: '+1 (516) 243-8557',
  social: {
    facebook: '#',
    twitter: '#',
    linkedin: '#',
    instagram: '#'
  }
};

export const defaultDynamicSections = [];
