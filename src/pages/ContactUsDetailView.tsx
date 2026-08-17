import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, Phone, MapPin, Send, MessageSquare, Sparkles, Loader2, CheckCircle } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import { cn } from '../lib/utils';
import HeroReviewProof from '../components/HeroReviewProof';
import { resolveSiteSettings } from '../lib/siteSettings';
import { leadService } from '../lib/leadService';

export default function ContactUsDetailView({ page }: { page?: any }) {
  const { content } = useCMS();
  const theme = content.theme || {};
  const headingFont = theme.fontFamily || 'Inter';
  const siteSettings = resolveSiteSettings(content.siteSettings);

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    subject: 'Web Design & Development',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    const res = await leadService.submitLead(formData);
    
    if (res.success) {
      setIsSuccess(true);
      setFormData({ fullName: '', email: '', subject: 'Web Design & Development', message: '' });
      setTimeout(() => setIsSuccess(false), 5000);
    } else {
      setError(res.error || 'Something went wrong. Please try again.');
    }
    setIsSubmitting(false);
  };
  
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
  const form = data.form || {
    title: "Send us a Message",
    subtitle: "We'll get back to you within 24 hours.",
    buttonText: "Send Inquiry"
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

      {/* Main Content: Info & Form */}
      <section className="py-24">
        <div className="max-w-[1400px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
            
            {/* Left: Contact Info & Locations */}
            <div className="space-y-12">
              <div className="space-y-4">
                <h2 className="text-3xl font-bold text-slate-900" style={{ fontFamily: headingFont }}>
                  {contactInfo.title}
                </h2>
                <p className="text-slate-600 text-lg">
                  {contactInfo.subtitle}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
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
                    viewport={{ once: true }}
                    transition={{ delay: idx * 0.1 }}
                    className="space-y-4 p-6 bg-slate-50 rounded-3xl border border-slate-100 hover:border-slate-200 transition-all group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#000080] group-hover:scale-110 transition-transform">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 mb-1">{loc.city}</h4>
                      <p className="text-sm text-slate-500 leading-relaxed">{loc.address}</p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-slate-200/60">
                      <a href={`mailto:${loc.email}`} className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-[#000080] transition-colors">
                        <Mail className="w-3.5 h-3.5" /> {loc.email}
                      </a>
                      {loc.phone && <a href={`tel:${loc.phone}`} className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-[#000080] transition-colors">
                        <Phone className="w-3.5 h-3.5" /> {loc.phone}
                      </a>}
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="bg-[#000080] p-8 rounded-3xl text-white space-y-6 relative overflow-hidden">
                <div className="relative z-10 space-y-4">
                  <h3 className="text-xl font-bold">Quick Contact</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <MessageSquare className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest opacity-60">Chat with us</p>
                        <p className="font-bold">Live Support 24/7</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                        <Send className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-widest opacity-60">Email Support</p>
                        <p className="font-bold">{content.siteSettings?.contactEmail || 'contact@profox.com'}</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl" />
              </div>
            </div>

            {/* Right: Inquiry Form */}
            <div className="bg-white border border-slate-200 p-8 sm:p-12 rounded-[40px] shadow-2xl relative">
              <div className="space-y-8">
                <div className="space-y-2 text-center lg:text-left">
                  <h2 className="text-3xl font-bold text-slate-900" style={{ fontFamily: headingFont }}>
                    {form.title}
                  </h2>
                  <p className="text-slate-500">
                    {form.subtitle}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                    <input 
                      type="text" 
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                      placeholder="John Doe"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm focus:bg-white focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                    <input 
                      type="email" 
                      required
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="john@company.com"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm focus:bg-white focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5 outline-none transition-all"
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Subject</label>
                    <select 
                      value={formData.subject}
                      onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm focus:bg-white focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5 outline-none transition-all appearance-none"
                    >
                      <option>Web Design & Development</option>
                      <option>Digital Strategy</option>
                      <option>Marketing Automation</option>
                      <option>Other Inquiry</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Your Message</label>
                    <textarea 
                      rows={5}
                      required
                      value={formData.message}
                      onChange={(e) => setFormData(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Tell us about your project goals..."
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3.5 text-sm focus:bg-white focus:border-[#000080] focus:ring-4 focus:ring-[#000080]/5 outline-none transition-all resize-none"
                    />
                  </div>
                  <div className="sm:col-span-2 pt-2">
                    <button 
                      type="submit"
                      disabled={isSubmitting}
                      className={cn(
                        "w-full font-bold py-4 rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 group cursor-pointer",
                        isSuccess ? "bg-green-600 text-white shadow-green-900/10" : "bg-[#000080] hover:bg-[#000066] text-white shadow-blue-900/10",
                        isSubmitting && "opacity-70 cursor-not-allowed"
                      )}
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending Inquiry...</span>
                        </>
                      ) : isSuccess ? (
                        <>
                          <CheckCircle className="w-4 h-4" />
                          <span>Message Sent Successfully!</span>
                        </>
                      ) : (
                        <>
                          <span>{form.buttonText}</span>
                          <Send className="w-4 h-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                        </>
                      )}
                    </button>
                  </div>
                  
                  <AnimatePresence>
                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="sm:col-span-2 text-red-500 text-xs font-bold text-center pt-2"
                      >
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>

                <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest">
                  We respect your privacy. No spam, ever.
                </p>
              </div>
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
