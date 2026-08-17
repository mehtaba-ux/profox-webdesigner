import React from 'react';
import { motion } from 'motion/react';
import { Check, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';
import { resolveContactCtaUrl } from '../lib/contactCta';

export interface ServicePackage {
  id: string;
  title: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  deliveryTime: string;
  popular: boolean;
  badge: string;
  ctaText: string;
  ctaLink: string;
}

const defaultPackages: ServicePackage[] = [
  {
    id: 'starter',
    title: 'Starter Web Package',
    price: '$1,499',
    period: 'one-time',
    description: 'Get online quickly with a custom, high-converting responsive landing page designed to turn visitors into paying customers.',
    features: [
      '1 Custom High-Converting Landing Page',
      'Mobile-First Responsive Design',
      'Basic SEO Setup & Indexing',
      'Interactive Contact / Booking Form',
      '1 Month Post-Launch Support'
    ],
    deliveryTime: '7 Days',
    popular: false,
    badge: 'Starter',
    ctaText: 'Get Started',
    ctaLink: '#contact'
  },
  {
    id: 'growth',
    title: 'Growth Suite Package',
    price: '$2,999',
    period: 'one-time',
    description: 'A complete multipage digital presence equipped with custom UI/UX design, blog publishing engine, and rich analytics integrations.',
    features: [
      'Up to 5 Custom-Designed Pages',
      'Full Blog & Content Management (CMS)',
      'Speed Optimization & Global CDN',
      'Google Analytics & Pixel Tracking',
      '3 Months Maintenance & Support'
    ],
    deliveryTime: '14-21 Days',
    popular: true,
    badge: 'Most Popular',
    ctaText: 'Choose Growth',
    ctaLink: '#contact'
  },
  {
    id: 'enterprise',
    title: 'Enterprise & Custom Solution',
    price: 'Custom Quote',
    period: 'from $4,999',
    description: 'Bespoke full-stack web applications, custom integrations, advanced databases, and tailored SEO strategy for major commercial growth.',
    features: [
      'Bespoke Custom Web Applications',
      'Advanced Relational / Document Databases',
      'Custom API & Third-Party Integrations',
      'Advanced Technical SEO & Copywriting',
      'Dedicated SLA Support & Core Audits'
    ],
    deliveryTime: 'Tailored Timeline',
    popular: false,
    badge: 'Enterprise',
    ctaText: 'Inquire Now',
    ctaLink: '/contact-us'
  }
];

interface ServicePackagesProps {
  isLiveEditing?: boolean;
}

export default function ServicePackages({ isLiveEditing = false }: ServicePackagesProps) {
  const { content } = useCMS();
  
  const packagesSectionData = content.servicePackages || {};
  const isEnabled = packagesSectionData.enabled === true;
  const sectionTitle = packagesSectionData.title || 'Our Services Packages';
  const sectionSubtitle = packagesSectionData.subtitle || 'Completely customizable web design and development packages tailored to match your specific digital and business requirements.';
  const packagesList = (packagesSectionData.list && packagesSectionData.list.length > 0) ? packagesSectionData.list : [
    {
      title: "Essential Digital Presence",
      price: "$2,500",
      description: "Perfect for establishing a professional foundation.",
      features: ["Custom UI/UX Design", "Responsive Web Development", "Basic SEO Setup", "Contact Form Integration", "1 Month Support"]
    },
    {
      title: "Growth Accelerator",
      price: "$5,000",
      isPopular: true,
      description: "Ideal for businesses looking to scale their online impact.",
      features: ["Advanced UI/UX with Animations", "CMS Integration (Blog/Portfolio)", "Performance Optimization", "E-commerce Readiness", "Analytics Setup", "3 Months Support"]
    },
    {
      title: "Enterprise Ecosystem",
      price: "Custom",
      description: "Comprehensive solutions for complex organizational needs.",
      features: ["Full-Stack Custom Development", "API Integrations", "Advanced Security Protocols", "Custom Web Apps / Portals", "Dedicated Account Manager", "Ongoing Maintenance"]
    }
  ];

  if (!isEnabled && !isLiveEditing) return null;

  const theme = content.theme || {};
  const primaryColor = theme.primaryColor || '#000080';
  const headingFont = theme.fontFamily || 'Inter';

  return (
    <section id="service-packages" className={`py-24 bg-slate-50 relative z-20 border-t border-slate-100 ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Header Section */}
        <div className="max-w-3xl mb-16">
          <span 
            className="text-xs font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-full inline-block mb-4"
            style={{ color: primaryColor, backgroundColor: `${primaryColor}10` }}
          >
            Flexible Plans
          </span>
          <h2 className="text-4xl md:text-5xl font-normal text-slate-900 tracking-tight mb-4" style={{ fontFamily: headingFont }}>
            <VisualEditable section="servicePackages" field="title" value={sectionTitle} label="Packages Section Title" isLiveEditing={isLiveEditing}>
              {sectionTitle}
            </VisualEditable>
          </h2>
          <p className="text-lg text-slate-600 leading-relaxed font-normal">
            <VisualEditable section="servicePackages" field="subtitle" value={sectionSubtitle} label="Packages Section Subtitle" isLiveEditing={isLiveEditing}>
              {sectionSubtitle}
            </VisualEditable>
          </p>
        </div>

        {/* Pricing/Packages Grid */}
        <div className="grid lg:grid-cols-3 md:grid-cols-2 gap-8 items-stretch">
          {packagesList.map((pkg: ServicePackage, idx: number) => {
            const isPopular = pkg.popular;
            return (
              <motion.div
                key={pkg.id || idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={`relative flex flex-col p-8 rounded-3xl transition-all duration-300 ${
                  isPopular 
                    ? 'bg-white text-slate-900 border-2 shadow-2xl scale-102 z-10' 
                    : 'bg-white text-slate-900 border border-slate-100 shadow-sm hover:shadow-md'
                }`}
                style={isPopular ? { borderColor: primaryColor } : {}}
              >
                {/* Popular Badge */}
                {pkg.badge && (
                  <div className="absolute top-6 right-6">
                    <span 
                      className={`text-[10px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full ${
                        isPopular ? 'bg-[#000080] text-white' : 'bg-slate-100 text-slate-600'
                      }`}
                      style={!isPopular ? { color: primaryColor, backgroundColor: `${primaryColor}10` } : {}}
                    >
                      {pkg.badge}
                    </span>
                  </div>
                )}

                <div className="mb-8 pr-16">
                  <h3 className="text-2xl font-semibold mb-3 tracking-tight" style={{ fontFamily: headingFont }}>
                    {pkg.title}
                  </h3>
                  <p className={`text-sm leading-relaxed ${isPopular ? 'text-slate-700' : 'text-slate-500'}`}>
                    {pkg.description}
                  </p>
                </div>

                {/* Price Display */}
                <div className="mb-8 pt-6 border-t border-slate-200/20">
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-bold tracking-tight">
                      {pkg.price}
                    </span>
                    {pkg.period && (
                      <span className={`text-sm ${isPopular ? 'text-slate-600' : 'text-slate-500'}`}>
                        / {pkg.period}
                      </span>
                    )}
                  </div>
                  {pkg.deliveryTime && (
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-[#000080] font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{pkg.deliveryTime} delivery</span>
                    </div>
                  )}
                </div>

                {/* Features List */}
                <div className="flex-1 space-y-4 mb-8">
                  <h4 className={`text-xs font-bold uppercase tracking-wider ${isPopular ? 'text-slate-600' : 'text-slate-600'}`}>
                    What's Included
                  </h4>
                  <ul className="space-y-3.5">
                    {(pkg.features || []).map((feature: string, fIdx: number) => (
                      <li key={fIdx} className="flex items-start gap-3 text-sm">
                        <span 
                          className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5" 
                          style={{ backgroundColor: isPopular ? `${primaryColor}30` : `${primaryColor}15` }}
                        >
                          <Check className="w-3.5 h-3.5" style={{ color: primaryColor }} />
                        </span>
                        <span className={isPopular ? 'text-slate-800' : 'text-slate-700'}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Call to Action */}
                <div className="mt-auto pt-6">
                  <a
                    href={resolveContactCtaUrl(pkg.ctaText, pkg.ctaLink, '/contact-us')}
                    className="w-full py-4 px-6 rounded-xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all text-center"
                    style={
                      isPopular 
                        ? { backgroundColor: primaryColor, color: '#ffffff' } 
                        : { backgroundColor: '#0f172a', color: '#ffffff' }
                    }
                  >
                    <span>{pkg.ctaText}</span>
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
