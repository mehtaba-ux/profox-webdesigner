import { motion } from 'motion/react';
import { ArrowUpRight, Calendar, Clock } from 'lucide-react';
import { useCMS } from '../lib/CMSProvider';
import VisualEditable from './admin/VisualEditable';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { BlogPost } from '../types';
import { Link } from 'react-router-dom';

interface InsightsProps {
  isLiveEditing?: boolean;
}

export default function Insights({ isLiveEditing = false }: InsightsProps) {
  const { content } = useCMS();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);

  const insightsData = content.insights || {};
  const isEnabled = insightsData.enabled !== false;
  const sectionTitle = insightsData.title || 'Expert Insights';

  if (!isEnabled && !isLiveEditing) return null;

  const theme = content.theme || {};
  const primaryColor = theme.primaryColor || '#000080';
  const headingFont = theme.fontFamily || 'Inter';

  useEffect(() => {
    const fetchLatestPosts = async () => {
      try {
        const { data, error } = await supabase
          .from('posts')
          .select('*')
          .eq('status', 'published')
          .order('updated_at', { ascending: false })
          .limit(3);

        if (error) throw error;

        const fetchedPosts = (data || []).map(post => {
          const seoData = post.seo || {};
          return {
            id: post.id,
            title: post.title,
            slug: post.slug,
            content: post.content,
            excerpt: post.excerpt,
            featuredImage: post.cover_image || post.featured_image || '',
            category: post.category,
            tags: post.tags || [],
            status: post.status,
            author: seoData._author || post.author || { name: 'Admin' },
            createdAt: post.updated_at,
            updatedAt: post.updated_at,
            publishedAt: post.published_at
          };
        }) as BlogPost[];
        
        setPosts(fetchedPosts);
      } catch (err) {
        console.error('Error fetching insights posts:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchLatestPosts();
  }, []);

  return (
    <section className={`py-24 bg-slate-50/50 ${!isEnabled ? 'opacity-50 grayscale' : ''}`}>
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
          <div className="space-y-4">
            <span className="text-xs font-bold text-[#000080] uppercase tracking-[0.3em] block">Knowledge & Expertise</span>
            <h2 className="text-4xl md:text-5xl font-bold text-slate-900 tracking-tight" style={{ fontFamily: headingFont }}>
              <VisualEditable section="insights" field="title" value={sectionTitle} label="Insights Title" isLiveEditing={isLiveEditing}>
                {sectionTitle}
              </VisualEditable>
            </h2>
          </div>
          <Link to="/blog" className="flex items-center gap-2.5 px-6 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 hover:text-[#000080] hover:shadow-xl transition-all group">
            View All Resources <ArrowUpRight className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </Link>
        </div>

        {loading ? (
          <div className="grid md:grid-cols-3 gap-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse space-y-4">
                <div className="aspect-[4/3] bg-slate-200 rounded-2xl" />
                <div className="h-4 bg-slate-200 rounded w-1/4" />
                <div className="h-6 bg-slate-200 rounded w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-10">
            {posts.map((post, idx) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="group"
              >
                <Link to={`/blog/${post.slug}`} className="block">
                  <div className="aspect-[4/3] rounded-[1.5rem] overflow-hidden mb-8 relative border border-slate-200 shadow-sm">
                    {post.featuredImage ? (
                      <img
                        src={post.featuredImage}
                        alt={post.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                        <div className="w-12 h-12 bg-blue-50 text-[#000080] rounded-xl flex items-center justify-center">
                          <ArrowUpRight className="w-6 h-6" />
                        </div>
                      </div>
                    )}
                    <div className="absolute top-4 left-4 z-10">
                      <span className="bg-white border-2 border-blue-50 text-[#000080] text-[10px] font-extrabold px-3 py-1.5 rounded-xl shadow-lg uppercase tracking-wider block">
                        {post.category}
                      </span>
                    </div>
                    {/* Soft overlay for better tag contrast if image is light */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-slate-500 mb-4 font-bold uppercase tracking-widest">
                    <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-[#000080]" /> {new Date(post.createdAt).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-[#000080]" /> {Math.ceil(post.content.split(' ').length / 200)} min read</span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-slate-900 leading-[1.3] group-hover:text-[#000080] transition-colors line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="mt-4 text-slate-500 text-sm line-clamp-2 leading-relaxed">
                    {post.excerpt}
                  </p>
                  <div className="mt-6 pt-6 border-t border-slate-200 flex items-center gap-2 group-hover:gap-3 transition-all text-[11px] font-bold text-[#000080] uppercase tracking-widest">
                    Read Article <ArrowUpRight className="w-4 h-4" />
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
