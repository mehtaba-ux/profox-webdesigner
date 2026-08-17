import React, { useState } from 'react';
import { CustomPage, PageBlock, PageBlockItem, SEOConfig } from '../../types';
import ImageUploader from './ImageUploader';
import { defaultBlueprintsList } from './TemplateManager';
import { 
  FileText, 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  ExternalLink, 
  Trash2, 
  Edit3, 
  Eye, 
  Globe, 
  Copy, 
  Sparkles, 
  Layout, 
  Check, 
  Layers, 
  Share2, 
  Code, 
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon,
  HelpCircle,
  BarChart2,
  FilePlus,
  RefreshCw,
  Video,
  Grid,
  Users,
  DollarSign,
  MessageSquare,
  AlignLeft,
  Zap,
  Rss,
  Upload,
  Loader2,
  Award
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCMS } from '../../lib/CMSProvider';
import { useConfirmContext } from './ConfirmContext';
import { ConfirmButton } from './ConfirmButton';
import { defaultPortfolioItems } from '../../data';
import { uploadOptimizedFile } from '../../lib/optimizedUpload';
import { getCanonicalUrl, getPagePath, isServicePage, sanitizeSeoSlug } from '../../lib/seoUrls';

function ImageUploaderButton({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      const isImage = file.type.startsWith('image/');
      if (!isImage) {
        alert('Please upload an image file.');
        setUploading(false);
        return;
      }

      const result = await uploadOptimizedFile(file);
      onChange(result.url);
    } catch (err: any) {
      console.error('Upload error:', err);
      alert(`Upload failed: ${err.message || err}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div>
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileUpload} 
        accept="image/*" 
        className="hidden" 
      />
      <button type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-all flex items-center gap-1 shrink-0 h-8 self-end"
        title="Upload Image">
        {uploading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#000080]" />
        ) : (
          <Upload className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}

interface PagesManagerProps {
  pages: CustomPage[];
  onSavePage: (page: CustomPage) => Promise<void>;
  onDeletePage: (pageId: string) => Promise<void>;
  onRestoreDefaults?: () => Promise<void>;
}

export default function PagesManager({ pages, onSavePage, onDeletePage, onRestoreDefaults }: PagesManagerProps) {
  const { confirm: confirmAction } = useConfirmContext();
  const { content } = useCMS();
  const navigate = useNavigate();
  const [selectedPage, setSelectedPage] = useState<CustomPage | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editorTab, setEditorTab] = useState<'content' | 'blocks' | 'seo' | 'social' | 'schema' | 'template'>('content');
  const [templateSubTab, setTemplateSubTab] = useState<string>('Hero');
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [savedMessage, setSavedMessage] = useState('');
  const [saving, setSaving] = useState(false);

  // Helper to create blank page
  const handleCreateNewPage = () => {
    const newId = `page-${Date.now()}`;
    const newPage: CustomPage = {
      id: newId,
      title: 'Untitled Page',
      slug: `new-page-${Math.floor(Math.random() * 1000)}`,
      status: 'draft',
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      heroTitle: 'New Page Heading',
      heroSubtitle: 'Enter a brief subtitle describing the purpose of this page.',
      coverImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
      bodyContent: 'Write your page content here. You can format paragraphs, add details about your services or company, and insert custom content blocks below.',
      blocks: [],
      seo: {
        metaTitle: 'Untitled Page | Profox web designer',
        metaDescription: 'Discover more about our enterprise solutions and digital expertise at Profox web designer.',
        focusKeyword: '',
        canonicalUrl: '',
        ogTitle: 'Untitled Page | Profox web designer',
        ogDescription: 'Discover more about our enterprise solutions and digital expertise at Profox web designer.',
        ogImage: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
        noIndex: false,
        schemaType: 'WebPage'
      }
    };
    setSelectedPage(newPage);
    setIsEditing(true);
    setEditorTab('content');
  };

  const handleEditPage = (page: CustomPage) => {
    setSelectedPage({ ...page });
    setIsEditing(true);
    setEditorTab('content');
  };

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    if (isEditing) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, selectedPage]);

  const handleSave = async () => {
    if (!selectedPage) return;
    setSaving(true);
    try {
      // Short delay for visual processing feedback
      await new Promise((resolve) => setTimeout(resolve, 600));
      const updatedPage: CustomPage = {
        ...selectedPage,
        updatedAt: new Date().toISOString().split('T')[0],
        slug: sanitizeSeoSlug(selectedPage.slug)
      };
      updatedPage.seo = { ...updatedPage.seo, canonicalUrl: getCanonicalUrl(updatedPage) };
      await onSavePage(updatedPage);
      setSelectedPage(updatedPage);
      setSavedMessage('Page saved successfully!');
      setTimeout(() => setSavedMessage(''), 4000);
    } catch (err: any) {
      console.error('Error saving page:', err);
      alert('Failed to save page: ' + (err?.message || 'Check network connection or image size limits.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pageId: string) => {
    if (await confirmAction('Delete Page', 'Are you sure you want to delete this page? This action cannot be undone.')) {
      await onDeletePage(pageId);
      if (selectedPage?.id === pageId) {
        setIsEditing(false);
        setSelectedPage(null);
      }
    }
  };

  // SEO Score Calculator
  const calculateSEOScore = (page: CustomPage) => {
    if (!page.seo) return { score: 0, items: [] };

    const kw = page.seo.focusKeyword?.toLowerCase().trim() || '';
    const title = page.seo.metaTitle?.toLowerCase() || '';
    const desc = page.seo.metaDescription?.toLowerCase() || '';
    const slug = page.slug?.toLowerCase() || '';
    const body = (page.bodyContent + ' ' + page.heroTitle + ' ' + page.heroSubtitle).toLowerCase();

    let score = 0;
    const checks = [];

    // Check 1: Focus keyword set
    if (kw.length> 0) {
      score += 10;
      checks.push({ label: 'Focus keyword specified', pass: true });
    } else {
      checks.push({ label: 'Focus keyword specified', pass: false, tip: 'Add a target focus keyword for SEO analysis' });
    }

    // Check 2: Keyword in Title
    if (kw && title.includes(kw)) {
      score += 15;
      checks.push({ label: 'Focus keyword in Meta Title', pass: true });
    } else {
      checks.push({ label: 'Focus keyword in Meta Title', pass: false, tip: 'Include your focus keyword in the meta title' });
    }

    // Check 3: Keyword in Description
    if (kw && desc.includes(kw)) {
      score += 15;
      checks.push({ label: 'Focus keyword in Meta Description', pass: true });
    } else {
      checks.push({ label: 'Focus keyword in Meta Description', pass: false, tip: 'Include focus keyword naturally in the meta description' });
    }

    // Check 4: Keyword in Slug
    if (kw && slug.includes(kw.replace(/\s+/g, '-'))) {
      score += 10;
      checks.push({ label: 'Focus keyword in URL Slug', pass: true });
    } else {
      checks.push({ label: 'Focus keyword in URL Slug', pass: false, tip: 'Use focus keyword inside the page URL slug' });
    }

    // Check 5: Keyword in Body
    if (kw && body.includes(kw)) {
      score += 10;
      checks.push({ label: 'Focus keyword in Page Content', pass: true });
    } else {
      checks.push({ label: 'Focus keyword in Page Content', pass: false, tip: 'Mention your focus keyword in the hero or body content' });
    }

    // Check 6: Title length
    const titleLen = page.seo.metaTitle?.length || 0;
    if (titleLen>= 30 && titleLen <= 65) {
      score += 10;
      checks.push({ label: `Meta Title length optimal (${titleLen}/60 chars)`, pass: true });
    } else {
      checks.push({ label: `Meta Title length optimal (${titleLen}/60 chars)`, pass: false, tip: 'Keep meta title between 30 and 60 characters for Google SERP' });
    }

    // Check 7: Meta Description length
    const descLen = page.seo.metaDescription?.length || 0;
    if (descLen>= 100 && descLen <= 160) {
      score += 10;
      checks.push({ label: `Meta Description length optimal (${descLen}/160 chars)`, pass: true });
    } else {
      checks.push({ label: `Meta Description length optimal (${descLen}/160 chars)`, pass: false, tip: 'Keep meta description between 100 and 160 characters' });
    }

    // Check 8: OpenGraph Social Image
    if (page.seo.ogImage || page.coverImage) {
      score += 10;
      checks.push({ label: 'Social Share (OG) Image configured', pass: true });
    } else {
      checks.push({ label: 'Social Share (OG) Image missing', pass: false, tip: 'Add an OpenGraph image for social media preview cards' });
    }

    // Check 9: Schema.org Structured Data
    if (page.seo.schemaType) {
      score += 10;
      checks.push({ label: `Schema.org Structured Data (${page.seo.schemaType})`, pass: true });
    } else {
      checks.push({ label: 'Schema.org Structured Data type set', pass: false, tip: 'Select a Schema type for Google rich snippet markup' });
    }

    return { score, checks };
  };

  const filteredPages = pages.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Schema JSON-LD Generator
  const generateSchemaJSON = (page: CustomPage) => {
    return JSON.stringify({
      "@context": "https://schema.org",
      "@type": page.seo?.schemaType || "WebPage",
      "name": page.seo?.metaTitle || page.title,
      "description": page.seo?.metaDescription || page.heroSubtitle,
      "url": getCanonicalUrl(page),
      "publisher": {
        "@type": "Organization",
        "name": "Profox web designer",
        "logo": "https://profoxwebdesigner.com/logo.png"
      },
      "datePublished": page.createdAt,
      "dateModified": page.updatedAt
    }, null, 2);
  };

  // Block Builder Helpers
  const addBlock = (type: PageBlock['type']) => {
    if (!selectedPage) return;
    const newId = `block-${Date.now()}`;
    
    let newBlock: PageBlock = {
      id: newId,
      type,
      heading: 'Section Heading',
      subheading: 'Enter subheadline or section description...',
      body: 'Write paragraph text or detailed description here...',
    };

    if (type === 'features') {
      newBlock.heading = 'Key Features & Capabilities';
      newBlock.subheading = 'Accelerate your digital growth with enterprise engineering.';
      newBlock.items = [
        { title: 'Custom Architecture', description: 'Tailored solutions built for scale and high performance.', icon: 'cpu' },
        { title: 'Cloud Automation', description: 'CI/CD deployment and modern cloud server infrastructure.', icon: 'sparkles' },
        { title: 'AI Integration', description: 'Next-gen LLM workflows and intelligent predictive analytics.', icon: 'bot' }
      ];
    } else if (type === 'quote') {
      newBlock.heading = 'Sarah Jenkins';
      newBlock.subheading = 'VP of Engineering, Global Tech Corp';
      newBlock.body = 'Profox web designer transformed our product experience with unmatched speed, design precision, and technical rigor.';
      newBlock.imageUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400';
    } else if (type === 'cta') {
      newBlock.heading = 'Ready to elevate your digital presence?';
      newBlock.subheading = 'Schedule a technical discovery session with our executive consulting team.';
      newBlock.buttonText = 'Get Started Today';
      newBlock.buttonUrl = '/contact-us';
      newBlock.bgColor = 'emerald';
    } else if (type === 'text') {
      newBlock.heading = 'In-Depth Overview';
      newBlock.body = 'Our multidisciplinary teams combine user experience design, rapid prototyping, and cloud-native software development to solve complex business challenges. We partner closely with leadership teams to deliver sustainable technical impact.';
      newBlock.imagePosition = 'right';
      newBlock.imageUrl = 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200';
    } else if (type === 'image') {
      newBlock.heading = 'High Impact Visual Showcase';
      newBlock.imageUrl = 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200';
      newBlock.imagePosition = 'full';
    } else if (type === 'gallery') {
      newBlock.heading = 'Photo & Project Gallery';
      newBlock.subheading = 'Browse high-resolution visual highlights from our portfolio.';
      newBlock.images = [
        'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=800',
        'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=800'
      ];
    } else if (type === 'faq') {
      newBlock.heading = 'Frequently Asked Questions';
      newBlock.subheading = 'Everything you need to know about our service engagement model.';
      newBlock.items = [
        { title: 'What is the typical project timeline?', description: 'Most enterprise consulting engagements run between 4 to 12 weeks depending on technical scope.' },
        { title: 'How do you handle data security?', description: 'We adhere to SOC 2 Type II, ISO 27001 standards and end-to-end encryption protocols.' },
        { title: 'Can we request custom integrations?', description: 'Yes! We specialize in custom API gateways, legacy migrations, and CRM/ERP integrations.' }
      ];
    } else if (type === 'pricing') {
      newBlock.heading = 'Transparent Pricing Plans';
      newBlock.subheading = 'Choose a tier that fits your growth trajectory and engineering demands.';
      newBlock.items = [
        { title: 'Starter Tier', price: '$4,900', description: 'Ideal for early-stage web apps and MVP validation.', badge: '', buttonText: 'Select Starter', buttonUrl: '#' },
        { title: 'Enterprise Pro', price: '$12,500', description: 'Full-stack development, custom CI/CD & 24/7 support.', badge: 'MOST POPULAR', buttonText: 'Choose Enterprise', buttonUrl: '#' }
      ];
    } else if (type === 'team') {
      newBlock.heading = 'Meet Our Leadership';
      newBlock.subheading = 'Experienced software architects, designers, and growth specialists.';
      newBlock.items = [
        { title: 'Marcus Vance', role: 'Chief Technology Officer', description: 'Former VP of Eng with 15+ years scaling distributed systems.', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=400' },
        { title: 'Elena Rostova', role: 'Head of UX & Product Design', description: 'Award-winning design lead specializing in design systems.', image: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=400' }
      ];
    } else if (type === 'stats') {
      newBlock.heading = 'Proven Track Record';
      newBlock.subheading = 'Key metrics demonstrating our commitment to client success.';
      newBlock.items = [
        { statNumber: '99.99%', statLabel: 'System Availability Uptime' },
        { statNumber: '250+', statLabel: 'Enterprise Products Launched' },
        { statNumber: '4.9/5.0', statLabel: 'Client Satisfaction Rating' },
        { statNumber: '<15ms', statLabel: 'Global API Latency' }
      ];
    } else if (type === 'video') {
      newBlock.heading = 'See Profox web designer in Action';
      newBlock.subheading = 'Watch our 2-minute overview video on digital transformation.';
      newBlock.videoUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ';
    }

    setSelectedPage({
      ...selectedPage,
      blocks: [...(selectedPage.blocks || []), newBlock]
    });
  };

  const removeBlock = (blockId: string) => {
    if (!selectedPage) return;
    setSelectedPage({
      ...selectedPage,
      blocks: (selectedPage.blocks || []).filter(b => b.id !== blockId)
    });
  };

  const moveBlock = (index: number, direction: 'up' | 'down') => {
    if (!selectedPage || !selectedPage.blocks) return;
    const blocks = [...selectedPage.blocks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex>= blocks.length) return;

    const temp = blocks[index];
    blocks[index] = blocks[targetIndex];
    blocks[targetIndex] = temp;

    setSelectedPage({ ...selectedPage, blocks });
  };

  const duplicateBlock = (index: number) => {
    if (!selectedPage || !selectedPage.blocks) return;
    const blocks = [...selectedPage.blocks];
    const sourceBlock = blocks[index];
    const duplicated: PageBlock = {
      ...JSON.parse(JSON.stringify(sourceBlock)),
      id: `block-${Date.now()}`
    };
    blocks.splice(index + 1, 0, duplicated);
    setSelectedPage({ ...selectedPage, blocks });
  };

  // ---------------- LIST VIEW ----------------
  if (!isEditing || !selectedPage) {
    return (
      <div className="space-y-6">
        {/* Header Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-6 rounded-2xl shadow-lg">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="w-6 h-6 text-[#000080]" />
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">WordPress-Style Pages</h2>
              <span className="bg-[#000080]/20 text-[#000080] text-xs font-semibold px-2.5 py-0.5 rounded-full border border-[#000080]/30">
                {pages.length} Custom {pages.length === 1 ? 'Page' : 'Pages'}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              Create, customize, and optimize dynamic pages for Google Search indexing & high-conversion visual performance.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {onRestoreDefaults && (
              <button onClick={async () => {
                  if (await confirmAction('Restore Standard Pages', 'Are you sure you want to restore and synchronize all standard pages (Pricing, About Us, Careers, Contact Us, Services, Policies)? Existing content will be preserved.')) {
                    await onRestoreDefaults();
                  }
                }}
                className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-xl text-sm transition-all border border-slate-200"
                title="Restore all standard pages if any are missing">
                <RefreshCw className="w-4 h-4" /> Restore Standard Pages
              </button>
            )}
            <button 
              onClick={handleCreateNewPage}
              className="inline-flex items-center gap-2 bg-[#000080] hover:bg-[#000066] text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-lg hover:scale-[1.02]"
            >
              <Plus className="w-4 h-4" /> Add New Page
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-3.5" />
          <input
            type="text"
            placeholder="Search pages by title or slug..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-11 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
          />
        </div>

        {/* Pages Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="bg-slate-50/80 text-xs uppercase font-semibold text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-4 px-6">Page Title</th>
                  <th className="py-4 px-6">URL Slug</th>
                  <th className="py-4 px-6">Status</th>
                  <th className="py-4 px-6">Google SEO Audit</th>
                  <th className="py-4 px-6">Last Updated</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPages.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <FilePlus className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-500" />
                      No pages found. Click "Add New Page" to create your first customizable page.
                    </td>
                  </tr>
                ) : (
                  filteredPages.map((page) => {
                    const { score } = calculateSEOScore(page);
                    return (
                      <tr key={page.id} className="hover:bg-slate-100/40 transition-colors group">
                        <td className="py-4 px-6 font-semibold text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{page.title}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6 font-mono text-xs text-slate-500">
                          <span className="text-[#000080] font-semibold">{getPagePath(page)}</span>
                        </td>
                        <td className="py-4 px-6">
                          {page.status === 'published' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-[#000080]/10 text-[#000080] border border-[#000080]/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#000066] animate-pulse"></span>
                              Published
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              Draft
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <div className="w-16 bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${
                                  score>= 80 ? 'bg-[#000066]' : score>= 50 ? 'bg-amber-400' : 'bg-red-400'
                                }`} 
                                style={{ width: `${score}%` }}
                              />
                            </div>
                            <span className={`text-xs font-bold ${
                              score>= 80 ? 'text-[#000080]' : score>= 50 ? 'text-amber-400' : 'text-red-400'
                            }`}>
                              {score}/100
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-xs text-slate-500">
                          {page.updatedAt || page.createdAt}
                        </td>
                        <td className="py-4 px-6 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <a
                              href={getPagePath(page)}
                              target="_blank"
                              rel="noreferrer"
                              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                              title="View Page Live">
                              <ExternalLink className="w-4 h-4" />
                            </a>
                            <button 
                              onClick={() => handleEditPage(page)}
                              className="p-2 text-slate-500 hover:text-[#000080] hover:bg-slate-100 rounded-lg transition-colors flex items-center gap-1.5"
                              title="Edit Page Content"
                            >
                              <Edit3 className="w-3.5 h-3.5" /> 
                              <span className="text-[10px] font-bold">Edit</span>
                            </button>
                            <ConfirmButton 
                              onConfirm={() => handleDelete(page.id)}
                              confirmTitle="Delete Page"
                              confirmMessage={`Are you sure you want to delete "${page.title}"? This cannot be undone.`}
                              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Move to Trash"
                            >
                              <Trash2 className="w-4 h-4" />
                            </ConfirmButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- EDITOR VIEW ----------------
  const { score: currentSeoScore, checks: seoChecks } = calculateSEOScore(selectedPage);
  const rawBlueprints = content.template_blueprints || [];
  let blueprints = [...rawBlueprints];
  for (const defBp of defaultBlueprintsList) {
    if (!blueprints.some((b: any) => b.id === defBp.id)) {
      blueprints.push(defBp);
    }
  }
  const bp = blueprints.find((b: any) => b.id === selectedPage.template) || blueprints.find((b: any) => b.type === selectedPage.template);
  const isServiceDetail = selectedPage.template === 'service-detail' || (bp && bp.type === 'service-detail');
  const hasTemplate = selectedPage.template && selectedPage.template !== 'default';

  return (
    <div className="space-y-6">
      {/* Top Navigation & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-slate-200 p-4 rounded-2xl shadow-lg sticky top-20 z-30 backdrop-blur-md bg-opacity-95">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setIsEditing(false);
              setSelectedPage(null);
            }}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Back to Pages List"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Editing Page:</span>
              <span className="font-bold text-slate-900">{selectedPage.title || 'Untitled'}</span>
              <span className="font-mono text-xs text-[#000080] bg-[#000080]/10 px-2 py-0.5 rounded border border-[#000080]/20">
                {getPagePath(selectedPage)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {savedMessage && (
            <span className="text-xs font-semibold text-[#000080] bg-[#000080]/10 border border-[#000080]/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 animate-fadeIn">
              <Check className="w-3.5 h-3.5" /> {savedMessage}
            </span>
          )}

          <a
            href={getPagePath(selectedPage)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-700 text-slate-800 border border-slate-300 px-4 py-2 rounded-xl text-xs font-bold transition-all">
            <Eye className="w-3.5 h-3.5" /> Live Preview
          </a>

          <button 
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 bg-[#000080] hover:bg-[#000066] disabled:bg-slate-400 text-white font-bold px-6 py-2 rounded-xl text-xs transition-all shadow-lg hover:scale-[1.02] disabled:cursor-not-allowed min-w-[120px] justify-center">
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : savedMessage ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Saved!</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Page Customizer Tabs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor Main Section */}
        <div className="lg:col-span-8 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xl">
            {/* Editor Tab Switcher */}
            <div className="flex border-b border-slate-200 bg-slate-50/60 p-1.5 gap-1 overflow-x-auto">
              <button onClick={() => setEditorTab('content')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
                  editorTab === 'content' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-100'
                }`}>
                <Edit3 className="w-3.5 h-3.5" /> Page Content & Hero
              </button>
              
              {!isServiceDetail && (
                <button onClick={() => setEditorTab('blocks')}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
                    editorTab === 'blocks' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-100'
                  }`}>
                  <Layers className="w-3.5 h-3.5" /> Content Blocks ({selectedPage.blocks?.length || 0})
                </button>
              )}
              {(isServiceDetail || bp || hasTemplate) && (
                <button onClick={() => setEditorTab('template')}
                  className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
                    editorTab === 'template' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-100'
                  }`}>
                  <Layout className="w-3.5 h-3.5" /> Template Sections
                </button>
              )}
              <button onClick={() => setEditorTab('seo')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
                  editorTab === 'seo' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-100'
                }`}>
                <Globe className="w-3.5 h-3.5" /> Google SEO & SERP
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                  currentSeoScore>= 80 ? 'bg-[#000066]/20 text-[#000066]' : 'bg-amber-400/20 text-amber-300'
                }`}>
                  {currentSeoScore}%
                </span>
              </button>
              <button onClick={() => setEditorTab('social')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
                  editorTab === 'social' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-100'
                }`}>
                <Share2 className="w-3.5 h-3.5" /> Social (OpenGraph)
              </button>
              <button onClick={() => setEditorTab('schema')}
                className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition-all shrink-0 ${
                  editorTab === 'schema' ? 'bg-[#000080] text-white shadow' : 'text-slate-500 hover:text-white hover:bg-slate-100'
                }`}>
                <Code className="w-3.5 h-3.5" /> Schema.org JSON
              </button>
            </div>

            <div className="p-6">
              {/* 1. CONTENT & HERO TAB */}
              {editorTab === 'content' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Page Title (Admin Name)</label>
                      <input
                        type="text"
                        value={selectedPage.title}
                        onChange={(e) => {
                          const newTitle = e.target.value;
                          const bizName = content.siteSettings?.businessName || 'Profox web designer';
                          const currentMeta = selectedPage.seo?.metaTitle || '';
                          const shouldSyncMeta = !currentMeta || currentMeta.includes('Untitled Page') || currentMeta.includes('Dotlogics') || currentMeta.startsWith(selectedPage.title);
                          
                          setSelectedPage({ 
                            ...selectedPage, 
                            title: newTitle,
                            seo: {
                              ...selectedPage.seo,
                              metaTitle: shouldSyncMeta && newTitle ? `${newTitle} | ${bizName}` : currentMeta,
                              ogTitle: shouldSyncMeta && newTitle ? `${newTitle} | ${bizName}` : (selectedPage.seo?.ogTitle || currentMeta)
                            }
                          });
                        }}
                        placeholder="e.g. About Us"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Page Template</label>
                      <select
                        value={selectedPage.template || 'default'}
                        onChange={(e) => {
                          const newTemplate = e.target.value;
                          const blueprint = blueprints.find((b: any) => b.id === newTemplate) || blueprints.find((b: any) => b.type === newTemplate);
                          let updatedData = selectedPage.serviceDetailData;
                          
                          if (newTemplate === 'default') {
                            updatedData = undefined;
                          } else if (blueprint && blueprint.defaultData) {
                            updatedData = JSON.parse(JSON.stringify(blueprint.defaultData));
                          }
                          
                          let newHeroTitle = selectedPage.heroTitle;
                          let newHeroSubtitle = selectedPage.heroSubtitle;
                          if (blueprint?.defaultData?.hero?.title && (!selectedPage.heroTitle || selectedPage.heroTitle === 'New Page Heading' || selectedPage.heroTitle === 'Untitled Page')) {
                            newHeroTitle = blueprint.defaultData.hero.title;
                          }
                          if (blueprint?.defaultData?.hero?.description && (!selectedPage.heroSubtitle || selectedPage.heroSubtitle === 'Enter a brief subtitle describing the purpose of this page.')) {
                            newHeroSubtitle = blueprint.defaultData.hero.description;
                          }
                          
                          setSelectedPage({ 
                            ...selectedPage, 
                            template: newTemplate,
                            heroTitle: newHeroTitle,
                            heroSubtitle: newHeroSubtitle,
                            serviceDetailData: updatedData
                          });

                          if (newTemplate !== 'default') {
                            setEditorTab('content');
                          }
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]">
                        <option value="default">Default Page Template</option>
                        {blueprints.map((b: any) => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">URL Permalink Slug</label>
                      <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1">
                        <span className="text-xs text-slate-500 font-mono">{isServicePage(selectedPage) ? '/services/' : '/'}</span>
                        <input
                          type="text"
                          value={selectedPage.slug}
                          onChange={(e) => setSelectedPage({ ...selectedPage, slug: e.target.value })}
                          placeholder="about"
                          className="w-full bg-transparent py-1.5 text-sm font-mono text-[#000080] focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  {!isServiceDetail && (
                    <>
                      <div className="border-t border-slate-200 pt-5 space-y-4">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Layout className="w-4 h-4 text-[#000080]" /> Hero Section Header
                    </h3>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Subheading (Eyebrow)</label>
                      <input
                        type="text"
                        value={selectedPage.heroSubheading || ''}
                        onChange={(e) => setSelectedPage({ ...selectedPage, heroSubheading: e.target.value })}
                        placeholder="e.g. INSIGHTS & UPDATES"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Highlight Title (Blue Accent Text)</label>
                      <input
                        type="text"
                        value={selectedPage.heroHighlight || ''}
                        onChange={(e) => setSelectedPage({ ...selectedPage, heroHighlight: e.target.value })}
                        placeholder="e.g. Engineered for Scale."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Headline Title</label>
                      <input
                        type="text"
                        value={selectedPage.heroTitle}
                        onChange={(e) => setSelectedPage({ ...selectedPage, heroTitle: e.target.value })}
                        placeholder="e.g. Human-Centered Digital Innovation"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080] font-semibold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Subtitle / Description</label>
                      <textarea
                        rows={2}
                        value={selectedPage.heroSubtitle}
                        onChange={(e) => setSelectedPage({ ...selectedPage, heroSubtitle: e.target.value })}
                        placeholder="Provide a compelling 1-2 sentence overview of this page..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>

                    <div>
                      <ImageUploader
                        label="Hero Cover Image (Background & Banner)"
                        value={selectedPage.coverImage || ''}
                        onChange={(url) => setSelectedPage({ ...selectedPage, coverImage: url })}
                        helpText="Upload a image file or pick from stock library. Stored directly with page."
                      />
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-5 space-y-3">
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Main Body Content (WordPress Rich Text)</label>
                    <textarea
                      rows={6}
                      value={selectedPage.bodyContent}
                      onChange={(e) => setSelectedPage({ ...selectedPage, bodyContent: e.target.value })}
                      placeholder="Write your detailed page text content here..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-900 focus:outline-none focus:border-[#000080] leading-relaxed font-sans"
                    />
                  </div>

                  {/* Quick Section Creator on Main Content Tab */}
                  <div className="border-t border-slate-200 pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          <Plus className="w-4 h-4 text-[#000080]" /> Add Page Sections & Content Blocks
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Click any block type below to insert new dynamic sections directly into this page.
                        </p>
                      </div>
                      <button>
                        <Layers className="w-3.5 h-3.5" /> Manage All ({selectedPage.blocks?.length || 0}) Blocks →
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 pt-1">
                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <Plus className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Features Grid
                        </div>
                        <p className="text-[10px] text-slate-500">Cards for key benefits</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <AlignLeft className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Text & Media
                        </div>
                        <p className="text-[10px] text-slate-500">Two-column image text</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <ImageIcon className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Image Banner
                        </div>
                        <p className="text-[10px] text-slate-500">Full-width visual banner</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <Grid className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Photo Gallery
                        </div>
                        <p className="text-[10px] text-slate-500">High-res image showcase</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <MessageSquare className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Testimonial
                        </div>
                        <p className="text-[10px] text-slate-500">Quotes & review banner</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <Zap className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Call To Action
                        </div>
                        <p className="text-[10px] text-slate-500">Action banner & button</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <HelpCircle className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> FAQ Accordion
                        </div>
                        <p className="text-[10px] text-slate-500">Questions & answers</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <DollarSign className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Pricing Plans
                        </div>
                        <p className="text-[10px] text-slate-500">Tiered pricing tables</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <Users className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Team Members
                        </div>
                        <p className="text-[10px] text-slate-500">Profiles & bios</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <BarChart2 className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Key Metrics
                        </div>
                        <p className="text-[10px] text-slate-500">Stats & achievements</p>
                      </button>

                      <button>
                        <div className="flex items-center gap-2 text-[#000080] font-bold text-xs mb-1">
                          <Video className="w-3.5 h-3.5 group-hover:scale-125 transition-transform" /> Video Embed
                        </div>
                        <p className="text-[10px] text-slate-500">YouTube / Vimeo player</p>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

              {/* 1.5 TEMPLATE SETTINGS TAB */}
              {editorTab === 'template' && (isServiceDetail || bp || hasTemplate) && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Layout className="w-4 h-4 text-[#000080]" /> Service Detail Template Editor
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Customize every section of this specialized service landing page. All changes are strictly brand-aligned.
                      </p>
                    </div>
                  </div>

                  {/* Template Section Switcher */}
                  <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200">
                    {['Hero', 'Value Prop', 'Evidence', 'Technical', 'Our Process', 'Conversion', 'Pricing', 'Dynamic Feeds'].map((tab) => (
                      <button key={tab}
                        onClick={() => setTemplateSubTab(tab)}
                        className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
                          templateSubTab === tab 
                            ? 'bg-[#000080] text-white shadow-sm' 
                            : 'text-slate-500 hover:text-slate-900'
                        }`}
                     >
                        {tab}
                      </button>
                    ))}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                    {(() => {
                      const subTab = templateSubTab;
                      const matchedBp = blueprints.find((b: any) => b.id === selectedPage.template || b.id === selectedPage.id) || 
                        (selectedPage.id === 'website-design-and-development' ? blueprints.find((b: any) => b.id === 'digital-experience') : null);
                      const bpDefault = matchedBp?.defaultData || {};
                      const rawSdd = (typeof selectedPage.serviceDetailData === 'object' && selectedPage.serviceDetailData !== null)
                        ? selectedPage.serviceDetailData
                        : {};

                      const data = {
                        ...bpDefault,
                        ...rawSdd,
                        hero: {
                          ...bpDefault.hero,
                          ...rawSdd.hero,
                          title: rawSdd.hero?.title || selectedPage.heroTitle || bpDefault.hero?.title || selectedPage.title || '',
                          highlight: rawSdd.hero?.highlight || selectedPage.heroHighlight || bpDefault.hero?.highlight || '',
                          subheading: rawSdd.hero?.subheading || selectedPage.heroSubheading || bpDefault.hero?.subheading || '',
                          description: rawSdd.hero?.description || selectedPage.heroSubtitle || bpDefault.hero?.description || '',
                          image: rawSdd.hero?.image || selectedPage.coverImage || bpDefault.hero?.image || ''
                        }
                      };

                      const updateData = (newData: any) => {
                        setSelectedPage({ ...selectedPage, serviceDetailData: newData });
                      };

                      if (subTab === 'Hero') {
                        return (
                          <div className="space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Subheading (Eyebrow)</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                                    value={data.hero?.subheading || ''}
                                    onChange={(e) => updateData({ ...data, hero: { ...data.hero, subheading: e.target.value } })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Title (Main)</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                                    value={data.hero?.title || ''}
                                    onChange={(e) => updateData({ ...data, hero: { ...data.hero, title: e.target.value } })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Highlight (Brand Color)</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-[#000080] font-bold"
                                    value={data.hero?.highlight || ''}
                                    onChange={(e) => updateData({ ...data, hero: { ...data.hero, highlight: e.target.value } })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Subtitle (Secondary Heading)</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                                    value={data.hero?.subtitle || ''}
                                    onChange={(e) => updateData({ ...data, hero: { ...data.hero, subtitle: e.target.value } })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero Description</label>
                                  <textarea 
                                    rows={3}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm"
                                    value={data.hero?.description || ''}
                                    onChange={(e) => updateData({ ...data, hero: { ...data.hero, description: e.target.value } })}
                                  />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero CTA Button Text</label>
                                    <input 
                                      type="text" 
                                      placeholder="Build Your Growth Website"
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs"
                                      value={data.hero?.ctaText || ''}
                                      onChange={(e) => updateData({ ...data, hero: { ...data.hero, ctaText: e.target.value } })}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Hero CTA Target Link (ID)</label>
                                    <input 
                                      type="text" 
                                      placeholder="cta"
                                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono"
                                      value={data.hero?.ctaUrl || ''}
                                      onChange={(e) => updateData({ ...data, hero: { ...data.hero, ctaUrl: e.target.value } })}
                                    />
                                  </div>
                                </div>
                              </div>
                              <div>
                                <ImageUploader 
                                  label="Hero Visual Asset"
                                  value={data.hero?.image || ''}
                                  onChange={(url) => updateData({ ...data, hero: { ...data.hero, image: url } })}
                                />
                              </div>
                            </div>
                            
                            <div className="border-t border-slate-100 pt-5">
                              <label className="block text-xs font-bold text-slate-700 mb-3 uppercase tracking-wider">Sticky Sub-Navigation Items</label>
                              <div className="space-y-2">
                                {(data.subnav || []).map((nav: any, idx: number) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <input 
                                      type="text" 
                                      placeholder="Label"
                                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                                      value={nav.label}
                                      onChange={(e) => {
                                        const next = [...data.subnav];
                                        next[idx].label = e.target.value;
                                        updateData({ ...data, subnav: next });
                                      }}
                                    />
                                    <input 
                                      type="text" 
                                      placeholder="Section ID"
                                      className="w-32 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-mono"
                                      value={nav.id}
                                      onChange={(e) => {
                                        const next = [...data.subnav];
                                        next[idx].id = e.target.value;
                                        updateData({ ...data, subnav: next });
                                      }}
                                    />
                                    <button onClick={() => {
                                        const next = (data.subnav || []).filter((_: any, i: number) => i !== idx);
                                        updateData({ ...data, subnav: next });
                                      }}
                                      className="p-1.5 text-red-400 hover:bg-red-50 rounded">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                                <button>
                                  <Plus className="w-3 h-3" /> Add Navigation Link
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (subTab === 'Value Prop') {
                        return (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">Impactful Large Quote Section</h4>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1.5">Quote Main Heading</label>
                                <textarea 
                                  rows={2}
                                  placeholder="e.g., Companies with high-performing websites outperform their competitors by nearly 80%."
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium"
                                  value={data.quoteHeading || ''}
                                  onChange={(e) => updateData({ ...data, quoteHeading: e.target.value })}
                                />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Quote Author / Attribution</label>
                                  <input 
                                    type="text" 
                                    placeholder="e.g., - Watermark Consulting"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold"
                                    value={data.quoteAuthor || ''}
                                    onChange={(e) => updateData({ ...data, quoteAuthor: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Quote Description / Subtext</label>
                                  <textarea 
                                    rows={2}
                                    placeholder="e.g., Your website is where buyers decide if you are worth trusting..."
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs"
                                    value={data.quoteDescription || ''}
                                    onChange={(e) => updateData({ ...data, quoteDescription: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider">Legacy Single Quote Fallback (Optional)</label>
                                <textarea 
                                  rows={1}
                                  placeholder="Used only as a fallback if custom fields above are empty"
                                  className="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-1.5 text-xs text-slate-400 font-mono italic"
                                  value={data.quote || ''}
                                  onChange={(e) => updateData({ ...data, quote: e.target.value })}
                                />
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">"How We Help" Section Header & Button</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.howWeHelpTitle || 'How We Help'}
                                    onChange={(e) => updateData({ ...data, howWeHelpTitle: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Sidebar CTA Button Text</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.howWeHelpButtonText || 'Get Started'}
                                    onChange={(e) => updateData({ ...data, howWeHelpButtonText: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Section Description</label>
                                <textarea 
                                  rows={2}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                  value={data.howWeHelpDesc || ''}
                                  onChange={(e) => updateData({ ...data, howWeHelpDesc: e.target.value })}
                                />
                              </div>

                              <h4 className="text-sm font-bold text-slate-900 pt-2">"How We Help" Dynamic Cards</h4>
                              <div className="grid grid-cols-1 gap-4">
                                {(data.howWeHelp || []).map((item: any, idx: number) => (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 relative group">
                                    <button onClick={() => {
                                        const next = (data.howWeHelp || []).filter((_: any, i: number) => i !== idx);
                                        updateData({ ...data, howWeHelp: next });
                                      }}
                                      className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 transition-colors">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <input 
                                          type="text" 
                                          placeholder="Feature Title"
                                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold mb-2"
                                          value={item.title}
                                          onChange={(e) => {
                                            const next = [...data.howWeHelp];
                                            next[idx].title = e.target.value;
                                            updateData({ ...data, howWeHelp: next });
                                          }}
                                        />
                                        <textarea 
                                          placeholder="Description text"
                                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs mb-2"
                                          value={item.desc}
                                          onChange={(e) => {
                                            const next = [...data.howWeHelp];
                                            next[idx].desc = e.target.value;
                                            updateData({ ...data, howWeHelp: next });
                                          }}
                                        />
                                        <div className="grid grid-cols-2 gap-2">
                                          <input 
                                            type="text" 
                                            placeholder="Link/CTA Text"
                                            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                                            value={item.ctaText || ''}
                                            onChange={(e) => {
                                              const next = [...data.howWeHelp];
                                              next[idx].ctaText = e.target.value;
                                              updateData({ ...data, howWeHelp: next });
                                            }}
                                          />
                                          <input 
                                            type="text" 
                                            placeholder="Link URL (#cta)"
                                            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                                            value={item.ctaUrl || ''}
                                            onChange={(e) => {
                                              const next = [...data.howWeHelp];
                                              next[idx].ctaUrl = e.target.value;
                                              updateData({ ...data, howWeHelp: next });
                                            }}
                                          />
                                        </div>
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase">Sub-features (List)</label>
                                        <div className="space-y-1 mt-1">
                                          {(item.features || []).map((feat: string, fidx: number) => (
                                            <div key={fidx} className="flex items-center gap-1">
                                              <input 
                                                type="text"
                                                className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-[10px]"
                                                value={feat}
                                                onChange={(e) => {
                                                  const next = [...data.howWeHelp];
                                                  next[idx].features[fidx] = e.target.value;
                                                  updateData({ ...data, howWeHelp: next });
                                                }}
                                              />
                                              <button onClick={() => {
                                                  const next = [...data.howWeHelp];
                                                  next[idx].features = next[idx].features.filter((_: any, i: number) => i !== fidx);
                                                  updateData({ ...data, howWeHelp: next });
                                                }}
                                                className="text-red-300 hover:text-red-500">
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                            </div>
                                          ))}
                                          <button onClick={() => {
                                              const next = [...data.howWeHelp];
                                              next[idx].features = [...(next[idx].features || []), 'New feature point'];
                                              updateData({ ...data, howWeHelp: next });
                                            }}
                                            className="text-[9px] font-bold text-[#000080] flex items-center gap-0.5">
                                            <Plus className="w-2.5 h-2.5" /> Add Point
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <button>
                                  <Plus className="w-4 h-4" /> Add Value Proposition Card
                                </button>
                              </div>
                            </div>

                            {/* Connected Growth Loop Section Editor */}
                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">"Connected Growth Loop" Section</h4>
                              <p className="text-xs text-slate-500">Edit the copy and steps for the "What Makes Us Different" section located after "How We Help".</p>
                              
                              {(() => {
                                const loop = data.connectedLoop || {
                                  eyebrow: "WHAT MAKES US DIFFERENT",
                                  title: "For the First Time, Your Website, Your Customer Experience, and Your Marketing Automation Are One System.",
                                  desc1: "Most agencies build you a website and call it a day. But a website is only one piece of the puzzle. To drive real growth, your digital presence needs to be connected to how you talk to your customers and how you keep them coming back.",
                                  desc2: "We don't just build websites. We build connected revenue systems that align your marketing, your technology, and your customer journey.",
                                  steps: [
                                    { badge: "Step 1", title: "Website Experience" },
                                    { badge: "Step 2", title: "Marketing Automation" },
                                    { badge: "Step 3", title: "Customer Experience" }
                                  ],
                                  footer: "The Connected Growth Loop",
                                  accentText: "Every decision we make is tied directly to growth. If it doesn't improve growth, it doesn't get made."
                                };

                                return (
                                  <div className="space-y-4 bg-slate-50/50 p-4 rounded-xl border border-slate-200">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Section Eyebrow</label>
                                        <input 
                                          type="text" 
                                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-emerald-600"
                                          value={loop.eyebrow || ''}
                                          onChange={(e) => updateData({ ...data, connectedLoop: { ...loop, eyebrow: e.target.value } })}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-bold text-slate-700 mb-1">Cursive Footer / Subtext</label>
                                        <input 
                                          type="text" 
                                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs italic"
                                          value={loop.footer || ''}
                                          onChange={(e) => updateData({ ...data, connectedLoop: { ...loop, footer: e.target.value } })}
                                        />
                                      </div>
                                    </div>

                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Main Section Title</label>
                                      <textarea 
                                        rows={2}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium"
                                        value={loop.title || ''}
                                        onChange={(e) => updateData({ ...data, connectedLoop: { ...loop, title: e.target.value } })}
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Description Paragraph 1</label>
                                      <textarea 
                                        rows={3}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs"
                                        value={loop.desc1 || ''}
                                        onChange={(e) => updateData({ ...data, connectedLoop: { ...loop, desc1: e.target.value } })}
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Description Paragraph 2 (Bold Highlight)</label>
                                      <textarea 
                                        rows={2}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold"
                                        value={loop.desc2 || ''}
                                        onChange={(e) => updateData({ ...data, connectedLoop: { ...loop, desc2: e.target.value } })}
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <label className="block text-xs font-bold text-slate-700">Connecting Steps</label>
                                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {(loop.steps || []).map((step: any, sIdx: number) => (
                                          <div key={sIdx} className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2">
                                            <div>
                                              <label className="block text-[10px] font-bold text-slate-400 uppercase">Badge</label>
                                              <input 
                                                type="text" 
                                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-bold text-emerald-600"
                                                value={step.badge || ''}
                                                onChange={(e) => {
                                                  const newSteps = [...loop.steps];
                                                  newSteps[sIdx] = { ...newSteps[sIdx], badge: e.target.value };
                                                  updateData({ ...data, connectedLoop: { ...loop, steps: newSteps } });
                                                }}
                                              />
                                            </div>
                                            <div>
                                              <label className="block text-[10px] font-bold text-slate-400 uppercase">Title</label>
                                              <input 
                                                type="text" 
                                                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-medium"
                                                value={step.title || ''}
                                                onChange={(e) => {
                                                  const newSteps = [...loop.steps];
                                                  newSteps[sIdx] = { ...newSteps[sIdx], title: e.target.value };
                                                  updateData({ ...data, connectedLoop: { ...loop, steps: newSteps } });
                                                }}
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>

                                    <div>
                                      <label className="block text-xs font-bold text-slate-700 mb-1">Left Accent Block Text</label>
                                      <textarea 
                                        rows={2}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold"
                                        value={loop.accentText || ''}
                                        onChange={(e) => updateData({ ...data, connectedLoop: { ...loop, accentText: e.target.value } })}
                                      />
                                    </div>
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        );
                      }

                      if (subTab === 'Evidence') {
                        const allPortfolioList = Array.isArray(content.portfolio_items) 
                          ? content.portfolio_items.filter((i: any) => i.status === 'published' || !i.status)
                          : defaultPortfolioItems.filter((i: any) => i.status === 'published' || !i.status);

                        return (
                          <div className="space-y-8">
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">"Challenges We Make Disappear" Section</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Title</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.challengesTitle || 'The Challenges We Make'}
                                    onChange={(e) => updateData({ ...data, challengesTitle: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Highlight Word/Phrase</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-[#000080] font-bold"
                                    value={data.challengesHighlight || 'Disappear For You'}
                                    onChange={(e) => updateData({ ...data, challengesHighlight: e.target.value })}
                                  />
                                </div>
                              </div>

                              <label className="block text-xs font-bold text-slate-700 mb-1">Pill List of Challenges</label>
                              <div className="flex flex-wrap gap-2">
                                {(data.challenges || []).map((c: string, idx: number) => (
                                  <div key={idx} className="flex items-center bg-slate-100 border border-slate-200 rounded-full px-3 py-1 text-xs">
                                    <input 
                                      type="text" 
                                      className="bg-transparent border-none focus:outline-none min-w-[120px]"
                                      value={c}
                                      onChange={(e) => {
                                        const next = [...data.challenges];
                                        next[idx] = e.target.value;
                                        updateData({ ...data, challenges: next });
                                      }}
                                    />
                                    <button onClick={() => updateData({ ...data, challenges: data.challenges.filter((_: any, i: number) => i !== idx) })} className="ml-1 text-slate-400 hover:text-red-500">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                                <button>
                                  + Add Item
                                </button>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">Case Studies & Success Stories Section Header</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.progressTitle || 'What Progress'}
                                    onChange={(e) => updateData({ ...data, progressTitle: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Highlight Word</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-[#000080] font-bold"
                                    value={data.progressHighlight || 'Looks Like'}
                                    onChange={(e) => updateData({ ...data, progressHighlight: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                                  <textarea 
                                    rows={2}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.progressDesc || ''}
                                    onChange={(e) => updateData({ ...data, progressDesc: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Header Link Text</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.progressLinkText || 'View All Case Studies'}
                                    onChange={(e) => updateData({ ...data, progressLinkText: e.target.value })}
                                  />
                                </div>
                              </div>

                              <label className="block text-xs font-bold text-slate-700 mb-2">Case Study Cards</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {(data.caseStudies || []).map((cs: any, idx: number) => (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden group relative p-4 pt-10">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = data.caseStudies.filter((_: any, i: number) => i !== idx);
                                        updateData({ ...data, caseStudies: next });
                                      }}
                                      className="absolute top-2 right-2 z-10 bg-white hover:bg-red-50 hover:text-red-600 text-slate-500 p-1.5 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <div className="aspect-video bg-slate-200 rounded-lg overflow-hidden">
                                      <img src={cs.image} className="w-full h-full object-cover" />
                                    </div>
                                    <div className="p-3 space-y-2">
                                      <div>
                                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Quick Select Post</label>
                                        <select
                                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-700 focus:ring-1 focus:ring-[#000080] focus:outline-none"
                                          value={cs.slug || ''}
                                          onChange={(e) => {
                                            const selectedSlug = e.target.value;
                                            const matched = allPortfolioList.find((p: any) => p.slug === selectedSlug || p.id === selectedSlug);
                                            if (matched) {
                                              const next = [...data.caseStudies];
                                              next[idx] = {
                                                client: matched.client || matched.logoText || 'CLIENT PARTNER',
                                                title: matched.title,
                                                image: matched.coverImage || matched.image || 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=800',
                                                slug: matched.slug || matched.id
                                              };
                                              updateData({ ...data, caseStudies: next });
                                            } else if (selectedSlug === '') {
                                              const next = [...data.caseStudies];
                                              next[idx].slug = '';
                                              updateData({ ...data, caseStudies: next });
                                            }
                                          }}
                                       >
                                          <option value="">-- Choose testimonial / post --</option>
                                          {allPortfolioList.map((p: any) => (
                                            <option key={p.slug || p.id} value={p.slug || p.id}>
                                              {p.client || p.logoText || 'No Client'}: {p.title}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <input 
                                        type="text" 
                                        placeholder="Client Name"
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px] font-bold"
                                        value={cs.client}
                                        onChange={(e) => {
                                          const next = [...data.caseStudies];
                                          next[idx].client = e.target.value;
                                          updateData({ ...data, caseStudies: next });
                                        }}
                                      />
                                      <input 
                                        type="text" 
                                        placeholder="Project Title"
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px]"
                                        value={cs.title}
                                        onChange={(e) => {
                                          const next = [...data.caseStudies];
                                          next[idx].title = e.target.value;
                                          updateData({ ...data, caseStudies: next });
                                        }}
                                      />
                                      <input 
                                        type="text" 
                                        placeholder="Portfolio Slug (optional)"
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[10px]"
                                        value={cs.slug || ''}
                                        onChange={(e) => {
                                          const next = [...data.caseStudies];
                                          next[idx].slug = e.target.value;
                                          updateData({ ...data, caseStudies: next });
                                        }}
                                      />
                                      <div className="pt-1">
                                        <ImageUploader 
                                          label=""
                                          value={cs.image}
                                          onChange={(url) => {
                                            const next = [...data.caseStudies];
                                            next[idx].image = url;
                                            updateData({ ...data, caseStudies: next });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...(data.caseStudies || [])];
                                    next.push({
                                      client: '',
                                      title: '',
                                      image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=800',
                                      slug: ''
                                    });
                                    updateData({ ...data, caseStudies: next });
                                  }}
                                  className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-[#000080] rounded-xl p-6 text-slate-400 hover:text-[#000080] transition-all bg-slate-50 hover:bg-slate-100 cursor-pointer aspect-video"
                                >
                                  <Plus className="w-6 h-6 mb-1" />
                                  <span className="text-xs font-semibold">Add Card</span>
                                </button>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">Awards & Recognition Section</h4>
                              <p className="text-xs text-slate-500">Manage trust badges and awards logos shown below the case studies.</p>
                              
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Section Title (use \n for newline)</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                  value={data.awardsTitle || 'Awards &\nRecognition'}
                                  onChange={(e) => updateData({ ...data, awardsTitle: e.target.value })}
                                />
                              </div>

                                <div className="space-y-3">
                                  <label className="block text-xs font-bold text-slate-700">Badges List</label>
                                  {(data.awards || [
                                    { text: 'CLUTCH', icon: 'Sparkles' },
                                    { text: 'DESIGNRUSH', icon: 'Monitor' },
                                    { text: 'BestDesign', icon: '' }
                                  ]).map((award: any, idx: number) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative">
                                      <div className="flex flex-col sm:flex-row items-center gap-3">
                                        <div className="flex-1 w-full">
                                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Badge/Award Text</label>
                                          <input 
                                            type="text" 
                                            placeholder="Award Name"
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-medium"
                                            value={award.text}
                                            onChange={(e) => {
                                              const next = [...(data.awards || [
                                                { text: 'CLUTCH', icon: 'Sparkles' },
                                                { text: 'DESIGNRUSH', icon: 'Monitor' },
                                                { text: 'BestDesign', icon: '' }
                                              ])];
                                              next[idx] = { ...next[idx], text: e.target.value };
                                              updateData({ ...data, awards: next });
                                            }}
                                          />
                                        </div>
                                        <div className="w-full sm:w-48">
                                          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Icon (If no image logo)</label>
                                          <select 
                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs"
                                            value={award.icon || ''}
                                            onChange={(e) => {
                                              const next = [...(data.awards || [
                                                { text: 'CLUTCH', icon: 'Sparkles' },
                                                { text: 'DESIGNRUSH', icon: 'Monitor' },
                                                { text: 'BestDesign', icon: '' }
                                              ])];
                                              next[idx] = { ...next[idx], icon: e.target.value };
                                              updateData({ ...data, awards: next });
                                            }}
                                         >
                                            <option value="">No Icon</option>
                                            <option value="Sparkles">Sparkles</option>
                                            <option value="Monitor">Monitor</option>
                                            <option value="Award">Award</option>
                                            <option value="Trophy">Trophy</option>
                                            <option value="Shield">Shield</option>
                                            <option value="Star">Star</option>
                                            <option value="Database">Database</option>
                                            <option value="Cloud">Cloud</option>
                                            <option value="Code">Code</option>
                                            <option value="Smartphone">Smartphone</option>
                                          </select>
                                        </div>
                                        <button onClick={() => {
                                            const currentAwards = data.awards || [
                                              { text: 'CLUTCH', icon: 'Sparkles' },
                                              { text: 'DESIGNRUSH', icon: 'Monitor' },
                                              { text: 'BestDesign', icon: '' }
                                            ];
                                            updateData({ ...data, awards: currentAwards.filter((_: any, i: number) => i !== idx) });
                                          }} 
                                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg mt-4 sm:mt-0 self-end sm:self-center shrink-0">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>
                                      <div className="border-t border-slate-200/60 pt-3">
                                        <ImageUploader 
                                          label="Badge Custom Image Logo (Optional)"
                                          value={award.image || ''}
                                          onChange={(url) => {
                                            const next = [...(data.awards || [
                                              { text: 'CLUTCH', icon: 'Sparkles' },
                                              { text: 'DESIGNRUSH', icon: 'Monitor' },
                                              { text: 'BestDesign', icon: '' }
                                            ])];
                                            next[idx] = { ...next[idx], image: url };
                                            updateData({ ...data, awards: next });
                                          }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                  <button onClick={() => {
                                      const currentAwards = data.awards || [
                                        { text: 'CLUTCH', icon: 'Sparkles' },
                                        { text: 'DESIGNRUSH', icon: 'Monitor' },
                                        { text: 'BestDesign', icon: '' }
                                      ];
                                      updateData({ ...data, awards: [...currentAwards, { text: 'New Badge', icon: '', image: '' }] });
                                    }}
                                    className="w-full py-2 border border-dashed border-slate-300 rounded-xl text-slate-500 hover:border-[#000080] transition-all flex items-center justify-center gap-2 font-bold text-xs">
                                    <Plus className="w-4 h-4" /> Add Award/Badge
                                  </button>
                                </div>
                            </div>
                          </div>
                        );
                      }

                      if (subTab === 'Technical') {
                        return (
                          <div className="space-y-8">
                            <div className="space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">"Engineering Friction" Feature Section</h4>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                  value={data.frictionTitle || 'Engineering the Friction Out of Complex Systems'}
                                  onChange={(e) => updateData({ ...data, frictionTitle: e.target.value })}
                                />
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Description Paragraph</label>
                                  <textarea 
                                    rows={4}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.frictionDescription || ''}
                                    onChange={(e) => updateData({ ...data, frictionDescription: e.target.value })}
                                  />
                                </div>
                                <ImageUploader 
                                  label="Section Portrait Image"
                                  value={data.frictionImage || ''}
                                  onChange={(url) => updateData({ ...data, frictionImage: url })}
                                />
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">Tech Stack & Integration Section Header</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Title</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.techStackTitle || 'Integration That Actually Plays Well with Others'}
                                    onChange={(e) => updateData({ ...data, techStackTitle: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                                  <textarea 
                                    rows={2}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.techStackDesc || ''}
                                    onChange={(e) => updateData({ ...data, techStackDesc: e.target.value })}
                                  />
                                </div>
                              </div>
                              <ImageUploader 
                                label="Tech Stack Showcase Banner Image"
                                value={data.techStackImage || ''}
                                onChange={(url) => updateData({ ...data, techStackImage: url })}
                              />

                              <h4 className="text-sm font-bold text-slate-900 pt-2">Technology Stack Categories</h4>
                              <div className="space-y-4">
                                {(data.techStack || []).map((stack: any, idx: number) => (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                      <input 
                                        type="text" 
                                        className="bg-white border border-slate-200 rounded px-3 py-1.5 text-xs font-bold w-1/2"
                                        value={stack.category}
                                        onChange={(e) => {
                                          const next = [...data.techStack];
                                          next[idx].category = e.target.value;
                                          updateData({ ...data, techStack: next });
                                        }}
                                      />
                                      <button onClick={() => updateData({ ...data, techStack: data.techStack.filter((_: any, i: number) => i !== idx) })} className="text-red-400 hover:text-red-600">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <div className="space-y-3 w-full mt-3">
                                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Technologies & Logos</label>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {(stack.icons || []).map((iconItem: any, iidx: number) => {
                                          const isObj = typeof iconItem === 'object' && iconItem !== null;
                                          const nameVal = isObj ? (iconItem.name || '') : iconItem;
                                          const logoVal = isObj ? (iconItem.logo || '') : '';
                                          return (
                                            <div key={iidx} className="flex flex-col bg-white border border-slate-200 rounded-xl p-3 relative group hover:border-[#000080]/30 hover:shadow-sm transition-all">
                                              <button onClick={() => {
                                                  const next = [...data.techStack];
                                                  next[idx].icons = next[idx].icons.filter((_: any, i: number) => i !== iidx);
                                                  updateData({ ...data, techStack: next });
                                                }} 
                                                className="absolute top-2 right-2 p-1 text-slate-300 hover:text-red-500 rounded-md hover:bg-slate-100 transition-all opacity-0 group-hover:opacity-100">
                                                <Trash2 className="w-3 h-3" />
                                              </button>
                                              
                                              <div className="space-y-2">
                                                <div>
                                                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Tech Name</label>
                                                  <input 
                                                    type="text" 
                                                    placeholder="React, AWS, etc."
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:bg-white focus:border-[#000080]"
                                                    value={nameVal}
                                                    onChange={(e) => {
                                                      const next = [...data.techStack];
                                                      next[idx].icons[iidx] = { name: e.target.value, logo: logoVal };
                                                      updateData({ ...data, techStack: next });
                                                    }}
                                                  />
                                                </div>
                                                
                                                <div>
                                                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Logo Image / URL</label>
                                                  <div className="flex gap-1.5 items-center">
                                                    {logoVal && (
                                                      <img 
                                                        src={logoVal} 
                                                        alt={nameVal} 
                                                        className="w-8 h-8 object-contain rounded bg-slate-100 p-1 border border-slate-200 shrink-0" 
                                                        referrerPolicy="no-referrer"
                                                      />
                                                    )}
                                                    <input 
                                                      type="text" 
                                                      placeholder="https://... or upload"
                                                      className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-600 focus:outline-none focus:bg-white focus:border-[#000080] min-w-0"
                                                      value={logoVal}
                                                      onChange={(e) => {
                                                        const next = [...data.techStack];
                                                        next[idx].icons[iidx] = { name: nameVal, logo: e.target.value };
                                                        updateData({ ...data, techStack: next });
                                                      }}
                                                    />
                                                    <ImageUploaderButton
                                                      value={logoVal}
                                                      onChange={(url) => {
                                                        const next = [...data.techStack];
                                                        next[idx].icons[iidx] = { name: nameVal, logo: url };
                                                        updateData({ ...data, techStack: next });
                                                      }}
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                        
                                        <button onClick={() => {
                                            const next = [...data.techStack];
                                            next[idx].icons = [...(next[idx].icons || []), { name: 'New Tech', logo: '' }];
                                            updateData({ ...data, techStack: next });
                                          }}
                                          className="border-2 border-dashed border-slate-200 rounded-xl p-4 text-slate-400 hover:text-[#000080] hover:border-[#000080]/30 transition-all flex flex-col items-center justify-center gap-1 min-h-[110px] bg-white hover:bg-slate-50/20 w-full">
                                          <Plus className="w-5 h-5 text-slate-300" />
                                          <span className="text-[11px] font-bold">Add Tech & Logo</span>
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                <button>
                                  + Add Stack Category
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (subTab === 'Our Process') {
                        const processList = data.ourProcess || data.engagement || [
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

                        return (
                          <div className="space-y-8">
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Section Badge / Eyebrow</label>
                                  <input 
                                    type="text" 
                                    placeholder="HOW WE DELIVER SUCCESS"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-[#000080]"
                                    value={data.processBadge || 'How We Deliver Success'}
                                    onChange={(e) => updateData({ ...data, processBadge: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Section Main Heading</label>
                                  <input 
                                    type="text" 
                                    placeholder="Our Process"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-900"
                                    value={data.processTitle || data.engagementTitle || 'Our Process'}
                                    onChange={(e) => updateData({ ...data, processTitle: e.target.value, engagementTitle: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center justify-between mb-3">
                                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">Process Steps ({processList.length})</label>
                                  <button 
                                    onClick={() => {
                                      const nextNum = processList.length + 1;
                                      const newStep = {
                                        step: nextNum < 10 ? `0${nextNum}` : `${nextNum}`,
                                        title: 'New Process Step',
                                        desc: 'Enter detailed description of this step in your workflow.',
                                        image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
                                        ctaText: "Let's Talk",
                                        ctaUrl: "/contact-us"
                                      };
                                      const next = [...processList, newStep];
                                      updateData({ ...data, ourProcess: next, engagement: next });
                                    }}
                                    className="text-xs font-bold text-white bg-[#000080] hover:bg-[#000066] px-3 py-1.5 rounded-lg flex items-center gap-1 shadow-sm">
                                    <Plus className="w-3.5 h-3.5" /> Add Step
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {processList.map((m: any, idx: number) => (
                                    <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative group">
                                      <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2">
                                          <input 
                                            type="text" 
                                            placeholder="01"
                                            className="w-14 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-black text-[#000080]"
                                            value={m.step || (idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`)}
                                            onChange={(e) => {
                                              const next = [...processList];
                                              next[idx] = { ...next[idx], step: e.target.value };
                                              updateData({ ...data, ourProcess: next, engagement: next });
                                            }}
                                          />
                                          <span className="text-[10px] font-bold text-slate-400 uppercase">Step Number</span>
                                        </div>
                                        <button onClick={() => {
                                            const next = processList.filter((_: any, i: number) => i !== idx);
                                            updateData({ ...data, ourProcess: next, engagement: next });
                                          }} 
                                          className="text-red-400 hover:text-red-600 p-1 transition-colors"
                                          title="Delete step">
                                          <Trash2 className="w-4 h-4" />
                                        </button>
                                      </div>

                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Step Title</label>
                                        <input 
                                          type="text" 
                                          placeholder="e.g. Discovery & Strategy"
                                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-900"
                                          value={m.title || ''}
                                          onChange={(e) => {
                                            const next = [...processList];
                                            next[idx] = { ...next[idx], title: e.target.value };
                                            updateData({ ...data, ourProcess: next, engagement: next });
                                          }}
                                        />
                                      </div>

                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Description</label>
                                        <textarea 
                                          rows={3}
                                          placeholder="Detailed explanation of this process step..."
                                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
                                          value={m.desc || m.description || ''}
                                          onChange={(e) => {
                                            const next = [...processList];
                                            next[idx] = { ...next[idx], desc: e.target.value, description: e.target.value };
                                            updateData({ ...data, ourProcess: next, engagement: next });
                                          }}
                                        />
                                      </div>

                                      <div className="grid grid-cols-2 gap-2">
                                        <div>
                                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Button Text</label>
                                          <input 
                                            type="text" 
                                            placeholder="e.g. Let's Talk"
                                            className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px]"
                                            value={m.ctaText || ''}
                                            onChange={(e) => {
                                              const next = [...processList];
                                              next[idx] = { ...next[idx], ctaText: e.target.value };
                                              updateData({ ...data, ourProcess: next, engagement: next });
                                            }}
                                          />
                                        </div>
                                        <div>
                                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Link / Anchor</label>
                                          <input 
                                            type="text" 
                                            placeholder="#cta"
                                            className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px]"
                                            value={m.ctaUrl || ''}
                                            onChange={(e) => {
                                              const next = [...processList];
                                              next[idx] = { ...next[idx], ctaUrl: e.target.value };
                                              updateData({ ...data, ourProcess: next, engagement: next });
                                            }}
                                          />
                                        </div>
                                      </div>

                                      <ImageUploader 
                                        label="Card Background Image"
                                        value={m.image || ''}
                                        onChange={(url) => {
                                          const next = [...processList];
                                          next[idx] = { ...next[idx], image: url };
                                          updateData({ ...data, ourProcess: next, engagement: next });
                                        }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (subTab === 'Conversion') {
                        const processList = data.ourProcess || data.engagement || [];
                        return (
                          <div className="space-y-8">
                            <div className="space-y-4">
                              <div className="flex items-center justify-between">
                                <h4 className="text-sm font-bold text-slate-900">"Our Process" Section Controls</h4>
                                <span className="text-[10px] font-extrabold uppercase bg-[#000080]/10 text-[#000080] px-2.5 py-1 rounded-full">Process Editor</span>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">Section Main Title</label>
                                <input 
                                  type="text" 
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold"
                                  value={data.processTitle || data.engagementTitle || 'Our Process'}
                                  onChange={(e) => updateData({ ...data, processTitle: e.target.value, engagementTitle: e.target.value })}
                                />
                              </div>

                              <label className="block text-xs font-bold text-slate-700 mb-1">Process Steps</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {processList.map((m: any, idx: number) => (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative group">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <input 
                                          type="text" 
                                          placeholder="01"
                                          className="w-14 bg-white border border-slate-200 rounded px-2 py-1 text-xs font-black text-[#000080]"
                                          value={m.step || (idx + 1 < 10 ? `0${idx + 1}` : `${idx + 1}`)}
                                          onChange={(e) => {
                                            const next = [...processList];
                                            next[idx] = { ...next[idx], step: e.target.value };
                                            updateData({ ...data, ourProcess: next, engagement: next });
                                          }}
                                        />
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Step Number</span>
                                      </div>
                                      <button onClick={() => {
                                          const next = processList.filter((_: any, i: number) => i !== idx);
                                          updateData({ ...data, ourProcess: next, engagement: next });
                                        }} 
                                        className="text-red-400 hover:text-red-600 p-1 transition-colors"
                                        title="Delete step">
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>

                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Step Title</label>
                                      <input 
                                        type="text" 
                                        placeholder="e.g. Discovery & Strategy"
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold text-slate-900"
                                        value={m.title || ''}
                                        onChange={(e) => {
                                          const next = [...processList];
                                          next[idx] = { ...next[idx], title: e.target.value };
                                          updateData({ ...data, ourProcess: next, engagement: next });
                                        }}
                                      />
                                    </div>

                                    <div>
                                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Description</label>
                                      <textarea 
                                        rows={3}
                                        placeholder="Detailed explanation of this process step..."
                                        className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700"
                                        value={m.desc || m.description || ''}
                                        onChange={(e) => {
                                          const next = [...processList];
                                          next[idx] = { ...next[idx], desc: e.target.value, description: e.target.value };
                                          updateData({ ...data, ourProcess: next, engagement: next });
                                        }}
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Button Text</label>
                                        <input 
                                          type="text" 
                                          placeholder="e.g. Let's Talk"
                                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px]"
                                          value={m.ctaText || ''}
                                          onChange={(e) => {
                                            const next = [...processList];
                                            next[idx] = { ...next[idx], ctaText: e.target.value };
                                            updateData({ ...data, ourProcess: next, engagement: next });
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-0.5">Link / Anchor</label>
                                        <input 
                                          type="text" 
                                          placeholder="#cta"
                                          className="w-full bg-white border border-slate-200 rounded px-2 py-1 text-[11px]"
                                          value={m.ctaUrl || ''}
                                          onChange={(e) => {
                                            const next = [...processList];
                                            next[idx] = { ...next[idx], ctaUrl: e.target.value };
                                            updateData({ ...data, ourProcess: next, engagement: next });
                                          }}
                                        />
                                      </div>
                                    </div>

                                    <ImageUploader 
                                      label="Card Background Image"
                                      value={m.image || ''}
                                      onChange={(url) => {
                                        const next = [...processList];
                                        next[idx] = { ...next[idx], image: url };
                                        updateData({ ...data, ourProcess: next, engagement: next });
                                      }}
                                    />
                                  </div>
                                ))}
                                <button 
                                  onClick={() => {
                                    const nextNum = processList.length + 1;
                                    const newStep = {
                                      step: nextNum < 10 ? `0${nextNum}` : `${nextNum}`,
                                      title: 'New Process Step',
                                      desc: 'Enter detailed description of this step in your workflow.',
                                      image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=1200',
                                      ctaText: "Let's Talk",
                                      ctaUrl: "/contact-us"
                                    };
                                    const next = [...processList, newStep];
                                    updateData({ ...data, ourProcess: next, engagement: next });
                                  }}
                                  className="border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-[#000080] hover:border-[#000080] transition-colors min-h-[220px] p-4 gap-2 bg-slate-50/50">
                                  <Plus className="w-8 h-8" />
                                  <span className="text-xs font-bold">+ Add Process Step</span>
                                </button>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">Resources Section Controls</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.resourcesTitle || 'Our Resources'}
                                    onChange={(e) => updateData({ ...data, resourcesTitle: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">View All Link Text</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.resourcesLinkText || 'View All Resources'}
                                    onChange={(e) => updateData({ ...data, resourcesLinkText: e.target.value })}
                                  />
                                </div>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">FAQ Section Header & Questions</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Section Title</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.faqsTitle || 'Frequently Asked Questions'}
                                    onChange={(e) => updateData({ ...data, faqsTitle: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                                  <textarea 
                                    rows={2}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.faqsDesc || ''}
                                    onChange={(e) => updateData({ ...data, faqsDesc: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="space-y-3 pt-2">
                                {(data.faqs || []).map((faq: any, idx: number) => (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                    <div className="flex gap-2 mb-2">
                                      <input 
                                        type="text" 
                                        placeholder="Question"
                                        className="flex-1 bg-white border border-slate-200 rounded px-3 py-1.5 text-xs font-bold"
                                        value={typeof faq === 'string' ? faq : faq.question}
                                        onChange={(e) => {
                                          const next = [...data.faqs];
                                          if (typeof faq === 'string') {
                                            next[idx] = { question: e.target.value, answer: '' };
                                          } else {
                                            next[idx].question = e.target.value;
                                          }
                                          updateData({ ...data, faqs: next });
                                        }}
                                      />
                                      <button onClick={() => updateData({ ...data, faqs: data.faqs.filter((_: any, i: number) => i !== idx) })} className="text-red-400">
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <textarea 
                                      placeholder="Detailed Answer"
                                      className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-xs h-20"
                                      value={typeof faq === 'string' ? '' : faq.answer}
                                      onChange={(e) => {
                                        const next = [...data.faqs];
                                        if (typeof faq === 'string') {
                                          next[idx] = { question: faq, answer: e.target.value };
                                        } else {
                                          next[idx].answer = e.target.value;
                                        }
                                        updateData({ ...data, faqs: next });
                                      }}
                                    />
                                  </div>
                                ))}
                                <button>
                                  + Add FAQ Entry
                                </button>
                              </div>
                            </div>

                            <div className="border-t border-slate-100 pt-5 space-y-4">
                              <h4 className="text-sm font-bold text-slate-900">"Let's Build for Impact" CTA Section</h4>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">CTA Main Title</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.ctaTitle || "Let's Build for Impact"}
                                    onChange={(e) => updateData({ ...data, ctaTitle: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-700 mb-1">CTA Button Text</label>
                                  <input 
                                    type="text" 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                    value={data.ctaButtonText || "Let's Talk"}
                                    onChange={(e) => updateData({ ...data, ctaButtonText: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">CTA Description Paragraph</label>
                                <textarea 
                                  rows={2}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm"
                                  value={data.ctaDescription || "Create technology that scales, performs, and delivers business results that last."}
                                  onChange={(e) => updateData({ ...data, ctaDescription: e.target.value })}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (subTab === 'Pricing') {
                        return (
                          <div className="space-y-6">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900 mb-1 flex items-center gap-2">
                                <DollarSign className="w-4 h-4 text-[#000080]" /> Tiered Service Pricing Models
                              </h4>
                              <p className="text-xs text-slate-500 mb-4">Define flexible engagement plans for this page instance.</p>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {(data.pricing || []).map((plan: any, idx: number) => (
                                  <div key={idx} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative group">
                                    <button>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                    <input 
                                      type="text" 
                                      placeholder="Plan Name"
                                      className="w-full bg-white border border-slate-200 rounded px-2.5 py-1 text-xs font-bold"
                                      value={plan.name}
                                      onChange={(e) => {
                                        const next = [...data.pricing];
                                        next[idx].name = e.target.value;
                                        updateData({ ...data, pricing: next });
                                      }}
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                      <input 
                                        type="text" 
                                        placeholder="Price ($)"
                                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs font-bold"
                                        value={plan.price}
                                        onChange={(e) => {
                                          const next = [...data.pricing];
                                          next[idx].price = e.target.value;
                                          updateData({ ...data, pricing: next });
                                        }}
                                      />
                                      <input 
                                        type="text" 
                                        placeholder="Period"
                                        className="bg-white border border-slate-200 rounded px-2 py-1 text-xs"
                                        value={plan.period}
                                        onChange={(e) => {
                                          const next = [...data.pricing];
                                          next[idx].period = e.target.value;
                                          updateData({ ...data, pricing: next });
                                        }}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[10px] font-bold text-slate-400 uppercase">Features</label>
                                      {(plan.features || []).map((feat: string, fidx: number) => (
                                        <div key={fidx} className="flex gap-1">
                                          <input 
                                            type="text"
                                            className="flex-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-[10px]"
                                            value={feat}
                                            onChange={(e) => {
                                              const next = [...data.pricing];
                                              next[idx].features[fidx] = e.target.value;
                                              updateData({ ...data, pricing: next });
                                            }}
                                          />
                                          <button onClick={() => {
                                            const next = [...data.pricing];
                                            next[idx].features = next[idx].features.filter((_: any, i: number) => i !== fidx);
                                            updateData({ ...data, pricing: next });
                                          }} className="text-red-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                                        </div>
                                      ))}
                                      <button onClick={() => {
                                          const next = [...data.pricing];
                                          next[idx].features = [...(next[idx].features || []), 'New feature'];
                                          updateData({ ...data, pricing: next });
                                        }}
                                        className="text-[9px] font-bold text-[#000080]">
                                        + Add Feature
                                      </button>
                                    </div>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = [...(data.caseStudies || [])];
                                    next.push({
                                      client: '',
                                      title: '',
                                      image: 'https://images.unsplash.com/photo-1552566626-52f8b828add9?auto=format&fit=crop&q=80&w=800',
                                      slug: ''
                                    });
                                    updateData({ ...data, caseStudies: next });
                                  }}
                                  className="flex flex-col items-center justify-center border border-dashed border-slate-300 hover:border-[#000080] rounded-xl p-4 text-slate-400 hover:text-[#000080] transition-colors bg-slate-50 hover:bg-slate-100 cursor-pointer aspect-video"
                                >
                                  <Plus className="w-5 h-5 mb-1" />
                                  <span className="text-[10px] font-bold text-slate-500">Add Case Study</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (subTab === 'Dynamic Feeds') {
                        return (
                          <div className="space-y-6">
                            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                              <Rss className="w-4 h-4 text-[#000080]" /> Dynamic Content Feeds
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-900">Portfolio Feed (Case Studies)</span>
                                  <input 
                                    type="checkbox"
                                    checked={data.portfolioFeed?.enabled !== false}
                                    onChange={(e) => updateData({ ...data, portfolioFeed: { ...(data.portfolioFeed || {}), enabled: e.target.checked } })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">Limit</label>
                                  <input 
                                    type="number"
                                    min={1}
                                    max={12}
                                    className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-xs font-bold"
                                    value={data.portfolioFeed?.limit || 3}
                                    onChange={(e) => updateData({ ...data, portfolioFeed: { ...(data.portfolioFeed || {}), limit: parseInt(e.target.value) || 3 } })}
                                  />
                                </div>
                              </div>

                              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-slate-900">Blog Feed (Articles)</span>
                                  <input 
                                    type="checkbox"
                                    checked={data.blogFeed?.enabled !== false}
                                    onChange={(e) => updateData({ ...data, blogFeed: { ...(data.blogFeed || {}), enabled: e.target.checked } })}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase">Limit</label>
                                  <input 
                                    type="number"
                                    min={1}
                                    max={12}
                                    className="w-full bg-white border border-slate-200 rounded px-3 py-1.5 text-xs font-bold"
                                    value={data.blogFeed?.limit || 3}
                                    onChange={(e) => updateData({ ...data, blogFeed: { ...(data.blogFeed || {}), limit: parseInt(e.target.value) || 3 } })}
                                  />
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>
                  
                  {/* JSON Fallback for power users */}
                  <div className="bg-slate-900 rounded-2xl p-4 overflow-hidden border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Raw Advanced JSON Config</label>
                      <button onClick={() => {
                          const data = selectedPage.serviceDetailData;
                          const json = JSON.stringify(data, null, 2);
                          navigator.clipboard.writeText(json);
                        }}
                        className="text-[10px] text-slate-400 hover:text-white flex items-center gap-1">
                        <Copy className="w-3 h-3" /> Copy Config
                      </button>
                    </div>
                    <textarea
                      rows={5}
                      className="w-full font-mono text-[10px] text-emerald-400 bg-transparent border-none focus:outline-none resize-none"
                      value={JSON.stringify(selectedPage.serviceDetailData || {}, null, 2)}
                      readOnly
                    />
                  </div>
                </div>
              )}

              {/* 2. CONTENT BLOCKS TAB */}
              {editorTab === 'blocks' && (
                <div className="space-y-6">
                  <div className="border-b border-slate-200 pb-4 space-y-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-[#000080]" /> Modular Page Block Builder
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">
                        Customize this page layout by adding, reordering, and editing dynamic section blocks.
                      </p>
                    </div>

                    {/* Block Type Creator Buttons */}
                    <div className="flex items-center gap-2 flex-wrap pt-2">
                      <button>
                        <Plus className="w-3.5 h-3.5 text-[#000080]" /> Features Grid
                      </button>
                      <button>
                        <AlignLeft className="w-3.5 h-3.5 text-[#000080]" /> Text & Media
                      </button>
                      <button>
                        <ImageIcon className="w-3.5 h-3.5 text-[#000080]" /> Image Banner
                      </button>
                      <button>
                        <Grid className="w-3.5 h-3.5 text-[#000080]" /> Photo Gallery
                      </button>
                      <button>
                        <MessageSquare className="w-3.5 h-3.5 text-[#000080]" /> Testimonial Quote
                      </button>
                      <button>
                        <Zap className="w-3.5 h-3.5 text-[#000080]" /> Call To Action
                      </button>
                      <button>
                        <HelpCircle className="w-3.5 h-3.5 text-[#000080]" /> FAQ Accordion
                      </button>
                      <button>
                        <DollarSign className="w-3.5 h-3.5 text-[#000080]" /> Pricing Plans
                      </button>
                      <button>
                        <Users className="w-3.5 h-3.5 text-[#000080]" /> Team Members
                      </button>
                      <button>
                        <BarChart2 className="w-3.5 h-3.5 text-[#000080]" /> Key Metrics
                      </button>
                      <button>
                        <Video className="w-3.5 h-3.5 text-[#000080]" /> Video Embed
                      </button>
                    </div>
                  </div>

                  {/* Active Blocks List */}
                  {(selectedPage.blocks || []).length === 0 ? (
                    <div className="py-14 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-3">
                      <Layers className="w-10 h-10 mx-auto text-slate-600" />
                      <p className="text-sm text-slate-700 font-semibold">No custom blocks added to this page yet.</p>
                      <p className="text-xs text-slate-500 max-w-md mx-auto">
                        Select any component above (Features Grid, Photo Gallery, Testimonials, Pricing, CTA) to begin customizing your page content.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {selectedPage.blocks?.map((block, index) => (
                        <div key={block.id} className="bg-slate-50 border border-slate-200 p-5 rounded-2xl space-y-4 relative group shadow-lg">
                          {/* Block Card Header Bar */}
                          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold uppercase tracking-wider text-[#000080] bg-[#000080]/10 px-2.5 py-1 rounded-lg border border-[#000080]/20">
                                Section #{index + 1}: {block.type}
                              </span>
                            </div>

                            {/* Control Actions: Move Up, Move Down, Duplicate, Delete */}
                            <div className="flex items-center gap-1">
                              <button type="button"
                                onClick={() => moveBlock(index, 'up')}
                                disabled={index === 0}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:hover:bg-transparent"
                                title="Move Block Up">
                                <ArrowUp className="w-4 h-4" />
                              </button>
                              <button type="button"
                                onClick={() => moveBlock(index, 'down')}
                                disabled={index === (selectedPage.blocks?.length || 0) - 1}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 disabled:hover:bg-transparent"
                                title="Move Block Down">
                                <ArrowDown className="w-4 h-4" />
                              </button>
                              <button type="button"
                                onClick={() => duplicateBlock(index)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg"
                                title="Duplicate Block">
                                <Copy className="w-4 h-4" />
                              </button>
                              <button type="button"
                                onClick={() => removeBlock(block.id)}
                                className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors ml-1"
                                title="Delete Block">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          {/* Common Block Headings */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">Section Heading / Title</label>
                              <input
                                type="text"
                                value={block.heading || ''}
                                onChange={(e) => {
                                  const updated = [...(selectedPage.blocks || [])];
                                  updated[index].heading = e.target.value;
                                  setSelectedPage({ ...selectedPage, blocks: updated });
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#000080] font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">Subheadline / Description</label>
                              <input
                                type="text"
                                value={block.subheading || ''}
                                onChange={(e) => {
                                  const updated = [...(selectedPage.blocks || [])];
                                  updated[index].subheading = e.target.value;
                                  setSelectedPage({ ...selectedPage, blocks: updated });
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#000080]"
                              />
                            </div>
                          </div>

                          {/* Text / Body field for blocks that support rich paragraphs */}
                          {(block.type === 'text' || block.type === 'quote' || block.type === 'cta' || block.type === 'video') && (
                            <div>
                              <label className="block text-xs font-medium text-slate-500 mb-1">Paragraph Content / Message</label>
                              <textarea
                                rows={3}
                                value={block.body || ''}
                                onChange={(e) => {
                                  const updated = [...(selectedPage.blocks || [])];
                                  updated[index].body = e.target.value;
                                  setSelectedPage({ ...selectedPage, blocks: updated });
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-[#000080]"
                              />
                            </div>
                          )}

                          {/* Image Uploader for single image, quote avatar, or text-media */}
                          {(block.type === 'image' || block.type === 'text' || block.type === 'quote') && (
                            <div className="pt-2">
                              <ImageUploader
                                label={block.type === 'quote' ? 'Author Avatar Image' : 'Section Image / Media Asset'}
                                value={block.imageUrl || ''}
                                onChange={(url) => {
                                  const updated = [...(selectedPage.blocks || [])];
                                  updated[index].imageUrl = url;
                                  setSelectedPage({ ...selectedPage, blocks: updated });
                                }}
                              />
                            </div>
                          )}

                          {/* CTA options */}
                          {block.type === 'cta' && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Button Label</label>
                                <input
                                  type="text"
                                  value={block.buttonText || ''}
                                  onChange={(e) => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    updated[index].buttonText = e.target.value;
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  placeholder="e.g. Get Started"
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Button Action URL</label>
                                <input
                                  type="text"
                                  value={block.buttonUrl || ''}
                                  onChange={(e) => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    updated[index].buttonUrl = e.target.value;
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  placeholder="mailto:contact@..."
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">Background Theme</label>
                                <select
                                  value={block.bgColor || 'emerald'}
                                  onChange={(e) => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    updated[index].bgColor = e.target.value as any;
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900">
                                  <option value="emerald font-bold">Emerald Teal Gradient</option>
                                  <option value="dark">Slate Dark</option>
                                  <option value="light">Clean Light Gray</option>
                                </select>
                              </div>
                            </div>
                          )}

                          {/* Photo Gallery block */}
                          {block.type === 'gallery' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/80">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">Gallery Photos ({(block.images || []).length})</label>
                                <button type="button"
                                  onClick={() => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    const currentImages = updated[index].images || [];
                                    updated[index].images = [...currentImages, 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=800'];
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-700 text-xs font-bold text-[#000080] rounded-lg flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Image
                                </button>
                              </div>
                              <div className="space-y-3">
                                {(block.images || []).map((imgUrl, imgIdx) => (
                                  <div key={imgIdx} className="bg-white p-3 rounded-xl border border-slate-200">
                                    <ImageUploader
                                      label={`Gallery Image #${imgIdx + 1}`}
                                      value={imgUrl}
                                      onChange={(url) => {
                                        const updated = [...(selectedPage.blocks || [])];
                                        if (updated[index].images) {
                                          updated[index].images![imgIdx] = url;
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Features items */}
                          {block.type === 'features' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/80">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">Feature Items ({(block.items || []).length})</label>
                                <button type="button"
                                  onClick={() => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    const current = updated[index].items || [];
                                    updated[index].items = [...current, { title: 'New Feature', description: 'Feature description details.', icon: 'sparkles' }];
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-700 text-xs font-bold text-[#000080] rounded-lg flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Item
                                </button>
                              </div>

                              <div className="space-y-2">
                                {block.items?.map((item, itemIdx) => (
                                  <div key={itemIdx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-slate-500">Feature #{itemIdx + 1}</span>
                                      <button type="button"
                                        onClick={() => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          updated[index].items = updated[index].items?.filter((_, i) => i !== itemIdx);
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }}
                                        className="text-red-400 text-[10px] hover:underline">
                                        Remove
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <input
                                        type="text"
                                        value={item.title || ''}
                                        placeholder="Feature title"
                                        onChange={(e) => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          if (updated[index].items) {
                                            updated[index].items![itemIdx].title = e.target.value;
                                            setSelectedPage({ ...selectedPage, blocks: updated });
                                          }
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                                      />
                                      <input
                                        type="text"
                                        value={item.description || ''}
                                        placeholder="Feature description"
                                        onChange={(e) => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          if (updated[index].items) {
                                            updated[index].items![itemIdx].description = e.target.value;
                                            setSelectedPage({ ...selectedPage, blocks: updated });
                                          }
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* FAQ Items */}
                          {block.type === 'faq' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/80">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">FAQ Questions ({(block.items || []).length})</label>
                                <button type="button"
                                  onClick={() => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    const current = updated[index].items || [];
                                    updated[index].items = [...current, { title: 'Question phrase here?', description: 'Answer explanation goes here.' }];
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-700 text-xs font-bold text-[#000080] rounded-lg flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Question
                                </button>
                              </div>

                              <div className="space-y-2">
                                {block.items?.map((item, itemIdx) => (
                                  <div key={itemIdx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-slate-500">FAQ #{itemIdx + 1}</span>
                                      <button type="button"
                                        onClick={() => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          updated[index].items = updated[index].items?.filter((_, i) => i !== itemIdx);
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }}
                                        className="text-red-400 text-[10px] hover:underline">
                                        Remove
                                      </button>
                                    </div>
                                    <input
                                      type="text"
                                      value={item.title || ''}
                                      placeholder="Question?"
                                      onChange={(e) => {
                                        const updated = [...(selectedPage.blocks || [])];
                                        if (updated[index].items) {
                                          updated[index].items![itemIdx].title = e.target.value;
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }
                                      }}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-semibold"
                                    />
                                    <textarea
                                      rows={2}
                                      value={item.description || ''}
                                      placeholder="Detailed answer..."
                                      onChange={(e) => {
                                        const updated = [...(selectedPage.blocks || [])];
                                        if (updated[index].items) {
                                          updated[index].items![itemIdx].description = e.target.value;
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }
                                      }}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Pricing block */}
                          {block.type === 'pricing' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/80">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">Pricing Tiers ({(block.items || []).length})</label>
                                <button type="button"
                                  onClick={() => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    const current = updated[index].items || [];
                                    updated[index].items = [...current, { title: 'Pro Plan', price: '$299', description: 'Suitable for growing teams.', badge: '' }];
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-700 text-xs font-bold text-[#000080] rounded-lg flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Tier
                                </button>
                              </div>

                              <div className="space-y-3">
                                {block.items?.map((item, itemIdx) => (
                                  <div key={itemIdx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-slate-500">Plan Tier #{itemIdx + 1}</span>
                                      <button type="button"
                                        onClick={() => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          updated[index].items = updated[index].items?.filter((_, i) => i !== itemIdx);
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }}
                                        className="text-red-400 text-[10px] hover:underline">
                                        Remove
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <input
                                        type="text"
                                        value={item.title || ''}
                                        placeholder="Plan Name"
                                        onChange={(e) => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          if (updated[index].items) {
                                            updated[index].items![itemIdx].title = e.target.value;
                                            setSelectedPage({ ...selectedPage, blocks: updated });
                                          }
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                                      />
                                      <input
                                        type="text"
                                        value={item.price || ''}
                                        placeholder="Price (e.g. $99/mo)"
                                        onChange={(e) => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          if (updated[index].items) {
                                            updated[index].items![itemIdx].price = e.target.value;
                                            setSelectedPage({ ...selectedPage, blocks: updated });
                                          }
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-[#000080] font-mono"
                                      />
                                      <input
                                        type="text"
                                        value={item.badge || ''}
                                        placeholder="Badge (e.g. POPULAR)"
                                        onChange={(e) => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          if (updated[index].items) {
                                            updated[index].items![itemIdx].badge = e.target.value;
                                            setSelectedPage({ ...selectedPage, blocks: updated });
                                          }
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-amber-300"
                                      />
                                    </div>
                                    <input
                                      type="text"
                                      value={item.description || ''}
                                      placeholder="Plan description / details"
                                      onChange={(e) => {
                                        const updated = [...(selectedPage.blocks || [])];
                                        if (updated[index].items) {
                                          updated[index].items![itemIdx].description = e.target.value;
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }
                                      }}
                                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Team Block */}
                          {block.type === 'team' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/80">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">Team Members ({(block.items || []).length})</label>
                                <button type="button"
                                  onClick={() => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    const current = updated[index].items || [];
                                    updated[index].items = [...current, { title: 'Jane Doe', role: 'Lead Architect', description: 'Bio overview', image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400' }];
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-700 text-xs font-bold text-[#000080] rounded-lg flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Member
                                </button>
                              </div>

                              <div className="space-y-3">
                                {block.items?.map((item, itemIdx) => (
                                  <div key={itemIdx} className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[11px] font-bold text-slate-500">Member #{itemIdx + 1}</span>
                                      <button type="button"
                                        onClick={() => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          updated[index].items = updated[index].items?.filter((_, i) => i !== itemIdx);
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }}
                                        className="text-red-400 text-[10px] hover:underline">
                                        Remove
                                      </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      <input
                                        type="text"
                                        value={item.title || ''}
                                        placeholder="Full Name"
                                        onChange={(e) => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          if (updated[index].items) {
                                            updated[index].items![itemIdx].title = e.target.value;
                                            setSelectedPage({ ...selectedPage, blocks: updated });
                                          }
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                                      />
                                      <input
                                        type="text"
                                        value={item.role || ''}
                                        placeholder="Job Role / Title"
                                        onChange={(e) => {
                                          const updated = [...(selectedPage.blocks || [])];
                                          if (updated[index].items) {
                                            updated[index].items![itemIdx].role = e.target.value;
                                            setSelectedPage({ ...selectedPage, blocks: updated });
                                          }
                                        }}
                                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-[#000080]"
                                      />
                                    </div>
                                    <ImageUploader
                                      label={`Member Photo`}
                                      value={item.image || ''}
                                      onChange={(url) => {
                                        const updated = [...(selectedPage.blocks || [])];
                                        if (updated[index].items) {
                                          updated[index].items![itemIdx].image = url;
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Key Stats Block */}
                          {block.type === 'stats' && (
                            <div className="space-y-3 pt-2 border-t border-slate-200/80">
                              <div className="flex items-center justify-between">
                                <label className="block text-xs font-bold text-slate-700">Key Stat Items ({(block.items || []).length})</label>
                                <button type="button"
                                  onClick={() => {
                                    const updated = [...(selectedPage.blocks || [])];
                                    const current = updated[index].items || [];
                                    updated[index].items = [...current, { statNumber: '100+', statLabel: 'Satisfied Enterprise Clients' }];
                                    setSelectedPage({ ...selectedPage, blocks: updated });
                                  }}
                                  className="px-2.5 py-1 bg-slate-100 hover:bg-slate-700 text-xs font-bold text-[#000080] rounded-lg flex items-center gap-1">
                                  <Plus className="w-3 h-3" /> Add Stat
                                </button>
                              </div>

                              <div className="space-y-2">
                                {block.items?.map((item, itemIdx) => (
                                  <div key={itemIdx} className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-white p-2.5 rounded-xl border border-slate-200">
                                    <input
                                      type="text"
                                      value={item.statNumber || ''}
                                      placeholder="Stat Value (e.g. 99.9%)"
                                      onChange={(e) => {
                                        const updated = [...(selectedPage.blocks || [])];
                                        if (updated[index].items) {
                                          updated[index].items![itemIdx].statNumber = e.target.value;
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }
                                      }}
                                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-[#000080] font-bold"
                                    />
                                    <input
                                      type="text"
                                      value={item.statLabel || ''}
                                      placeholder="Stat Label"
                                      onChange={(e) => {
                                        const updated = [...(selectedPage.blocks || [])];
                                        if (updated[index].items) {
                                          updated[index].items![itemIdx].statLabel = e.target.value;
                                          setSelectedPage({ ...selectedPage, blocks: updated });
                                        }
                                      }}
                                      className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Video Block */}
                          {block.type === 'video' && (
                            <div className="pt-2 border-t border-slate-200/80">
                              <label className="block text-xs font-medium text-slate-500 mb-1">Video Embed URL (YouTube / Vimeo / MP4)</label>
                              <input
                                type="text"
                                value={block.videoUrl || ''}
                                onChange={(e) => {
                                  const updated = [...(selectedPage.blocks || [])];
                                  updated[index].videoUrl = e.target.value;
                                  setSelectedPage({ ...selectedPage, blocks: updated });
                                }}
                                placeholder="https://www.youtube.com/embed/..."
                                className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-[#000080] font-mono"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 3. GOOGLE SEO TAB */}
              {editorTab === 'seo' && (
                <div className="space-y-6">
                  {/* Google Search Snippet Preview Box */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                      <span className="text-xs font-bold text-slate-700 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-blue-400" /> Real-Time Google Search SERP Preview
                      </span>
                      <div className="flex bg-white rounded-lg p-1 border border-slate-200">
                        <button onClick={() => setPreviewDevice('desktop')}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                            previewDevice === 'desktop' ? 'bg-blue-600 text-slate-900' : 'text-slate-500'
                          }`}>
                          Desktop
                        </button>
                        <button onClick={() => setPreviewDevice('mobile')}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded ${
                            previewDevice === 'mobile' ? 'bg-blue-600 text-slate-900' : 'text-slate-500'
                          }`}>
                          Mobile
                        </button>
                      </div>
                    </div>

                    {/* Google SERP Visual Representation */}
                    <div className="bg-white p-5 rounded-xl text-left font-sans shadow-sm">
                      <div className="text-[12px] text-[#202124] flex items-center gap-1.5 mb-1">
                        <div className="w-4 h-4 bg-[#000080] rounded-full text-white text-[9px] font-bold flex items-center justify-center">d</div>
                        <span className="font-semibold">profoxwebdesigner.com</span>
                        <span className="text-slate-500">› {getPagePath(selectedPage).split('/').filter(Boolean).join(' › ') || 'home'}</span>
                      </div>
                      <h4 className="text-[20px] text-[#1a0dab] font-normal hover:underline leading-snug cursor-pointer font-sans truncate">
                        {selectedPage.seo?.metaTitle || selectedPage.title || 'Page Title Placeholder'}
                      </h4>
                      <p className="text-[14px] text-[#4d5156] leading-snug mt-1 line-clamp-2">
                        {selectedPage.seo?.metaDescription || 'Add a customized Google meta description to make your page stand out in search results and drive organic clicks.'}
                      </p>
                    </div>
                  </div>

                  {/* SEO Form Inputs */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700">Target Focus Keyword / Phrase</label>
                        <span className="text-[11px] text-slate-500">The main search query you want to rank for in Google</span>
                      </div>
                      <input
                        type="text"
                        value={selectedPage.seo?.focusKeyword || ''}
                        onChange={(e) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, focusKeyword: e.target.value }
                        })}
                        placeholder="e.g. Digital Transformation Strategy"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080] font-semibold"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700">Google Meta Title</label>
                        <span className={`text-[11px] font-mono ${
                          (selectedPage.seo?.metaTitle?.length || 0) <= 60 ? 'text-[#000080]' : 'text-red-400'
                        }`}>
                          {(selectedPage.seo?.metaTitle?.length || 0)} / 60 Chars
                        </span>
                      </div>
                      <input
                        type="text"
                        value={selectedPage.seo?.metaTitle || ''}
                        onChange={(e) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, metaTitle: e.target.value }
                        })}
                        placeholder="Meta Title (appears in Google blue link)"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700">Google Meta Description</label>
                        <span className={`text-[11px] font-mono ${
                          (selectedPage.seo?.metaDescription?.length || 0) <= 160 ? 'text-[#000080]' : 'text-red-400'
                        }`}>
                          {(selectedPage.seo?.metaDescription?.length || 0)} / 160 Chars
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        value={selectedPage.seo?.metaDescription || ''}
                        onChange={(e) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, metaDescription: e.target.value }
                        })}
                        placeholder="Meta description snippet for search engine indexing..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-700">Canonical URL</label>
                        <span className="text-[11px] text-slate-500">Automatically follows the published SEO URL</span>
                      </div>
                      <input
                        type="text"
                        value={getCanonicalUrl(selectedPage)}
                        readOnly
                        placeholder={getCanonicalUrl(selectedPage)}
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-600 font-mono text-xs cursor-not-allowed"
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                      <div>
                        <label className="text-xs font-bold text-slate-800 block">Robots Search Engine Indexing (noindex)</label>
                        <p className="text-[11px] text-slate-500">When toggled ON, tells Google and Bing search crawlers NOT to index or rank this page.</p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedPage.seo?.noIndex || false}
                          onChange={(e) => setSelectedPage({
                            ...selectedPage,
                            seo: { ...selectedPage.seo, noIndex: e.target.checked }
                          })}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* 4. SOCIAL (OPENGRAPH) TAB */}
              {editorTab === 'social' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Social Media Sharing Preview (OpenGraph / Twitter Cards)</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Control how this page looks when shared on LinkedIn, Twitter, Facebook, or messaging apps.</p>
                  </div>

                  {/* Social Preview Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 overflow-hidden max-w-md mx-auto">
                    <div className="h-44 bg-white rounded-xl overflow-hidden mb-3 relative border border-slate-200">
                      {selectedPage.seo?.ogImage || selectedPage.coverImage ? (
                        <img 
                          src={selectedPage.seo?.ogImage || selectedPage.coverImage} 
                          alt="OpenGraph Preview" 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-slate-600">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1">profoxwebdesigner.com</div>
                    <div className="font-bold text-slate-900 text-sm leading-snug line-clamp-1">
                      {selectedPage.seo?.ogTitle || selectedPage.seo?.metaTitle || selectedPage.title}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                      {selectedPage.seo?.ogDescription || selectedPage.seo?.metaDescription}
                    </p>
                  </div>

                  <div className="space-y-4 border-t border-slate-200 pt-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Social Title (og:title)</label>
                      <input
                        type="text"
                        value={selectedPage.seo?.ogTitle || ''}
                        onChange={(e) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, ogTitle: e.target.value }
                        })}
                        placeholder="Title for social media shares"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Social Description (og:description)</label>
                      <textarea
                        rows={2}
                        value={selectedPage.seo?.ogDescription || ''}
                        onChange={(e) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, ogDescription: e.target.value }
                        })}
                        placeholder="Description for social shares..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-900 focus:outline-none focus:border-[#000080]"
                      />
                    </div>

                    <div>
                      <ImageUploader
                        label="Social Share Image (og:image)"
                        value={selectedPage.seo?.ogImage || ''}
                        onChange={(url) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, ogImage: url }
                        })}
                        helpText="Displayed when link is shared on social media and messaging platforms."
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 5. SCHEMA.ORG & ADVANCED */}
              {editorTab === 'schema' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Google Schema.org JSON-LD Structured Data</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Automated structured data script injected directly into the HTML &lt;head&gt; for rich Google search results.</p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Schema.org Type</label>
                      <select
                        value={selectedPage.seo?.schemaType || 'WebPage'}
                        onChange={(e) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, schemaType: e.target.value as any }
                        })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080]">
                        <option value="WebPage">WebPage</option>
                        <option value="Article">Article</option>
                        <option value="Organization">Organization</option>
                        <option value="Service">Service</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">Canonical URL</label>
                      <input
                        type="text"
                        value={selectedPage.seo?.canonicalUrl || ''}
                        onChange={(e) => setSelectedPage({
                          ...selectedPage,
                          seo: { ...selectedPage.seo, canonicalUrl: e.target.value }
                        })}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-[#000080] font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Generated JSON-LD Script Output</label>
                    <pre className="bg-slate-50 border border-slate-200 p-4 rounded-xl text-xs font-mono text-[#000080] overflow-x-auto leading-relaxed">
                      {generateSchemaJSON(selectedPage)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Sidebar: Publish Controls & SEO Audit Checklist */}
        <div className="lg:col-span-4 space-y-6">
          {/* Publish Box */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-4">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-200 pb-3 flex items-center justify-between">
              <span>Publish Settings</span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                selectedPage.status === 'published' ? 'bg-[#000080]/10 text-[#000080] border border-[#000080]/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}>
                {selectedPage.status}
              </span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Publication Status</label>
                <select
                  value={selectedPage.status}
                  onChange={(e) => setSelectedPage({ ...selectedPage, status: e.target.value as 'published' | 'draft' })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-[#000080]">
                  <option value="published">Published (Live on site)</option>
                  <option value="draft">Draft (Hidden from public)</option>
                </select>
              </div>

              <div className="pt-2 text-xs text-slate-500 space-y-1 font-mono">
                <div>Created: {selectedPage.createdAt}</div>
                <div>Updated: {selectedPage.updatedAt}</div>
              </div>

              <button 
                onClick={handleSave}
                disabled={saving}
                className="w-full py-2.5 bg-[#000080] hover:bg-[#000066] disabled:bg-slate-400 text-white font-bold rounded-xl text-xs transition-colors shadow-lg flex items-center justify-center gap-2 mt-2 disabled:cursor-not-allowed">
                {saving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : savedMessage ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Saved!</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save & Update Page</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Google SEO Audit Checklist Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Google SEO Audit</h3>
                <p className="text-[11px] text-slate-500">Live search optimization score</p>
              </div>
              <div className="text-right">
                <span className={`text-xl font-black ${
                  currentSeoScore>= 80 ? 'text-[#000080]' : currentSeoScore>= 50 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {currentSeoScore}
                </span>
                <span className="text-xs text-slate-500">/100</span>
              </div>
            </div>

            {/* Checklist */}
            <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
              {seoChecks.map((check, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs">
                  {check.pass ? (
                    <CheckCircle2 className="w-4 h-4 text-[#000080] shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div>
                    <span className={check.pass ? 'text-slate-700 font-medium' : 'text-amber-300 font-medium'}>
                      {check.label}
                    </span>
                    {!check.pass && check.tip && (
                      <p className="text-[11px] text-slate-500 mt-0.5">{check.tip}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Floating Sticky Bottom Action Bar for Instant Saving */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-white/95 backdrop-blur-md border border-slate-300/80 p-3 px-6 rounded-2xl shadow-2xl flex items-center justify-between gap-6 max-w-2xl w-[92vw] sm:w-full mx-auto">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#000066] animate-pulse" />
          <div className="text-xs">
            <span className="font-bold text-slate-900 block truncate max-w-[150px] sm:max-w-[200px]">{selectedPage.title || 'Untitled Page'}</span>
            <span className="text-slate-500 font-mono text-[10px]">{getPagePath(selectedPage)}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedMessage && (
            <span className="text-xs font-semibold text-[#000080] bg-[#000080]/10 border border-[#000080]/20 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> {savedMessage}
            </span>
          )}

          <a
            href={getPagePath(selectedPage)}
            target="_blank"
            rel="noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-700 text-slate-800 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold transition-all">
            <Eye className="w-3.5 h-3.5 text-[#000080]" /> Preview
          </a>

          <button 
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-[#000080] hover:bg-[#000066] disabled:bg-slate-400 active:scale-95 text-white font-extrabold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-[#000080]/20 transition-all cursor-pointer disabled:cursor-not-allowed min-w-[120px] justify-center">
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : savedMessage ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                <span>Save Page</span>
              </>
            )}
          </button>
        </div>
      </div>
      
    </div>
  );
}
