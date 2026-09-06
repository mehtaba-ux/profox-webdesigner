import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useLocation } from 'react-router-dom';
import { CalendarDays, FileText, Mail, Phone, MapPin, Send, MessageSquare, MessageCircle } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import HeroReviewProof from '../components/HeroReviewProof';
import QualifiedContactForm from '../components/QualifiedContactForm';
import PublicBookingFlow from '../components/PublicBookingFlow';
import { resolveSiteSettings } from '../lib/siteSettings';

type ContactMode = 'quote' | 'meeting';

export default function ContactUsDetailView({ page }: { page?: any }) {
  const location = useLocation();
  const { content } = useCMS();
  const theme = content.theme || {};
  const buttonRadius = theme.buttonRadius || 'rounded-lg';
  const siteSettings = resolveSiteSettings(content.siteSettings);
  const requestedMode = new URLSearchParams(location.search).get('intent') === 'meeting' ? 'meeting' : 'quote';
  const [contactMode, setContactMode] = useState<ContactMode>(requestedMode);

  useEffect(() => { setContactMode(requestedMode); }, [requestedMode]);

  const blueprints = content.template_blueprints || [];
  const blueprint = blueprints.find((b: any) => b.id === page?.template);
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

  const heroContent = content.hero || {};
  const trustedLogos = heroContent.trustedLogos || ['CLEAR', 'BROWN', 'M', 'Unilever'];

  const renderLogo = (item: any) => {
    if (typeof item === 'string') {
      return <div className="flex shrink-0 items-center gap-2 opacity-65 transition-opacity hover:opacity-100"><span className="text-xl font-semibold tracking-[-0.02em] text-slate-900">{item}</span></div>;
    }
    if (item.type === 'image' && item.image) {
      return <div className="flex shrink-0 items-center justify-center grayscale opacity-60 transition-all duration-300 hover:grayscale-0 hover:opacity-100"><img src={item.image} alt={item.name} className="h-8 w-auto max-w-[120px] object-contain md:h-10" /></div>;
    }
    if (item.type === 'logo' || item.value === 'BROWN') {
      return <div className="flex shrink-0 items-center gap-2 opacity-65 transition-opacity hover:opacity-100"><div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-900"><div className="h-4 w-4 rotate-45 border border-slate-900" /></div><span className="text-xl font-semibold tracking-[-0.02em] text-slate-900">{item.name || item.value}</span></div>;
    }
    let className = 'shrink-0 text-slate-900 opacity-65 transition-all hover:opacity-100 ';
    if (item.style === 'black') className += 'text-3xl font-bold';
    else if (item.style === 'italic') className += 'text-3xl font-semibold italic';
    else if (item.style === 'bold') className += 'text-xl font-semibold tracking-tight';
    else className += 'text-2xl font-semibold';
    return <div className={className}>{item.value || item.name}</div>;
  };

  const modeTabs = (
    <div className="mt-4 grid grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5" role="tablist" aria-label="How would you like to start?">
      <button
        type="button"
        role="tab"
        aria-selected={contactMode === 'quote'}
        onClick={() => setContactMode('quote')}
        className={`group flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-all sm:text-sm ${contactMode === 'quote' ? 'bg-white text-[var(--brand-primary)] shadow-[0_8px_24px_rgba(15,23,42,0.08)] ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
      >
        <FileText className={`h-4 w-4 transition-transform ${contactMode === 'quote' ? 'scale-105' : 'group-hover:-rotate-3'}`} />
        <span>Get a Quote</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={contactMode === 'meeting'}
        onClick={() => setContactMode('meeting')}
        className={`group flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold transition-all sm:text-sm ${contactMode === 'meeting' ? 'bg-[var(--brand-primary)] text-white shadow-[0_10px_26px_rgba(0,0,128,0.18)]' : 'text-slate-500 hover:bg-white/70 hover:text-slate-800'}`}
      >
        <CalendarDays className={`h-4 w-4 transition-transform ${contactMode === 'meeting' ? 'scale-105' : 'group-hover:rotate-3'}`} />
        <span>Book a Meeting</span>
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <section className="relative overflow-hidden bg-[#f7f8ff] pb-20 pt-40">
        <div className="relative z-10 mx-auto max-w-[1400px] px-6">
          <div className="max-w-4xl">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
              <h1 className="pf-display mb-6 text-slate-950">{hero.title}</h1>
              <p className="max-w-2xl text-lg leading-8 text-slate-600 md:text-xl">{hero.subtitle}</p>
              <div className="pt-6"><HeroReviewProof /></div>
            </motion.div>
          </div>
        </div>
        <div className="absolute right-0 top-0 z-0 h-full w-1/2 translate-x-1/4 -skew-x-12 bg-[var(--brand-primary)]/[0.05]" />
      </section>

      <section className="relative py-16 lg:min-h-screen lg:py-20">
        <div className="mx-auto max-w-[1400px] px-6">
          <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-12 xl:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <div className="space-y-7">
                <div className="space-y-4">
                  <div className="pf-eyebrow inline-flex items-center gap-2 text-[var(--brand-primary)]"><MapPin className="h-4 w-4" />Our Office</div>
                  <h2 className="pf-section-title max-w-xl text-slate-950">{contactInfo.title}</h2>
                  <p className="max-w-xl text-base leading-7 text-slate-600 lg:text-lg">{contactInfo.subtitle}</p>
                </div>

                <div className="space-y-4">
                  {[{ city: siteSettings.address, address: siteSettings.businessAddress, email: siteSettings.contactEmail, phone: siteSettings.contactPhone }].map((loc: any, idx: number) => (
                    <motion.div key={idx} initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} whileHover={{ y: -2 }} viewport={{ once: true }} transition={{ duration: 0.24, delay: idx * 0.08 }} className="group relative overflow-hidden rounded-3xl border border-slate-200/90 bg-white p-6 shadow-[0_16px_45px_rgba(15,23,42,0.055)] transition-all hover:border-slate-300 hover:shadow-[0_22px_55px_rgba(15,23,42,0.08)]">
                      <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/3 -translate-y-1/3 rounded-full bg-[var(--brand-primary)]/[0.05] blur-2xl" />
                      <div className="relative z-10">
                        <div className="flex items-start justify-between gap-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--brand-primary)]/10 bg-[var(--brand-primary)]/[0.05] text-[var(--brand-primary)] transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-105"><MapPin className="h-5 w-5" /></div><span className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[11px] font-bold tracking-[.05em] text-emerald-700">Available worldwide</span></div>
                        <div className="mt-5"><h3 className="pf-card-title text-slate-950">{loc.city}</h3><p className="mt-1.5 text-sm leading-6 text-slate-500">{loc.address}</p></div>
                        <div className="mt-5 grid gap-2 border-t border-slate-100 pt-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                          <a href={`mailto:${loc.email}`} className={`flex min-h-11 items-center gap-3 border border-slate-200 bg-slate-50/80 px-3 text-xs font-semibold text-slate-600 transition-all hover:border-[var(--brand-primary)]/20 hover:bg-[var(--brand-primary)]/[0.04] hover:text-[var(--brand-primary)] ${buttonRadius}`}><Mail className="h-4 w-4 shrink-0" /><span className="truncate">{loc.email}</span></a>
                          {loc.phone && <a href={`tel:${loc.phone}`} className={`flex min-h-11 items-center gap-3 border border-slate-200 bg-slate-50/80 px-3 text-xs font-semibold text-slate-600 transition-all hover:border-[var(--brand-primary)]/20 hover:bg-[var(--brand-primary)]/[0.04] hover:text-[var(--brand-primary)] ${buttonRadius}`}><Phone className="h-4 w-4 shrink-0" /><span className="truncate">{loc.phone}</span></a>}
                        </div>
                        {(loc.address || loc.city) && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([loc.address, loc.city].filter(Boolean).join(', '))}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[var(--brand-primary)] transition-all hover:gap-3"><MapPin className="h-3.5 w-3.5" />View office location</a>}
                      </div>
                    </motion.div>
                  ))}
                </div>

                <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.2 }} className="relative overflow-hidden rounded-3xl bg-[var(--brand-primary)] p-6 text-white shadow-[0_18px_42px_rgba(0,0,128,0.18)]">
                  <div className="relative z-10">
                    <div className="flex items-center justify-between gap-4"><h3 className="pf-card-title text-white">Quick Contact</h3><div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><MessageSquare className="h-4 w-4" /></div></div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                      <div className={`flex items-center gap-3 bg-white/[0.07] p-3 transition-colors hover:bg-white/[0.12] ${buttonRadius}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"><MessageSquare className="h-4 w-4" /></div><div><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">Chat with us</p><p className="text-sm font-semibold">Live Support 24/7</p></div></div>
                      <a href={`mailto:${siteSettings.contactEmail}`} className={`flex items-center gap-3 bg-white/[0.07] p-3 transition-colors hover:bg-white/[0.12] ${buttonRadius}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10"><Send className="h-4 w-4" /></div><div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">Email support</p><p className="truncate text-sm font-semibold">{siteSettings.contactEmail}</p></div></a>
                    </div>
                  </div>
                  <div className="absolute right-0 top-0 h-32 w-32 translate-x-1/2 -translate-y-1/2 rounded-full bg-white/5 blur-2xl" />
                </motion.div>
              </div>
            </div>

            <div className="min-w-0 lg:self-start">
              <div className="mb-3 rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_10px_30px_rgba(15,23,42,0.045)]">{modeTabs}</div>
              <AnimatePresence mode="wait" initial={false}>
                {contactMode === 'quote' ? (
                  <motion.div key="quote" role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: 'easeOut' }}><QualifiedContactForm /></motion.div>
                ) : (
                  <motion.div key="meeting" role="tabpanel" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: 'easeOut' }}><PublicBookingFlow embedded onRequestQuote={() => setContactMode('quote')} /></motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>

      {trustedBy.showSlider && (
        <section className="overflow-hidden border-t border-slate-100 bg-slate-50 py-24">
          <div className="mx-auto mb-12 max-w-[1400px] space-y-3 px-6 text-center"><div className="pf-eyebrow inline-flex items-center gap-2 text-[var(--brand-primary)]"><MessageCircle className="h-4 w-4" /><span>Industry Leaders</span></div><h2 className="pf-section-title text-slate-950">{trustedBy.title}</h2><p className="mx-auto max-w-xl text-sm leading-6 text-slate-500">{trustedBy.subtitle}</p></div>
          <div className="relative flex w-full items-center overflow-hidden" style={{ maskImage: 'linear-gradient(to right, transparent 0%, #000 15%, #000 85%, transparent 100%)', WebkitMaskImage: 'linear-gradient(to right, transparent 0%, #000 15%, #000 85%, transparent 100%)' }}>
            <div className="flex w-full flex-shrink-0 items-center justify-around gap-16 px-4 animate-scroll-logos">{trustedLogos.map((item: any, idx: number) => <React.Fragment key={idx}>{renderLogo(item)}</React.Fragment>)}</div>
            <div className="flex w-full flex-shrink-0 items-center justify-around gap-16 px-4 animate-scroll-logos">{trustedLogos.map((item: any, idx: number) => <React.Fragment key={`clone-${idx}`}>{renderLogo(item)}</React.Fragment>)}</div>
          </div>
        </section>
      )}
    </div>
  );
}
