import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  MapPin, 
  Briefcase, 
  Search, 
  Send, 
  X, 
  CheckCircle2, 
  Upload, 
  Edit3, 
  Sparkles,
  Users,
  Target,
  Compass,
  Heart
} from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import { useAuth } from '../lib/AuthContext';
import CTA from '../components/CTA';
import HeroReviewProof from '../components/HeroReviewProof';

interface Position {
  id: string;
  title: string;
  location: string;
  department?: string;
  type?: string;
  description?: string;
  applyUrl?: string;
  active?: boolean;
}

interface CultureItem {
  id: string;
  title: string;
  description: string;
}

interface CareersData {
  hero?: {
    title?: string;
    subtitle?: string;
    subheading?: string;
    badgeText?: string;
    description?: string;
    subtitleParagraph?: string;
  };
  positions?: Position[];
  culture?: {
    title?: string;
    bgImage?: string;
    items?: CultureItem[];
  };
}

const defaultCareersData: CareersData = {
  hero: {
    title: "Open positions",
    subtitle: "We value experience, curiosity, empathy, and dedication; we look for thoughtful teammates who enjoy learning and helping others succeed. Take a look at the open roles below and share your resume. We’ll review it with care and reach out if there’s a good fit now or in the future.",
    badgeText: "CAREERS & OFFERS",
  },
  positions: [
    {
      id: "pos-1",
      title: "Product Experience Designer",
      location: "United States, New York",
      department: "Design & UX",
      type: "Full-time",
      description: "We are seeking a senior Product Experience Designer to craft high-impact digital solutions for enterprise clients.",
      active: true
    },
    {
      id: "pos-2",
      title: "Senior UX Designer",
      location: "United States, Remote",
      department: "Design & UX",
      type: "Full-time",
      description: "Lead user research, wireframing, and design systems for enterprise web applications.",
      active: true
    },
    {
      id: "pos-3",
      title: "Creative Director",
      location: "United States, New York",
      department: "Creative Strategy",
      type: "Full-time",
      description: "Drive brand vision, creative strategy, and digital storytelling across client engagements.",
      active: true
    },
    {
      id: "pos-4",
      title: "Brand and Visual Design Lead",
      location: "Remote",
      department: "Design & UX",
      type: "Full-time",
      description: "Own visual identity systems, typography, and interactive brand design.",
      active: true
    },
    {
      id: "pos-5",
      title: "Solutions Architect",
      location: "Remote",
      department: "Engineering",
      type: "Full-time",
      description: "Architect cloud infrastructure, API integrations, and scalable web software.",
      active: true
    },
    {
      id: "pos-6",
      title: "Ecommerce Solutions Architect",
      location: "Remote",
      department: "Engineering",
      type: "Full-time",
      description: "Build high-conversion headless e-commerce architectures for global brands.",
      active: true
    },
    {
      id: "pos-7",
      title: "Customer Experience Technology Lead",
      location: "Remote",
      department: "Technology",
      type: "Full-time",
      description: "Bridge marketing strategy and frontend software engineering to deliver seamless customer journeys.",
      active: true
    },
    {
      id: "pos-8",
      title: "Data Solutions Architect",
      location: "United States, Remote",
      department: "Data & AI",
      type: "Full-time",
      description: "Design real-time data pipelines, AI models, and enterprise analytics architectures.",
      active: true
    },
    {
      id: "pos-9",
      title: "AI and Automation Consultant",
      location: "United States, New York",
      department: "Data & AI",
      type: "Full-time",
      description: "Deploy autonomous AI agents, workflow automation pipelines, and machine learning solutions.",
      active: true
    },
    {
      id: "pos-10",
      title: "Technical Delivery Lead",
      location: "United States, Remote",
      department: "Engineering",
      type: "Full-time",
      description: "Lead cross-functional engineering teams delivering complex digital transformation projects.",
      active: true
    }
  ],
  culture: {
    title: "Why Work at Profox",
    bgImage: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1600",
    items: [
      {
        id: "c1",
        title: "Work That Actually Matters",
        description: "You will work on real business challenges, not throwaway tasks, helping teams grow and fix what is broken, allowing you to see the direct impact of your work."
      },
      {
        id: "c2",
        title: "Learn From Experienced People",
        description: "You collaborate with senior creatives, engineers, and strategists who share context, challenge your thinking, and help you grow through real projects."
      },
      {
        id: "c3",
        title: "Trust, Ownership, and Respect",
        description: "We trust people to own their work, manage their time, and speak honestly. We create a culture where accountability and respect come before process."
      },
      {
        id: "c4",
        title: "Room to Grow Over Time",
        description: "Profox is built for long-term growth, giving you space to improve your skills, take on more responsibility, and shape your own career path."
      }
    ]
  }
};

export default function CareersDetailView({ page }: { page?: any }) {
  const { content } = useCMS();
  const { isAdminOrEditor } = useAuth();
  const navigate = useNavigate();

  // Retrieve careers template blueprint data or fallback
  const blueprints = content.template_blueprints || [];
  const careersBlueprint = blueprints.find((b: any) => b.id === page?.template);
  
  const careersData: CareersData = page?.careersData || page?.serviceDetailData || careersBlueprint?.defaultData || defaultCareersData;

  const hero = {
    title: page?.heroTitle || careersData?.hero?.title || defaultCareersData.hero!.title,
    subtitle: careersData?.hero?.subtitle || "",
    description: page?.heroSubtitle || careersData?.hero?.description || careersData?.hero?.subtitleParagraph || defaultCareersData.hero!.description,
    badgeText: page?.heroSubheading || careersData?.hero?.subheading || careersData?.hero?.badgeText || defaultCareersData.hero!.badgeText,
  };

  const rawPositions = (careersData?.positions && careersData.positions.length > 0) 
    ? careersData.positions 
    : defaultCareersData.positions!;
  
  // Filter out inactive positions if flag exists
  const positions = rawPositions.filter(p => p.active !== false);

  const culture = careersData?.culture || defaultCareersData.culture!;

  // UI States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedRoleForApply, setSelectedRoleForApply] = useState<Position | null>(null);
  const [applicationSubmitted, setApplicationSubmitted] = useState(false);

  useEffect(() => {
    const businessName = content.siteSettings?.businessName || 'Profox web designer';
    let pageTitle = page?.seo?.metaTitle;
    if (!pageTitle || pageTitle.includes('Untitled Page') || pageTitle.includes('Dotlogics')) {
      const displayTitle = page?.title && page.title !== 'Untitled Page' ? page.title : 'Careers & Offers';
      pageTitle = `${displayTitle} | ${businessName}`;
    } else if (pageTitle.includes('Dotlogics')) {
      pageTitle = pageTitle.replace(/Dotlogics/g, businessName);
    }
    document.title = pageTitle;
    window.scrollTo(0, 0);
  }, [page, content.siteSettings?.businessName]);
  
  // Application form state
  const [applicantName, setApplicantName] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantLink, setApplicantLink] = useState('');
  const [applicantCover, setApplicantCover] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  // Departments list for tabs
  const departments = useMemo(() => {
    const depts = new Set<string>();
    positions.forEach(p => {
      if (p.department) depts.add(p.department);
    });
    return ['All', ...Array.from(depts)];
  }, [positions]);

  // Filtered positions
  const filteredPositions = useMemo(() => {
    return positions.filter(p => {
      const matchesSearch = searchQuery === '' || 
        p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.location.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = selectedDept === 'All' || p.department === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [positions, searchQuery, selectedDept]);

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applicantName || !applicantEmail) return;
    
    setApplicationSubmitted(true);
    setTimeout(() => {
      setApplicationSubmitted(false);
      setSelectedRoleForApply(null);
      setApplicantName('');
      setApplicantEmail('');
      setApplicantPhone('');
      setApplicantLink('');
      setApplicantCover('');
      setResumeFile(null);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-slate-100 selection:text-[#000080] overflow-x-hidden relative">
      
      {/* Top Header / Breadcrumb Hero */}
      <section className="pt-36 pb-16 bg-[#FBFBFD] border-b border-slate-200/60 relative">
        <div className="max-w-6xl mx-auto px-6">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-[#000080] transition-colors mb-8 bg-white border border-slate-200 px-3.5 py-1.5 rounded-full shadow-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="max-w-4xl space-y-6"
          >
            {hero.badgeText && (
              <span className="inline-block text-[11px] font-bold text-[#000080] bg-[#000080]/10 border border-[#000080]/20 px-3 py-1 rounded-full uppercase tracking-wider">
                {hero.badgeText}
              </span>
            )}
            
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-tight">
              {hero.title}
            </h1>

            {hero.subtitle && (
              <p className="text-xl sm:text-2xl font-bold text-[#000080] max-w-3xl leading-snug">
                {hero.subtitle}
              </p>
            )}

            <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-3xl font-normal">
              {hero.description}
            </p>
            <div className="flex flex-col items-start gap-4 pt-3 sm:flex-row sm:items-center">
              <a href="/contact-us" className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-1">Talk to Our Team</a>
              <HeroReviewProof />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Open Positions List & Filters */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6 space-y-10">
          
          {/* Controls Bar: Search & Department Tabs */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200">
            {/* Department Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
              {departments.map((dept) => (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                    selectedDept === dept
                      ? 'bg-[#000080] text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                  }`}
                >
                  {dept}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search position or location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium focus:outline-none focus:border-[#000080] focus:bg-white transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Roles Grid / Rows */}
          {filteredPositions.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 rounded-3xl border border-slate-200/80 space-y-4">
              <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto text-slate-400 border border-slate-200 shadow-sm">
                <Briefcase className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No positions found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No open roles match your current search criteria. Try selecting another department or clearing search filters.
              </p>
              <button
                onClick={() => { setSearchQuery(''); setSelectedDept('All'); }}
                className="text-xs font-bold text-[#000080] underline hover:text-[#000066]"
              >
                Reset Search Filters
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/80 border-t border-b border-slate-200">
              {filteredPositions.map((pos, idx) => (
                <motion.div
                  key={pos.id || idx}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.3, delay: idx * 0.03 }}
                  className="py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-slate-50/80 px-4 rounded-2xl transition-all"
                >
                  <div className="space-y-1.5">
                    <h3 className="text-lg sm:text-xl font-bold text-slate-900 group-hover:text-[#000080] transition-colors">
                      {pos.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1 font-medium text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" /> {pos.location}
                      </span>
                      {pos.type && (
                        <>
                          <span>•</span>
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-semibold">
                            {pos.type}
                          </span>
                        </>
                      )}
                      {pos.department && (
                        <>
                          <span>•</span>
                          <span className="text-slate-400 font-medium">{pos.department}</span>
                        </>
                      )}
                    </div>
                    {pos.description && (
                      <p className="text-xs text-slate-500 mt-2 line-clamp-2 max-w-2xl">
                        {pos.description}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 pt-2 sm:pt-0">
                    <button
                      onClick={() => {
                        if (pos.applyUrl && pos.applyUrl.startsWith('http')) {
                          window.open(pos.applyUrl, '_blank');
                        } else {
                          setSelectedRoleForApply(pos);
                        }
                      }}
                      className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold px-6 py-3 rounded-full transition-all shadow-sm hover:shadow-md hover:scale-[1.02]"
                    >
                      <span>Send Your Resume</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

        </div>
      </section>

      {/* Culture Section: Why Work at Profox web designer */}
      <section className="py-20 sm:py-32 bg-slate-950 text-white relative overflow-hidden">
        {culture.bgImage && (
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <img src={culture.bgImage} alt="Culture background" className="w-full h-full object-cover filter blur-xs" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950" />
          </div>
        )}

        <div className="max-w-6xl mx-auto px-6 relative z-10 space-y-16">
          <div className="max-w-2xl space-y-4">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-950/80 border border-emerald-800/60 px-3 py-1 rounded-full">
              CULTURE & VALUES
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              {culture.title || "Why Work at Profox"}
            </h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {culture.items?.map((item, idx) => (
              <motion.div
                key={item.id || idx}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                className="bg-slate-900/90 border border-slate-800 p-8 rounded-3xl space-y-4 shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center font-bold text-sm">
                    0{idx + 1}
                  </div>
                  <h3 className="text-lg font-bold text-white tracking-tight leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed font-normal">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Global CTA */}
      <CTA />

      {/* Application / Send Resume Modal Drawer */}
      <AnimatePresence>
        {selectedRoleForApply && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative overflow-hidden"
            >
              <button
                onClick={() => setSelectedRoleForApply(null)}
                className="absolute right-6 top-6 text-slate-400 hover:text-slate-700 bg-slate-100 p-2 rounded-full transition-colors"
              >
                <X className="w-4 h-4" />
              </button>

              {applicationSubmitted ? (
                <div className="py-12 text-center space-y-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-black text-slate-900">Resume Sent Successfully!</h3>
                  <p className="text-xs text-slate-600 max-w-md mx-auto leading-relaxed">
                    Thank you for applying for the <strong>{selectedRoleForApply.title}</strong> role. Our talent acquisition team will review your details with care and reach out to you shortly.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} className="space-y-5">
                  <div>
                    <span className="text-[10px] font-bold text-[#059669] bg-emerald-50 px-2.5 py-1 rounded-full uppercase tracking-wider border border-emerald-200">
                      JOB APPLICATION
                    </span>
                    <h3 className="text-2xl font-black text-slate-900 mt-2">
                      Apply for {selectedRoleForApply.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {selectedRoleForApply.location} • {selectedRoleForApply.department || 'Profox Careers'}
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Full Name <span className="text-red-500">*</span>
                      </label>
                      <input 
                        type="text" 
                        required
                        placeholder="John Doe"
                        value={applicantName}
                        onChange={(e) => setApplicantName(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:border-[#000080] focus:bg-white outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Email Address <span className="text-red-500">*</span>
                        </label>
                        <input 
                          type="email" 
                          required
                          placeholder="john@example.com"
                          value={applicantEmail}
                          onChange={(e) => setApplicantEmail(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:border-[#000080] focus:bg-white outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Phone Number
                        </label>
                        <input 
                          type="tel" 
                          placeholder="+1 (555) 000-0000"
                          value={applicantPhone}
                          onChange={(e) => setApplicantPhone(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:border-[#000080] focus:bg-white outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        LinkedIn Profile / Portfolio Link
                      </label>
                      <input 
                        type="url" 
                        placeholder="https://linkedin.com/in/username or portfolio link"
                        value={applicantLink}
                        onChange={(e) => setApplicantLink(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:border-[#000080] focus:bg-white outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Attach Resume (PDF, DOCX)
                      </label>
                      <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer">
                        <input 
                          type="file" 
                          accept=".pdf,.doc,.docx"
                          onChange={(e) => setResumeFile(e.target.files?.[0] || null)}
                          className="hidden"
                          id="resume-upload-input"
                        />
                        <label htmlFor="resume-upload-input" className="cursor-pointer space-y-1 block">
                          <Upload className="w-5 h-5 text-slate-400 mx-auto" />
                          <span className="text-xs font-bold text-[#000080] block">
                            {resumeFile ? resumeFile.name : 'Click to upload your resume'}
                          </span>
                          <span className="text-[10px] text-slate-400 block">
                            PDF, DOCX up to 10MB
                          </span>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Brief Cover Note / Why You'd Be a Great Fit
                      </label>
                      <textarea 
                        rows={3}
                        placeholder="Tell us about your background, projects, or curiosity..."
                        value={applicantCover}
                        onChange={(e) => setApplicantCover(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-medium focus:border-[#000080] focus:bg-white outline-none resize-none"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setSelectedRoleForApply(null)}
                      className="px-5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-[#059669] hover:bg-[#047857] text-white text-xs font-bold px-7 py-2.5 rounded-xl transition-all shadow-md flex items-center gap-2"
                    >
                      <span>Submit Application</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Admin Quick Edit Shortcut */}
      {isAdminOrEditor && (
        <button
          onClick={() => navigate('/admin')}
          className="fixed bottom-6 right-6 z-50 bg-white hover:bg-[#000066] text-slate-900 px-4 py-3 rounded-full shadow-2xl border border-slate-300 flex items-center gap-2 text-xs font-bold transition-all group hover:scale-105"
          title="Manage Careers & Offers in Admin Area"
        >
          <Edit3 className="w-4 h-4 text-[#000080] group-hover:text-slate-900" />
          <span>Manage Careers & Offers in Admin</span>
        </button>
      )}

    </div>
  );
}
