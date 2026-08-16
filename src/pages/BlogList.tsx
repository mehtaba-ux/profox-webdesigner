import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, ArrowUpRight, Edit2, Search, Tag } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BlogPost } from '../types';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { useCMS } from '../lib/CMSProvider';
import HeroReviewProof from '../components/HeroReviewProof';

const articleTransition = { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

export default function BlogList() {
  const { isAdminOrEditor } = useAuth();
  const { content } = useCMS();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('All Topics');
  const businessName = content.siteSettings?.businessName || 'ProFox Web Designer';

  useEffect(() => {
    document.title = `Blog & Insights | ${businessName}`;
  }, [businessName]);

  useEffect(() => {
    const fetchPosts = async () => {
      try {
        const { data, error } = await supabase.from('posts').select('*').eq('status', 'published').order('published_at', { ascending: false, nullsFirst: false }).order('updated_at', { ascending: false });
        if (error) throw error;
        setPosts((data || []).map(post => {
          const seoData = post.seo || {};
          return {
            id: post.id, title: post.title, slug: post.slug, content: post.content || '', excerpt: post.excerpt || '',
            featuredImage: post.cover_image || post.featured_image || '', category: post.category || 'Insights', tags: post.tags || [], status: post.status,
            author: seoData._author || post.author || { name: 'ProFox Team' }, seo: seoData,
            createdAt: post.created_at || post.updated_at, updatedAt: post.updated_at, publishedAt: post.published_at
          };
        }) as BlogPost[]);
      } catch (error) {
        console.error('Error fetching posts:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPosts();
  }, []);

  const categories = useMemo(() => Array.from(new Set(posts.map(post => post.category?.trim()).filter(Boolean))) as string[], [posts]);
  const filteredPosts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return posts.filter(post => {
      const matchesCategory = activeCategory === 'All Topics' || post.category === activeCategory;
      const matchesSearch = !query || post.title.toLowerCase().includes(query) || post.category.toLowerCase().includes(query) || post.excerpt.toLowerCase().includes(query);
      return matchesCategory && matchesSearch;
    });
  }, [posts, activeCategory, searchQuery]);
  const featuredPost = filteredPosts[0];
  const latestPosts = filteredPosts.slice(1, 6);
  const visibleCategorySections = (activeCategory === 'All Topics' ? categories : [activeCategory])
    .map(category => ({ category, posts: filteredPosts.filter(post => post.category === category).slice(0, 3) }))
    .filter(section => section.posts.length > 0);

  const openEditor = (event: React.MouseEvent, post: BlogPost) => {
    event.preventDefault();
    event.stopPropagation();
    navigate(`/admin?tab=blog&edit=${post.id}`);
  };

  const Image = ({ post, className = '' }: { post: BlogPost; className?: string }) => post.featuredImage ? (
    <img src={post.featuredImage} alt={post.title} className={`h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04] ${className}`} loading="lazy" />
  ) : (
    <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[#000080] to-[#5c5cff] ${className}`}><Tag className="h-10 w-10 text-white/70" /></div>
  );

  const EditButton = ({ post }: { post: BlogPost }) => isAdminOrEditor ? (
    <button type="button" onClick={event => openEditor(event, post)} className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-lg bg-white/95 text-[#000080] shadow-lg transition-colors hover:bg-[#000080] hover:text-white" title="Edit post"><Edit2 className="h-4 w-4" /></button>
  ) : null;

  const ResourceCard = ({ post, large = false, index = 0 }: { key?: string; post: BlogPost; large?: boolean; index?: number }) => (
    <motion.article initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ ...articleTransition, delay: index * 0.06 }} className="group min-w-0">
      <Link to={`/blog/${post.slug}`} className="relative block aspect-[16/10] overflow-hidden rounded-lg bg-slate-100">
        <Image post={post} />
        <EditButton post={post} />
      </Link>
      <div className="pf-eyebrow mt-4 text-[#000080]">{post.category}</div>
      <Link to={`/blog/${post.slug}`}><h3 className={`${large ? 'text-lg md:text-xl' : 'pf-card-title'} mt-2 text-slate-950 transition-colors group-hover:text-[#000080]`}>{post.title}</h3></Link>
    </motion.article>
  );

  return (
    <div className="min-h-screen bg-white text-slate-950">
      {/* Existing hero intentionally preserved */}
      <section className="bg-white pb-16 pt-32 text-slate-900 sm:pb-20 sm:pt-36">
        <div className="pf-container">
          <div className="max-w-4xl">
            <h1 className="pf-display mb-6">Insights & <span className="text-[#000080]">Expertise</span></h1>
            <p className="max-w-3xl text-lg leading-8 text-slate-600 sm:text-xl">Deep dives into technology, digital strategy, and business transformation.</p>
            <div className="flex flex-col items-start gap-4 pt-7 sm:flex-row sm:items-center">
              <Link to="/contact-us" className="inline-flex items-center gap-2 rounded-xl bg-[#000080] px-6 py-3.5 text-sm font-bold text-white shadow-lg transition-transform hover:-translate-y-1">Discuss Your Next Move <ArrowUpRight className="h-4 w-4" /></Link>
              <HeroReviewProof />
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-[1120px] px-5 pb-24 pt-8 sm:px-6 md:pb-32 md:pt-12">
        <h2 className="pf-section-title text-slate-950">Resources</h2>
        <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex max-w-full gap-2 overflow-x-auto pb-2 no-scrollbar">
            {['All Topics', ...categories].map(category => <button key={category} type="button" onClick={() => setActiveCategory(category)} className={`min-h-10 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold transition-colors ${activeCategory === category ? 'bg-[#000080] text-white shadow-sm' : 'bg-[#f1f3fa] text-slate-600 hover:bg-[#000080]/10 hover:text-[#000080]'}`}>{category}</button>)}
          </div>
          <label className="relative block w-full md:w-64"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><span className="sr-only">Search insights</span><input value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Search insights" className="min-h-11 w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition-colors focus:border-[#000080]" /></label>
        </div>

        {loading ? (
          <div className="grid min-h-[360px] place-items-center"><div className="h-9 w-9 animate-spin rounded-full border-4 border-[#000080] border-t-transparent" /></div>
        ) : filteredPosts.length === 0 ? (
          <div className="py-28 text-center"><h2 className="text-2xl font-bold">No published insights found</h2><p className="mt-3 text-slate-500">Try another topic or search term.</p></div>
        ) : (
          <>
            {featuredPost && (
              <section className="py-10 md:py-14">
                <motion.div initial={{ opacity: 0, y: 35 }} animate={{ opacity: 1, y: 0 }} transition={articleTransition} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                  <Link to={`/blog/${featuredPost.slug}`} className="group relative block aspect-[16/10] overflow-hidden rounded-lg bg-slate-100"><Image post={featuredPost} /><EditButton post={featuredPost} /></Link>
                  <div>
                    <div className="pf-eyebrow text-[#000080]">Featured Article <span aria-hidden="true">&middot;</span> {featuredPost.category}</div>
                    <Link to={`/blog/${featuredPost.slug}`}><h2 className="mt-4 text-[clamp(1.9rem,4vw,3.25rem)] font-semibold leading-[1.04] tracking-[-0.045em] text-slate-950 transition-colors hover:text-[#000080]">{featuredPost.title}</h2></Link>
                    {featuredPost.excerpt && <p className="mt-5 line-clamp-3 max-w-xl text-base leading-7 text-slate-600">{featuredPost.excerpt}</p>}
                    <Link to={`/blog/${featuredPost.slug}`} className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-extrabold text-[#000080]">Read article <ArrowRight className="h-4 w-4" /></Link>
                  </div>
                </motion.div>
              </section>
            )}

            {latestPosts.length > 0 && (
              <section className="pb-16 pt-8 md:pt-10">
                <h2 className="pf-section-title">Latest Resources</h2>
                <div className="mt-7 grid gap-x-4 gap-y-8 md:grid-cols-6">
                  {latestPosts.map((post, index) => <div key={post.id} className={index < 2 ? 'md:col-span-3' : 'md:col-span-2'}><ResourceCard post={post} large={index < 2} index={index} /></div>)}
                </div>
              </section>
            )}

            {visibleCategorySections.map((section, sectionIndex) => (
              <React.Fragment key={section.category}>
                <section className="border-t border-slate-200 py-12 md:py-14">
                  <div className="flex items-end justify-between gap-5"><h2 className="pf-section-title">{section.category}</h2>{activeCategory === 'All Topics' && <button type="button" onClick={() => setActiveCategory(section.category)} className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-slate-700 transition-colors hover:text-[#000080]">View all <ArrowUpRight className="h-4 w-4" /></button>}</div>
                  <div className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{section.posts.map((post, index) => <ResourceCard key={post.id} post={post} index={index} />)}</div>
                </section>
                {sectionIndex === 2 && visibleCategorySections.length > 3 && (
                  <section className="my-4 grid items-center gap-7 overflow-hidden rounded-2xl bg-[#1d2027] px-7 py-9 text-white md:grid-cols-[1fr_auto] md:px-10 md:py-11">
                    <div><h2 className="text-3xl font-semibold leading-tight tracking-[-0.04em]">Stay Informed About<br />The Latest Insights</h2><p className="mt-3 text-sm text-white/55">Follow new thinking on websites, applications, automation, and measurable digital growth.</p></div>
                    <a href={`mailto:${content.siteSettings?.contactEmail || 'contact@profoxwebdesigner.com'}?subject=Subscribe%20me%20to%20ProFox%20Insights`} className="inline-flex w-fit items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-extrabold text-[#000080] transition-transform hover:-translate-y-1">Request updates <ArrowUpRight className="h-4 w-4" /></a>
                  </section>
                )}
              </React.Fragment>
            ))}
          </>
        )}
      </main>
    </div>
  );
}
