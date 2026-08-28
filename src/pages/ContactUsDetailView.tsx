import React from 'react';
import { motion } from 'motion/react';
import { Mail, Phone, MapPin, Send, MessageSquare, Sparkles } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import HeroReviewProof from '../components/HeroReviewProof';
import QualifiedContactForm from '../components/QualifiedContactForm';
import { resolveSiteSettings } from '../lib/siteSettings';

export default function ContactUsDetailView({ page }: { page?: any }) {
  const { content } = useCMS();
  const theme = content.theme || {};
  const headingFont = theme.fontFamily || 'Inter';
  const siteSettings = resolveSiteSettings(content.siteSettings);

  // Load blueprint data if present - Priority 1: Exact template ID match
  const blueprints = content.template_blueprints || [];
  const blueprint = blueprints.find((b: any) => b.id === page?.template);

  // Get template data - Priority: Page specific data > Blueprint defaults
  const data = page?.serviceDetailData || page?.data || blueprint?.defaultData || {};
  const hero = data.hero || {
    title: "Let's Start a Conversation",
    subtitle: "We're here to help you navigate your digital transformation journey.",
    image: "https://images.unsplash.com/photo-1534536281715-e28d76689b4d?auto=format&fit=crop&q=80&w=2000"
  };
  const contactInfo = data.contactInfo || {
    title: "Get in Touch",
    subtitle: "Have a project in mind? Let's discuss how we can help your business grow.",
    locations: []
  };
  const trustedBy = data.trustedBy || {
    showSlider: true,
    title: "Trusted By Global Leaders",
    subtitle: "Join the companies scaling their digital impact with us."
  };

  // Source of Truth Logos
  const heroContent = content.hero || {};
  const trustedLogos = heroContent.trustedLogos || ['CLEAR', 'BROWN', 'M', 'Unilever'];

  const renderLogo = (item: any) => {
    if (typeof item === 'string') {
      return (
        <div className="flex items-center gap-2 drop-shadow-md shrink-0 opacity-70 hover:opacity-100 transition-opacity">
          <span className="text-slate-900 font-serif text-xl tracking-wide font-bold">{item}</span>
        </div>
      );
    }

    if (item.type === 'image' && item.image) {
      return (
        <div className="flex items-center justify-center grayscale hover:grayscale-0 opacity-60 hover:opacity-100 transition-all duration-300 shrink-0">
          <img src={item.image} alt={item.name} className="h-8 md:h-10 w-auto object-contain max-w-[120px]" />
        </div>
      );
    }

    if (item.type === 'logo' || item.value === 'BROWN') {
      return (
        <div className="flex items-center gap-2 drop-shadow-md shrink-0 opacity-70 hover:opacity-100 transition-opacity">
          <div className="w-8 h-8 rounded-full border-2 border-slate-900 flex items-center justify-center">
            <div className="w-4 h-4 border border-slate-900 rotate-45"></div>
          </div>
          <span className="text-slate-900 font-serif text-xl tracking-wide">{item.name || item.value}</span>
        </div>
      );
    }

    let className = "text-slate-900 drop-shadow-md shrink-0 opacity-70 hover:opacity-100 transition-all ";
    if (item.style === 'black') className += "text-3xl font-black";
    else if (item.style === 'italic') className += "text-4xl font-serif italic";
    else if (item.style === 'bold') className += "text-xl font-bold tracking-tight";
    else className += "text-2xl font-bold";

    return <div className={className}>{item.value || item.name}</div>;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Simple Hero Section */}
      <section className="relative pt-40 pb-20 overflow-hidden bg-slate-50">
        <div className="max-w-[1400px] mx-auto px-6 relative z-10">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1
                className="text-5xl md:text-7xl font-bold text-slate-900 leading-tight mb-6 tracking-tight"
                style={{ fontFamily: headingFont }}
              >
                {hero.title}
              </h1>
              <p className="text-lg md:text-xl text-slate-600 leading-relaxed max-w-2xl">
                {hero.subtitle}
              </p>
              <div className="pt-6"><HeroReviewProof /></div>
            </motion.div>
          </div>
        </div>

        {/* Background Decorative Element */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-[#000080]/5 -skew-x-12 translate-x-1/4 z-0" />
      </section>

      {/* Main Content: sticky office information + compact inquiry experience */}
      <section className="relative py-16 lg:min-h-screen lg:py-20">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="grid grid-cols-1 gap-12 items-start lg:grid-cols-[0.82fr_1.18fr] lg:gap-12 xl:gap-16">

            {/* Left: sticky office and contact information */}
            <div className="lg:sticky lg:top-28 lg:self-start">
              <div className="space-y-7">
                <div className="space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#000080]/10 bg-[#000080]/5 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.18em] text-[#000080]">
                    <MapPin className="h-3.5 w-3.5" />
                    Our Office
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 lg:text-4xl" style={{ fontFamily: headingFont }}>
                    {contactInfo.title}
                  </h2>
                  <p className="max-w-xl text-base leading-7 text-slate-600 lg:text-lg">
                    {contactInfo.subtitle}
                  </p>
                </div>

                <div className="space-y-4">
                  {[{
                    city: siteSettings.address,
                    address: siteSettings.businessAddress,
                    email: siteSettings.contactEmail,
                    phone: siteSettings.contactPhone,
                  }].map((loc: any, idx: number) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      whileHover={{ y: -4 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.25, delay: idx * 0.08 }}
                      className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.06)] transition-shadow hover:shadow-[0_24px_60px_rgba(15,23,42,0.10)]"
                    >
                      <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#000080]/5 blur-2xl" />
                      <div className="relative z-10">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#000080]/10 bg-[#000080]/5 text-[#000080] transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3">
                            <MapPin className="h-5 w-5" />
                          </div>
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[.12em] text-emerald-700">Available worldwide</span>
                        </div>

                        <div className="mt-5">
                          <h4 className="text-lg font-black text-slate-900">{loc.city}</h4>
                          <p className="mt-1 text-sm leading-6 text-slate-500">{loc.address}</p>
                        </div>

                        <div className="mt-5 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                          <a href={`mailto:${loc.email}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs font-bold text-slate-600 transition-all hover:border-[#000080]/20 hover:bg-[#000080]/5 hover:text-[#000080]">
                            <Mail className="h-4 w-4 shrink-0" />
                            <span className="truncate">{loc.email}</span>
                          </a>
                          {loc.phone && (
                            <a href={`tel:${loc.phone}`} className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs font-bold text-slate-600 transition-all hover:border-[#000080]/20 hover:bg-[#000080]/5 hover:text-[#000080]">
                              <Phone className="h-4 w-4 shrink-0" />
                              <span className="truncate">{loc.phone}</span>
                            </a>
                          )}
                        </div>

                        {(loc.address || loc.city) && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc.address, loc.city].filter(Boolean).join(', '))}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-4 inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[.12em] text-[#000080] transition-all hover:gap-3"
                          >
                            <MapPin className="h-3.5 w-3.5" />
                            View office location
                          </a>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  whileHover={{ y: -3 }}
                  transition={{ duration: 0.2 }}
                  className="relative overflow-hidden rounded-3xl bg-[#000080] p-6 text-white shadow-xl shadow-blue-950/10"
                >
                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-lg font-bold">Quick Contact</h3>
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><MessageSquare className="h-4 w-4" /></div>
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 transition-colors hover:bg-white/10">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                          <MessageSquare className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-widest opacity-60">Chat with us</p>
                          <p className="text-sm font-bold">Live Support 24/7</p>
                        </div>
                      </div>
                      <a href={`mailto:${siteSettings.contactEmail}`} className="flex items-center gap-3 rounded-2xl bg-white/5 p-3 transition-colors hover:bg-white/10">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10">
                          <Send className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[9px] uppercase tracking-widest opacity-60">Email Support</p>
                          <p className="truncate text-sm font-bold">{siteSettings.contactEmail}</p>
                        </div>
                      </a>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
                </motion.div>
              </div>
            </div>

            {/* Right: conversion-optimized inquiry experience configured from Admin */}
            <div className="min-w-0 lg:self-start">
              <QualifiedContactForm />
            </div>
          </div>
        </div>
      </section>

      {/* Source of Truth: Trusted Brands Slider */}
      {trustedBy.showSlider && (
        <section className="py-24 bg-slate-50 border-t border-slate-100 overflow-hidden">
          <div className="max-w-[1400px] mx-auto px-6 mb-12 text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#000080]/5 border border-[#000080]/10 rounded-full text-[#000080] text-[10px] font-bold uppercase tracking-widest">
              <Sparkles className="w-3 h-3" />
              <span>Industry Leaders</span>
            </div>
            <h2 className="text-3xl font-bold text-slate-900" style={{ fontFamily: headingFont }}>{trustedBy.title}</h2>
            <p className="text-slate-500 max-w-xl mx-auto text-sm">{trustedBy.subtitle}</p>
          </div>

          <div className="flex items-center overflow-hidden relative w-full" style={{ maskImage: 'linear-gradient(to right, transparent 0%, #000 15%, #000 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 15%, #000 85%, transparent 100%)' }}>
            <div className="flex items-center flex-shrink-0 w-full justify-around gap-16 px-4 animate-scroll-logos">
              {trustedLogos.map((item: any, idx: number) => (
                <React.Fragment key={idx}>{renderLogo(item)}</React.Fragment>
              ))}
            </div>
            <div className="flex items-center flex-shrink-0 w-full justify-around gap-16 px-4 animate-scroll-logos">
              {trustedLogos.map((item: any, idx: number) => (
                <React.Fragment key={`clone-${idx}`}>{renderLogo(item)}</React.Fragment>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
