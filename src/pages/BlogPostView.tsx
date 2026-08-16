import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { BlogPost } from '../types';
import { 
  Calendar, 
  Clock, 
  User, 
  ArrowLeft, 
  Share2, 
  Tag, 
  ChevronRight, 
  MessageSquare, 
  Edit2,
  Copy,
  Twitter,
  Facebook,
  Linkedin,
  Check,
  ChevronDown,
  ChevronUp,
  Mail,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../lib/AuthContext';
import { useCMS } from '../lib/CMSProvider';
import { formatR2ImageUrl, processBlogContentR2Images } from '../lib/r2Media';
import { getBlogPostBySlug, getAllBlogPosts } from '../lib/blogService';

interface TOCItem {
  id: string;
  text: string;
  level: number;
}

export default function BlogPostView() {
  const { isAdminOrEditor } = useAuth();
  const { content: cmsContent } = useCMS();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentPosts, setRecentPosts] = useState<BlogPost[]>([]);
  const [toc, setToc] = useState<TOCItem[]>([]);
  const [articleHtml, setArticleHtml] = useState('');
  const [activeId, setActiveId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const contentRef = useRef<HTMLElement>(null);

  const businessName = cmsContent.siteSettings?.businessName || 'Profox web designer';
  const readingMinutes = Math.max(1, Math.ceil((post?.content || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length / 220));
  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  useEffect(() => {
    const fetchPost = async () => {
      setLoading(true);
      try {
        if (!slug) return;
        const mappedPost = await getBlogPostBySlug(slug);

        if (mappedPost) {
          setPost(mappedPost);
          
          // Update SEO Title & Meta Description
          document.title = `${mappedPost.seo?.metaTitle || mappedPost.title} | ${businessName}`;
          
          let metaDesc = document.querySelector('meta[name="description"]');
          if (!metaDesc) {
            metaDesc = document.createElement('meta');
            metaDesc.setAttribute('name', 'description');
            document.head.appendChild(metaDesc);
          }
          metaDesc.setAttribute('content', mappedPost.seo?.metaDescription || mappedPost.excerpt);

          let ogImg = document.querySelector('meta[property="og:image"]');
          if (!ogImg) {
            ogImg = document.createElement('meta');
            ogImg.setAttribute('property', 'og:image');
            document.head.appendChild(ogImg);
          }
          ogImg.setAttribute('content', mappedPost.featuredImage);
          
          // Fetch recent posts
          const allPosts = await getAllBlogPosts();
          const mappedRecent = allPosts
            .filter(p => p.slug !== slug && p.status === 'published')
            .slice(0, 3);
          setRecentPosts(mappedRecent);
        } else {
          setPost(null);
        }
      } catch (err) {
        console.error('Error fetching post:', err);
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchPost();
  }, [slug, businessName]);

  // Prepare article HTML and permanent heading anchors together. Persisting
  // IDs inside the rendered HTML keeps every TOC link reliable after re-renders.
  useEffect(() => {
    if (post) {
      const articleRoot = document.createElement('div');
      articleRoot.innerHTML = processBlogContentR2Images(post.content || '');
      // The reference TOC lists primary article sections (H2)
      // H3/H4 remain within their parent article section.
      const headings = Array.from(articleRoot.querySelectorAll('h2')) as HTMLElement[];
      const usedIds = new Set<string>();
      const createUniqueId = (text: string) => {
        const base = text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/^-+|-+$/g, '') || 'section';
        let id = base;
        let suffix = 2;
        while (usedIds.has(id)) id = `${base}-${suffix++}`;
        usedIds.add(id);
        return id;
      };
      const tocItems: TOCItem[] = [];

      headings.forEach((h) => {
        const text = h.textContent || '';
        const id = createUniqueId(text);
        h.id = id;
        tocItems.push({
          id,
          text,
          level: parseInt(h.tagName.substring(1))
        });
      });

      setArticleHtml(articleRoot.innerHTML);
      setToc(tocItems);
    }
  }, [post]);

  // Active TOC tracking. A scroll-position model keeps one item active even
  // while the reader is between headings or inside a long section.
  useEffect(() => {
    if (toc.length === 0) return;

    let animationFrame = 0;
    const updateActiveSection = () => {
      animationFrame = 0;
      
      const sections = toc.map(item => document.getElementById(item.id)).filter((element): element is HTMLElement => Boolean(element));
      if (sections.length === 0) return;

      const readingLine = window.scrollY + 120;
      let currentId = sections[0].id;

      for (const section of sections) {
        const sectionTop = section.getBoundingClientRect().top + window.scrollY;
        if (sectionTop <= readingLine) currentId = section.id;
        else break;
      }

      const atPageEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
      if (atPageEnd) currentId = sections[sections.length - 1].id;
      setActiveId(previous => previous === currentId ? previous : currentId);
    };

    const scheduleUpdate = () => {
      if (!animationFrame) animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    const hashId = decodeURIComponent(window.location.hash.replace(/^#/, ''));
    if (hashId && toc.some(item => item.id === hashId)) {
      window.requestAnimationFrame(() => {
        const target = document.getElementById(hashId);
        if (target) window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - 112, behavior: 'auto' });
      });
    }

    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [toc]);

  useEffect(() => {
    if (!activeId) return;
    const activeElement = document.querySelector(`#toc-nav a[href="#${activeId}"]`);
    if (activeElement) {
      activeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeId]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const jumpToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    const targetTop = target.getBoundingClientRect().top + window.scrollY - 112;
    setActiveId(id);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${encodeURIComponent(id)}`);
    window.scrollTo({ top: targetTop, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#000080] animate-spin" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">Post Not Found</h1>
        <p className="text-slate-500 mb-8">The article you're looking for doesn't exist or has been moved.</p>
        <Link to="/blog" className="bg-[#000080] text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-[#000080]/20">
          Return to Blog
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white selection:bg-[#000080]/15 selection:text-[#000080]">
            
      {/* Premium Hero Section */}
      <section className="relative flex min-h-[100vh] min-h-[100svh] items-end overflow-hidden pb-16 pt-40 sm:pb-20">
        <div className="absolute inset-0 z-0">
          <img 
            src={post.featuredImage || (slug === 'how-much-does-a-website-cost' ? '/blog_cost_cover.jpg' : '/how_to_choose_web_design_company_cover.jpg')} 
            className="w-full h-full object-cover" 
            alt={post.title}
            onError={(e) => {
              const target = e.currentTarget;
              if (slug === 'how-much-does-a-website-cost') {
                target.src = '/blog_cost_cover.jpg';
              } else if (slug === 'how-to-choose-a-web-design-company') {
                target.src = '/how_to_choose_web_design_company_cover.jpg';
              }
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/35 via-slate-950/45 to-slate-950/90" />
        </div>
        
        <div className="pf-container relative z-10 text-white">
          <div className="max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5 flex flex-wrap items-center gap-3"
          >
            {post.category.split(',').map((cat, i) => (
              <span key={i} className="pf-eyebrow text-white/85">
                {cat.trim()}
              </span>
            ))}
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-[19ch] text-[clamp(2.5rem,6vw,4.75rem)] font-semibold leading-[0.98] tracking-[-0.055em]"
          >
            {post.title}
          </motion.h1>

          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold uppercase tracking-[0.12em] text-white/70"
          >
            <span>Created on {new Date(post.publishedAt || post.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
            <span aria-hidden="true">•</span><span>{readingMinutes} min read</span>
            <span aria-hidden="true">•</span><span>By {post.author?.name || 'ProFox Team'}</span>
          </motion.div>
          </div>
        </div>

        {/* Back Link & Admin Actions */}
        <div className="absolute left-0 right-0 top-28 z-20 pointer-events-none">
          <div className="max-w-7xl mx-auto px-6 flex justify-between items-center">
            <Link to="/blog" className="pointer-events-auto flex items-center gap-2 text-white/70 hover:text-white transition-colors group">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-[#000080] transition-colors">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold uppercase tracking-widest">Back to Blog</span>
            </Link>
            {isAdminOrEditor && (
              <button
                onClick={() => navigate(`/admin?tab=blog&edit=${post.id}`)}
                className="pointer-events-auto flex items-center gap-2 bg-white/10 hover:bg-[#000080] text-white px-4 py-2 rounded-xl backdrop-blur transition-all border border-slate-300 text-xs font-bold uppercase tracking-widest"
              >
                <Edit2 className="w-4 h-4" /> Edit Post
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Main Content Layout */}
      <div className="mx-auto max-w-[1080px] px-5 py-16 sm:px-6 md:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[220px_minmax(0,720px)] lg:justify-between lg:gap-16">
          
          {/* Left Sidebar: TOC & Share */}
          <aside>
            <div className="sticky top-28 space-y-10">
              {toc.length > 0 && (
                <div className="space-y-6">
                  <h3 className="border-b border-slate-200 pb-4 text-sm font-medium text-slate-950">
                    Table of Contents
                  </h3>
                  <nav id="toc-nav" aria-label="Article table of contents" className="flex max-h-[calc(100vh-260px)] flex-col gap-1 overflow-y-auto pr-2">
                    {toc.map((item) => (
                      <a
                        key={item.id}
                        href={`#${item.id}`}
                        aria-current={activeId === item.id ? 'location' : undefined}
                        onClick={(event) => {
                          event.preventDefault();
                          jumpToSection(item.id);
                        }}
                        className={`shrink-0 group relative z-10 flex min-h-10 w-full cursor-pointer items-start py-2 pr-2 text-left text-sm leading-5 transition-all ${
                          activeId === item.id 
                            ? 'translate-x-1 font-bold text-[#000080]' 
                            : 'font-semibold text-slate-800 hover:translate-x-1 hover:text-[#000080]'
                        }`}
                      >
                        <span aria-hidden="true" className={`mr-2 mt-0.5 shrink-0 text-base leading-5 text-[#000080] transition-opacity ${activeId === item.id ? 'opacity-100' : 'opacity-0'}`}>→</span>
                        <span>
                          {item.text}
                        </span>
                      </a>
                    ))}
                  </nav>
                </div>
              )}

              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-[0.14em] text-slate-950">
                  Share
                </h3>
                <div className="flex items-center gap-2">
                  <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-all hover:border-[#000080] hover:text-[#000080]">
                    <Twitter className="w-4 h-4" />
                  </a>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-all hover:border-[#000080] hover:text-[#000080]">
                    <Facebook className="w-4 h-4" />
                  </a>
                  <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn" className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-all hover:border-[#000080] hover:text-[#000080]">
                    <Linkedin className="w-4 h-4" />
                  </a>
                  <button 
                    onClick={handleCopyLink}
                    aria-label="Copy article link"
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-all hover:border-[#000080] hover:text-[#000080]"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          </aside>

          {/* Article Main Body */}
          <main className="min-w-0 max-w-[720px]">
            {/* Highlights Section */}
            {post.highlights && post.highlights.length > 0 && (
              <section id="highlights" className="mb-12 scroll-mt-28 border-b border-slate-200 pb-10">
                <h2 className="mb-5 text-xl font-bold text-slate-950">Key Highlights</h2>
                <ul className="grid grid-cols-1 gap-3">
                  {post.highlights.map((highlight, i) => (
                    <li key={i} className="flex gap-4 items-start group">
                      <div className="mt-1.5 w-2 h-2 rounded-full bg-[#000080] shrink-0 group-hover:scale-150 transition-transform" />
                      <p className="text-sm leading-6 text-slate-700">{highlight}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Post Content */}
            <article 
              ref={contentRef}
              className="pf-article-content"
              dangerouslySetInnerHTML={{ __html: articleHtml }}
            />

            {/* FAQ Section */}
            {post.faq && post.faq.length > 0 && (
              <section id="faq" className="mt-16 scroll-mt-28 border-t border-slate-200 pt-14">
                <h2 className="mb-7 flex items-center gap-4 text-2xl font-bold text-slate-950">
                  Frequently Asked Questions
                  <div className="h-0.5 flex-1 bg-slate-100" />
                </h2>
                <div className="space-y-4">
                  {post.faq.map((item, index) => (
                    <div 
                      key={index} 
                      className={`overflow-hidden border-b border-slate-200 transition-all duration-300 ${
                        openFaqIndex === index 
                          ? 'bg-[#f4f5fb]' 
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <button 
                        onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                        className="flex w-full items-center justify-between gap-5 px-4 py-4 text-left"
                      >
                        <span className={`text-sm font-bold transition-colors ${openFaqIndex === index ? 'text-[#000080]' : 'text-slate-900'}`}>
                          {item.question}
                        </span>
                        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                          openFaqIndex === index ? 'bg-[#000080] text-white rotate-180' : 'bg-slate-200 text-slate-600'
                        }`}>
                          <ChevronDown className="w-4 h-4" />
                        </div>
                      </button>
                      <AnimatePresence>
                        {openFaqIndex === index && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.3 }}
                          >
                            <div className="px-4 pb-5 pt-0 text-sm leading-6 text-slate-600">
                              {item.answer}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Newsletter Subscription Box */}
            <section className="relative mt-16 overflow-hidden rounded-xl bg-[#1d2027] px-6 py-8 text-white sm:px-9 sm:py-10">
              <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-[#000080] to-transparent blur-3xl translate-x-1/2 -translate-y-1/2" />
              </div>
              
              <div className="relative z-10 grid grid-cols-1 items-center gap-7 sm:grid-cols-[1fr_1.1fr]">
                <div>
                  <h3 className="text-2xl font-semibold leading-tight">
                    Stay Informed About The Latest Insights
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-white/60">
                    Join our network of innovators and get strategic digital insights delivered to your inbox weekly.
                  </p>
                </div>
                <div>
                  <form className="relative">
                    <div className="relative flex flex-col gap-2 rounded-lg bg-white p-1.5 sm:flex-row sm:items-center">
                      <Mail className="ml-3 hidden h-4 w-4 text-slate-400 sm:block" />
                      <input 
                        type="email" 
                        placeholder="Enter your email address" 
                        className="min-h-10 flex-1 bg-transparent px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                      />
                      <button className="min-h-10 rounded-md bg-[#000080] px-6 text-sm font-bold text-white transition-all hover:bg-[#000066]">
                        Subscribe
                      </button>
                    </div>
                    <p className="mt-4 text-xs text-slate-500 text-center lg:text-left">
                      By subscribing, you agree to our <Link to="/privacy-policy" className="underline hover:text-slate-900">Privacy Policy</Link>.
                    </p>
                  </form>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      {/* Related Posts Section */}
      {recentPosts.length > 0 && (
        <section className="bg-slate-50 py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex items-end justify-between mb-12">
              <div>
                <span className="text-[#000080] font-bold text-xs uppercase tracking-[0.3em] mb-4 block">Keep Reading</span>
                <h2 className="text-4xl font-bold text-slate-900">Recommended for You</h2>
              </div>
              <Link to="/blog" className="hidden md:flex items-center gap-2 text-slate-900 font-bold group">
                Browse All Insights 
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center border border-slate-200 group-hover:bg-white group-hover:text-slate-900 transition-all">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </Link>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {recentPosts.map((p) => (
                <Link key={p.id} to={`/blog/${p.slug}`} className="group flex flex-col h-full bg-white rounded-3xl overflow-hidden border border-slate-100 hover:border-[#000080]/30 hover:shadow-2xl hover:shadow-[#000080]/5 transition-all">
                  <div className="aspect-[16/10] overflow-hidden relative">
                    <img 
                      src={p.featuredImage} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" 
                      alt={p.title}
                    />
                    <div className="absolute top-4 left-4">
                      <span className="bg-white/90 backdrop-blur px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-900">
                        {p.category}
                      </span>
                    </div>
                  </div>
                  <div className="p-8 flex-1 flex flex-col">
                    <h3 className="text-xl font-bold text-slate-900 mb-4 group-hover:text-[#000080] transition-colors line-clamp-2">
                      {p.title}
                    </h3>
                    <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between text-xs text-slate-600 font-bold uppercase tracking-widest">
                      <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                      <div className="flex items-center gap-2 text-slate-900">
                        Read Story <ChevronRight className="w-4 h-4 text-[#000080]" />
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

          </div>
  );
}

function ArrowRight(props: any) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}
